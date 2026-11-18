import { describe, expect, it } from "vitest";
import {
  TREE_DELETION_GRACE_DAYS,
  TREE_DELETION_REQUEST_TTL_DAYS,
  TREE_DELETION_REMINDER_DAYS,
  allOwnersApproved,
  daysUntilPurge,
  ownersAwaitingApproval,
  purgeAfterFrom,
  requestExpiresAtFrom,
} from "./tree-deletion";

const now = new Date("2030-01-01T00:00:00Z");
const DAY_MS = 24 * 60 * 60_000;

describe("tree deletion helpers", () => {
  it("schedules the purge 30 days out", () => {
    expect(purgeAfterFrom(now).getTime() - now.getTime()).toBe(
      TREE_DELETION_GRACE_DAYS * DAY_MS,
    );
    expect(TREE_DELETION_GRACE_DAYS).toBe(30);
  });

  it("expires a request after the approval window", () => {
    expect(requestExpiresAtFrom(now).getTime() - now.getTime()).toBe(
      TREE_DELETION_REQUEST_TTL_DAYS * DAY_MS,
    );
    expect(TREE_DELETION_REQUEST_TTL_DAYS).toBeLessThan(TREE_DELETION_GRACE_DAYS);
  });

  it("waits for every current owner", () => {
    expect(ownersAwaitingApproval(["a", "b", "c"], ["a"])).toEqual(["b", "c"]);
    expect(ownersAwaitingApproval(["a", "b"], ["a", "b"])).toEqual([]);
    expect(ownersAwaitingApproval(["a"], [])).toEqual(["a"]);
  });

  it("never treats a tree without owners as ready", () => {
    expect(allOwnersApproved([], [])).toBe(false);
    expect(allOwnersApproved(["a"], ["a"])).toBe(true);
    expect(allOwnersApproved(["a", "b"], ["a"])).toBe(false);
  });

  it("counts whole days left, rounded up", () => {
    expect(daysUntilPurge(new Date(now.getTime() + 10.5 * DAY_MS), now)).toBe(11);
    expect(daysUntilPurge(now, now)).toBe(0);
    expect(daysUntilPurge(new Date(now.getTime() - DAY_MS), now)).toBe(0);
    expect(daysUntilPurge(null, now)).toBe(0);
  });

  it("reminds before the purge", () => {
    expect(TREE_DELETION_REMINDER_DAYS).toBeLessThan(TREE_DELETION_GRACE_DAYS);
  });
});
