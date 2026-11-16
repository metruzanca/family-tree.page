import { describe, expect, it } from "vitest";
import {
  analyzeRelationships,
  createChildrenMap,
  isAncestorInMap,
  type AnalyzedRelationship,
  type RelationshipPerson,
} from "./relationships";

function people(ids: string[]): RelationshipPerson[] {
  return ids.map(id => ({ id }));
}

function parent(id: string, source: string, target: string): AnalyzedRelationship {
  return { id, type: "parent", source, target };
}

function partner(id: string, source: string, target: string): AnalyzedRelationship {
  return { id, type: "partner", source, target };
}

describe("analyzeRelationships", () => {
  it("keeps valid partners on the same row and children below them", () => {
    const analysis = analyzeRelationships(people(["a", "b", "c"]), [
      partner("p1", "a", "b"),
      parent("r1", "a", "c"),
      parent("r2", "b", "c"),
    ]);

    expect(analysis.conflicts).toEqual([]);
    expect(analysis.levels.get("a")).toBe(0);
    expect(analysis.levels.get("b")).toBe(0);
    expect(analysis.levels.get("c")).toBe(1);
  });

  it("does not let a parent cycle push levels down forever", () => {
    const analysis = analyzeRelationships(people(["a", "b"]), [
      parent("r1", "a", "b"),
      parent("r2", "b", "a"),
    ]);

    expect(analysis.conflicts).toEqual([
      expect.objectContaining({ kind: "parent-cycle" }),
    ]);
    expect(analysis.levels.get("a")).toBeLessThanOrEqual(1);
    expect(analysis.levels.get("b")).toBeLessThanOrEqual(1);
  });

  it("reports a partner who is also an ancestor instead of sharing their row", () => {
    const analysis = analyzeRelationships(people(["a", "b", "c"]), [
      parent("r1", "a", "b"),
      parent("r2", "b", "c"),
      partner("p1", "a", "c"),
    ]);

    expect(analysis.conflicts).toEqual([
      {
        kind: "partner-ancestor",
        relationshipId: "p1",
        personIds: ["a", "c"],
      },
    ]);
    expect(analysis.levels.get("a")).toBe(0);
    expect(analysis.levels.get("b")).toBe(1);
    expect(analysis.levels.get("c")).toBe(2);
  });

  it("bounds levels to the number of partner groups", () => {
    const ids = ["a", "b", "c", "d", "e"];
    const analysis = analyzeRelationships(people(ids), [
      partner("p1", "a", "b"),
      parent("r1", "a", "c"),
      parent("r2", "c", "d"),
      parent("r3", "d", "e"),
      parent("r4", "e", "a"),
    ]);

    expect(analysis.conflicts.length).toBeGreaterThan(0);
    for (const level of analysis.levels.values()) {
      expect(level).toBeGreaterThanOrEqual(0);
      expect(level).toBeLessThanOrEqual(ids.length);
    }
  });
});

describe("ancestor helpers", () => {
  it("walks the parent graph without looping on a cycle", () => {
    const children = createChildrenMap([
      { parentId: "a", childId: "b" },
      { parentId: "b", childId: "a" },
      { parentId: "b", childId: "c" },
    ]);

    expect(isAncestorInMap(children, "a", "c")).toBe(true);
    expect(isAncestorInMap(children, "c", "a")).toBe(false);
  });
});
