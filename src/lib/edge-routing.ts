import type { GraphLink, GraphModel, GraphNode } from "./graph";
import { nodeIdOf, nodeRadius } from "./graph";
import {
  bracketLaneY,
  childLaneY,
  freeJunctionX,
  LANE_STEP,
  median,
  parentLaneY,
  type FamilyPlan,
  type GraphLayout,
  type GutterPlan,
  type Point,
} from "./graph-layout";

export type { Point as EdgePoint };

export type EdgeSegment = {
  id: string;
  lineId: string;
  kind: "parent" | "partner" | "exception";
  a: Point;
  b: Point;
  /** Semantic endpoints, used for hover and selection highlighting. */
  nodeIds: string[];
  linkIds: string[];
  parentType?: GraphLink["parentType"];
  arrow?: boolean;
};

const CORRIDOR_GAP = 46;
const STUB_OFFSET = 7;

type FamilyLinks = {
  byParent: Map<string, string[]>;
  byChild: Map<string, string[]>;
  parentTypeByChild: Map<string, GraphLink["parentType"]>;
};

export function routeEdges(
  model: GraphModel,
  layout: GraphLayout,
): EdgeSegment[] {
  const segments: EdgeSegment[] = [];
  const add = (segment: EdgeSegment) => {
    if (Math.hypot(segment.b.x - segment.a.x, segment.b.y - segment.a.y) >= 0.5) {
      segments.push(segment);
    }
  };

  const positionOf = (id: string) => layout.personPositions.get(id);
  const nodeOf = (id: string) => model.byId.get(id);

  const extraUsed = new Map<number, number>();
  const takeExtraLane = (key: number) => {
    const next = extraUsed.get(key) ?? 0;
    extraUsed.set(key, next + 1);
    return next;
  };
  const exceptionalParentUsed = new Map<number, number>();
  const takeExceptionalParentLane = (key: number) => {
    const next = exceptionalParentUsed.get(key) ?? 0;
    exceptionalParentUsed.set(key, next + 1);
    return next;
  };
  const exceptionalChildUsed = new Map<number, number>();
  const takeExceptionalChildLane = (key: number) => {
    const next = exceptionalChildUsed.get(key) ?? 0;
    exceptionalChildUsed.set(key, next + 1);
    return next;
  };
  const exceptionalChildOffsets = new Map<string, number>();
  const takeStubOffset = (childId: string) => {
    const index = exceptionalChildOffsets.get(childId) ?? 0;
    exceptionalChildOffsets.set(childId, index + 1);
    const magnitude = STUB_OFFSET * (1 + Math.floor(index / 2));
    return index % 2 === 0 ? magnitude : -magnitude;
  };

  const linksByFamily = buildFamilyLinks(model, layout);
  routeFamilies(layout, linksByFamily, add, positionOf, nodeOf);
  routePartners(
    model,
    layout,
    add,
    positionOf,
    nodeOf,
    takeExtraLane,
    takeStubOffset,
  );
  routeExceptional(
    layout,
    add,
    positionOf,
    nodeOf,
    takeExtraLane,
    takeExceptionalParentLane,
    takeExceptionalChildLane,
    takeStubOffset,
    extraUsed,
  );

  return segments;
}

function pushTo(map: Map<string, string[]>, key: string, value: string) {
  const list = map.get(key) ?? [];
  list.push(value);
  map.set(key, list);
}

function buildFamilyLinks(
  model: GraphModel,
  layout: GraphLayout,
): Map<string, FamilyLinks> {
  const familyByCluster = new Map(layout.families.map(family => [family.id, family]));
  const result = new Map<string, FamilyLinks>();
  for (const link of model.links) {
    if (link.kind !== "parent") continue;
    const parentId = nodeIdOf(link.source);
    const childId = nodeIdOf(link.target);
    const cluster = layout.clusterOf.get(parentId);
    const family = cluster ? familyByCluster.get(cluster.id) : undefined;
    if (!family || !family.childIds.includes(childId)) continue;
    let entry = result.get(family.id);
    if (!entry) {
      entry = {
        byParent: new Map(),
        byChild: new Map(),
        parentTypeByChild: new Map(),
      };
      result.set(family.id, entry);
    }
    pushTo(entry.byParent, parentId, link.id);
    pushTo(entry.byChild, childId, link.id);
    if (link.parentType && link.parentType !== "biological") {
      entry.parentTypeByChild.set(childId, link.parentType);
    } else if (!entry.parentTypeByChild.has(childId)) {
      entry.parentTypeByChild.set(childId, "biological");
    }
  }
  return result;
}

