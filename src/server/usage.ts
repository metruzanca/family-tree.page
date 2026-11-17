import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "./db";
import {
  files,
  usageEvents,
  users,
  usageEventKind,
  type UsageEvent,
} from "../../drizzle/schema";
import { AppError } from "./errors";
import { optionalEnv } from "./config";
import { formatBytes } from "../lib/format";

export const DEFAULT_STORAGE_QUOTA_BYTES = 1024 * 1024 * 1024;
export const DEFAULT_PEOPLE_QUOTA = 500;
export const MAX_PENDING_UPLOADS = 50;

export type UsageKind = (typeof usageEventKind.enumValues)[number];

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export class QuotaError extends AppError {}

export function supportEmail() {
  return optionalEnv("SUPPORT_EMAIL", "samuele+family-tree@zanca.dev");
}

export type AccountUsage = {
  storageBytes: number;
  storageQuotaBytes: number;
  peopleCreated: number;
  peopleQuota: number;
  pendingUploads: number;
  supportEmail: string;
};

export async function getAccountUsage(userId: string): Promise<AccountUsage> {
  const [user] = await db
    .select({
      storageQuotaBytes: users.storageQuotaBytes,
      peopleCreated: users.peopleCreatedCount,
      peopleQuota: users.peopleQuota,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) throw new AppError("Account not found.");

  const [usage] = await db
    .select({
      bytes: sql<string>`coalesce(sum(${files.sizeBytes} + coalesce(${files.thumbSizeBytes}, 0)), 0)`,
      pending: sql<string>`count(*) filter (where ${files.status} = 'uploading')`,
    })
    .from(files)
    .where(and(eq(files.uploadedBy, userId), ne(files.status, "failed")));

  return {
    storageBytes: Number(usage?.bytes ?? 0),
    storageQuotaBytes: Number(user.storageQuotaBytes),
    peopleCreated: user.peopleCreated,
    peopleQuota: user.peopleQuota,
    pendingUploads: Number(usage?.pending ?? 0),
    supportEmail: supportEmail(),
  };
}

/**
 * Reserves space for one upload inside the caller's transaction.
 *
 * The advisory lock serializes concurrent prepares for the same account. The
 * file row is inserted in the same transaction, so two parallel uploads cannot
 * both pass the check and then overshoot the quota.
 */
export async function reserveStorage(
  tx: Transaction,
  input: { userId: string; bytes: number },
): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${input.userId}), 1)`);

  const [user] = await tx
    .select({ quota: users.storageQuotaBytes })
    .from(users)
    .where(eq(users.id, input.userId))
    .limit(1);
  if (!user) throw new AppError("Account not found.");

  const [usage] = await tx
    .select({
      bytes: sql<string>`coalesce(sum(${files.sizeBytes} + coalesce(${files.thumbSizeBytes}, 0)), 0)`,
      pending: sql<string>`count(*) filter (where ${files.status} = 'uploading')`,
    })
    .from(files)
    .where(and(eq(files.uploadedBy, input.userId), ne(files.status, "failed")));

  if (Number(usage?.pending ?? 0) >= MAX_PENDING_UPLOADS) {
    throw new AppError("You have too many uploads in progress. Wait for them to finish and try again.");
  }

  const used = Number(usage?.bytes ?? 0);
  const reserved = Math.max(0, Math.round(input.bytes));
  if (used + reserved > Number(user.quota)) {
    throw new QuotaError(
      `You have reached your ${formatBytes(Number(user.quota))} storage limit. Delete some files or email ${supportEmail()} to ask for more space.`,
    );
  }
}

/**
 * Counts one created person against a lifetime per-account cap.
 *
 * The counter is conditional in SQL, so parallel creates cannot exceed the
 * quota and a later deletion never gives the slot back.
 */
export async function reservePersonSlot(tx: Transaction, userId: string): Promise<void> {
  const updated = await tx
    .update(users)
    .set({
      peopleCreatedCount: sql`${users.peopleCreatedCount} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(users.id, userId),
        sql`${users.peopleCreatedCount} < ${users.peopleQuota}`,
      ),
    )
    .returning({ count: users.peopleCreatedCount });

  if (updated.length) return;

  const [user] = await tx
    .select({ quota: users.peopleQuota })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const quota = user?.quota ?? DEFAULT_PEOPLE_QUOTA;
  throw new QuotaError(
    `You have reached your limit of ${quota} people created. Email ${supportEmail()} to ask for a higher limit.`,
  );
}

export async function recordUsage(input: {
  userId: string;
  kind: UsageKind;
  bytes?: number;
  itemCount?: number;
  treeId?: string | null;
}): Promise<void> {
  try {
    await db.insert(usageEvents).values({
      userId: input.userId,
      kind: input.kind,
      bytes: Math.max(0, Math.round(input.bytes ?? 0)),
      itemCount: Math.max(0, Math.round(input.itemCount ?? 0)),
      treeId: input.treeId ?? null,
    });
  } catch (error) {
    // Monitoring must never break the action it is observing.
    console.error("Could not record usage event", error);
  }
}

const rejectionLog = new Map<string, number>();
const REJECTION_INTERVAL_MS = 60_000;

/**
 * Rejection events can be triggered in a loop by an abusive client, so one
 * event per account, kind, and minute is enough to spot a pattern.
 */
export async function recordRejection(input: {
  userId: string;
  kind: Extract<
    UsageKind,
    "upload_rejected_quota" | "upload_rejected_type" | "upload_rejected_size" | "rate_limited"
  >;
  treeId?: string | null;
  bytes?: number;
  itemCount?: number;
}): Promise<void> {
  const now = Date.now();
  const key = `${input.userId}:${input.kind}`;
  const last = rejectionLog.get(key) ?? 0;
  if (now - last < REJECTION_INTERVAL_MS) return;

  rejectionLog.set(key, now);
  if (rejectionLog.size > 5000) {
    for (const [entry, at] of rejectionLog) {
      if (now - at > REJECTION_INTERVAL_MS) rejectionLog.delete(entry);
    }
  }

  await recordUsage(input);
}

export type UsageEventRow = UsageEvent;

/**
 * Deletes usage rows older than the retention window. Called by the daily
 * maintenance plugin.
 */
export async function pruneUsageEvents(days = 90): Promise<number> {
  const result = await db.execute(
    sql`delete from ${usageEvents} where ${usageEvents.createdAt} < now() - ${`${days} days`}::interval`,
  );
  return Number((result as { rowCount?: number }).rowCount ?? 0);
}
