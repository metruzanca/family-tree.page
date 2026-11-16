export const DB_DUMP_PREFIX = "postgres/";
export const MEDIA_SOURCE_PREFIX = "trees/";
export const MEDIA_BACKUP_PREFIX = "media/";
export const DAILY_RETENTION_DAYS = 30;
export const MONTHLY_RETENTION_DAYS = 366;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Dump keys are sortable and safe for S3:
 * postgres/2026-11-16T03-00-00Z.dump
 */
export function dumpKeyFor(date: Date): string {
  return `${DB_DUMP_PREFIX}${date.toISOString().slice(0, 19).replace(/:/g, "-")}Z.dump`;
}

export function parseDumpKey(key: string): Date | null {
  const match = /^postgres\/(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})Z\.dump$/.exec(
    key,
  );
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const date = new Date(Date.UTC(year, month, day, hour, minute, second));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute ||
    date.getUTCSeconds() !== second
  ) {
    return null;
  }
  return date;
}

export function shouldKeepDump(
  date: Date,
  now: Date,
  options: {
    dailyRetentionDays?: number;
    monthlyRetentionDays?: number;
  } = {},
): boolean {
  const dailyRetentionDays = options.dailyRetentionDays ?? DAILY_RETENTION_DAYS;
  const monthlyRetentionDays = options.monthlyRetentionDays ?? MONTHLY_RETENTION_DAYS;
  const ageMs = now.getTime() - date.getTime();

  if (ageMs < 0) return true;
  if (ageMs <= dailyRetentionDays * DAY_MS) return true;

  const firstOfMonth = date.getUTCDate() === 1;
  return firstOfMonth && ageMs <= monthlyRetentionDays * DAY_MS;
}

export function dumpsToDelete(keys: string[], now: Date): string[] {
  return keys.filter(key => {
    const date = parseDumpKey(key);
    if (!date) return false;
    return !shouldKeepDump(date, now);
  });
}

export function mediaBackupKey(sourceKey: string): string {
  return `${MEDIA_BACKUP_PREFIX}${sourceKey}`;
}

export function mediaSourceKey(backupKey: string): string | null {
  if (!backupKey.startsWith(MEDIA_BACKUP_PREFIX)) return null;
  return backupKey.slice(MEDIA_BACKUP_PREFIX.length);
}

/**
 * Backup keys whose source object no longer exists. The caller must only use
 * this after a successful source listing.
 */
export function staleMediaKeys(
  sourceKeys: Iterable<string>,
  backupKeys: Iterable<string>,
): string[] {
  const source = new Set(sourceKeys);
  const stale: string[] = [];
  for (const backupKey of backupKeys) {
    const sourceKey = mediaSourceKey(backupKey);
    if (!sourceKey) continue;
    if (!sourceKey.startsWith(MEDIA_SOURCE_PREFIX)) continue;
    if (!source.has(sourceKey)) stale.push(backupKey);
  }
  return stale;
}
