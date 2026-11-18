"use server";

import { createHash, randomBytes } from "node:crypto";
import { and, asc, count, desc, eq, gt, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import { db } from "../server/db";
import {
  people,
  treeDeletionApprovals,
  treeDeletionRequests,
  treeInvites,
  treeMembers,
  trees,
  users,
  type Tree,
} from "../../drizzle/schema";
import { requireUser } from "../server/auth-service";
import {
  canManage,
  requireTreeMember,
  type TreeRole,
} from "../server/guards";
import {
  AppError,
  runAction,
  userMessage,
  type ActionResult,
} from "../server/errors";
import { log } from "../server/logger";
import { inviteEmailSchema, inviteSchema, treeRoleSchema, treeSchema } from "../server/validation";
import { publicOrigin } from "../server/config";
import { sendEmail } from "../server/email";
import {
  inviteMessage,
  treeDeletionRequestedMessage,
  treeDeletionScheduledMessage,
} from "../server/email-templates";
import { recordUsage } from "../server/usage";
import { logActivity } from "../server/activity";
import type { ActivitySummaryParams } from "../lib/activity";
import type { TranslationKey } from "../i18n";
import { notifyTreeChanged } from "../server/presence";
import {
  allOwnersApproved,
  ownersAwaitingApproval,
  purgeAfterFrom,
  requestExpiresAtFrom,
} from "../lib/tree-deletion";
import { currentTreeOwners, lockTreeForDeletion } from "../server/tree-deletion";

export type TreeSummary = {
  id: string;
  name: string;
  description: string | null;
  role: TreeRole;
  peopleCount: number;
  memberCount: number;
  updatedAt: Date;
};

export async function getMyTrees(): Promise<TreeSummary[]> {
  const user = await requireUser();
  const rows = await db
    .select({
      id: trees.id,
      name: trees.name,
      description: trees.description,
      role: treeMembers.role,
      updatedAt: trees.updatedAt,
      peopleCount: sql<number>`(select count(*) from ${people} where ${people.treeId} = ${trees.id})`,
      memberCount: sql<number>`(select count(*) from ${treeMembers} where ${treeMembers.treeId} = ${trees.id})`,
    })
    .from(treeMembers)
    .innerJoin(trees, eq(trees.id, treeMembers.treeId))
    .where(and(eq(treeMembers.userId, user.id), isNull(trees.deletedAt)))
    .orderBy(desc(trees.updatedAt));

  return rows.map(row => ({
    ...row,
    peopleCount: Number(row.peopleCount),
    memberCount: Number(row.memberCount),
  }));
}

export type TreeDeletionRequestView = {
  id: string;
  requestedBy: string | null;
  requestedByName: string;
  createdAt: Date;
  expiresAt: Date;
  approvals: { userId: string; approvedAt: Date }[];
};

export type TreeOverview = {
  tree: Tree;
  role: TreeRole;
  peopleCount: number;
  memberCount: number;
  deletionRequest: TreeDeletionRequestView | null;
};

export async function getTreeOverview(treeId: string): Promise<TreeOverview> {
  const access = await requireTreeMember(treeId);
  const [peopleRow] = await db
    .select({ value: count() })
    .from(people)
    .where(eq(people.treeId, treeId));
  const [membersRow] = await db
    .select({ value: count() })
    .from(treeMembers)
    .where(eq(treeMembers.treeId, treeId));

  const [requestRow] = await db
    .select({
      id: treeDeletionRequests.id,
      requestedBy: treeDeletionRequests.requestedBy,
      requestedByName: users.displayName,
      createdAt: treeDeletionRequests.createdAt,
      expiresAt: treeDeletionRequests.expiresAt,
    })
    .from(treeDeletionRequests)
    .leftJoin(users, eq(users.id, treeDeletionRequests.requestedBy))
    .where(
      and(
        eq(treeDeletionRequests.treeId, treeId),
        gt(treeDeletionRequests.expiresAt, new Date()),
      ),
    )
    .limit(1);

  const approvals = requestRow
    ? await db
        .select({
          userId: treeDeletionApprovals.userId,
          approvedAt: treeDeletionApprovals.approvedAt,
        })
        .from(treeDeletionApprovals)
        .where(eq(treeDeletionApprovals.requestId, requestRow.id))
    : [];

  return {
    tree: access.tree,
    role: access.role,
    peopleCount: Number(peopleRow?.value ?? 0),
    memberCount: Number(membersRow?.value ?? 0),
    deletionRequest: requestRow
      ? {
          ...requestRow,
          requestedByName: requestRow.requestedByName ?? "A former owner",
          approvals,
        }
      : null,
  };
}

export type PendingDeletionTree = {
  id: string;
  name: string;
  description: string | null;
  role: TreeRole;
  deletedAt: Date;
  purgeAfter: Date | null;
  requestedByName: string;
  peopleCount: number;
  memberCount: number;
};

/** Trees that every owner approved for deletion, still restorable. */
export async function getPendingDeletionTrees(): Promise<PendingDeletionTree[]> {
  const user = await requireUser();
  const rows = await db
    .select({
      id: trees.id,
      name: trees.name,
      description: trees.description,
      role: treeMembers.role,
      deletedAt: trees.deletedAt,
      purgeAfter: trees.purgeAfter,
      requestedByName: users.displayName,
      peopleCount: sql<number>`(select count(*) from ${people} where ${people.treeId} = ${trees.id})`,
      memberCount: sql<number>`(select count(*) from ${treeMembers} where ${treeMembers.treeId} = ${trees.id})`,
    })
    .from(treeMembers)
    .innerJoin(trees, eq(trees.id, treeMembers.treeId))
    .leftJoin(users, eq(users.id, trees.deletedBy))
    .where(and(eq(treeMembers.userId, user.id), isNotNull(trees.deletedAt)))
    .orderBy(asc(trees.purgeAfter));

  return rows.flatMap(row =>
    row.deletedAt
      ? [
          {
            id: row.id,
            name: row.name,
            description: row.description,
            role: row.role,
            deletedAt: row.deletedAt,
            purgeAfter: row.purgeAfter,
            requestedByName: row.requestedByName ?? "A former owner",
            peopleCount: Number(row.peopleCount),
            memberCount: Number(row.memberCount),
          },
        ]
      : [],
  );
}

export async function createTree(input: {
  name: string;
  description?: string | null;
}): Promise<ActionResult<{ id: string; role: TreeRole }>> {
  return runAction("trees.createTree", async () => {
    const user = await requireUser();
    const parsed = treeSchema.parse(input);
    const result = await db.transaction(async tx => {
      const [tree] = await tx.insert(trees).values({
        name: parsed.name,
        description: parsed.description,
        createdBy: user.id,
      }).returning();
      await tx.insert(treeMembers).values({
        treeId: tree.id,
        userId: user.id,
        role: "owner",
      });
      return tree;
    });
    await recordUsage({
      userId: user.id,
      kind: "tree_created",
      itemCount: 1,
      treeId: result.id,
    });
    return { id: result.id, role: "owner" as TreeRole };
  });
}

export async function updateTree(input: {
  treeId: string;
  name: string;
  description?: string | null;
}): Promise<ActionResult<undefined>> {
  return runAction("trees.updateTree", async () => {
    const access = await requireTreeMember(input.treeId, "owner");
    if (!canManage(access.role)) throw new AppError(userMessage("tree.error.ownerOnly"));
    const parsed = treeSchema.parse(input);
    const [updated] = await db
      .update(trees)
      .set({ name: parsed.name, description: parsed.description, updatedAt: new Date() })
      .where(eq(trees.id, input.treeId))
      .returning();
    if (updated) {
      await logActivity(db, {
        treeId: access.tree.id,
        actor: access.user,
        action: "tree.updated",
        entityType: "tree",
        entityId: updated.id,
        summary: "Updated tree settings",
        summaryKey: "tree.activity.summary.treeUpdated",
      });
      notifyTreeChanged(access.tree.id);
    }
    return undefined;
  });
}

export type TreeDeletionResult = {
  scheduled: boolean;
  purgeAfter: Date | null;
  ownersAwaiting: number;
  emailsSent: number;
};

function deletionSettingsUrl(treeId: string) {
  return `${publicOrigin()}/trees/${treeId}/settings?tab=danger`;
}

async function emailOwnersAboutRequest(input: {
  treeId: string;
  treeName: string;
  requesterId: string;
  requesterName: string;
  expiresAt: Date;
}): Promise<number> {
  const owners = await db
    .select({ userId: treeMembers.userId, email: users.email })
    .from(treeMembers)
    .innerJoin(users, eq(users.id, treeMembers.userId))
    .where(and(eq(treeMembers.treeId, input.treeId), eq(treeMembers.role, "owner")));

  let sent = 0;
  for (const owner of owners) {
    if (owner.userId === input.requesterId) continue;
    try {
      const result = await sendEmail(
        owner.email,
        treeDeletionRequestedMessage({
          treeName: input.treeName,
          requesterName: input.requesterName,
          url: deletionSettingsUrl(input.treeId),
          expiresAt: input.expiresAt,
        }),
      );
      if (result.delivered || result.simulated) sent += 1;
    } catch (error) {
      log.error("trees.deletion_request_email_failed", { treeId: input.treeId, error });
    }
  }
  return sent;
}

async function emailMembersAboutSchedule(input: {
  treeId: string;
  treeName: string;
  purgeAt: Date;
}): Promise<number> {
  const recipients = await db
    .select({ email: users.email })
    .from(treeMembers)
    .innerJoin(users, eq(users.id, treeMembers.userId))
    .where(
      and(eq(treeMembers.treeId, input.treeId), isNotNull(users.emailVerifiedAt)),
    );

  let sent = 0;
  for (const recipient of recipients) {
    try {
      const result = await sendEmail(
        recipient.email,
        treeDeletionScheduledMessage({
          treeName: input.treeName,
          purgeAt: input.purgeAt,
          url: `${publicOrigin()}/trees`,
        }),
      );
      if (result.delivered || result.simulated) sent += 1;
    } catch (error) {
      log.error("trees.deletion_scheduled_email_failed", { treeId: input.treeId, error });
    }
  }
  return sent;
}

async function scheduleTreeDeletion(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  input: {
    treeId: string;
    actor: { id: string; displayName: string };
    deletedBy?: string | null;
    summary: string;
    summaryKey: TranslationKey;
    summaryParams?: ActivitySummaryParams;
  },
): Promise<Date> {
  const now = new Date();
  const purgeAfter = purgeAfterFrom(now);
  await tx
    .update(trees)
    .set({
      deletedAt: now,
      purgeAfter,
      deletedBy: input.deletedBy ?? input.actor.id,
      deletionReminderSentAt: null,
      updatedAt: now,
    })
    .where(eq(trees.id, input.treeId));
  await lockTreeForDeletion(tx, input.treeId);
  await logActivity(tx, {
    treeId: input.treeId,
    actor: input.actor,
    action: "tree.deletion_scheduled",
    entityType: "tree",
    entityId: input.treeId,
    summary: input.summary,
    summaryKey: input.summaryKey,
    summaryParams: input.summaryParams,
  });
  return purgeAfter;
}

/**
 * Deletion starts as a request. With one owner it is scheduled straight away;
 * with several, every current owner must approve first. Nothing is erased
 * until the 30 day grace period ends.
 */
export async function requestTreeDeletion(input: {
  treeId: string;
  confirmationName: string;
}): Promise<ActionResult<TreeDeletionResult>> {
  return runAction("trees.requestTreeDeletion", async () => {
    const access = await requireTreeMember(input.treeId, "owner");
    if (!canManage(access.role)) throw new AppError(userMessage("tree.error.deleteOwnerOnly"));

    const confirmation = input.confirmationName.trim();
    if (confirmation !== access.tree.name) {
      throw new AppError(userMessage("tree.error.confirmName"));
    }

    const outcome = await db.transaction(async tx => {
      await tx
        .delete(treeDeletionRequests)
        .where(eq(treeDeletionRequests.treeId, input.treeId));

      const owners = await currentTreeOwners(tx, input.treeId);
      if (!owners.length) throw new AppError(userMessage("tree.error.needsOwner"));

      if (owners.length <= 1) {
        const purgeAfter = await scheduleTreeDeletion(tx, {
          treeId: input.treeId,
          actor: access.user,
          summary: "Scheduled the tree for deletion. The only owner approved it.",
          summaryKey: "tree.activity.summary.deletionScheduledBySoleOwner",
        });
        return { scheduled: true, purgeAfter, ownersAwaiting: 0, expiresAt: null };
      }

      const now = new Date();
      const expiresAt = requestExpiresAtFrom(now);
      const [request] = await tx
        .insert(treeDeletionRequests)
        .values({
          treeId: input.treeId,
          requestedBy: access.user.id,
          expiresAt,
        })
        .returning();
      await tx.insert(treeDeletionApprovals).values({
        requestId: request.id,
        userId: access.user.id,
      });
      await logActivity(tx, {
        treeId: input.treeId,
        actor: access.user,
        action: "tree.deletion_requested",
        entityType: "tree",
        entityId: input.treeId,
        summary: "Asked every owner to approve deleting the tree",
        summaryKey: "tree.activity.summary.deletionRequested",
      });
      return {
        scheduled: false,
        purgeAfter: null,
        ownersAwaiting: owners.length - 1,
        expiresAt,
      };
    });

    if (!outcome.scheduled) {
      const emailsSent = outcome.expiresAt
        ? await emailOwnersAboutRequest({
            treeId: input.treeId,
            treeName: access.tree.name,
            requesterId: access.user.id,
            requesterName: access.user.displayName,
            expiresAt: outcome.expiresAt,
          })
        : 0;
      notifyTreeChanged(input.treeId);
      return {
        scheduled: false,
        purgeAfter: null,
        ownersAwaiting: outcome.ownersAwaiting,
        emailsSent,
      };
    }

    if (outcome.purgeAfter) {
      const emailsSent = await emailMembersAboutSchedule({
        treeId: input.treeId,
        treeName: access.tree.name,
        purgeAt: outcome.purgeAfter,
      });
      notifyTreeChanged(input.treeId);
      return {
        scheduled: true,
        purgeAfter: outcome.purgeAfter,
        ownersAwaiting: 0,
        emailsSent,
      };
    }

    return {
      scheduled: false,
      purgeAfter: null,
      ownersAwaiting: outcome.ownersAwaiting,
      emailsSent: 0,
    };
  });
}

/** Records one owner's approval and schedules the deletion once all agree. */
export async function approveTreeDeletion(
  treeId: string,
): Promise<ActionResult<TreeDeletionResult>> {
  return runAction("trees.approveTreeDeletion", async () => {
    const access = await requireTreeMember(treeId, "owner");

    const outcome = await db.transaction(async tx => {
      const [request] = await tx
        .select()
        .from(treeDeletionRequests)
        .where(eq(treeDeletionRequests.treeId, treeId))
        .for("update")
        .limit(1);
      if (!request) throw new AppError(userMessage("tree.error.noDeletionRequest"));
      if (request.expiresAt.getTime() <= Date.now()) {
        await tx
          .delete(treeDeletionRequests)
          .where(eq(treeDeletionRequests.id, request.id));
        throw new AppError(userMessage("tree.error.deletionExpired"));
      }

      const inserted = await tx
        .insert(treeDeletionApprovals)
        .values({ requestId: request.id, userId: access.user.id })
        .onConflictDoNothing()
        .returning({ userId: treeDeletionApprovals.userId });
      if (!inserted.length) {
        throw new AppError(userMessage("tree.error.deletionAlreadyApproved"));
      }

      const owners = await currentTreeOwners(tx, treeId);
      const approvals = await tx
        .select({ userId: treeDeletionApprovals.userId })
        .from(treeDeletionApprovals)
        .where(eq(treeDeletionApprovals.requestId, request.id));
      const awaiting = ownersAwaitingApproval(
        owners.map(owner => owner.userId),
        approvals.map(row => row.userId),
      );

      if (awaiting.length) {
        await logActivity(tx, {
          treeId,
          actor: access.user,
          action: "tree.deletion_approved",
          entityType: "tree",
          entityId: treeId,
          summary: "Approved deleting the tree",
          summaryKey: "tree.activity.summary.deletionApproved",
        });
        return { scheduled: false, purgeAfter: null, ownersAwaiting: awaiting.length };
      }

      if (
        !allOwnersApproved(
          owners.map(owner => owner.userId),
          approvals.map(row => row.userId),
        )
      ) {
        throw new AppError(userMessage("tree.error.deletionNeedsApproval"));
      }

      const purgeAfter = await scheduleTreeDeletion(tx, {
        treeId,
        actor: access.user,
        deletedBy: request.requestedBy,
        summary: "Every owner approved. The tree is scheduled for deletion.",
        summaryKey: "tree.activity.summary.deletionScheduled",
      });
      return { scheduled: true, purgeAfter, ownersAwaiting: 0 };
    });

    if (outcome.scheduled && outcome.purgeAfter) {
      const emailsSent = await emailMembersAboutSchedule({
        treeId,
        treeName: access.tree.name,
        purgeAt: outcome.purgeAfter,
      });
      notifyTreeChanged(treeId);
      return {
        scheduled: true,
        purgeAfter: outcome.purgeAfter,
        ownersAwaiting: 0,
        emailsSent,
      };
    }

    notifyTreeChanged(treeId);
    return {
      scheduled: false,
      purgeAfter: null,
      ownersAwaiting: outcome.ownersAwaiting,
      emailsSent: 0,
    };
  });
}

/** Any owner can cancel a request. The tree was never locked. */
export async function cancelTreeDeletionRequest(
  treeId: string,
): Promise<ActionResult<undefined>> {
  return runAction("trees.cancelTreeDeletionRequest", async () => {
    const access = await requireTreeMember(treeId, "owner");
    const deleted = await db.transaction(async tx => {
      const rows = await tx
        .delete(treeDeletionRequests)
        .where(eq(treeDeletionRequests.treeId, treeId))
        .returning({ id: treeDeletionRequests.id });
      if (rows.length) {
        await logActivity(tx, {
          treeId,
          actor: access.user,
          action: "tree.deletion_cancelled",
          entityType: "tree",
          entityId: treeId,
          summary: "Cancelled the tree deletion request",
          summaryKey: "tree.activity.summary.deletionCancelled",
        });
      }
      return rows.length;
    });
    if (!deleted) throw new AppError(userMessage("tree.error.noDeletionRequestToCancel"));
    notifyTreeChanged(treeId);
    return undefined;
  });
}

/** Restores a tree during the grace period. Any owner may do this. */
export async function restoreTree(treeId: string): Promise<ActionResult<{ name: string }>> {
  return runAction("trees.restoreTree", async () => {
    const access = await requireTreeMember(treeId, "owner", { includeDeleted: true });
    if (!access.tree.deletedAt) throw new AppError(userMessage("tree.error.notScheduledForDeletion"));

    await db.transaction(async tx => {
      await tx
        .update(trees)
        .set({
          deletedAt: null,
          purgeAfter: null,
          deletedBy: null,
          deletionReminderSentAt: null,
          updatedAt: new Date(),
        })
        .where(eq(trees.id, treeId));
      await tx
        .delete(treeDeletionRequests)
        .where(eq(treeDeletionRequests.treeId, treeId));
      await logActivity(tx, {
        treeId,
        actor: access.user,
        action: "tree.restored",
        entityType: "tree",
        entityId: treeId,
        summary: "Restored the tree before its deletion date",
        summaryKey: "tree.activity.summary.treeRestored",
      });
    });

    notifyTreeChanged(treeId);
    return { name: access.tree.name };
  });
}

export type TreeMemberView = {
  userId: string;
  email: string;
  displayName: string;
  role: TreeRole;
  joinedAt: Date;
  /** The person this member represents in the tree, when they claimed one. */
  personId: string | null;
  personName: string | null;
};

export async function getTreeMembers(treeId: string): Promise<TreeMemberView[]> {
  await requireTreeMember(treeId);
  const rows = await db
    .select({
      userId: users.id,
      email: users.email,
      displayName: users.displayName,
      role: treeMembers.role,
      joinedAt: treeMembers.createdAt,
      personId: people.id,
      firstName: people.firstName,
      lastName: people.lastName,
      nickname: people.nickname,
    })
    .from(treeMembers)
    .innerJoin(users, eq(users.id, treeMembers.userId))
    .leftJoin(people, eq(people.id, treeMembers.personId))
    .where(eq(treeMembers.treeId, treeId))
    .orderBy(asc(treeMembers.createdAt));
  return rows.map(row => ({
    userId: row.userId,
    email: row.email,
    displayName: row.displayName,
    role: row.role,
    joinedAt: row.joinedAt,
    personId: row.personId,
    personName: row.personId
      ? `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim() || row.nickname || "Unnamed person"
      : null,
  }));
}

/** Owners can correct a claim, for example when someone linked the wrong person. */
export async function clearMemberPerson(input: {
  treeId: string;
  userId: string;
}): Promise<ActionResult<undefined>> {
  return runAction("trees.clearMemberPerson", async () => {
    await requireTreeMember(input.treeId, "owner");
    const updated = await db
      .update(treeMembers)
      .set({ personId: null })
      .where(
        and(
          eq(treeMembers.treeId, input.treeId),
          eq(treeMembers.userId, input.userId),
        ),
      )
      .returning({ userId: treeMembers.userId });
    if (!updated.length) throw new AppError(userMessage("tree.error.memberNotFound"));
    return undefined;
  });
}

export async function updateMemberRole(input: {
  treeId: string;
  userId: string;
  role: "owner" | "editor" | "viewer";
}): Promise<ActionResult<undefined>> {
  return runAction("trees.updateMemberRole", async () => {
    const access = await requireTreeMember(input.treeId, "owner");
    const role = treeRoleSchema.parse(input.role);
    await db.transaction(async tx => {
      const owners = await tx
        .select({ userId: treeMembers.userId })
        .from(treeMembers)
        .where(and(eq(treeMembers.treeId, input.treeId), eq(treeMembers.role, "owner")));
      if (role !== "owner" && owners.some(owner => owner.userId === input.userId) && owners.length <= 1) {
        throw new AppError(userMessage("tree.error.needsOwner"));
      }
      const updated = await tx
        .update(treeMembers)
        .set({ role })
        .where(
          and(eq(treeMembers.treeId, input.treeId), eq(treeMembers.userId, input.userId)),
        )
        .returning({ userId: treeMembers.userId });
      if (!updated.length) throw new AppError(userMessage("tree.error.memberNotFound"));
      const [target] = await tx
        .select({ displayName: users.displayName })
        .from(users)
        .where(eq(users.id, input.userId))
        .limit(1);
      const targetName = target?.displayName ?? "a member";
      await logActivity(tx, {
        treeId: access.tree.id,
        actor: access.user,
        action: "member.role_changed",
        entityType: "member",
        entityId: input.userId,
        summary: `Changed ${targetName}'s role to ${role}`,
        summaryKey:
          role === "owner"
            ? "tree.activity.summary.memberRoleChangedOwner"
            : role === "editor"
              ? "tree.activity.summary.memberRoleChangedEditor"
              : "tree.activity.summary.memberRoleChangedViewer",
        summaryParams: { name: targetName },
      });
    });
    notifyTreeChanged(input.treeId);
    return undefined;
  });
}

