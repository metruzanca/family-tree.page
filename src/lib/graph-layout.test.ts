import { describe, expect, it } from "vitest";
import {
  CHILD_FAN_CURVE,
  CLEARANCE_MAX_PUSH,
  LEVEL_SPACING,
  PARENT_CURVE,
  PARTNER_CURVE,
  forceLinkClearance,
  generationTargetY,
  linkCurvatures,
  maxGenerationLevel,
  pathSlice,
  polylineLength,
  quadraticPoints,
  segmentDistance,
  splitPathOutsideCircles,
} from "./graph-layout";
import {
  buildGraphModel,
  junctionNodeId,
  nodeIdOf,
  type GraphLink,
  type GraphNode,
} from "./graph";
import type {
  GraphPerson,
  GraphRelationship,
  TreeGraph,
} from "../api/people-server";

function person(
  id: string,
  firstName = id,
  birthYear: number | null = null,
): GraphPerson {
  return {
    id,
    firstName,
    lastName: "Simpson",
    displayName: `${firstName} Simpson`,
    maidenName: null,
    nickname: null,
    birthDate:
      birthYear === null
        ? null
        : { start: { year: birthYear, month: null, day: null }, qualifier: "exact" },
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

function layoutNode(
  id: string,
  x: number,
  y: number,
  degree = 2,
): GraphNode {
  return { id, kind: "person", name: id, degree, level: 0, x, y, vx: 0, vy: 0 };
}

describe("segmentDistance", () => {
  it("measures a perpendicular hit", () => {
    const hit = segmentDistance(50, 12, 0, 0, 100, 0);
    expect(hit.distance).toBeCloseTo(12);
    expect(hit.x).toBeCloseTo(50);
    expect(hit.y).toBeCloseTo(0);
    expect(hit.t).toBeCloseTo(0.5);
  });

  it("clamps to both endpoints", () => {
    const before = segmentDistance(-30, 40, 0, 0, 100, 0);
    expect(before.distance).toBeCloseTo(50);
    expect(before.x).toBe(0);
    expect(before.t).toBe(0);

    const after = segmentDistance(130, 40, 0, 0, 100, 0);
    expect(after.distance).toBeCloseTo(50);
    expect(after.x).toBe(100);
    expect(after.t).toBe(1);
  });

  it("handles a zero length segment", () => {
    const hit = segmentDistance(3, 4, 0, 0, 0, 0);
    expect(hit.distance).toBeCloseTo(5);
    expect(hit.x).toBe(0);
    expect(hit.t).toBe(0);
  });
});

describe("quadraticPoints", () => {
  it("returns the chord when there is no curvature", () => {
    const points = quadraticPoints({ x: 0, y: 0 }, { x: 100, y: 0 }, 0);
    expect(points).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ]);
  });

  it("bows up for a positive curve and down for a negative one", () => {
    const up = quadraticPoints({ x: 0, y: 0 }, { x: 100, y: 0 }, 0.2, 4);
    const middle = up[2];
    expect(middle.x).toBeCloseTo(50);
    expect(middle.y).toBeLessThan(0);

    const down = quadraticPoints({ x: 0, y: 0 }, { x: 100, y: 0 }, -0.2, 4);
    expect(down[2].y).toBeGreaterThan(0);
  });

  it("keeps both endpoints exact", () => {
    const points = quadraticPoints({ x: 10, y: 20 }, { x: 90, y: 60 }, 0.3, 8);
    expect(points[0]).toEqual({ x: 10, y: 20 });
    expect(points[points.length - 1]).toEqual({ x: 90, y: 60 });
    expect(points).toHaveLength(9);
  });
});

describe("pathSlice", () => {
  const points = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
  ];

  it("reports the length of a polyline", () => {
    expect(polylineLength(points)).toBeCloseTo(100);
    expect(polylineLength([{ x: 5, y: 5 }])).toBe(0);
  });

  it("keeps the middle of a straight path", () => {
    const slice = pathSlice(points, 20, 80);
    expect(slice[0].x).toBeCloseTo(20);
    expect(slice[slice.length - 1].x).toBeCloseTo(80);
  });

  it("walks corners of a polyline", () => {
    const corner = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 50 },
    ];
    const slice = pathSlice(corner, 40, 60);
    expect(slice).toEqual([
      { x: 40, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 10 },
    ]);
  });

  it("returns nothing for an empty range", () => {
    expect(pathSlice(points, 60, 40)).toEqual([]);
    expect(pathSlice(points, 100, 200)).toEqual([]);
  });
});

