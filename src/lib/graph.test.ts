import { describe, expect, it } from "vitest";
import {
  buildGraphModel,
  clampToGenerationBand,
  computeGenerations,
  fileCardSize,
  generationRowY,
  mediaAspect,
  nodeRadius,
  partnerGroups,
  type GraphNode,
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
        groupId: null,
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
        groupId: null,
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
    groups: [],
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

  it("renders one stack node for an uploaded album", () => {
    const albumData: TreeGraph = {
      ...data,
      files: [
        data.files[0],
        {
          ...data.files[1],
          id: "group-one",
          groupId: "album-1",
          thumbUrl: "/api/files/group-one/thumb",
          isAvatar: false,
        },
        {
          ...data.files[1],
          id: "group-two",
          groupId: "album-1",
          thumbUrl: "/api/files/group-two/thumb",
          isAvatar: false,
        },
      ],
      groups: [
        {
          id: "album-1",
          personId: "b",
          name: "Summer",
          count: 2,
          coverFileId: "group-one",
          coverWidth: 1600,
          coverHeight: 1200,
          createdAt: new Date(),
        },
      ],
    };
    const model = buildGraphModel(albumData, true, "oldest-top");
    const groupNodes = model.nodes.filter(node => node.kind === "group");
    expect(groupNodes).toHaveLength(1);
    expect(groupNodes[0].group?.name).toBe("Summer");
    expect(model.nodes.filter(node => node.kind === "file")).toHaveLength(0);
    expect(model.links.filter(link => link.kind === "media")).toHaveLength(1);
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
        groups: [],
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

function fileNode(
  width: number | null,
  height: number | null,
  kind: "image" | "document" = "image",
): GraphNode {
  return {
    id: "file:one",
    kind: "file",
    name: "photo.jpg",
    file: {
      id: "one",
      personId: "a",
      groupId: null,
      name: "photo.jpg",
      mimeType: kind === "image" ? "image/jpeg" : "application/pdf",
      kind,
      thumbUrl: "/api/files/one/thumb",
      width,
      height,
      sizeBytes: 1000,
      createdAt: new Date(),
      isAvatar: false,
    },
    degree: 1,
    val: 0.35,
    level: 0,
  };
}

describe("media card sizing", () => {
  const squareArea = 22 * 22;

  it("keeps a square photo square", () => {
    const card = fileCardSize(fileNode(800, 800));
    expect(card.aspect).toBe(1);
    expect(card.width).toBeCloseTo(22);
    expect(card.height).toBeCloseTo(22);
  });

  it("keeps landscape and portrait photos in their real proportions", () => {
    const landscape = fileCardSize(fileNode(1200, 800));
    const portrait = fileCardSize(fileNode(800, 1200));
    expect(landscape.aspect).toBeCloseTo(1.5);
    expect(portrait.aspect).toBeCloseTo(2 / 3);
    expect(landscape.width).toBeGreaterThan(landscape.height);
    expect(portrait.height).toBeGreaterThan(portrait.width);
    expect(landscape.width * landscape.height).toBeCloseTo(squareArea);
    expect(portrait.width * portrait.height).toBeCloseTo(squareArea);
  });

  it("clamps extreme panoramas so one card cannot dominate the graph", () => {
    expect(mediaAspect(4000, 400)).toBe(3);
    expect(mediaAspect(400, 4000)).toBe(1 / 3);
    const card = fileCardSize(fileNode(4000, 400));
    expect(card.aspect).toBe(3);
    expect(card.width).toBeLessThan(44);
  });

  it("falls back to a square when dimensions are missing", () => {
    expect(mediaAspect(null, null)).toBe(1);
    expect(mediaAspect(0, 500)).toBe(1);
    const card = fileCardSize(fileNode(null, null));
    expect(card.width).toBeCloseTo(22);
    expect(card.height).toBeCloseTo(22);
  });

  it("keeps non-image files as square cards", () => {
    const card = fileCardSize(fileNode(1200, 800, "document"));
    expect(card.aspect).toBe(1);
    expect(card.width).toBeCloseTo(22);
  });

  it("sizes the collision radius from the longest card side", () => {
    expect(nodeRadius(fileNode(800, 800))).toBeCloseTo(11);
    expect(nodeRadius(fileNode(1200, 800))).toBeCloseTo(13.47, 1);
    expect(nodeRadius(fileNode(1200, 800))).toBeGreaterThan(
      nodeRadius(fileNode(800, 800)),
    );
  });

  it("sizes album cards from their cover photo", () => {
    const group: GraphNode = {
      id: "group:album",
      kind: "group",
      name: "Summer",
      group: {
        id: "album",
        personId: "a",
        name: "Summer",
        count: 3,
        coverFileId: "one",
        coverWidth: 1200,
        coverHeight: 800,
        createdAt: new Date(),
      },
      degree: 1,
      val: 0.7,
      level: 0,
    };
    const card = fileCardSize(group);
    expect(card.aspect).toBeCloseTo(1.5);
    expect(card.width).toBeGreaterThan(card.height);
    expect(card.width * card.height).toBeCloseTo(32 * 32);
  });
});