export async function removeMember(input: {
  treeId: string;
  userId: string;
}): Promise<ActionResult<undefined>> {
  return runAction("trees.removeMember", async () => {
    const access = await requireTreeMember(input.treeId, "owner");
    await db.transaction(async tx => {
      const members = await tx
        .select({ userId: treeMembers.userId, role: treeMembers.role })
        .from(treeMembers)
        .where(eq(treeMembers.treeId, input.treeId));
      const target = members.find(member => member.userId === input.userId);
      if (!target) throw new AppError(userMessage("tree.error.memberNotFound"));
      if (target.role === "owner" && members.filter(member => member.role === "owner").length <= 1) {
        throw new AppError(userMessage("tree.error.needsOwner"));
      }
      const [targetUser] = await tx
        .select({ displayName: users.displayName })
        .from(users)
        .where(eq(users.id, input.userId))
        .limit(1);
      await tx
        .delete(treeMembers)
        .where(
          and(eq(treeMembers.treeId, input.treeId), eq(treeMembers.userId, input.userId)),
        );
      await logActivity(tx, {
        treeId: access.tree.id,
        actor: access.user,
        action: "member.removed",
        entityType: "member",
        entityId: input.userId,
        summary: `Removed ${targetUser?.displayName ?? "a member"} from the tree`,
        summaryKey: "tree.activity.summary.memberRemoved",
        summaryParams: { name: targetUser?.displayName ?? "a member" },
      });
    });
    notifyTreeChanged(input.treeId);
    return undefined;
  });
}

