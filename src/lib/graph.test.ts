import { describe, expect, it } from "vitest";
import { buildGraphModel, computeGenerations } from "./graph";
import type { GraphPerson, GraphRelationship, TreeGraph } from "../api/people-server";

function person(id: string, firstName = id, lastName = "Zanca"): GraphPerson {
  return {
    id,
    firstName,
    lastName,
    displayName: `${firstName} ${lastName}`,
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
  return {
    id,
    type: "parent",
    source,
    target,
    parentType: "biological",
  };
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

describe("computeGenerations", () => {
  it("pushes children below parents and keeps partners on the same row", () => {
    const people = ["g", "m", "l", "d", "s"].map(id => person(id));
    const relationships = [
      partner("p1", "g", "m"),
      partner("p2", "d", "l"),
      parent("c1", "g", "l"),
      parent("c2", "m", "l"),
      parent("c3", "l", "s"),
      parent("c4", "d", "s"),
    ];
    const levels = computeGenerations(people, relationships);
    expect(levels.get("g")).toBe(0);
    expect(levels.get("m")).toBe(0);
    expect(levels.get("l")).toBe(1);
    expect(levels.get("d")).toBe(1);
    expect(levels.get("s")).toBe(2);
  });

  it("does not hang on malformed cyclic data", () => {
    const people = ["a", "b"].map(id => person(id));
    const relationships = [parent("c1", "a", "b"), parent("c2", "b", "a")];
    const levels = computeGenerations(people, relationships);
    expect(levels.size).toBe(2);
  });
});

describe("buildGraphModel", () => {
  const people = [person("a"), person("b")];
  const relationships = [parent("r1", "a", "b")];
  const data: TreeGraph = {
    tree: { id: "tree", name: "Test", description: null },
    role: "owner",
    people,
    relationships,
    files: [
      {
        id: "avatar",
        personId: "a",
        name: "portrait.jpg",
        mimeType: "image/jpeg",
        kind: "image",
        thumbUrl: "/api/files/avatar/thumb",
        width: 100,
        height: 100,
        isAvatar: true,
      },
      {
        id: "doc",
        personId: "b",
        name: "letter.pdf",
        mimeType: "application/pdf",
        kind: "document",
        thumbUrl: null,
        width: null,
        height: null,
        isAvatar: false,
      },
    ],
  };

  it("adds non-avatar files when media is visible", () => {
    const model = buildGraphModel(data, true);
    expect(model.nodes.map(node => node.id)).toContain("file:doc");
    expect(model.nodes.map(node => node.id)).not.toContain("file:avatar");
    expect(model.links.some(link => link.kind === "media")).toBe(true);
  });

  it("drops media nodes when media is hidden", () => {
    const model = buildGraphModel(data, false);
    expect(model.nodes.map(node => node.id)).toEqual(["a", "b"]);
    expect(model.links.some(link => link.kind === "media")).toBe(false);
  });
});
