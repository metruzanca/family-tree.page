/** How long a tree stays restorable after every owner approves its deletion. */
export const TREE_DELETION_GRACE_DAYS = 30;

/** How long owners have to approve a deletion request before it lapses. */
export const TREE_DELETION_REQUEST_TTL_DAYS = 14;

/** When the reminder before permanent deletion goes out. */
export const TREE_DELETION_REMINDER_DAYS = 7;

const DAY_MS = 24 * 60 * 60_000;

export function purgeAfterFrom(now: Date = new Date()): Date {
  return new Date(now.getTime() + TREE_DELETION_GRACE_DAYS * DAY_MS);
}

export function requestExpiresAtFrom(now: Date = new Date()): Date {
  return new Date(now.getTime() + TREE_DELETION_REQUEST_TTL_DAYS * DAY_MS);
}

/**
 * Owners who have not approved yet, compared against the current owner list so
 * a promoted or removed owner changes the requirement immediately.
 */
export function ownersAwaitingApproval(
  ownerIds: readonly string[],
  approvedIds: Iterable<string>,
): string[] {
  const approved = new Set(approvedIds);
  return ownerIds.filter(ownerId => !approved.has(ownerId));
}

export function allOwnersApproved(
  ownerIds: readonly string[],
  approvedIds: Iterable<string>,
): boolean {
  return ownerIds.length > 0 && ownersAwaitingApproval(ownerIds, approvedIds).length === 0;
}

/** Whole days left before the purge, rounded up and never below zero. */
export function daysUntilPurge(
  purgeAfter: Date | string | null | undefined,
  now: Date = new Date(),
): number {
  if (!purgeAfter) return 0;
  const date = purgeAfter instanceof Date ? purgeAfter : new Date(purgeAfter);
  if (Number.isNaN(date.getTime())) return 0;
  return Math.max(0, Math.ceil((date.getTime() - now.getTime()) / DAY_MS));
}
