import { describe, expect, it } from "vitest";
import {
  buildGraphModel,
  clampToGenerationBand,
  computeGenerations,
  generationRowY,
  partnerGroups,
} from "./graph";
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

describe("generation bands", () => {
  it("puts older generations above newer ones by default", () => {
    expect(generationRowY(0, "oldest-top")).toBeLessThan(generationRowY(1, "oldest-top"));
    expect(generationRowY(0, "oldest-bottom")).toBeGreaterThan(
      generationRowY(1, "oldest-bottom"),
    );
  });

  it("only clamps a node when it leaves its generation band", () => {
    const level = 1;
    const row = generationRowY(level, "oldest-top");
    expect(clampToGenerationBand(row + 20, level, "oldest-top")).toBe(row + 20);
    expect(clampToGenerationBand(row + 200, level, "oldest-top")).toBe(row + 58);
    expect(clampToGenerationBand(row - 200, level, "oldest-top")).toBe(row - 58);
  });
});

describe("partnerGroups", () => {
  it("groups direct and chained partners so their rows can be aligned", () => {
    const groups = partnerGroups([
      partner("p1", "a", "b"),
      partner("p2", "b", "c"),
      partner("p3", "d", "e"),
      parent("c1", "a", "f"),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups.map(group => group.sort())).toEqual(
      expect.arrayContaining([
        ["a", "b", "c"],
        ["d", "e"],
      ]),
    );
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
        sizeBytes: 1000,
        createdAt: new Date(),
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
        sizeBytes: 2000,
        createdAt: new Date(),
        isAvatar: false,
      },
    ],
  };

  it("adds non-avatar files when media is visible", () => {
    const model = buildGraphModel(data, true, "oldest-top");
    expect(model.nodes.map(node => node.id)).toContain("file:doc");
    expect(model.nodes.map(node => node.id)).not.toContain("file:avatar");
    expect(model.links.some(link => link.kind === "media")).toBe(true);
  });

  it("drops media nodes when media is hidden", () => {
    const model = buildGraphModel(data, false, "oldest-top");
    expect(model.nodes.map(node => node.id)).toEqual(["a", "b"]);
    expect(model.links.some(link => link.kind === "media")).toBe(false);
  });

  it("keeps single-parent links direct", () => {
    const model = buildGraphModel(data, false, "oldest-top");
    expect(model.nodes.some(node => node.kind === "union")).toBe(false);
    expect(model.links.filter(link => link.kind === "parent")).toHaveLength(1);
    expect(model.links.find(link => link.kind === "parent")?.viaUnion).toBeUndefined();
  });

  it("shares one junction for siblings with the same two parents", () => {
    const familyPeople = [person("a"), person("b"), person("c"), person("d")];
    const familyRelationships = [
      partner("p1", "a", "b"),
      parent("r1", "a", "c"),
      parent("r2", "b", "c"),
      parent("r3", "a", "d"),
      parent("r4", "b", "d"),
    ];
    const model = buildGraphModel(
      {
        tree: { id: "family", name: "Family", description: null },
        role: "owner",
        people: familyPeople,
        relationships: familyRelationships,
        files: [],
      },
      false,
      "oldest-top",
    );

    const unions = model.nodes.filter(node => node.kind === "union");
    expect(unions).toHaveLength(1);
    expect(unions[0].memberIds?.sort()).toEqual(["a", "b", "c", "d"]);
    expect(model.links.filter(link => link.kind === "union")).toHaveLength(2);
    expect(
      model.links.filter(link => link.kind === "parent" && link.viaUnion),
    ).toHaveLength(2);
    expect(
      model.links.filter(link => link.kind === "parent" && !link.viaUnion),
    ).toHaveLength(0);
  });
});