function routeFamilies(
  layout: GraphLayout,
  linksByFamily: Map<string, FamilyLinks>,
  add: (segment: EdgeSegment) => void,
  positionOf: (id: string) => Point | undefined,
  nodeOf: (id: string) => GraphNode | undefined,
) {
  for (const family of layout.families) {
    const gutter = layout.gutters.get(family.parentLevel);
    if (!gutter) continue;
    routeFamily(
      family,
      gutter,
      add,
      positionOf,
      nodeOf,
      linksByFamily.get(family.id),
    );
  }
}

function routeFamily(
  family: FamilyPlan,
  gutter: GutterPlan,
  add: (segment: EdgeSegment) => void,
  positionOf: (id: string) => Point | undefined,
  nodeOf: (id: string) => GraphNode | undefined,
  links: FamilyLinks | undefined,
) {
  const down = gutter.down;
  const junction = family.junctionX;
  const trunkNodeIds = [...family.parentIds, ...family.childIds];
  const trunkLinkIds = [
    ...new Set([
      ...family.parentIds.flatMap(id => links?.byParent.get(id) ?? []),
      ...family.childIds.flatMap(id => links?.byChild.get(id) ?? []),
    ]),
  ];

  for (const parentId of family.parentIds) {
    const node = nodeOf(parentId);
    const position = positionOf(parentId);
    if (!node || !position) continue;
    const lane = family.parentLanes.get(parentId);
    if (lane == null) continue;
    const lineId = `family:${family.id}:parent:${parentId}`;
    const nodeIds = [parentId, ...family.childIds];
    const linkIds = links?.byParent.get(parentId) ?? [];
    const laneY = parentLaneY(gutter, lane);
    add({
      id: `${lineId}:stub`,
      lineId,
      kind: "parent",
      a: personEdgePoint(position, node, down, 0),
      b: { x: position.x, y: laneY },
      nodeIds,
      linkIds,
    });
    if (Math.abs(position.x - junction) > 0.5) {
      add({
        id: `${lineId}:arm`,
        lineId,
        kind: "parent",
        a: { x: position.x, y: laneY },
        b: { x: junction, y: laneY },
        nodeIds,
        linkIds,
      });
    }
  }

  const absorbedChild =
    family.childIds.find(childId => {
      const position = positionOf(childId);
      return position ? Math.abs(position.x - junction) < 0.5 : false;
    }) ?? null;

  const childEdgeYs = new Map<string, number>();
  for (const childId of family.childIds) {
    const node = nodeOf(childId);
    const position = positionOf(childId);
    if (!node || !position) continue;
    childEdgeYs.set(
      childId,
      personEdgePoint(position, node, (down === 1 ? -1 : 1) as 1 | -1, 0).y,
    );
  }

  const deepestLaneY = parentLaneY(gutter, family.maxLane);
  const absorbedY = absorbedChild ? childEdgeYs.get(absorbedChild) : undefined;
  const trunkEndY =
    absorbedY == null
      ? deepestLaneY
      : down > 0
        ? Math.max(deepestLaneY, absorbedY)
        : Math.min(deepestLaneY, absorbedY);
  add({
    id: `family:${family.id}:trunk`,
    lineId: `family:${family.id}:trunk`,
    kind: "parent",
    a: { x: junction, y: parentLaneY(gutter, 0) },
    b: { x: junction, y: trunkEndY },
    nodeIds: trunkNodeIds,
    linkIds: trunkLinkIds,
  });

  for (const childId of family.childIds) {
    if (childId === absorbedChild) continue;
    const node = nodeOf(childId);
    const position = positionOf(childId);
    if (!node || !position) continue;
    const lane = family.childLanes.get(childId);
    if (lane == null) continue;
    const laneY = parentLaneY(gutter, lane);
    const parentType = links?.parentTypeByChild.get(childId) ?? "biological";
    const lineId = `family:${family.id}:child:${childId}`;
    const nodeIds = [childId, ...family.parentIds];
    const linkIds = links?.byChild.get(childId) ?? [];
    add({
      id: `${lineId}:arm`,
      lineId,
      kind: "parent",
      a: { x: junction, y: laneY },
      b: { x: position.x, y: laneY },
      nodeIds,
      linkIds,
      parentType,
    });
    add({
      id: `${lineId}:drop`,
      lineId,
      kind: "parent",
      a: { x: position.x, y: laneY },
      b: { x: position.x, y: childEdgeYs.get(childId) ?? laneY },
      nodeIds,
      linkIds,
      parentType,
      arrow: true,
    });
  }
}

