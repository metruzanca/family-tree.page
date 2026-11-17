import { describe, expect, it } from "vitest";
import {
  buildGraphModel,
  fileCardSize,
  fileNodeId,
  nodeRadius,
} from "./graph";
import type { GraphPerson, GraphRelationship, TreeGraph } from "../api/people-server";
import { layoutGraph, type GraphLayout } from "./graph-layout";
import { routeEdges, type EdgeSegment } from "./edge-routing";

function person(id: string, firstName = id, lastName = "Test"): GraphPerson {
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

type Scene = {
  data: TreeGraph;
  model: ReturnType<typeof buildGraphModel>;
  layout: GraphLayout;
  segments: EdgeSegment[];
};

function scene(
  data: TreeGraph,
  direction: "oldest-top" | "oldest-bottom" = "oldest-top",
  showMedia = false,
): Scene {
  const model = buildGraphModel(data, showMedia);
  const layout = layoutGraph(model, direction);
  const segments = routeEdges(model, layout);
  return { data, model, layout, segments };
}

function peopleOf(model: ReturnType<typeof buildGraphModel>) {
  return model.nodes.filter(node => node.kind === "person");
}

function nodeX(layout: GraphLayout, id: string) {
  const position = layout.personPositions.get(id);
  if (!position) throw new Error(`missing person ${id}`);
  return position.x;
}

function nodeY(layout: GraphLayout, id: string) {
  const position = layout.personPositions.get(id);
  if (!position) throw new Error(`missing person ${id}`);
  return position.y;
}

function overlaps(hits: string[]) {
  return hits.slice(0, 12);
}

function nodeOverlaps(sceneValue: Scene) {
  const nodes = peopleOf(sceneValue.model);
  const hits: string[] = [];
  for (let left = 0; left < nodes.length; left += 1) {
    for (let right = left + 1; right < nodes.length; right += 1) {
      const first = nodes[left];
      const second = nodes[right];
      const firstPosition = sceneValue.layout.personPositions.get(first.id)!;
      const secondPosition = sceneValue.layout.personPositions.get(second.id)!;
      const minimum = nodeRadius(first) + nodeRadius(second);
      const distance = Math.hypot(
        firstPosition.x - secondPosition.x,
        firstPosition.y - secondPosition.y,
      );
      if (distance < minimum - 0.5) hits.push(`${first.id}/${second.id}`);
    }
  }
  return hits;
}

function segmentPairs(sceneValue: Scene) {
  const segments = sceneValue.segments;
  const hits: string[] = [];
  for (let left = 0; left < segments.length; left += 1) {
    for (let right = left + 1; right < segments.length; right += 1) {
      const first = segments[left];
      const second = segments[right];
      if (first.lineId === second.lineId) continue;
      const dx = first.b.x - first.a.x;
      const dy = first.b.y - first.a.y;
      const length = Math.hypot(dx, dy);
      if (length < 0.01) continue;
      const ux = dx / length;
      const uy = dy / length;
      const firstStart =
        (second.a.x - first.a.x) * ux + (second.a.y - first.a.y) * uy;
      const firstEnd =
        (second.b.x - first.a.x) * ux + (second.b.y - first.a.y) * uy;
      const perpendicularA = Math.abs(
        (second.a.x - first.a.x) * -uy + (second.a.y - first.a.y) * ux,
      );
      const perpendicularB = Math.abs(
        (second.b.x - first.a.x) * -uy + (second.b.y - first.a.y) * ux,
      );
      if (perpendicularA > 0.6 || perpendicularB > 0.6) continue;
      const start = Math.max(0, Math.min(firstStart, firstEnd));
      const end = Math.min(length, Math.max(firstStart, firstEnd));
      if (end - start > 0.75) hits.push(`${first.id} ~ ${second.id}`);
    }
  }
  return hits;
}

function nodeHits(sceneValue: Scene) {
  const nodes = peopleOf(sceneValue.model);
  const hits: string[] = [];
  for (const segment of sceneValue.segments) {
    const dx = segment.b.x - segment.a.x;
    const dy = segment.b.y - segment.a.y;
    const lengthSquared = dx * dx + dy * dy;
    if (!lengthSquared) continue;
    for (const node of nodes) {
      const position = sceneValue.layout.personPositions.get(node.id)!;
      const t = Math.max(
        0,
        Math.min(
          1,
          ((position.x - segment.a.x) * dx + (position.y - segment.a.y) * dy) /
            lengthSquared,
        ),
      );
      const x = segment.a.x + t * dx;
      const y = segment.a.y + t * dy;
      const distance = Math.hypot(position.x - x, position.y - y);
      if (distance < nodeRadius(node) - 1) {
        hits.push(`${segment.id} through ${node.id}`);
      }
    }
  }
  return hits;
}

function assertClean(sceneValue: Scene) {
  expect(overlaps(nodeOverlaps(sceneValue))).toEqual([]);
  expect(overlaps(segmentPairs(sceneValue))).toEqual([]);
  expect(overlaps(nodeHits(sceneValue))).toEqual([]);
}

function familyTree() {
  const grandparents = Array.from({ length: 8 }, (_, index) => `a${index}`);
  const parents = Array.from({ length: 16 }, (_, index) => `b${index}`);
  const children = Array.from({ length: 24 }, (_, index) => `c${index}`);
  const relationships: GraphRelationship[] = [];
  let count = 0;
  const addParent = (source: string, target: string) =>
    relationships.push(parent(`r${++count}`, source, target));
  const addPartner = (source: string, target: string) =>
    relationships.push(partner(`p${++count}`, source, target));

  for (let index = 0; index < 4; index += 1) {
    addPartner(grandparents[index * 2], grandparents[index * 2 + 1]);
  }
  for (let index = 0; index < 4; index += 1) {
    for (const child of [parents[index * 2], parents[index * 2 + 1]]) {
      addParent(grandparents[index * 2], child);
      addParent(grandparents[index * 2 + 1], child);
    }
  }
  for (let index = 0; index < 8; index += 1) {
    addPartner(parents[index], parents[8 + index]);
  }
  let cursor = 0;
  for (let index = 0; index < 8; index += 1) {
    for (let child = 0; child < 2 && cursor < children.length; child += 1) {
      addParent(parents[index], children[cursor]);
      addParent(parents[8 + index], children[cursor]);
      cursor += 1;
    }
  }
  for (; cursor < children.length; cursor += 1) {
    addParent(parents[0], children[cursor]);
    addParent(parents[8], children[cursor]);
  }
  addPartner(children[0], children[10]);

  return treeWith(
    [...grandparents, ...parents, ...children].map(id => person(id)),
    relationships,
  );
}

describe("small trees", () => {
  it("lays out an empty tree", () => {
    const value = scene(treeWith([], []));
    expect(value.layout.personPositions.size).toBe(0);
    expect(value.segments).toHaveLength(0);
  });

  it("lays out one person with no relationships", () => {
    const value = scene(treeWith([person("solo")], []));
    expect(value.layout.personPositions.get("solo")).toEqual({ x: 0, y: 0 });
    expect(value.segments).toHaveLength(0);
  });
});

describe("tidy family layout", () => {
  for (const direction of ["oldest-top", "oldest-bottom"] as const) {
    it(`never overlaps people, lines, or people with lines (${direction})`, () => {
      const value = scene(familyTree(), direction);
      expect(value.segments.length).toBeGreaterThan(0);
      assertClean(value);
    });

    it(`puts every parent above its children (${direction})`, () => {
      const value = scene(familyTree(), direction);
      const sign = direction === "oldest-top" ? 1 : -1;
      for (const link of value.model.links) {
        if (link.kind !== "parent") continue;
        const source = String(link.source);
        const target = String(link.target);
        const parentY = nodeY(value.layout, source);
        const childY = nodeY(value.layout, target);
        if (parentY === childY) continue;
        expect(sign * (childY - parentY)).toBeGreaterThan(0);
      }
    });
  }

  it("is deterministic", () => {
    const first = scene(familyTree());
    const second = scene(familyTree());
    expect([...second.layout.personPositions.entries()]).toEqual([
      ...first.layout.personPositions.entries(),
    ]);
    expect(second.segments.map(segment => [segment.id, segment.a, segment.b])).toEqual(
      first.segments.map(segment => [segment.id, segment.a, segment.b]),
    );
  });

  it("keeps partners in overlapping family clusters together", () => {
    const value = scene(familyTree());
    for (const link of value.model.links) {
      if (link.kind !== "partner") continue;
      expect(value.layout.clusterOf.get(String(link.source))).toBe(
        value.layout.clusterOf.get(String(link.target)),
      );
    }
  });

  it("centres a parent over the middle of its children", () => {
    const data = treeWith(
      ["a", "b", "c", "d", "e"].map(id => person(id)),
      [
        partner("p1", "a", "b"),
        parent("r1", "a", "c"),
        parent("r2", "b", "c"),
        parent("r3", "a", "d"),
        parent("r4", "b", "d"),
        parent("r5", "a", "e"),
        parent("r6", "b", "e"),
      ],
    );
    const value = scene(data);
    const family = value.layout.families[0];
    const childXs = ["c", "d", "e"].map(id => nodeX(value.layout, id));
    const middle = [...childXs].sort((a, b) => a - b)[1];
    expect(Math.abs(family.junctionX - middle)).toBeLessThan(24);
  });
});

describe("co-parents", () => {
  it("places two non-partnered parents together", () => {
    const data = treeWith(
      ["a", "b", "c"].map(id => person(id)),
      [parent("r1", "a", "c"), parent("r2", "b", "c")],
    );
    const value = scene(data);
    expect(value.layout.clusterOf.get("a")).toBe(value.layout.clusterOf.get("b"));
    expect(Math.abs(nodeX(value.layout, "a") - nodeX(value.layout, "b"))).toBeLessThan(
      240,
    );
    assertClean(value);
  });

  it("keeps half-siblings from the same pair next to each other", () => {
    const data = treeWith(
      ["a", "b", "c", "d", "e", "f"].map(id => person(id)),
      [
        parent("r1", "a", "c"),
        parent("r2", "b", "c"),
        parent("r3", "a", "d"),
        parent("r4", "b", "d"),
        parent("r5", "a", "e"),
        parent("r6", "f", "e"),
      ],
    );
    const value = scene(data);
    assertClean(value);
    const c = nodeX(value.layout, "c");
    const d = nodeX(value.layout, "d");
    const e = nodeX(value.layout, "e");
    // c and d share both parents, so they must sit on the same side of the
    // half-sibling e rather than interleaving with it.
    expect((c - e) * (d - e)).toBeGreaterThan(0);
  });
});

describe("components and media", () => {
  it("lays out a focused subset without overlaps", () => {
    const data = familyTree();
    const model = buildGraphModel(data, false, new Set(["a0", "a1", "b0", "c0", "c1"]));
    const layout = layoutGraph(model, "oldest-top");
    const segments = routeEdges(model, layout);
    assertClean({ data, model, layout, segments });
  });

  it("gives disconnected families their own space", () => {
    const data = treeWith(
      ["a", "b", "c", "d", "loner"].map(id => person(id)),
      [parent("r1", "a", "b"), parent("r2", "c", "d")],
    );
    const value = scene(data);
    assertClean(value);
    const first = Math.max(nodeX(value.layout, "a"), nodeX(value.layout, "b"));
    const second = Math.min(nodeX(value.layout, "c"), nodeX(value.layout, "d"));
    expect(first).toBeLessThan(second);
  });

  it("never moves a person when media is shown", () => {
    const data = familyTree();
    data.files = [
      {
        id: "photo",
        personId: "b3",
        groupId: null,
        name: "photo.jpg",
        mimeType: "image/jpeg",
        kind: "image",
        thumbUrl: "/api/files/photo/thumb",
        width: 1200,
        height: 800,
        sizeBytes: 2000,
        takenAt: null,
        taggedPersonIds: [],
        createdAt: new Date(),
        isAvatar: false,
      },
    ];
    const withoutMedia = scene(data, "oldest-top", false);
    const withMedia = scene(data, "oldest-top", true);
    expect([...withMedia.layout.personPositions.entries()]).toEqual([
      ...withoutMedia.layout.personPositions.entries(),
    ]);
    expect(withMedia.layout.positions.has(fileNodeId("photo"))).toBe(true);
  });
});

describe("partnership shapes", () => {
  it("routes a star of partners without painting through anyone", () => {
    const data = treeWith(
      ["a", "b", "c", "d"].map(id => person(id)),
      [
        partner("p1", "a", "b"),
        partner("p2", "a", "c"),
        partner("p3", "a", "d"),
      ],
    );
    const value = scene(data);
    assertClean(value);
    expect(value.layout.clusters).toHaveLength(1);
  });
});

describe("exceptional edges", () => {
  it("routes a parent who lives a generation above its co-parent", () => {
    const data = treeWith(
      ["x", "a", "b", "c"].map(id => person(id)),
      [
        parent("r1", "x", "b"),
        parent("r2", "a", "c"),
        parent("r3", "b", "c"),
      ],
    );
    const value = scene(data);
    expect(value.layout.exceptional.length).toBeGreaterThan(0);
    assertClean(value);
  });

  it("keeps both sets of grandparents above a couple without a corridor", () => {
    const data = treeWith(
      ["a1", "a2", "b1", "b2", "c1", "c2"].map(id => person(id)),
      [
        partner("p1", "a1", "a2"),
        partner("p2", "b1", "b2"),
        partner("p3", "c1", "c2"),
        parent("r1", "a1", "c1"),
        parent("r2", "a2", "c1"),
        parent("r3", "b1", "c2"),
        parent("r4", "b2", "c2"),
      ],
    );
    const value = scene(data);
    expect(value.layout.exceptional.length).toBeGreaterThan(0);
    expect(value.layout.exceptional.every(edge => edge.direction === "gutter")).toBe(true);
    expect(value.segments.some(segment => segment.id.includes("corridor"))).toBe(false);
    assertClean(value);
  });
});

describe("generated trees", () => {
  function generatedTree() {
    const levels = [8, 16, 24, 20];
    const ids: string[][] = [];
    let counter = 0;
    for (const count of levels) {
      ids.push(
        Array.from({ length: count }, () => {
          counter += 1;
          return `p${counter}`;
        }),
      );
    }
    const people = ids.flat().map(id => person(id));
    const relationships: GraphRelationship[] = [];
    let edge = 0;
    for (let level = 0; level < levels.length - 1; level += 1) {
      const parents = ids[level];
      const children = ids[level + 1];
      for (let index = 0; index < children.length; index += 1) {
        const first = index % parents.length;
        const second = (index * 3 + 1) % parents.length;
        relationships.push(
          parent(`r${++edge}`, parents[first], children[index]),
        );
        if (second !== first) {
          relationships.push(
            parent(`r${++edge}`, parents[second], children[index]),
          );
        }
      }
    }
    for (let level = 0; level < levels.length; level += 1) {
      const levelIds = ids[level];
      for (let index = 0; index + 1 < levelIds.length; index += 2) {
        if (index % 6 === 0) continue;
        relationships.push(partner(`p${++edge}`, levelIds[index], levelIds[index + 1]));
      }
    }
    const disconnected = Array.from({ length: 8 }, (_, index) => {
      counter += 1;
      return person(`p${counter}`);
    });
    return treeWith([...people, ...disconnected], relationships);
  }

  for (const direction of ["oldest-top", "oldest-bottom"] as const) {
    it(`has no overlaps on a 76-person tree (${direction})`, () => {
      const value = scene(generatedTree(), direction);
      expect(value.segments.length).toBeGreaterThan(100);
      assertClean(value);
    });
  }

  it("places media cards on a ring around their owner", () => {
    const data = treeWith(["a", "b", "c"].map(id => person(id)), [
      parent("r1", "a", "b"),
      parent("r2", "b", "c"),
    ]);
    data.files = Array.from({ length: 11 }, (_, index) => ({
      id: `f${index}`,
      personId: "b",
      groupId: null,
      name: `photo-${index}.jpg`,
      mimeType: "image/jpeg",
      kind: "image" as const,
      thumbUrl: `/api/files/f${index}/thumb`,
      width: 1200,
      height: 800,
      sizeBytes: 2000,
      takenAt: null,
      taggedPersonIds: [],
      createdAt: new Date(),
      isAvatar: false,
    }));
    const value = scene(data, "oldest-top", true);
    const owner = value.layout.personPositions.get("b")!;
    const ownerNode = value.model.byId.get("b")!;
    for (const file of data.files) {
      const position = value.layout.positions.get(fileNodeId(file.id))!;
      const card = fileCardSize(value.model.byId.get(fileNodeId(file.id))!);
      const distance = Math.hypot(position.x - owner.x, position.y - owner.y);
      expect(distance).toBeGreaterThan(nodeRadius(ownerNode) + card.width / 2);
      expect(distance).toBeLessThan(
        nodeRadius(ownerNode) +
          card.width / 2 +
          16 +
          2 * 30 +
          1,
      );
    }
  });
});
