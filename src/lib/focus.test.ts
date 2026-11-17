import { describe, expect, it } from "vitest";
import type { GraphPerson, GraphRelationship } from "../api/people-server";
import {
  computeFocusDistances,
  defaultFocusRadius,
  parseFocusRadius,
  resolveFocus,
  shortestPath,
} from "./focus";

function person(id: string): GraphPerson {
  return {
    id,
    firstName: id,
    lastName: "Test",
    displayName: `${id} Test`,
    maidenName: null,
    nickname: null,
    birthDate: null,
    deathDate: null,
    birthPlace: null,
    deathPlace: null,
    bio: null,
    avatarFileId: null,
  };
}

function parent(id: string, source: string, target: string): GraphRelationship {
  return { id, type: "parent", source, target, parentType: "biological" };
}

function partner(id: string, source: string, target: string): GraphRelationship {
  return {
    id,
    type: "partner",
    source,
    target,
    status: "married",
    startDate: null,
    endDate: null,
  };
}

/**
 * Three generations:
 *   grandpa + grandma
 *     uncle
 *     mum + dad
 *       me
 *       sibling
 *       me's child
 *   uncle's child (cousin)
 *   grandpa's sibling (great-aunt)
 */
const people = [
  "grandpa",
  "grandma",
  "great-aunt",
  "uncle",
  "mum",
  "dad",
  "me",
  "sibling",
  "child",
  "cousin",
  "stranger",
].map(person);

const relationships: GraphRelationship[] = [
  partner("p1", "grandpa", "grandma"),
  parent("r1", "grandpa", "mum"),
  parent("r2", "grandma", "mum"),
  parent("r3", "grandpa", "uncle"),
  parent("r4", "grandma", "uncle"),
  parent("r5", "mum", "me"),
  parent("r6", "dad", "me"),
  partner("p2", "mum", "dad"),
  parent("r7", "mum", "sibling"),
  parent("r8", "dad", "sibling"),
  parent("r9", "me", "child"),
  parent("r10", "uncle", "cousin"),
  parent("r11", "great-aunt", "grandpa"),
];

function ids(view: ReturnType<typeof resolveFocus>) {
  return [...view.visible].sort();
}

describe("computeFocusDistances", () => {
  it("counts parent, child and partner edges as one hop", () => {
    const distances = computeFocusDistances("me", relationships);
    expect(distances.get("me")).toBe(0);
    expect(distances.get("mum")).toBe(1);
    expect(distances.get("child")).toBe(1);
    expect(distances.get("sibling")).toBe(2);
    expect(distances.get("grandpa")).toBe(2);
    expect(distances.get("uncle")).toBe(3);
    expect(distances.get("cousin")).toBe(4);
    expect(distances.get("great-aunt")).toBe(3);
  });

  it("leaves unrelated people out of the map", () => {
    const distances = computeFocusDistances("me", relationships);
    expect(distances.has("stranger")).toBe(false);
  });

  it("returns an empty map without a focus person", () => {
    expect(computeFocusDistances(null, relationships).size).toBe(0);
  });
});

describe("resolveFocus", () => {
  it("shows everyone when no person is claimed", () => {
    const view = resolveFocus(people, relationships, { focusId: null, radius: 4 });
    expect(view.visible.size).toBe(people.length);
    expect(view.nextRadius).toBeNull();
  });

  it("reveals one ring at a time and reports the next ring", () => {
    const view = resolveFocus(people, relationships, { focusId: "me", radius: 1 });
    expect(ids(view)).toEqual(["child", "dad", "me", "mum", "stranger"].sort());
    expect(view.nextRadius).toBe(2);
    expect(view.nextRingCount).toBe(3);
  });

  it("includes first cousins at the default radius", () => {
    const view = resolveFocus(people, relationships, { focusId: "me", radius: 4 });
    expect(view.visible.has("cousin")).toBe(true);
    expect(view.visible.has("great-aunt")).toBe(true);
    expect(view.visible.has("stranger")).toBe(true);
  });

  it("always includes partners of visible people", () => {
    const view = resolveFocus(people, relationships, { focusId: "me", radius: 1 });
    expect(view.visible.has("dad")).toBe(true);
  });

  it("keeps pinned people visible and counts them toward the total", () => {
    const view = resolveFocus(people, relationships, {
      focusId: "me",
      radius: 1,
      pinned: ["great-aunt"],
    });
    expect(view.visible.has("great-aunt")).toBe(true);
    expect(view.total).toBe(people.length);
  });

  it("reports everyone as next when the tree is small", () => {
    const view = resolveFocus(people, relationships, { focusId: "me", radius: 4 });
    expect(view.nextRadius).toBeNull();
  });

  it("ignores an unknown focus person and shows everyone", () => {
    const view = resolveFocus(people, relationships, {
      focusId: "not-in-tree",
      radius: 1,
    });
    expect(view.visible.size).toBe(people.length);
  });
});

describe("shortestPath", () => {
  it("finds the chain from the focus to a hidden cousin", () => {
    expect(shortestPath(relationships, "me", "cousin")).toEqual([
      "me",
      "mum",
      "grandpa",
      "uncle",
      "cousin",
    ]);
  });

  it("returns null when the people are not connected", () => {
    expect(shortestPath(relationships, "me", "stranger")).toBeNull();
  });
});

describe("focus defaults", () => {
  it("shows small trees whole and focuses larger ones on cousins", () => {
    expect(defaultFocusRadius(10)).toBe("all");
    expect(defaultFocusRadius(40)).toBe(4);
  });

  it("parses stored radii safely", () => {
    expect(parseFocusRadius("4")).toBe(4);
    expect(parseFocusRadius("all")).toBe("all");
    expect(parseFocusRadius("9")).toBeNull();
    expect(parseFocusRadius(null)).toBeNull();
  });
});