describe("splitPathOutsideCircles", () => {
  it("keeps the whole path when nothing is in the way", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ];
    expect(splitPathOutsideCircles(points, [])).toEqual([points]);
  });

  it("cuts a gap for a circle in the middle", () => {
    const runs = splitPathOutsideCircles(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      [{ x: 50, y: 0, radius: 10 }],
    );
    expect(runs).toHaveLength(2);
    expect(runs[0][runs[0].length - 1].x).toBeCloseTo(40);
    expect(runs[1][0].x).toBeCloseTo(60);
  });

  it("trims a circle that covers the start", () => {
    const runs = splitPathOutsideCircles(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      [{ x: 0, y: 0, radius: 10 }],
    );
    expect(runs).toHaveLength(1);
    expect(runs[0][0].x).toBeCloseTo(10);
  });

  it("merges overlapping circles into one gap", () => {
    const runs = splitPathOutsideCircles(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      [
        { x: 40, y: 0, radius: 10 },
        { x: 55, y: 0, radius: 10 },
      ],
    );
    expect(runs).toHaveLength(2);
    expect(runs[0][runs[0].length - 1].x).toBeCloseTo(30);
    expect(runs[1][0].x).toBeCloseTo(65);
  });

  it("returns nothing when the circle covers the path", () => {
    expect(
      splitPathOutsideCircles(
        [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
        ],
        [{ x: 50, y: 0, radius: 200 }],
      ),
    ).toEqual([]);
  });

  it("handles a corner in a polyline", () => {
    const runs = splitPathOutsideCircles(
      [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 50, y: 50 },
      ],
      [{ x: 50, y: 0, radius: 10 }],
    );
    expect(runs).toHaveLength(2);
    expect(runs[0][runs[0].length - 1].x).toBeCloseTo(40);
    expect(runs[1][0].y).toBeCloseTo(10);
    expect(runs[1][0].x).toBeCloseTo(50);
  });

  it("ignores degenerate paths", () => {
    expect(splitPathOutsideCircles([{ x: 0, y: 0 }], [])).toEqual([]);
    expect(
      splitPathOutsideCircles(
        [
          { x: 5, y: 5 },
          { x: 5, y: 5 },
        ],
        [{ x: 5, y: 5, radius: 1 }],
      ),
    ).toEqual([]);
  });
});

describe("linkCurvatures", () => {
  it("fans children in birth order and arcs the partners", () => {
    const model = buildGraphModel(
      treeWith(
        [
          person("a", "Homer", 1956),
          person("b", "Marge", 1956),
          person("c", "Bart", 2001),
          person("d", "Lisa", 1999),
          person("e", "Maggie", 2000),
        ],
        [
          partner("p1", "a", "b"),
          parent("r1", "a", "c"),
          parent("r2", "b", "c"),
          parent("r3", "a", "d"),
          parent("r4", "b", "d"),
          parent("r5", "a", "e"),
          parent("r6", "b", "e"),
        ],
      ),
      false,
    );
    const curvatures = linkCurvatures(model);
    const junction = junctionNodeId(["a", "b"]);
    const childCurve = (childId: string) =>
      curvatures.get(`${junction}:child:${childId}`);

    expect(childCurve("d")).toBeCloseTo(-CHILD_FAN_CURVE);
    expect(childCurve("e")).toBeCloseTo(0);
    expect(childCurve("c")).toBeCloseTo(CHILD_FAN_CURVE);
    expect(curvatures.get("p1")).toBeCloseTo(PARTNER_CURVE);
    expect(
      model.links
        .filter(link => link.kind === "parent")
        .map(link => Math.abs(curvatures.get(link.id) ?? 0)),
    ).toEqual([PARENT_CURVE, PARENT_CURVE]);
  });

  it("gives a lone child a straight arm", () => {
    const model = buildGraphModel(
      treeWith([person("a"), person("b")], [parent("r1", "a", "b")]),
      false,
    );
    const child = model.links.find(link => link.kind === "child");
    const parentArm = model.links.find(link => link.kind === "parent");
    expect(child && linkCurvatures(model).get(child.id)).toBe(0);
    expect(parentArm && linkCurvatures(model).get(parentArm.id)).toBe(PARENT_CURVE);
  });

  it("alternates parent arms so they cannot be collinear", () => {
    const model = buildGraphModel(
      treeWith(
        ["a", "b", "c"].map(id => person(id)),
        [parent("r1", "a", "c"), parent("r2", "b", "c")],
      ),
      false,
    );
    const arms = model.links.filter(link => link.kind === "parent");
    const signs = arms.map(link => Math.sign(linkCurvatures(model).get(link.id) ?? 0));
    expect(signs).toEqual([1, -1]);
    expect(nodeIdOf(arms[0].source)).toBe("a");
  });
});

