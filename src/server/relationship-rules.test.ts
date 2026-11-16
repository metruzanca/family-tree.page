import { describe, expect, it } from "vitest";
import { assertRelationshipInvariants } from "./relationship-rules";

describe("assertRelationshipInvariants", () => {
  it("allows a child with two parents", () => {
    expect(() =>
      assertRelationshipInvariants({
        parentEdges: [],
        partnerships: [{ id: "p", personAId: "a", personBId: "b" }],
        addParentEdges: [
          { id: "r1", parentId: "a", childId: "c" },
          { id: "r2", parentId: "b", childId: "c" },
        ],
      }),
    ).not.toThrow();
  });

  it("rejects a third parent", () => {
    expect(() =>
      assertRelationshipInvariants({
        parentEdges: [
          { id: "r1", parentId: "a", childId: "c" },
          { id: "r2", parentId: "b", childId: "c" },
        ],
        partnerships: [],
        addParentEdges: [{ id: "r3", parentId: "d", childId: "c" }],
      }),
    ).toThrow("two parents");
  });

  it("rejects a parent loop", () => {
    expect(() =>
      assertRelationshipInvariants({
        parentEdges: [{ id: "r1", parentId: "a", childId: "b" }],
        partnerships: [],
        addParentEdges: [{ id: "r2", parentId: "b", childId: "a" }],
      }),
    ).toThrow("loop");
  });

  it("rejects a partnership that is also an ancestor link", () => {
    expect(() =>
      assertRelationshipInvariants({
        parentEdges: [
          { id: "r1", parentId: "a", childId: "b" },
          { id: "r2", parentId: "b", childId: "c" },
        ],
        partnerships: [],
        addPartnership: { id: "p", personAId: "a", personBId: "c" },
      }),
    ).toThrow("ancestors");
  });
});
