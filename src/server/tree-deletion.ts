import { and, asc, eq, isNotNull, isNull, lte } from "drizzle-orm";
import { db } from "./db";
import {
  files,
  treeDeletionRequests,
  treeInvites,
  treeMembers,
  treeShareLinks,
  trees,
  users,
} from "../../drizzle/schema";
import { deletePrefix, TREE_PREFIX } from "./storage";
import { log } from "./logger";
import { sendEmail } from "./email";
import { treeDeletionReminderMessage } from "./email-templates";
import { publicOrigin } from "./config";
import { recordUsage } from "./usage";
import { notifyTreeChanged } from "./presence";
import { TREE_DELETION_REMINDER_DAYS } from "../lib/tree-deletion";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Cuts every outside route into a tree the moment deletion is scheduled:
 * invites, public share links, and any request rows. The contents stay put so
 * an owner can restore the tree during the grace period.
 */
export async function lockTreeForDeletion(client: Transaction, treeId: string) {
  const now = new Date();
  await client
    .update(treeShareLinks)
    .set({ revokedAt: now })
    .where(and(eq(treeShareLinks.treeId, treeId), isNull(treeShareLinks.revokedAt)));
  await client
    .update(treeInvites)
    .set({ revokedAt: now })
    .where(
      and(
        eq(treeInvites.treeId, treeId),
        isNull(treeInvites.revokedAt),
        isNull(treeInvites.acceptedAt),
      ),
    );
  await client.delete(treeDeletionRequests).where(eq(treeDeletionRequests.treeId, treeId));
}

/**
 * Permanently removes a tree and its storage objects.
 *
 * Storage goes first. If it fails the row stays behind so the next maintenance
 * run can retry, rather than leaving orphaned objects and no way to find them.
 */
export async function purgeTree(
  treeId: string,
  options: { force?: boolean } = {},
): Promise<{ deleted: boolean; reason?: "missing" | "active" }> {
  const [tree] = await db
    .select({
      id: trees.id,
      name: trees.name,
      deletedAt: trees.deletedAt,
      deletedBy: trees.deletedBy,
    })
    .from(trees)
    .where(eq(trees.id, treeId))
    .limit(1);

  if (!tree) return { deleted: false, reason: "missing" };
  if (!tree.deletedAt && !options.force) return { deleted: false, reason: "active" };

  const fileRows = await db
    .select({ id: files.id })
    .from(files)
    .where(eq(files.treeId, treeId));

  await deletePrefix(`${TREE_PREFIX}/${treeId}/`);
  await db.delete(trees).where(eq(trees.id, treeId));

  if (tree.deletedBy) {
    await recordUsage({
      userId: tree.deletedBy,
      kind: "tree_deleted",
      itemCount: 1,
      treeId: null,
    });
  }

  notifyTreeChanged(treeId);
  log.info("tree.purged", {
    treeId,
    forced: Boolean(options.force),
    files: fileRows.length,
  });
  return { deleted: true };
}

/** Called by the daily maintenance job. */
export async function purgeDueTrees(limit = 10): Promise<{
  purged: number;
  failed: number;
}> {
  const due = await db
    .select({ id: trees.id })
    .from(trees)
    .where(and(isNotNull(trees.deletedAt), lte(trees.purgeAfter, new Date())))
    .orderBy(asc(trees.purgeAfter))
    .limit(limit);

  let purged = 0;
  let failed = 0;
  for (const tree of due) {
    try {
      const result = await purgeTree(tree.id);
      if (result.deleted) purged += 1;
      else failed += 1;
    } catch (error) {
      failed += 1;
      log.error("tree.purge_failed", { treeId: tree.id, error });
    }
  }
  return { purged, failed };
}

/**
 * Emails every member a week before the purge. Members without a confirmed
 * address are skipped, and the reminder is marked sent even when an individual
 * address fails so a bad mailbox cannot loop forever.
 */
export async function sendDeletionReminders(now: Date = new Date()): Promise<{
  trees: number;
  emailsSent: number;
}> {
  const cutoff = new Date(
    now.getTime() + TREE_DELETION_REMINDER_DAYS * 24 * 60 * 60_000,
  );
  const due = await db
    .select({ id: trees.id, name: trees.name, purgeAfter: trees.purgeAfter })
    .from(trees)
    .where(
      and(
        isNotNull(trees.deletedAt),
        isNotNull(trees.purgeAfter),
        lte(trees.purgeAfter, cutoff),
        isNull(trees.deletionReminderSentAt),
      ),
    )
    .limit(20);

  let emailsSent = 0;
  for (const tree of due) {
    if (!tree.purgeAfter) continue;
    const recipients = await db
      .select({ email: users.email })
      .from(treeMembers)
      .innerJoin(users, eq(users.id, treeMembers.userId))
      .where(
        and(eq(treeMembers.treeId, tree.id), isNotNull(users.emailVerifiedAt)),
      );

    for (const recipient of recipients) {
      const result = await sendEmail(
        recipient.email,
        treeDeletionReminderMessage({
          treeName: tree.name,
          purgeAt: tree.purgeAfter,
          url: `${publicOrigin()}/trees`,
        }),
      );
      if (result.delivered || result.simulated) emailsSent += 1;
    }

    await db
      .update(trees)
      .set({ deletionReminderSentAt: now })
      .where(eq(trees.id, tree.id));
  }

  return { trees: due.length, emailsSent };
}

/** Expired or orphaned request rows are noise, not history. */
export async function pruneDeletionRequests(olderThan: Date): Promise<number> {
  const rows = await db
    .delete(treeDeletionRequests)
    .where(lte(treeDeletionRequests.expiresAt, olderThan))
    .returning({ id: treeDeletionRequests.id });
  return rows.length;
}

/** Used by the purge script to list rows before deleting them. */
export async function treeDeletionAudit(treeId: string) {
  const [tree] = await db
    .select({
      id: trees.id,
      name: trees.name,
      deletedAt: trees.deletedAt,
      purgeAfter: trees.purgeAfter,
    })
    .from(trees)
    .where(eq(trees.id, treeId))
    .limit(1);
  if (!tree) return null;
  const [fileRow] = await db
    .select({ id: files.id })
    .from(files)
    .where(eq(files.treeId, treeId))
    .limit(1);
  return { tree, hasFiles: Boolean(fileRow) };
}

/** Shared by the API actions so both sides agree on the owner list. */
export async function currentTreeOwners(
  client: Transaction | typeof db,
  treeId: string,
): Promise<{ userId: string; displayName: string; email: string }[]> {
  return client
    .select({
      userId: treeMembers.userId,
      displayName: users.displayName,
      email: users.email,
    })
    .from(treeMembers)
    .innerJoin(users, eq(users.id, treeMembers.userId))
    .where(and(eq(treeMembers.treeId, treeId), eq(treeMembers.role, "owner")));
}
