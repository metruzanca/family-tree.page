import { describe, expect, it } from "vitest";
import {
  buildGraphModel,
  computeGenerations,
  dedupeRelationships,
  fileCardSize,
  fileNodeId,
  groupChildrenByParents,
  groupNodeId,
  junctionNodeId,
  mediaAspect,
  nodeIdOf,
  nodeRadius,
  type GraphNode,
} from "./graph";
import type { GraphPerson, GraphRelationship, TreeGraph } from "../api/people-server";

function person(id: string, firstName = id, lastName = "Simpson"): GraphPerson {
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

function treeWith(
  people: GraphPerson[],
  relationships: GraphRelationship[],
): TreeGraph {
  return {
    tree: { id: "tree", name: "Test", description: null },
    role: "owner",
    viewerPersonId: null,
    people,
    relationships,
    files: [],
    groups: [],
    events: [],
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

describe("relationship deduplication", () => {
  it("keeps one link for a repeated parent or partner pair", () => {
    const data = treeWith(
      ["a", "b", "c"].map(id => person(id)),
      [
        parent("r1", "a", "c"),
        parent("r2", "a", "c"),
        partner("p1", "a", "b"),
        partner("p2", "b", "a"),
      ],
    );
    const model = buildGraphModel(data, false);
    expect(model.links.filter(link => link.kind === "child")).toHaveLength(1);
    expect(model.links.filter(link => link.kind === "partner")).toHaveLength(1);
    expect(dedupeRelationships(data.relationships)).toHaveLength(2);
  });
});

describe("buildGraphModel", () => {
  const people = [person("a"), person("b")];
  const relationships = [parent("r1", "a", "b")];
  const data: TreeGraph = {
    tree: { id: "tree", name: "Test", description: null },
    role: "owner",
    viewerPersonId: null,
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
        takenAt: null,
        taggedPersonIds: [],
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
        takenAt: null,
        taggedPersonIds: [],
        createdAt: new Date(),
        isAvatar: false,
      },
    ],
    groups: [],
    events: [],
  };

  it("adds non-avatar files and keeps them with their owner", () => {
    const model = buildGraphModel(data, true);
    expect(model.nodes.map(node => node.id)).toContain(fileNodeId("doc"));
    expect(model.nodes.map(node => node.id)).not.toContain(fileNodeId("avatar"));
    expect(model.mediaByOwner.get("b")?.map(node => node.id)).toEqual([
      fileNodeId("doc"),
    ]);
  });

  it("links every media node to its owner", () => {
    const model = buildGraphModel(data, true);
    const mediaLinks = model.links.filter(link => link.kind === "media");
    const mediaNodes = model.nodes.filter(
      node => node.kind === "file" || node.kind === "group",
    );
    expect(mediaLinks).toHaveLength(mediaNodes.length);
    expect(mediaLinks[0]).toMatchObject({
      source: "b",
      target: fileNodeId("doc"),
    });
  });

  it("drops media nodes and their links when media is hidden", () => {
    const model = buildGraphModel(data, false);
    expect(model.people.map(node => node.id)).toEqual(["a", "b"]);
    expect(model.nodes.filter(node => node.kind === "file")).toHaveLength(0);
    expect(model.mediaByOwner.size).toBe(0);
    expect(model.links.filter(link => link.kind === "media")).toHaveLength(0);
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
    const model = buildGraphModel(albumData, true);
    const groupNodes = model.nodes.filter(node => node.kind === "group");
    expect(groupNodes).toHaveLength(1);
    expect(groupNodes[0].group?.name).toBe("Summer");
    expect(model.nodes.filter(node => node.kind === "file")).toHaveLength(0);
    expect(groupNodes[0].ownerId).toBe("b");
    expect(groupNodes[0].id).toBe(groupNodeId("album-1"));
  });

  it("joins co-parents and their children at one family junction", () => {
    const familyData = treeWith(
      ["a", "b", "c", "d"].map(id => person(id)),
      [
        partner("p1", "a", "b"),
        parent("r1", "a", "c"),
        parent("r2", "b", "c"),
        parent("r3", "a", "d"),
        parent("r4", "b", "d"),
      ],
    );
    const model = buildGraphModel(familyData, false);
    const junction = junctionNodeId(["a", "b"]);
    expect(model.junctions.map(node => node.id)).toEqual([junction]);
    expect(model.links.filter(link => link.kind === "partner")).toHaveLength(1);
    expect(
      model.links
        .filter(link => link.kind === "parent")
        .map(link => nodeIdOf(link.source)),
    ).toEqual(["a", "b"]);
    expect(
      model.links
        .filter(link => link.kind === "child")
        .map(link => nodeIdOf(link.target)),
    ).toEqual(["c", "d"]);
    expect(
      model.links
        .filter(link => link.kind !== "partner")
        .every(
          link =>
            link.kind === "media" ||
            (link.kind === "parent"
              ? nodeIdOf(link.target) === junction
              : nodeIdOf(link.source) === junction),
        ),
    ).toBe(true);
  });

  it("gives half-siblings a junction per parent set", () => {
    const model = buildGraphModel(
      treeWith(
        ["a", "b", "c", "d", "e"].map(id => person(id)),
        [
          parent("r1", "a", "c"),
          parent("r2", "b", "c"),
          parent("r3", "a", "e"),
          parent("r4", "d", "e"),
        ],
      ),
      false,
    );
    expect(model.junctions.map(node => node.id).sort()).toEqual(
      [junctionNodeId(["a", "b"]), junctionNodeId(["a", "d"])].sort(),
    );
    expect(
      model.links.filter(
        link => link.kind === "parent" && nodeIdOf(link.source) === "a",
      ),
    ).toHaveLength(2);
    expect(
      model.links.filter(link => link.kind === "child").map(link => nodeIdOf(link.target)),
    ).toEqual(["c", "e"]);
  });

  it("creates a junction for a single parent", () => {
    const model = buildGraphModel(
      treeWith([person("a"), person("b")], [parent("r1", "a", "b")]),
      false,
    );
    const junction = junctionNodeId(["a"]);
    expect(model.junctions.map(node => node.id)).toEqual([junction]);
    expect(model.links).toHaveLength(2);
    expect(model.links[0]).toMatchObject({
      kind: "parent",
      source: "a",
      target: junction,
    });
    expect(model.links[1]).toMatchObject({
      kind: "child",
      source: junction,
      target: "b",
    });
  });

  it("keeps the strongest parent type on a shared arm", () => {
    const adoptive = (id: string, source: string, target: string) => ({
      id,
      type: "parent" as const,
      source,
      target,
      parentType: "adoptive" as const,
    });
    const model = buildGraphModel(
      treeWith(
        ["a", "b", "c", "d"].map(id => person(id)),
        [
          parent("r1", "a", "c"),
          parent("r2", "b", "c"),
          adoptive("r3", "a", "d"),
          parent("r4", "b", "d"),
        ],
      ),
      false,
    );
    const arm = model.links.find(
      link => link.kind === "parent" && nodeIdOf(link.source) === "a",
    );
    expect(arm?.parentType).toBe("biological");
  });

  it("groups children by their exact parent set", () => {
    const groups = groupChildrenByParents([
      parent("r1", "a", "c"),
      parent("r2", "b", "c"),
      parent("r3", "b", "d"),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({
      parentIds: ["a", "b"],
      childIds: ["c"],
    });
    expect(groups[1]).toMatchObject({
      parentIds: ["b"],
      childIds: ["d"],
    });
  });
});

describe("media card sizing", () => {
  const squareArea = 22 * 22;

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
        takenAt: null,
        taggedPersonIds: [],
        createdAt: new Date(),
        isAvatar: false,
      },
      degree: 1,
      level: 0,
    };
  }

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
      level: 0,
    };
    const card = fileCardSize(group);
    expect(card.aspect).toBeCloseTo(1.5);
    expect(card.width).toBeGreaterThan(card.height);
    expect(card.width * card.height).toBeCloseTo(32 * 32);
  });
});

