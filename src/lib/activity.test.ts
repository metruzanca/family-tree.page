import { describe, expect, it } from "vitest";
import english from "../i18n/en.json";
import italian from "../i18n/it.json";
import {
  ACTIVITY_GROUPS,
  activityActionKey,
  activityActionLabel,
  activityGroupFor,
  activityGroupKey,
  type ActivityAction,
  type ActivityGroup,
} from "./activity";

const ACTIONS: ActivityAction[] = [
  "person.created",
  "person.updated",
  "person.deleted",
  "relationship.created",
  "relationship.removed",
  "event.created",
  "event.updated",
  "event.deleted",
  "file.uploaded",
  "file.updated",
  "file.deleted",
  "group.renamed",
  "group.deleted",
  "member.role_changed",
  "member.removed",
  "member.left",
  "invite.created",
  "invite.revoked",
  "invite.accepted",
  "tree.updated",
  "tree.deletion_requested",
  "tree.deletion_approved",
  "tree.deletion_cancelled",
  "tree.deletion_scheduled",
  "tree.restored",
  "tree.imported",
];

const GROUPS: (ActivityGroup | "")[] = [
  "",
  "people",
  "relationships",
  "events",
  "media",
  "members",
  "tree",
];

describe("activity action keys", () => {
  it("maps every action to a distinct key", () => {
    const keys = ACTIONS.map(action => activityActionKey(action));
    expect(new Set(keys).size).toBe(ACTIONS.length);
  });

  it("points at a key that exists in both dictionaries", () => {
    for (const action of ACTIONS) {
      const key = activityActionKey(action);
      expect((english as Record<string, string>)[key], key).toBeTruthy();
      expect((italian as Record<string, string>)[key], key).toBeTruthy();
    }
  });

  it("keeps the English label for API consumers", () => {
    for (const action of ACTIONS) {
      expect(activityActionLabel(action)).toBeTruthy();
    }
  });
});

describe("activity group keys", () => {
  it("points at a key that exists in both dictionaries", () => {
    for (const group of GROUPS) {
      const key = activityGroupKey(group);
      expect((english as Record<string, string>)[key], key).toBeTruthy();
      expect((italian as Record<string, string>)[key], key).toBeTruthy();
    }
  });

  it("matches the filter options", () => {
    expect(ACTIVITY_GROUPS.map(option => option.value)).toEqual(GROUPS);
  });

  it("assigns every action to a group", () => {
    for (const action of ACTIONS) {
      expect(GROUPS).toContain(activityGroupFor(action));
    }
  });
});