function personEdgePoint(
  position: Point,
  node: GraphNode,
  direction: 1 | -1,
  xOffset: number,
): Point {
  const radius = nodeRadius(node);
  const dx = Math.min(Math.abs(xOffset), Math.max(0, radius - 0.5));
  const dy = Math.sqrt(Math.max(1, radius * radius - dx * dx));
  return { x: position.x + xOffset, y: position.y + direction * dy };
}

function bracketSide(layout: GraphLayout) {
  const down: 1 | -1 = layout.direction === "oldest-top" ? 1 : -1;
  return (down === 1 ? -1 : 1) as 1 | -1;
}

function bracketGutterKey(layout: GraphLayout, level: number) {
  const index = layout.levels.indexOf(level);
  if (index < 0) return null;
  const lower = layout.levels[index - 1];
  if (lower != null) return Math.min(level, lower);
  const higher = layout.levels[index + 1];
  if (higher != null) return Math.min(level, higher);
  return null;
}

function gutterDirection(
  layout: GraphLayout,
  level: number,
  gutterKey: number,
): 1 | -1 {
  const down: 1 | -1 = layout.direction === "oldest-top" ? 1 : -1;
  return gutterKey < level ? ((down === 1 ? -1 : 1) as 1 | -1) : down;
}

function routePartners(
  model: GraphModel,
  layout: GraphLayout,
  add: (segment: EdgeSegment) => void,
  positionOf: (id: string) => Point | undefined,
  nodeOf: (id: string) => GraphNode | undefined,
  takeExtraLane: (key: number) => number,
  takeStubOffset: (id: string) => number,
) {
  const partnerLinks = model.links
    .filter(link => link.kind === "partner")
    .sort((a, b) => a.id.localeCompare(b.id));

  for (const link of partnerLinks) {
    const sourceId = nodeIdOf(link.source);
    const targetId = nodeIdOf(link.target);
    const source = nodeOf(sourceId);
    const target = nodeOf(targetId);
    const sourcePosition = positionOf(sourceId);
    const targetPosition = positionOf(targetId);
    if (!source || !target || !sourcePosition || !targetPosition) continue;
    const lineId = `partner:${link.id}`;
    const nodeIds = [sourceId, targetId];

    const sourceCluster = layout.clusterOf.get(sourceId);
    const targetCluster = layout.clusterOf.get(targetId);
    const sameCluster = sourceCluster && sourceCluster === targetCluster;
    const sourceIndex = sourceCluster?.memberIds.indexOf(sourceId) ?? -1;
    const targetIndex = sourceCluster?.memberIds.indexOf(targetId) ?? -1;
    const adjacent =
      sameCluster &&
      sourceIndex >= 0 &&
      targetIndex >= 0 &&
      Math.abs(sourceIndex - targetIndex) === 1;

    if (adjacent) {
      const leftFirst = sourcePosition.x <= targetPosition.x;
      const left = leftFirst ? source : target;
      const right = leftFirst ? target : source;
      const leftPosition = leftFirst ? sourcePosition : targetPosition;
      const rightPosition = leftFirst ? targetPosition : sourcePosition;
      add({
        id: `${lineId}:straight`,
        lineId,
        kind: "partner",
        a: { x: leftPosition.x + nodeRadius(left), y: leftPosition.y },
        b: { x: rightPosition.x - nodeRadius(right), y: rightPosition.y },
        nodeIds,
        linkIds: [link.id],
      });
      continue;
    }

    if (Math.abs(sourcePosition.y - targetPosition.y) > 0.5) {
      const a = personEdgePoint(
        sourcePosition,
        source,
        targetPosition.y >= sourcePosition.y ? 1 : -1,
        0,
      );
      const b = personEdgePoint(
        targetPosition,
        target,
        sourcePosition.y >= targetPosition.y ? 1 : -1,
        0,
      );
      add({
        id: `${lineId}:direct`,
        lineId,
        kind: "partner",
        a,
        b,
        nodeIds,
        linkIds: [link.id],
      });
      continue;
    }

    const gutterKey = bracketGutterKey(layout, source.level);
    const visualDirection =
      gutterKey == null
        ? bracketSide(layout)
        : gutterDirection(layout, source.level, gutterKey);
    const lane = takeExtraLane(gutterKey ?? -1);
    const radius = Math.max(nodeRadius(source), nodeRadius(target));
    const laneY = bracketLaneY(
      sourcePosition.y,
      radius,
      visualDirection,
      lane,
    );
    const sourceOffset = takeStubOffset(sourceId);
    const targetOffset = takeStubOffset(targetId);
    const sourceEdge = personEdgePoint(
      sourcePosition,
      source,
      visualDirection,
      sourceOffset,
    );
    const targetEdge = personEdgePoint(
      targetPosition,
      target,
      visualDirection,
      targetOffset,
    );
    add({
      id: `${lineId}:a`,
      lineId,
      kind: "partner",
      a: sourceEdge,
      b: { x: sourceEdge.x, y: laneY },
      nodeIds,
      linkIds: [link.id],
    });
    add({
      id: `${lineId}:run`,
      lineId,
      kind: "partner",
      a: { x: sourceEdge.x, y: laneY },
      b: { x: targetEdge.x, y: laneY },
      nodeIds,
      linkIds: [link.id],
    });
    add({
      id: `${lineId}:b`,
      lineId,
      kind: "partner",
      a: { x: targetEdge.x, y: laneY },
      b: targetEdge,
      nodeIds,
      linkIds: [link.id],
    });
  }
}

