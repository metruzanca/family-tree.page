type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 10_000;

/**
 * A generous per-account ceiling for tree reads and writes.
 *
 * Normal use stays far below this. The point is to turn a runaway client or a
 * scraper into a rate limit event instead of thousands of quiet requests. The
 * map lives in the app process, matching the single-replica presence design.
 */
export function checkAccountRateLimit(
  userId: string,
  limit = 600,
  windowMs = 60_000,
): boolean {
  const now = Date.now();
  const key = `account:${userId}`;
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > MAX_BUCKETS) prune(now);
    return true;
  }

  bucket.count += 1;
  return bucket.count <= limit;
}

function prune(now: number) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}
