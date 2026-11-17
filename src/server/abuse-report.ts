import { gte, sql } from "drizzle-orm";
import { db } from "./db";
import { files, jobRuns, usageEvents, users } from "../../drizzle/schema";
import { optionalEnv } from "./config";
import { sendEmail } from "./email";

const DAY_MS = 24 * 60 * 60_000;

export const ABUSE_THRESHOLDS = {
  quotaMultiplePerDay: 2,
  filesPerDay: 1000,
  treeChurnPerDay: 20,
  quotaRejectionsPerDay: 20,
  typeRejectionsPerDay: 20,
  rateLimitsPerDay: 20,
};

export type AbuseWindow = {
  bytes: number;
  files: number;
  treesCreated: number;
  treesDeleted: number;
  peopleCreated: number;
  quotaRejections: number;
  typeRejections: number;
  rateLimits: number;
};

export type AbuseAccount = {
  userId: string;
  email: string;
  displayName: string;
  storageBytes: number;
  storageQuotaBytes: number;
  day: AbuseWindow;
  week: AbuseWindow;
  warnings: string[];
  lastEventAt: Date | null;
};

export type UsageAccount = {
  userId: string;
  email: string;
  displayName: string;
  storageBytes: number;
  storageQuotaBytes: number;
  peopleCreated: number;
  peopleQuota: number;
  pendingUploads: number;
};

function emptyWindow(): AbuseWindow {
  return {
    bytes: 0,
    files: 0,
    treesCreated: 0,
    treesDeleted: 0,
    peopleCreated: 0,
    quotaRejections: 0,
    typeRejections: 0,
    rateLimits: 0,
  };
}

function storageByUser() {
  return db
    .select({
      userId: files.uploadedBy,
      bytes: sql<string>`coalesce(sum(${files.sizeBytes} + coalesce(${files.thumbSizeBytes}, 0)), 0)`,
      pending: sql<string>`count(*) filter (where ${files.status} = 'uploading')`,
    })
    .from(files)
    .where(sql`${files.uploadedBy} is not null`)
    .groupBy(files.uploadedBy);
}

export async function getUsageReport(): Promise<UsageAccount[]> {
  const storageRows = await storageByUser();
  const storage = new Map(
    storageRows.map(row => [
      row.userId ?? "",
      { bytes: Number(row.bytes ?? 0), pending: Number(row.pending ?? 0) },
    ]),
  );

  const rows = await db
    .select({
      userId: users.id,
      email: users.email,
      displayName: users.displayName,
      storageQuotaBytes: users.storageQuotaBytes,
      peopleCreated: users.peopleCreatedCount,
      peopleQuota: users.peopleQuota,
    })
    .from(users);

  return rows
    .map(row => {
      const used = storage.get(row.userId);
      return {
        ...row,
        storageQuotaBytes: Number(row.storageQuotaBytes),
        storageBytes: used?.bytes ?? 0,
        pendingUploads: used?.pending ?? 0,
      };
    })
    .sort((a, b) => b.storageBytes - a.storageBytes);
}

function applyEvent(window: AbuseWindow, row: { kind: string; bytes: number; itemCount: number }) {
  switch (row.kind) {
    case "file_uploaded":
      window.bytes += row.bytes;
      window.files += row.itemCount;
      break;
    case "tree_created":
      window.treesCreated += 1;
      break;
    case "tree_deleted":
      window.treesDeleted += 1;
      break;
    case "person_created":
      window.peopleCreated += 1;
      break;
    case "upload_rejected_quota":
      window.quotaRejections += 1;
      break;
    case "upload_rejected_type":
    case "upload_rejected_size":
      window.typeRejections += 1;
      break;
    case "rate_limited":
      window.rateLimits += 1;
      break;
  }
}

export async function getAbuseReport(): Promise<AbuseAccount[]> {
  const now = Date.now();
  const dayStart = new Date(now - DAY_MS);
  const weekStart = new Date(now - 7 * DAY_MS);

  const eventRows = await db
    .select({
      userId: usageEvents.userId,
      kind: usageEvents.kind,
      bytes: usageEvents.bytes,
      itemCount: usageEvents.itemCount,
      createdAt: usageEvents.createdAt,
    })
    .from(usageEvents)
    .where(gte(usageEvents.createdAt, weekStart));

  const storageRows = await storageByUser();
  const storage = new Map(
    storageRows.map(row => [
      row.userId ?? "",
      Number(row.bytes ?? 0),
    ]),
  );

  const userRows = await db
    .select({
      userId: users.id,
      email: users.email,
      displayName: users.displayName,
      storageQuotaBytes: users.storageQuotaBytes,
    })
    .from(users);

  const accounts = new Map<string, AbuseAccount>();
  for (const user of userRows) {
    accounts.set(user.userId, {
      ...user,
      storageQuotaBytes: Number(user.storageQuotaBytes),
      storageBytes: storage.get(user.userId) ?? 0,
      day: emptyWindow(),
      week: emptyWindow(),
      warnings: [],
      lastEventAt: null,
    });
  }

  for (const row of eventRows) {
    const account = accounts.get(row.userId);
    if (!account) continue;
    applyEvent(account.week, row);
    if (row.createdAt >= dayStart) applyEvent(account.day, row);
    if (!account.lastEventAt || row.createdAt > account.lastEventAt) {
      account.lastEventAt = row.createdAt;
    }
  }

  const result = [...accounts.values()].filter(account => account.lastEventAt);
  for (const account of result) {
    account.warnings = warningsFor(account);
  }

  return result
    .filter(account => account.lastEventAt)
    .sort((a, b) => {
      if (a.warnings.length !== b.warnings.length) return b.warnings.length - a.warnings.length;
      return b.week.bytes - a.week.bytes;
    });
}