export async function leaveTree(treeId: string): Promise<ActionResult<undefined>> {
  return runAction("trees.leaveTree", async () => {
    const access = await requireTreeMember(treeId);
    await db.transaction(async tx => {
      if (access.role === "owner") {
        const owners = await tx
          .select({ userId: treeMembers.userId })
          .from(treeMembers)
          .where(and(eq(treeMembers.treeId, treeId), eq(treeMembers.role, "owner")));
        if (owners.length <= 1) throw new AppError(userMessage("tree.error.promoteOwnerBeforeLeaving"));
      }
      await tx
        .delete(treeMembers)
        .where(and(eq(treeMembers.treeId, treeId), eq(treeMembers.userId, access.user.id)));
      await logActivity(tx, {
        treeId,
        actor: access.user,
        action: "member.left",
        entityType: "member",
        entityId: access.user.id,
        summary: `${access.user.displayName} left the tree`,
        summaryKey: "tree.activity.summary.memberLeft",
        summaryParams: { name: access.user.displayName },
      });
    });
    notifyTreeChanged(treeId);
    return undefined;
  });
}

export type InviteView = {
  id: string;
  role: TreeRole;
  email: string | null;
  sentAt: Date | null;
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  acceptedAt: Date | null;
  acceptedBy: string | null;
};

