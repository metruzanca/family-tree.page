import { describe, expect, it } from "vitest";
import { decodeCursor, encodeCursor, pageItems } from "./cursor";

type Item = { id: string; updatedAt: string };

function item(id: string, minute: number): Item {
  return {
    id,
    updatedAt: `2026-01-01T00:${String(minute).padStart(2, "0")}:00.000Z`,
  };
}

const key = (entry: Item) => ({
  updatedAt: entry.updatedAt,
  id: entry.id,
});

describe("API cursors", () => {
  it("round-trips a cursor", () => {
    const encoded = encodeCursor({
      updatedAt: "2026-01-01T00:00:00.000Z",
      id: "abc",
    });
    expect(decodeCursor(encoded)).toEqual({
      updatedAt: "2026-01-01T00:00:00.000Z",
      id: "abc",
    });
  });

  it("rejects junk cursors", () => {
    expect(decodeCursor("not-a-cursor")).toBeNull();
    expect(decodeCursor("")).toBeNull();
    expect(
      decodeCursor(Buffer.from(JSON.stringify({ u: "nope", i: "abc" })).toString("base64url")),
    ).toBeNull();
    expect(
      decodeCursor(Buffer.from(JSON.stringify({ u: "2026-01-01T00:00:00.000Z" })).toString("base64url")),
    ).toBeNull();
  });

  it("pages in updatedAt order and stops at the end", () => {
    const items = [item("a", 0), item("b", 1), item("c", 2), item("d", 3), item("e", 4)];

    const first = pageItems(items, { limit: 2, key });
    expect(first.data.map(entry => entry.id)).toEqual(["a", "b"]);
    expect(first.hasMore).toBe(true);
    expect(first.nextCursor).not.toBeNull();

    const second = pageItems(items, {
      limit: 2,
      cursor: first.nextCursor,
      key,
    });
    expect(second.data.map(entry => entry.id)).toEqual(["c", "d"]);
    expect(second.hasMore).toBe(true);

    const third = pageItems(items, {
      limit: 2,
      cursor: second.nextCursor,
      key,
    });
    expect(third.data.map(entry => entry.id)).toEqual(["e"]);
    expect(third.hasMore).toBe(false);
    expect(third.nextCursor).toBeNull();
  });

  it("breaks ties on id for items with the same timestamp", () => {
    const same = "2026-01-01T00:00:00.000Z";
    const items: Item[] = [
      { id: "b", updatedAt: same },
      { id: "a", updatedAt: same },
      { id: "c", updatedAt: same },
    ];
    const first = pageItems(items, { limit: 2, key });
    expect(first.data.map(entry => entry.id)).toEqual(["a", "b"]);
    const second = pageItems(items, { limit: 2, cursor: first.nextCursor, key });
    expect(second.data.map(entry => entry.id)).toEqual(["c"]);
  });

  it("returns an empty page after the last item", () => {
    const items = [item("a", 0), item("b", 1)];
    const last = encodeCursor(key(items[1]));
    const after = pageItems(items, { limit: 2, cursor: last, key });
    expect(after.data).toEqual([]);
    expect(after.hasMore).toBe(false);
    expect(after.nextCursor).toBeNull();
  });
});
