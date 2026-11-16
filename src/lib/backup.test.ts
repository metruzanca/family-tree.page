import { describe, expect, it } from "vitest";
import {
  dumpKeyFor,
  dumpsToDelete,
  mediaBackupKey,
  mediaSourceKey,
  parseDumpKey,
  shouldKeepDump,
  staleMediaKeys,
} from "./backup";

const NOW = new Date("2026-11-16T12:00:00Z");

function daysAgo(days: number) {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);
}

describe("backup helpers", () => {
  it("round trips dump keys", () => {
    const date = new Date("2026-11-16T03:04:05Z");
    const key = dumpKeyFor(date);
    expect(key).toBe("postgres/2026-11-16T03-04-05Z.dump");
    expect(parseDumpKey(key)?.toISOString()).toBe("2026-11-16T03:04:05.000Z");
  });

  it("rejects malformed dump keys", () => {
    expect(parseDumpKey("postgres/latest.json")).toBeNull();
    expect(parseDumpKey("postgres/2026-13-01T00-00-00Z.dump")).toBeNull();
    expect(parseDumpKey("postgres/2026-02-30T00-00-00Z.dump")).toBeNull();
  });

  it("keeps the last 30 daily dumps", () => {
    expect(shouldKeepDump(daysAgo(1), NOW)).toBe(true);
    expect(shouldKeepDump(daysAgo(30), NOW)).toBe(true);
    expect(shouldKeepDump(daysAgo(31), NOW)).toBe(false);
  });

  it("keeps the first dump of each month for a year", () => {
    expect(shouldKeepDump(new Date("2026-10-01T03:00:00Z"), NOW)).toBe(true);
    expect(shouldKeepDump(new Date("2026-10-02T03:00:00Z"), NOW)).toBe(false);
    expect(shouldKeepDump(new Date("2025-06-01T03:00:00Z"), NOW)).toBe(false);
  });

  it("lists only expired dumps for deletion", () => {
    const keys = [
      dumpKeyFor(daysAgo(2)),
      dumpKeyFor(new Date("2026-10-01T03:00:00Z")),
      dumpKeyFor(new Date("2026-10-02T03:00:00Z")),
      "postgres/latest.json",
    ];
    expect(dumpsToDelete(keys, NOW)).toEqual([dumpKeyFor(new Date("2026-10-02T03:00:00Z"))]);
  });

  it("maps media keys between the source and backup buckets", () => {
    expect(mediaBackupKey("trees/tree/people/person/file/original")).toBe(
      "media/trees/tree/people/person/file/original",
    );
    expect(mediaSourceKey("media/trees/tree/people/person/file/original")).toBe(
      "trees/tree/people/person/file/original",
    );
    expect(mediaSourceKey("postgres/latest.json")).toBeNull();
  });

  it("finds media that no longer exists in the source bucket", () => {
    const source = [
      "trees/a/people/p/original",
      "trees/a/people/p/thumb",
    ];
    const backup = [
      "media/trees/a/people/p/original",
      "media/trees/a/people/p/thumb",
      "media/trees/a/people/deleted/original",
      "postgres/2026-11-16T03-00-00Z.dump",
    ];
    expect(staleMediaKeys(source, backup)).toEqual([
      "media/trees/a/people/deleted/original",
    ]);
  });
});