export async function getTreeInvites(treeId: string): Promise<InviteView[]> {
  await requireTreeMember(treeId, "owner");
  return db
    .select({
      id: treeInvites.id,
      role: treeInvites.role,
      email: treeInvites.email,
      sentAt: treeInvites.sentAt,
      createdAt: treeInvites.createdAt,
      expiresAt: treeInvites.expiresAt,
      revokedAt: treeInvites.revokedAt,
      acceptedAt: treeInvites.acceptedAt,
      acceptedBy: treeInvites.acceptedBy,
    })
    .from(treeInvites)
    .where(eq(treeInvites.treeId, treeId))
    .orderBy(desc(treeInvites.createdAt));
}

export type CreatedInvite = {
  id: string;
  url: string;
  expiresAt: Date;
  role: TreeRole;
  email: string | null;
  emailSent: boolean;
  emailSimulated: boolean;
  emailError?: string;
};

async function issueInvite(input: {
  treeId: string;
  role: TreeRole;
  email: string | null;
  expiresInDays: number;
  createdBy: string;
  inviterName: string;
  treeName: string;
}) {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashInviteToken(token);
  const expiresAt = new Date(Date.now() + input.expiresInDays * 24 * 60 * 60_000);

  const invite = await db.transaction(async tx => {
    if (input.email) {
      // Only the newest pending invite for an address stays usable.
      await tx
        .update(treeInvites)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(treeInvites.treeId, input.treeId),
            eq(treeInvites.email, input.email),
            isNull(treeInvites.acceptedAt),
            isNull(treeInvites.revokedAt),
            gt(treeInvites.expiresAt, new Date()),
          ),
        );
    }

    const [created] = await tx
      .insert(treeInvites)
      .values({
        treeId: input.treeId,
        tokenHash,
        role: input.role,
        email: input.email,
        createdBy: input.createdBy,
        expiresAt,
      })
      .returning();
    await logActivity(tx, {
      treeId: input.treeId,
      actor: { id: input.createdBy, displayName: input.inviterName },
      action: "invite.created",
      entityType: "invite",
      entityId: created.id,
      summary: input.email
        ? `Invited ${input.email} as ${input.role}`
        : `Created an invite link as ${input.role}`,
      summaryKey: input.email
        ? input.role === "owner"
          ? "tree.activity.summary.inviteCreatedEmailOwner"
          : input.role === "editor"
            ? "tree.activity.summary.inviteCreatedEmailEditor"
            : "tree.activity.summary.inviteCreatedEmailViewer"
        : input.role === "owner"
          ? "tree.activity.summary.inviteLinkCreatedOwner"
          : input.role === "editor"
            ? "tree.activity.summary.inviteLinkCreatedEditor"
            : "tree.activity.summary.inviteLinkCreatedViewer",
      summaryParams: input.email ? { email: input.email } : {},
    });
    return created;
  });

  const url = `${publicOrigin()}/invite/${token}`;
  let emailSent = false;
  let emailSimulated = false;
  let emailError: string | undefined;

  if (input.email) {
    const result = await sendEmail(
      input.email,
      inviteMessage({
        treeName: input.treeName,
        inviterName: input.inviterName,
        role: invite.role,
        url,
        expiresAt: invite.expiresAt,
      }),
    );
    if (result.delivered) {
      await db
        .update(treeInvites)
        .set({ sentAt: new Date() })
        .where(eq(treeInvites.id, invite.id));
      emailSent = true;
    } else if (result.simulated) {
      emailSimulated = true;
    } else {
      emailError =
        result.reason === "not_configured"
          ? userMessage("tree.error.emailNotConfigured")
          : userMessage("tree.invites.emailFailed");
    }
  }

  return {
    id: invite.id,
    url,
    expiresAt: invite.expiresAt,
    role: invite.role,
    email: invite.email,
    emailSent,
    emailSimulated,
    emailError,
  } satisfies CreatedInvite;
}

