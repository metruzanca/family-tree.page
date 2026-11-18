export type ApiCursorKey = {
  updatedAt: string;
  id: string;
};

export type Page<T> = {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
};

export function encodeCursor(cursor: ApiCursorKey) {
  return Buffer.from(
    JSON.stringify({ u: cursor.updatedAt, i: cursor.id }),
    "utf8",
  ).toString("base64url");
}

export function decodeCursor(raw: string | null | undefined): ApiCursorKey | null {
  if (!raw) return null;
  if (raw.length > 300) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as {
      u?: unknown;
      i?: unknown;
    };
    if (typeof parsed.u !== "string" || typeof parsed.i !== "string") return null;
    if (Number.isNaN(Date.parse(parsed.u))) return null;
    return { updatedAt: parsed.u, id: parsed.i };
  } catch {
    return null;
  }
}

function isAfter(key: ApiCursorKey, cursor: ApiCursorKey) {
  if (key.updatedAt !== cursor.updatedAt) return key.updatedAt > cursor.updatedAt;
  return key.id > cursor.id;
}

/**
 * Stable cursor pagination over a sorted list. ISO timestamps compare
 * lexicographically because they are always UTC, and the id breaks ties.
 */
export function pageItems<T>(
  items: T[],
  options: {
    limit: number;
    cursor?: string | null;
    key: (item: T) => ApiCursorKey;
  },
): Page<T> {
  const cursor = decodeCursor(options.cursor);
  const sorted = [...items].sort((left, right) => {
    const a = options.key(left);
    const b = options.key(right);
    if (a.updatedAt !== b.updatedAt) return a.updatedAt < b.updatedAt ? -1 : 1;
    return a.id.localeCompare(b.id);
  });
  const filtered = cursor
    ? sorted.filter(item => isAfter(options.key(item), cursor))
    : sorted;
  const page = filtered.slice(0, options.limit);
  const hasMore = filtered.length > options.limit;
  const last = page[page.length - 1];
  return {
    data: page,
    nextCursor: hasMore && last ? encodeCursor(options.key(last)) : null,
    hasMore,
  };
}
