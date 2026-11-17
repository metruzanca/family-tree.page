import { describe, expect, it } from "vitest";
import { buildGraphModel, fileCardSize, nodeRadius } from "./graph";
import { buildConnectors, type EdgeConnector } from "./edge-routing";
import type { GraphPerson, GraphRelationship, TreeGraph } from "../api/people-server";

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

function parent(
  id: string,
  source: string,
  target: string,
): GraphRelationship {
  return { id, type: "parent", source, target, parentType: "biological" };
}

function partner(
  id: string,
  source: string,
  target: string,
): GraphRelationship {
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
    [...grandparents, ...parents, ...children].map(person),
    relationships,
  );
}

type Segment = {
  a: { x: number; y: number };
  b: { x: number; y: number };
  connectorId: string;
  nodeIds: Set<string>;
};

function segmentsOf(connectors: EdgeConnector[]): Segment[] {
  const segments: Segment[] = [];
  for (const connector of connectors) {
    for (const stroke of connector.strokes) {
      for (let index = 0; index < stroke.points.length - 1; index += 1) {
        segments.push({
          a: stroke.points[index],
          b: stroke.points[index + 1],
          connectorId: connector.id,
          nodeIds: new Set([stroke.sourceId, stroke.targetId]),
        });
      }
    }
    if (connector.trunk) {
      for (let index = 0; index < connector.trunk.length - 1; index += 1) {
        segments.push({
          a: connector.trunk[index],
          b: connector.trunk[index + 1],
          connectorId: connector.id,
          nodeIds: new Set([connector.id]),
        });
      }
    }
  }
  return segments;
}

function overlappingSegmentPairs(segments: Segment[]) {
  const overlaps: Array<[Segment, Segment]> = [];
  for (let left = 0; left < segments.length; left += 1) {
    for (let right = left + 1; right < segments.length; right += 1) {
      const first = segments[left];
      const second = segments[right];
      if (first.connectorId === second.connectorId) continue;
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
      if (end - start > 0.75) overlaps.push([first, second]);
    }
  }
  return overlaps;
}

function nodeHits(
  nodes: ReturnType<typeof buildGraphModel>["nodes"],
  segments: Segment[],
) {
  const hits: string[] = [];
  for (const segment of segments) {
    for (const node of nodes) {
      if (segment.nodeIds.has(node.id) || node.kind === "union") continue;
      const radius =
        node.kind === "person"
          ? nodeRadius(node) + 2
          : Math.max(fileCardSize(node).width, fileCardSize(node).height) / 2 + 2;
      const dx = segment.b.x - segment.a.x;
      const dy = segment.b.y - segment.a.y;
      const lengthSquared = dx * dx + dy * dy;
      const t = lengthSquared
        ? Math.max(
            0,
            Math.min(
              1,
              (((node.x ?? 0) - segment.a.x) * dx +
                ((node.y ?? 0) - segment.a.y) * dy) /
                lengthSquared,
            ),
          )
        : 0;
      const x = segment.a.x + t * dx;
      const y = segment.a.y + t * dy;
      if (Math.hypot((node.x ?? 0) - x, (node.y ?? 0) - y) < radius - 1) {
        hits.push(`${node.id} on ${segment.connectorId}`);
      }
    }
  }
  return hits;
}

function nodeOverlaps(nodes: ReturnType<typeof buildGraphModel>["nodes"]) {
  const overlaps: string[] = [];
  for (let left = 0; left < nodes.length; left += 1) {
    for (let right = left + 1; right < nodes.length; right += 1) {
      const first = nodes[left];
      const second = nodes[right];
      if (first.kind === "union" || second.kind === "union") continue;
      const firstRadius =
        first.kind === "person"
          ? nodeRadius(first)
          : Math.max(fileCardSize(first).width, fileCardSize(first).height) / 2;
      const secondRadius =
        second.kind === "person"
          ? nodeRadius(second)
          : Math.max(fileCardSize(second).width, fileCardSize(second).height) / 2;
      if (
        Math.hypot(
          (first.x ?? 0) - (second.x ?? 0),
          (first.y ?? 0) - (second.y ?? 0),
        ) <
        firstRadius + secondRadius
      ) {
        overlaps.push(`${first.id}/${second.id}`);
      }
    }
  }
  return overlaps;
}