export async function createInvite(input: {
  treeId: string;
  role: TreeRole;
  expiresInDays: number;
  email?: string | null;
}): Promise<ActionResult<CreatedInvite>> {
  return runAction("trees.createInvite", async () => {
    const access = await requireTreeMember(input.treeId, "owner");
    const parsed = inviteSchema.parse(input);
    const email = input.email ? inviteEmailSchema.parse(input.email) : null;

    if (email) {
      if (!access.user.emailVerified) {
        throw new AppError(userMessage("tree.error.verifyEmailFirst"));
      }
      if (email === access.user.email.toLowerCase()) {
        throw new AppError(userMessage("tree.error.ownEmail"));
      }
      const existing = await db
        .select({ userId: treeMembers.userId })
        .from(treeMembers)
        .innerJoin(users, eq(users.id, treeMembers.userId))
        .where(and(eq(treeMembers.treeId, input.treeId), eq(users.email, email)))
        .limit(1);
      if (existing.length) throw new AppError(userMessage("tree.error.alreadyMember"));
    }

    return issueInvite({
      treeId: access.tree.id,
      role: parsed.role,
      email,
      expiresInDays: parsed.expiresInDays,
      createdBy: access.user.id,
      inviterName: access.user.displayName,
      treeName: access.tree.name,
    });
  });
}

