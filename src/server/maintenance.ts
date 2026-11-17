import { log } from "./logger";
import { and, eq, isNotNull, lt, or, sql } from "drizzle-orm";
import { db } from "./db";
import {
  authTokens,
  birthdayEmailLog,
  files,
  treeInvites,
} from "../../drizzle/schema";
import { cleanupFile } from "./file-service";
import { pruneUsageEvents } from "./usage";
import { sendAbuseDigest } from "./abuse-report";

const STALE_UPLOAD_MS = 24 * 60 * 60_000;
const TOKEN_GRACE_MS = 30 * 24 * 60 * 60_000;
const INVITE_GRACE_MS = 90 * 24 * 60 * 60_000;
const USAGE_RETENTION_DAYS = 90;
const BIRTHDAY_LOG_RETENTION_MONTHS = 12;

export type MaintenanceSummary = {
  staleUploads: number;
  authTokens: number;
  invites: number;
  birthdayLogs: number;
  usageEvents: number;
  abuseWarnings: number;
  abuseDigestSent: boolean;
};

export async function runMaintenance(): Promise<MaintenanceSummary> {
  const now = Date.now();

  const stale = await db
    .select()
    .from(files)
    .where(
      and(
        eq(files.status, "uploading"),
        lt(files.createdAt, new Date(now - STALE_UPLOAD_MS)),
      ),
    )
    .limit(500);
  let staleUploads = 0;
  for (const file of stale) {
    try {
      await cleanupFile(file);
      staleUploads += 1;
    } catch (error) {
      log.error("maintenance.stale_upload_failed", { fileId: file.id, error });
    }
  }

  const tokenCutoff = new Date(now - TOKEN_GRACE_MS);
  const tokenRows = await db
    .delete(authTokens)
    .where(
      or(
        lt(authTokens.expiresAt, tokenCutoff),
        and(isNotNull(authTokens.usedAt), lt(authTokens.usedAt, tokenCutoff)),
      ),
    )
    .returning({ id: authTokens.id });

  const inviteCutoff = new Date(now - INVITE_GRACE_MS);
  const inviteRows = await db
    .delete(treeInvites)
    .where(
      or(
        lt(treeInvites.expiresAt, inviteCutoff),
        and(isNotNull(treeInvites.revokedAt), lt(treeInvites.revokedAt, inviteCutoff)),
        and(isNotNull(treeInvites.acceptedAt), lt(treeInvites.acceptedAt, inviteCutoff)),
      ),
    )
    .returning({ id: treeInvites.id });

  const birthdayRows = await db
    .delete(birthdayEmailLog)
    .where(
      sql`${birthdayEmailLog.sentOn} < current_date - interval '${sql.raw(
        String(BIRTHDAY_LOG_RETENTION_MONTHS),
      )} months'`,
    )
    .returning({ id: birthdayEmailLog.id });

  const usageEvents = await pruneUsageEvents(USAGE_RETENTION_DAYS);

  let abuseWarnings = 0;
  let abuseDigestSent = false;
  try {
    const digest = await sendAbuseDigest();
    abuseWarnings = digest.warnings;
    abuseDigestSent = digest.sent;
  } catch (error) {
    log.error("maintenance.abuse_digest_failed", { error });
  }

  return {
    staleUploads,
    authTokens: tokenRows.length,
    invites: inviteRows.length,
    birthdayLogs: birthdayRows.length,
    usageEvents,
    abuseWarnings,
    abuseDigestSent,
  };
}