describe("relationship deduplication", () => {
  it("keeps one link for a repeated parent or partner pair", () => {
    const data = treeWith(
      ["a", "b", "c"].map(person),
      [
        parent("r1", "a", "c"),
        parent("r2", "a", "c"),
        partner("p1", "a", "b"),
        partner("p2", "b", "a"),
      ],
    );
    const model = buildGraphModel(data, false, "oldest-top");
    expect(model.links.filter(link => link.kind === "parent")).toHaveLength(1);
    expect(model.links.filter(link => link.kind === "partner")).toHaveLength(1);
  });
});

describe("tidy generation layout", () => {
  it("is deterministic and keeps every person on their row", () => {
    const data = familyTree();
    const first = buildGraphModel(data, false, "oldest-top");
    const second = buildGraphModel(data, false, "oldest-top");
    expect(
      second.nodes.map(node => [node.id, node.x, node.y]),
    ).toEqual(first.nodes.map(node => [node.id, node.x, node.y]));

    const rows = new Map<number, number>();
    for (const node of first.nodes) {
      if (node.kind !== "person") continue;
      const row = rows.get(node.level) ?? node.y ?? 0;
      expect(node.y).toBe(row);
      rows.set(node.level, row);
    }
  });

  it("keeps partners adjacent and labels apart", () => {
    const data = familyTree();
    const model = buildGraphModel(data, false, "oldest-top");
    const people = model.nodes.filter(node => node.kind === "person");
    for (const link of model.links) {
      if (link.kind !== "partner") continue;
      const source = people.find(node => node.id === link.source);
      const target = people.find(node => node.id === link.target);
      if (!source || !target) continue;
      const between = people.filter(node => {
        if (node.id === source.id || node.id === target.id) return false;
        if (node.level !== source.level) return false;
        const low = Math.min(source.x ?? 0, target.x ?? 0);
        const high = Math.max(source.x ?? 0, target.x ?? 0);
        return (node.x ?? 0) > low && (node.x ?? 0) < high;
      });
      expect(between).toHaveLength(0);
    }
  });

  it("does not move people when media visibility changes", () => {
    const data = familyTree();
    const withoutMedia = buildGraphModel(data, false, "oldest-top");
    const withMedia = buildGraphModel(data, true, "oldest-top");
    expect(
      withMedia.nodes
        .filter(node => node.kind === "person")
        .map(node => [node.id, node.x, node.y]),
    ).toEqual(
      withoutMedia.nodes
        .filter(node => node.kind === "person")
        .map(node => [node.id, node.x, node.y]),
    );
  });
});

describe("edge routing", () => {
  for (const direction of ["oldest-top", "oldest-bottom"] as const) {
    it(`never paints one edge over another (${direction})`, () => {
      const model = buildGraphModel(familyTree(), false, direction);
      const connectors = buildConnectors(model.nodes, model.links, direction);
      const segments = segmentsOf(connectors);
      expect(segments.length).toBeGreaterThan(0);
      expect(overlappingSegmentPairs(segments)).toHaveLength(0);
    });

    it(`keeps connectors out of unrelated nodes (${direction})`, () => {
      const model = buildGraphModel(familyTree(), false, direction);
      const connectors = buildConnectors(model.nodes, model.links, direction);
      expect(nodeHits(model.nodes, segmentsOf(connectors))).toHaveLength(0);
    });

    it(`never overlaps two nodes (${direction})`, () => {
      const model = buildGraphModel(familyTree(), false, direction);
      expect(nodeOverlaps(model.nodes)).toHaveLength(0);
    });
  }

  it("shares one trunk when a single parent has several children", () => {
    const data = treeWith(
      ["a", "b", "c", "d"].map(person),
      [
        parent("r1", "a", "b"),
        parent("r2", "a", "c"),
        parent("r3", "a", "d"),
      ],
    );
    const model = buildGraphModel(data, false, "oldest-top");
    const connectors = buildConnectors(model.nodes, model.links, "oldest-top");
    const connector = connectors.find(item => item.id === "parent:a");
    expect(connector?.linkIds).toHaveLength(3);
    expect(connector?.trunk).toBeDefined();
    expect(overlappingSegmentPairs(segmentsOf(connectors))).toHaveLength(0);
  });

  it("gives every link a connector and every connector an endpoint", () => {
    const model = buildGraphModel(familyTree(), false, "oldest-top");
    const connectors = buildConnectors(model.nodes, model.links, "oldest-top");
    const covered = new Set(connectors.flatMap(connector => connector.linkIds));
    for (const link of model.links) expect(covered.has(link.id)).toBe(true);
    for (const connector of connectors) {
      expect(connector.strokes.length).toBeGreaterThan(0);
      for (const stroke of connector.strokes) {
        expect(stroke.points.length).toBeGreaterThanOrEqual(2);
      }
    }
  });
});