export async function resendInvite(input: {
  treeId: string;
  inviteId: string;
}): Promise<ActionResult<CreatedInvite>> {
  return runAction("trees.resendInvite", async () => {
    const access = await requireTreeMember(input.treeId, "owner");
    if (!access.user.emailVerified) {
      throw new AppError(userMessage("tree.error.verifyEmailFirst"));
    }
    const rows = await db
      .select()
      .from(treeInvites)
      .where(
        and(
          eq(treeInvites.id, input.inviteId),
          eq(treeInvites.treeId, input.treeId),
          isNull(treeInvites.acceptedAt),
          isNull(treeInvites.revokedAt),
          gt(treeInvites.expiresAt, new Date()),
        ),
      )
      .limit(1);
    const invite = rows[0];
    if (!invite) throw new AppError(userMessage("tree.error.inviteInactive"));
    if (!invite.email) throw new AppError(userMessage("tree.error.inviteNoEmail"));

    const days = Math.min(
      30,
      Math.max(
        1,
        Math.round(
          (invite.expiresAt.getTime() - invite.createdAt.getTime()) / (24 * 60 * 60_000),
        ),
      ),
    );

    await db
      .update(treeInvites)
      .set({ revokedAt: new Date() })
      .where(eq(treeInvites.id, invite.id));

    return issueInvite({
      treeId: access.tree.id,
      role: invite.role,
      email: invite.email,
      expiresInDays: days,
      createdBy: access.user.id,
      inviterName: access.user.displayName,
      treeName: access.tree.name,
    });
  });
}