function warningsFor(account: AbuseAccount): string[] {
  const warnings: string[] = [];
  const { day } = account;
  const quota = Math.max(1, account.storageQuotaBytes);

  if (day.bytes > quota * ABUSE_THRESHOLDS.quotaMultiplePerDay) {
    warnings.push("uploaded more than twice the storage quota in 24 hours");
  }
  if (day.files >= ABUSE_THRESHOLDS.filesPerDay) {
    warnings.push(`${day.files} files uploaded in 24 hours`);
  }
  if (
    day.treesCreated + day.treesDeleted >= ABUSE_THRESHOLDS.treeChurnPerDay &&
    day.treesCreated > 2 &&
    day.treesDeleted > 2
  ) {
    warnings.push(`${day.treesCreated} trees created and ${day.treesDeleted} deleted in 24 hours`);
  }
  if (day.quotaRejections >= ABUSE_THRESHOLDS.quotaRejectionsPerDay) {
    warnings.push(`${day.quotaRejections} quota rejections in 24 hours`);
  }
  if (day.typeRejections >= ABUSE_THRESHOLDS.typeRejectionsPerDay) {
    warnings.push(`${day.typeRejections} rejected file types in 24 hours`);
  }
  if (day.rateLimits >= ABUSE_THRESHOLDS.rateLimitsPerDay) {
    warnings.push(`${day.rateLimits} rate limit trips in 24 hours`);
  }
  return warnings;
}

export function formatBytesShort(bytes: number) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

export function formatAbuseReport(accounts: AbuseAccount[]): string {
  if (!accounts.length) return "No usage events in the last 7 days.";
  const lines = [
    "account".padEnd(34) + "files/24h".padStart(10) + "MB/24h".padStart(10) + "warnings",
  ];
  for (const account of accounts) {
    if (!account.warnings.length) continue;
    lines.push(
      account.email.padEnd(34) +
        String(account.day.files).padStart(10) +
        formatBytesShort(account.day.bytes).padStart(10) +
        "  " +
        account.warnings.join("; "),
    );
  }
  if (lines.length === 1) return "No accounts crossed a threshold in the last 24 hours.";
  return lines.join("\n");
}

export async function sendAbuseDigest(): Promise<{
  sent: boolean;
  warnings: number;
}> {
  const recipient = optionalEnv("ADMIN_ALERT_EMAIL", "").trim();
  if (!recipient) return { sent: false, warnings: 0 };

  const accounts = (await getAbuseReport()).filter(account => account.warnings.length);
  if (!accounts.length) return { sent: false, warnings: 0 };

  // Claim the daily send before doing any work, so restarts and a second
  // replica cannot send the same digest again.
  const claimed = await db
    .insert(jobRuns)
    .values({ name: "abuse_digest", lastRunAt: new Date() })
    .onConflictDoUpdate({
      target: jobRuns.name,
      set: { lastRunAt: new Date() },
      setWhere: sql`${jobRuns.lastRunAt} < now() - interval '20 hours'`,
    })
    .returning({ name: jobRuns.name });
  if (!claimed.length) return { sent: false, warnings: accounts.length };

  const lines = accounts.map(
    account =>
      `${account.email} (${account.userId})\n` +
      `  storage: ${formatBytesShort(account.storageBytes)} of ${formatBytesShort(account.storageQuotaBytes)}\n` +
      `  24h: ${account.day.files} files, ${formatBytesShort(account.day.bytes)}, ` +
      `${account.day.treesCreated} trees created, ${account.day.treesDeleted} deleted, ` +
      `${account.day.quotaRejections} quota rejections, ${account.day.typeRejections} type rejections, ` +
      `${account.day.rateLimits} rate limits\n` +
      `  warnings: ${account.warnings.join("; ")}`,
  );

  const result = await sendEmail(recipient, {
    subject: `family-tree abuse digest: ${accounts.length} account${accounts.length === 1 ? "" : "s"} flagged`,
    text: `These accounts crossed a monitoring threshold in the last 24 hours.\n\n${lines.join("\n\n")}\n\nReview with: pnpm abuse:report\n`,
    html: `<p>These accounts crossed a monitoring threshold in the last 24 hours.</p><pre>${escapeHtml(lines.join("\n\n"))}</pre><p>Review with <code>pnpm abuse:report</code>.</p>`,
  });

  return { sent: result.delivered || Boolean(result.simulated), warnings: accounts.length };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