describe("generationTargetY", () => {
  it("centres the bands around zero", () => {
    expect(generationTargetY(0, 4)).toBe(-2 * LEVEL_SPACING);
    expect(generationTargetY(2, 4)).toBe(0);
    expect(generationTargetY(4, 4)).toBe(2 * LEVEL_SPACING);
  });

  it("finds the deepest generation", () => {
    expect(maxGenerationLevel([0, 3, 1])).toBe(3);
    expect(maxGenerationLevel([])).toBe(0);
  });
});

describe("forceLinkClearance", () => {
  function runClearance(
    nodes: GraphNode[],
    links: GraphLink[],
    options?: Parameters<typeof forceLinkClearance>[1],
  ) {
    const force = forceLinkClearance(() => links, options);
    force.initialize(nodes);
    force(1);
    return force;
  }

  it("pushes a person off a link they do not own", () => {
    const a = layoutNode("a", 0, 0);
    const b = layoutNode("b", 100, 0);
    const p = layoutNode("p", 50, 3);
    runClearance(
      [a, b, p],
      [{ id: "l", kind: "parent", source: a, target: b }],
    );
    expect(p.vx).toBeCloseTo(0);
    expect(p.vy).toBeGreaterThan(0);
  });

  it("pushes towards the nearest side", () => {
    const a = layoutNode("a", 0, 0);
    const b = layoutNode("b", 100, 0);
    const below = layoutNode("p", 50, -3);
    runClearance(
      [a, b, below],
      [{ id: "l", kind: "parent", source: a, target: b }],
    );
    expect(below.vy).toBeLessThan(0);
  });

  it("leaves the endpoints and the media links alone", () => {
    const a = layoutNode("a", 0, 0);
    const b = layoutNode("b", 100, 0);
    const p = layoutNode("p", 50, 3);
    runClearance(
      [a, b, p],
      [
        { id: "l", kind: "parent", source: a, target: b },
        { id: "m", kind: "media", source: a, target: p },
      ],
    );
    expect(a.vx).toBe(0);
    expect(a.vy).toBe(0);
    expect(b.vx).toBe(0);
    expect(b.vy).toBe(0);
  });

  it("ignores people that are already clear of the corridor", () => {
    const a = layoutNode("a", 0, 0);
    const b = layoutNode("b", 100, 0);
    const far = layoutNode("p", 50, 400);
    runClearance(
      [a, b, far],
      [{ id: "l", kind: "parent", source: a, target: b }],
    );
    expect(far.vx).toBe(0);
    expect(far.vy).toBe(0);
  });

  it("clamps the push when a person sits exactly on the line", () => {
    const a = layoutNode("a", 0, 0);
    const b = layoutNode("b", 100, 0);
    const p = layoutNode("p", 50, 0);
    runClearance(
      [a, b, p],
      [{ id: "l", kind: "parent", source: a, target: b }],
      { strength: 1000 },
    );
    expect(Math.hypot(p.vx ?? 0, p.vy ?? 0)).toBeLessThanOrEqual(
      CLEARANCE_MAX_PUSH + 1e-9,
    );
    expect(p.vy).not.toBe(0);
  });
});