export async function revokeInvite(input: {
  treeId: string;
  inviteId: string;
}): Promise<ActionResult<undefined>> {
  return runAction("trees.revokeInvite", async () => {
    const access = await requireTreeMember(input.treeId, "owner");
    const [updated] = await db
      .update(treeInvites)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(treeInvites.id, input.inviteId),
          eq(treeInvites.treeId, input.treeId),
          isNull(treeInvites.revokedAt),
          isNull(treeInvites.acceptedAt),
        ),
      )
      .returning({ id: treeInvites.id, email: treeInvites.email });
    if (!updated) throw new AppError(userMessage("tree.error.inviteInactive"));
    await logActivity(db, {
      treeId: access.tree.id,
      actor: access.user,
      action: "invite.revoked",
      entityType: "invite",
      entityId: updated.id,
      summary: updated.email
        ? `Revoked the invite for ${updated.email}`
        : "Revoked an invite link",
      summaryKey: updated.email
        ? "tree.activity.summary.inviteRevoked"
        : "tree.activity.summary.inviteLinkRevoked",
      summaryParams: updated.email ? { email: updated.email } : {},
    });
    return undefined;
  });
}

export type InvitePreview =
  | {
      status: "valid";
      treeName: string;
      inviterName: string;
      role: TreeRole;
      email: string | null;
      expiresAt: Date;
    }
  | { status: "expired" | "revoked" | "used" | "invalid" };