function routeExceptional(
  layout: GraphLayout,
  add: (segment: EdgeSegment) => void,
  positionOf: (id: string) => Point | undefined,
  nodeOf: (id: string) => GraphNode | undefined,
  takeExtraLane: (key: number) => number,
  takeExceptionalParentLane: (key: number) => number,
  takeExceptionalChildLane: (key: number) => number,
  takeStubOffset: (childId: string) => number,
  extraUsed: Map<number, number>,
) {
  const sorted = [...layout.exceptional].sort((a, b) =>
    a.linkId.localeCompare(b.linkId),
  );
  const sameRow = sorted.filter(edge => edge.direction === "same-row");
  const gutterEdges = sorted.filter(edge => edge.direction === "gutter");
  const corridors = sorted.filter(edge => edge.direction === "corridor");
  let corridorIndex = 0;

  for (const edge of sameRow) {
    const parent = nodeOf(edge.parentId);
    const child = nodeOf(edge.childId);
    const parentPosition = positionOf(edge.parentId);
    const childPosition = positionOf(edge.childId);
    if (!parent || !child || !parentPosition || !childPosition) continue;
    const lineId = `exception:${edge.linkId}`;
    const nodeIds = [edge.parentId, edge.childId];
    const gutterKey = edge.parentGutterKey ?? bracketGutterKey(layout, parent.level);
    if (gutterKey == null) {
      add({
        id: `${lineId}:direct`,
        lineId,
        kind: "exception",
        a: personEdgePoint(
          parentPosition,
          parent,
          childPosition.y >= parentPosition.y ? 1 : -1,
          0,
        ),
        b: personEdgePoint(
          childPosition,
          child,
          parentPosition.y >= childPosition.y ? 1 : -1,
          0,
        ),
        nodeIds,
        linkIds: [edge.linkId],
        parentType: edge.parentType,
        arrow: true,
      });
      continue;
    }
    const lane = takeExtraLane(gutterKey);
    const visualDirection = gutterDirection(layout, parent.level, gutterKey);
    const radius = Math.max(nodeRadius(parent), nodeRadius(child));
    const laneY = bracketLaneY(parentPosition.y, radius, visualDirection, lane);
    const sourceOffset = takeStubOffset(edge.parentId);
    const targetOffset = takeStubOffset(edge.childId);
    const sourceEdge = personEdgePoint(
      parentPosition,
      parent,
      visualDirection,
      sourceOffset,
    );
    const targetEdge = personEdgePoint(
      childPosition,
      child,
      visualDirection,
      targetOffset,
    );
    add({
      id: `${lineId}:a`,
      lineId,
      kind: "exception",
      a: sourceEdge,
      b: { x: sourceEdge.x, y: laneY },
      nodeIds,
      linkIds: [edge.linkId],
      parentType: edge.parentType,
    });
    add({
      id: `${lineId}:run`,
      lineId,
      kind: "exception",
      a: { x: sourceEdge.x, y: laneY },
      b: { x: targetEdge.x, y: laneY },
      nodeIds,
      linkIds: [edge.linkId],
      parentType: edge.parentType,
    });
    add({
      id: `${lineId}:b`,
      lineId,
      kind: "exception",
      a: { x: targetEdge.x, y: laneY },
      b: targetEdge,
      nodeIds,
      linkIds: [edge.linkId],
      parentType: edge.parentType,
      arrow: true,
    });
  }

  const gutterGroups = new Map<string, typeof gutterEdges>();
  for (const edge of gutterEdges) {
    const clusterId = layout.clusterOf.get(edge.parentId)?.id ?? edge.parentId;
    const key = `${clusterId}|${edge.childId}`;
    const list = gutterGroups.get(key) ?? [];
    list.push(edge);
    gutterGroups.set(key, list);
  }

  for (const [groupKey, group] of gutterGroups) {
    const child = nodeOf(group[0].childId);
    const childPosition = positionOf(group[0].childId);
    const gutterKey = group[0].parentGutterKey;
    if (!child || !childPosition || gutterKey == null) continue;
    const gutter = layout.gutters.get(gutterKey);
    if (!gutter) continue;

    const parents = group
      .map(entry => {
        const node = nodeOf(entry.parentId);
        const position = positionOf(entry.parentId);
        return node && position
          ? { entry, node, position }
          : null;
      })
      .filter(
        (
          value,
        ): value is {
          entry: (typeof group)[number];
          node: GraphNode;
          position: Point;
        } => Boolean(value),
      )
      .sort(
        (a, b) =>
          a.position.x - b.position.x ||
          a.entry.parentId.localeCompare(b.entry.parentId),
      );
    if (!parents.length) continue;

    const parentXs = parents.map(value => value.position.x);
    const childOffset = takeStubOffset(group[0].childId);
    const targetX = childPosition.x + childOffset;
    const junctionX = freeJunctionX(
      median(parentXs),
      [...parentXs, targetX],
      [],
    );
    const left = parents
      .filter(value => value.position.x < junctionX - 0.5)
      .sort(
        (a, b) =>
          Math.abs(a.position.x - junctionX) -
          Math.abs(b.position.x - junctionX),
      );
    const right = parents
      .filter(value => value.position.x > junctionX + 0.5)
      .sort(
        (a, b) =>
          Math.abs(a.position.x - junctionX) -
          Math.abs(b.position.x - junctionX),
      );
    const center = parents.filter(
      value => Math.abs(value.position.x - junctionX) <= 0.5,
    );
    const parentLaneCount = Math.max(1, left.length, right.length);
    const laneCount = 1 + parentLaneCount;
    let baseLane = 0;
    for (let index = 0; index < laneCount; index += 1) {
      const lane = gutter.normalParentLanes + takeExceptionalParentLane(gutterKey);
      if (index === 0) baseLane = lane;
    }
    const runLane = parentLaneY(gutter, baseLane);
    const trunkEnd = parentLaneY(gutter, baseLane + parentLaneCount);
    const towardChild: 1 | -1 =
      childPosition.y >= parents[0].position.y ? 1 : -1;
    const targetEdge = personEdgePoint(
      childPosition,
      child,
      (towardChild === 1 ? -1 : 1) as 1 | -1,
      childOffset,
    );
    const lineId = `exception-group:${groupKey}`;
    const linkIds = group.map(entry => entry.linkId);
    const nodeIds = [...parents.map(value => value.entry.parentId), group[0].childId];
    const parentType =
      group.find(entry => entry.parentType && entry.parentType !== "biological")
        ?.parentType ?? "biological";

    const laneFor = (value: (typeof parents)[number]) => {
      const side = value.position.x < junctionX - 0.5 ? left : right;
      const index = side.indexOf(value);
      return baseLane + 1 + Math.max(0, index);
    };

    for (const value of parents) {
      const lane = center.includes(value) ? baseLane + 1 : laneFor(value);
      const laneY = parentLaneY(gutter, lane);
      const parentOffset = takeStubOffset(value.entry.parentId);
      const start = personEdgePoint(
        value.position,
        value.node,
        towardChild,
        parentOffset,
      );
      add({
        id: `${lineId}:${value.entry.parentId}:stub`,
        lineId,
        kind: "exception",
        a: start,
        b: { x: value.position.x + parentOffset, y: laneY },
        nodeIds,
        linkIds,
        parentType,
      });
      if (Math.abs(value.position.x + parentOffset - junctionX) > 0.5) {
        add({
          id: `${lineId}:${value.entry.parentId}:arm`,
          lineId,
          kind: "exception",
          a: { x: value.position.x + parentOffset, y: laneY },
          b: { x: junctionX, y: laneY },
          nodeIds,
          linkIds,
          parentType,
        });
      }
    }

    add({
      id: `${lineId}:trunk`,
      lineId,
      kind: "exception",
      a: { x: junctionX, y: runLane },
      b: { x: junctionX, y: trunkEnd },
      nodeIds,
      linkIds,
      parentType,
    });
    add({
      id: `${lineId}:run`,
      lineId,
      kind: "exception",
      a: { x: junctionX, y: runLane },
      b: { x: targetX, y: runLane },
      nodeIds,
      linkIds,
      parentType,
    });
    add({
      id: `${lineId}:drop`,
      lineId,
      kind: "exception",
      a: { x: targetX, y: runLane },
      b: targetEdge,
      nodeIds,
      linkIds,
      parentType,
      arrow: true,
    });
  }

  for (const edge of corridors) {
    const parent = nodeOf(edge.parentId);
    const child = nodeOf(edge.childId);
    const parentPosition = positionOf(edge.parentId);
    const childPosition = positionOf(edge.childId);
    if (!parent || !child || !parentPosition || !childPosition) continue;
    if (edge.parentGutterKey == null || edge.childGutterKey == null) continue;
    const parentGutter = layout.gutters.get(edge.parentGutterKey);
    const childGutter = layout.gutters.get(edge.childGutterKey);
    if (!parentGutter || !childGutter) continue;

    const lineId = `exception:${edge.linkId}`;
    const nodeIds = [edge.parentId, edge.childId];
    const parentLane =
      parentGutter.normalParentLanes +
      takeExceptionalParentLane(edge.parentGutterKey);
    const parentLaneYValue = parentLaneY(parentGutter, parentLane);
    const childLane =
      (extraUsed.get(edge.childGutterKey) ?? 0) +
      takeExceptionalChildLane(edge.childGutterKey);
    const childLaneYValue = childLaneY(childGutter, childLane);
    const corridorX =
      layout.networkBounds.maxX + CORRIDOR_GAP * (corridorIndex + 1);
    corridorIndex += 1;

    const towardChild: 1 | -1 =
      childPosition.y >= parentPosition.y ? 1 : -1;
    const childOffset = takeStubOffset(edge.childId);
    const parentOffset = takeStubOffset(edge.parentId);
    const sourceEdge = personEdgePoint(
      parentPosition,
      parent,
      towardChild,
      parentOffset,
    );
    add({
      id: `${lineId}:a`,
      lineId,
      kind: "exception",
      a: sourceEdge,
      b: { x: sourceEdge.x, y: parentLaneYValue },
      nodeIds,
      linkIds: [edge.linkId],
      parentType: edge.parentType,
    });
    add({
      id: `${lineId}:toCorridor`,
      lineId,
      kind: "exception",
      a: { x: sourceEdge.x, y: parentLaneYValue },
      b: { x: corridorX, y: parentLaneYValue },
      nodeIds,
      linkIds: [edge.linkId],
      parentType: edge.parentType,
    });
    add({
      id: `${lineId}:corridor`,
      lineId,
      kind: "exception",
      a: { x: corridorX, y: parentLaneYValue },
      b: { x: corridorX, y: childLaneYValue },
      nodeIds,
      linkIds: [edge.linkId],
      parentType: edge.parentType,
    });
    add({
      id: `${lineId}:fromCorridor`,
      lineId,
      kind: "exception",
      a: { x: corridorX, y: childLaneYValue },
      b: { x: childPosition.x + childOffset, y: childLaneYValue },
      nodeIds,
      linkIds: [edge.linkId],
      parentType: edge.parentType,
    });
    const targetEdge = personEdgePoint(
      childPosition,
      child,
      (towardChild === 1 ? -1 : 1) as 1 | -1,
      childOffset,
    );
    add({
      id: `${lineId}:b`,
      lineId,
      kind: "exception",
      a: { x: targetEdge.x, y: childLaneYValue },
      b: targetEdge,
      nodeIds,
      linkIds: [edge.linkId],
      parentType: edge.parentType,
      arrow: true,
    });
  }
}