describe("focused graph model", () => {
  const people = ["a", "b", "c", "d"].map(id => person(id));
  const relationships = [
    parent("r1", "a", "b"),
    parent("r2", "b", "c"),
    parent("r3", "c", "d"),
  ];

  it("draws only people and links inside the visible set", () => {
    const model = buildGraphModel(
      treeWith(people, relationships),
      false,
      new Set(["a", "b"]),
    );
    const junction = junctionNodeId(["a"]);
    expect(model.nodes.map(node => node.id).sort()).toEqual(
      ["a", "b", junction].sort(),
    );
    expect(model.links).toHaveLength(2);
    expect(model.links[0]).toMatchObject({
      kind: "parent",
      source: "a",
      target: junction,
    });
    expect(model.links[1]).toMatchObject({
      kind: "child",
      source: junction,
      target: "b",
    });
  });

  it("drops media whose owner is hidden", () => {
    const data = treeWith(people, relationships);
    data.files = [
      {
        id: "doc",
        personId: "d",
        groupId: null,
        name: "letter.pdf",
        mimeType: "application/pdf",
        kind: "document",
        thumbUrl: null,
        width: null,
        height: null,
        sizeBytes: 2000,
        takenAt: null,
        taggedPersonIds: [],
        createdAt: new Date(),
        isAvatar: false,
      },
    ];
    const narrowed = buildGraphModel(data, true, new Set(["a", "b"]));
    expect(narrowed.nodes.some(node => node.id === fileNodeId("doc"))).toBe(false);

    const full = buildGraphModel(data, true);
    expect(full.nodes.some(node => node.id === fileNodeId("doc"))).toBe(true);
  });
});