export async function getInvitePreview(token: string): Promise<InvitePreview> {
  if (!token || token.length > 200) return { status: "invalid" };
  const rows = await db
    .select({
      role: treeInvites.role,
      email: treeInvites.email,
      expiresAt: treeInvites.expiresAt,
      revokedAt: treeInvites.revokedAt,
      acceptedAt: treeInvites.acceptedAt,
      treeName: trees.name,
      inviterName: users.displayName,
    })
    .from(treeInvites)
    .innerJoin(trees, eq(trees.id, treeInvites.treeId))
    .leftJoin(users, eq(users.id, treeInvites.createdBy))
    .where(eq(treeInvites.tokenHash, hashInviteToken(token)))
    .limit(1);
  const invite = rows[0];
  if (!invite) return { status: "invalid" };
  if (invite.revokedAt) return { status: "revoked" };
  if (invite.acceptedAt) return { status: "used" };
  if (invite.expiresAt.getTime() <= Date.now()) return { status: "expired" };
  return {
    status: "valid",
    treeName: invite.treeName,
    inviterName: invite.inviterName ?? "Someone",
    role: invite.role,
    email: invite.email,
    expiresAt: invite.expiresAt,
  };
}

export async function acceptInvite(token: string): Promise<ActionResult<{ treeId: string }>> {
  return runAction("trees.acceptInvite", async () => {
    const user = await requireUser();
    if (!token || token.length > 200) throw new AppError(userMessage("tree.error.inviteInvalid"));
    const tokenHash = hashInviteToken(token);

    const result = await db.transaction(async tx => {
      const rows = await tx
        .select()
        .from(treeInvites)
        .where(eq(treeInvites.tokenHash, tokenHash))
        .for("update")
        .limit(1);
      const invite = rows[0];
      if (!invite) throw new AppError(userMessage("tree.error.inviteInvalid"));
      if (invite.revokedAt) throw new AppError(userMessage("tree.error.inviteRevoked"));
      if (invite.acceptedAt) throw new AppError(userMessage("tree.error.inviteUsed"));
      if (invite.expiresAt.getTime() <= Date.now()) throw new AppError(userMessage("tree.error.inviteExpired"));

      const existing = await tx
        .select({ userId: treeMembers.userId })
        .from(treeMembers)
        .where(
          and(eq(treeMembers.treeId, invite.treeId), eq(treeMembers.userId, user.id)),
        )
        .limit(1);

      if (!existing.length) {
        await tx.insert(treeMembers).values({
          treeId: invite.treeId,
          userId: user.id,
          role: invite.role,
        });
      }

      await tx
        .update(treeInvites)
        .set({ acceptedAt: new Date(), acceptedBy: user.id })
        .where(eq(treeInvites.id, invite.id));

      await logActivity(tx, {
        treeId: invite.treeId,
        actor: user,
        action: "invite.accepted",
        entityType: "invite",
        entityId: invite.id,
        summary: existing.length
          ? `${user.displayName} accepted an invite`
          : `${user.displayName} joined the tree`,
        summaryKey: existing.length
          ? "tree.activity.summary.inviteAcceptedExisting"
          : "tree.activity.summary.inviteAcceptedJoined",
        summaryParams: { name: user.displayName },
      });

      return { treeId: invite.treeId };
    });
    notifyTreeChanged(result.treeId);
    return result;
  });
}

function hashInviteToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
