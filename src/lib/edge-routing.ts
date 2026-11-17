import {
  fileCardSize,
  nodeRadius,
  type GenerationDirection,
  type GraphLink,
  type GraphNode,
} from "./graph";

export type EdgePoint = { x: number; y: number };

export type EdgeStroke = {
  kind: GraphLink["kind"];
  parentType?: GraphLink["parentType"];
  points: EdgePoint[];
  arrow: boolean;
  sourceId: string;
  targetId: string;
};

export type EdgeConnector = {
  id: string;
  linkIds: string[];
  strokes: EdgeStroke[];
  trunk?: EdgePoint[];
};

const LANE_STEP = 9;
const EDGE_CLEARANCE = 8;
/** Keep horizontal connector runs clear of the name label under each person. */
const LABEL_CLEARANCE = 22;
const TRUNK_X_CLEARANCE = 8;

function nodeIdOf(endpoint: string | GraphNode) {
  return typeof endpoint === "string" ? endpoint : endpoint.id;
}

function nodeCenter(node: GraphNode): EdgePoint {
  return { x: node.x ?? 0, y: node.y ?? 0 };
}

/** Point on the node outline in the direction of another point. */
export function anchorToward(node: GraphNode, x: number, y: number): EdgePoint {
  const center = nodeCenter(node);
  const dx = x - center.x;
  const dy = y - center.y;
  if (node.kind === "union") {
    const length = Math.abs(dx) + Math.abs(dy);
    if (!length) return center;
    const scale = 6 / length;
    return { x: center.x + dx * scale, y: center.y + dy * scale };
  }
  if (node.kind === "person") {
    const length = Math.hypot(dx, dy);
    if (!length) return center;
    const radius = nodeRadius(node) + 1;
    return {
      x: center.x + (dx / length) * radius,
      y: center.y + (dy / length) * radius,
    };
  }
  const card = fileCardSize(node);
  const halfWidth = card.width / 2 + 1;
  const halfHeight = card.height / 2 + 1;
  if (!dx && !dy) return { x: center.x, y: center.y - halfHeight };
  const scale = 1 / Math.max(Math.abs(dx) / halfWidth, Math.abs(dy) / halfHeight);
  return { x: center.x + dx * scale, y: center.y + dy * scale };
}

function anchorSide(node: GraphNode, side: "top" | "bottom"): EdgePoint {
  const center = nodeCenter(node);
  if (node.kind === "person") {
    const radius = nodeRadius(node) + 1;
    return { x: center.x, y: center.y + (side === "top" ? -radius : radius) };
  }
  if (node.kind === "union") {
    return { x: center.x, y: center.y + (side === "top" ? -6 : 6) };
  }
  const card = fileCardSize(node);
  return { x: center.x, y: center.y + (side === "top" ? -card.height / 2 : card.height / 2) };
}

function directionSign(direction: GenerationDirection) {
  return direction === "oldest-top" ? 1 : -1;
}

/**
 * Allocates horizontal runs so two link segments may share a lane only when
 * their x ranges do not overlap. That is what makes overlapping edge pixels
 * impossible rather than merely unlikely.
 */
class LanePool {
  private lanes = new Map<number, Array<[number, number]>>();

  take(
    startY: number,
    towardY: number,
    minX: number,
    maxX: number,
  ): number | null {
    const dir = Math.sign(towardY - startY) || 1;
    const limit = towardY;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const y = startY + dir * attempt * LANE_STEP;
      if (dir > 0 ? y > limit : y < limit) break;
      if (this.claim(y, minX, maxX)) return y;
    }
    return null;
  }

  private claim(y: number, minX: number, maxX: number) {
    const key = Math.round(y * 2) / 2;
    const left = Math.min(minX, maxX);
    const right = Math.max(minX, maxX);
    const intervals = this.lanes.get(key) ?? [];
    for (const [start, end] of intervals) {
      if (left < end && right > start) return false;
    }
    intervals.push([left, right]);
    this.lanes.set(key, intervals);
    return true;
  }
}

/**
 * Builds the drawable connector for every family. Each union becomes one
 * orthogonal tree: parent arms merge into a single vertical trunk, then child
 * arms split off on their own lanes. Rendering the junction once means sibling
 * edges never paint over each other.
 */
export function buildConnectors(
  nodes: GraphNode[],
  links: GraphLink[],
  direction: GenerationDirection,
): EdgeConnector[] {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const sign = directionSign(direction);
  const lanes = new LanePool();
  const connectors: EdgeConnector[] = [];
  const unionGroups = new Map<
    string,
    { parentLinks: GraphLink[]; childLinks: GraphLink[] }
  >();
  const directGroups = new Map<string, GraphLink[]>();

  for (const link of links) {
    if (link.kind === "union") {
      const group = unionGroups.get(nodeIdOf(link.target)) ?? {
        parentLinks: [],
        childLinks: [],
      };
      group.parentLinks.push(link);
      unionGroups.set(nodeIdOf(link.target), group);
      continue;
    }
    if (link.kind === "parent" && link.viaUnion) {
      const group = unionGroups.get(nodeIdOf(link.source)) ?? {
        parentLinks: [],
        childLinks: [],
      };
      group.childLinks.push(link);
      unionGroups.set(nodeIdOf(link.source), group);
      continue;
    }
    if (link.kind === "parent") {
      const parentId = nodeIdOf(link.source);
      const group = directGroups.get(parentId) ?? [];
      group.push(link);
      directGroups.set(parentId, group);
    }
  }

  for (const [unionId, group] of unionGroups) {
    const union = byId.get(unionId);
    if (!union) continue;
    const junction = nodeCenter(union);
    const strokes: EdgeStroke[] = [];
    const trunkYs: number[] = [junction.y];
    const linkIds: string[] = [];

    for (const link of group.parentLinks) {
      linkIds.push(link.id);
      const parent = byId.get(nodeIdOf(link.source));
      if (!parent) continue;
      const lane = parentLane(lanes, parent, junction, sign);
      if (lane == null) {
        strokes.push({
          kind: "union",
          points: [anchorToward(parent, junction.x, junction.y), junction],
          arrow: false,
          sourceId: parent.id,
          targetId: union.id,
        });
        continue;
      }
      trunkYs.push(lane);
      strokes.push({
        kind: "union",
        points: [
          anchorSide(parent, sign > 0 ? "bottom" : "top"),
          { x: parent.x ?? 0, y: lane },
          { x: junction.x, y: lane },
        ],
        arrow: false,
        sourceId: parent.id,
        targetId: union.id,
      });
    }

    for (const link of group.childLinks) {
      linkIds.push(link.id);
      const child = byId.get(nodeIdOf(link.target));
      if (!child) continue;
      const lane = childLane(lanes, child, junction, sign);
      if (lane == null) {
        strokes.push({
          kind: "parent",
          parentType: link.parentType,
          points: [junction, anchorToward(child, junction.x, junction.y)],
          arrow: true,
          sourceId: union.id,
          targetId: child.id,
        });
        continue;
      }
      trunkYs.push(lane);
      strokes.push({
        kind: "parent",
        parentType: link.parentType,
        points: [
          { x: junction.x, y: lane },
          { x: child.x ?? 0, y: lane },
          anchorSide(child, sign > 0 ? "top" : "bottom"),
        ],
        arrow: true,
        sourceId: union.id,
        targetId: child.id,
      });
    }

    const top = Math.min(...trunkYs);
    const bottom = Math.max(...trunkYs);
    connectors.push({
      id: unionId,
      linkIds,
      strokes,
      trunk:
        bottom - top > 0.5
          ? [
              { x: junction.x, y: top },
              { x: junction.x, y: bottom },
            ]
          : undefined,
    });
  }

  const personColumns = nodes
    .filter(node => node.kind !== "union")
    .map(node => node.x ?? 0);
  const virtualColumns: number[] = [];
  for (const [parentId, group] of directGroups) {
    const parent = byId.get(parentId);
    if (!parent) continue;
    const children = group
      .map(link => ({ link, child: byId.get(nodeIdOf(link.target)) }))
      .filter(
        (entry): entry is { link: GraphLink; child: GraphNode } =>
          Boolean(entry.child),
      );
    if (!children.length) continue;

    if (children.length === 1) {
      const { link, child } = children[0];
      const parentCenter = nodeCenter(parent);
      const childCenter = nodeCenter(child);
      const lane = lanes.take(
        parentCenter.y +
          sign * (nodeRadius(parent) + EDGE_CLEARANCE + LABEL_CLEARANCE),
        childCenter.y,
        parentCenter.x,
        childCenter.x,
      );
      if (lane == null) {
        connectors.push({
          id: `parent:${link.id}`,
          linkIds: [link.id],
          strokes: [
            {
              kind: "parent",
              parentType: link.parentType,
              points: [
                anchorToward(parent, childCenter.x, childCenter.y),
                anchorToward(child, parentCenter.x, parentCenter.y),
              ],
              arrow: true,
              sourceId: parent.id,
              targetId: child.id,
            },
          ],
        });
        continue;
      }
      connectors.push({
        id: `parent:${link.id}`,
        linkIds: [link.id],
        strokes: [
          {
            kind: "parent",
            parentType: link.parentType,
            points: [
              anchorSide(parent, sign > 0 ? "bottom" : "top"),
              { x: parentCenter.x, y: lane },
              { x: childCenter.x, y: lane },
              anchorSide(child, sign > 0 ? "top" : "bottom"),
            ],
            arrow: true,
            sourceId: parent.id,
            targetId: child.id,
          },
        ],
      });
      continue;
    }

    // One parent with several children needs the same shared trunk as a
    // couple, otherwise every child edge would paint the parent's drop again.
    const parentCenter = nodeCenter(parent);
    const childXs = children.map(entry => entry.child.x ?? 0);
    let junctionX = (Math.min(...childXs) + Math.max(...childXs)) / 2;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const onColumn =
        personColumns.some(column => Math.abs(column - junctionX) < 3) ||
        virtualColumns.some(column => Math.abs(column - junctionX) < 8);
      if (!onColumn) break;
      const step = Math.floor(attempt / 2) + 1;
      junctionX += 6 * step * (attempt % 2 === 0 ? 1 : -1);
    }
    virtualColumns.push(junctionX);
    const childRowY = children[0].child.y ?? parentCenter.y + sign * 190;
    const junction: EdgePoint = {
      x: junctionX,
      y: (parentCenter.y + childRowY) / 2,
    };
    const laneYs: number[] = [junction.y];
    const strokes: EdgeStroke[] = [];

    const parentY = parentLane(lanes, parent, junction, sign);
    if (parentY == null) {
      strokes.push({
        kind: "union",
        points: [anchorToward(parent, junction.x, junction.y), junction],
        arrow: false,
        sourceId: parent.id,
        targetId: parent.id,
      });
    } else {
      laneYs.push(parentY);
      strokes.push({
        kind: "union",
        points: [
          anchorSide(parent, sign > 0 ? "bottom" : "top"),
          { x: parentCenter.x, y: parentY },
          { x: junction.x, y: parentY },
        ],
        arrow: false,
        sourceId: parent.id,
        targetId: parent.id,
      });
    }

    for (const { link, child } of children) {
      const childY = childLane(lanes, child, junction, sign);
      if (childY == null) {
        strokes.push({
          kind: "parent",
          parentType: link.parentType,
          points: [junction, anchorToward(child, junction.x, junction.y)],
          arrow: true,
          sourceId: parent.id,
          targetId: child.id,
        });
        continue;
      }
      laneYs.push(childY);
      strokes.push({
        kind: "parent",
        parentType: link.parentType,
        points: [
          { x: junction.x, y: childY },
          { x: child.x ?? 0, y: childY },
          anchorSide(child, sign > 0 ? "top" : "bottom"),
        ],
        arrow: true,
        sourceId: parent.id,
        targetId: child.id,
      });
    }

    const top = Math.min(...laneYs);
    const bottom = Math.max(...laneYs);
    connectors.push({
      id: `parent:${parent.id}`,
      linkIds: group.map(link => link.id),
      strokes,
      trunk:
        bottom - top > 0.5
          ? [
              { x: junction.x, y: top },
              { x: junction.x, y: bottom },
            ]
          : undefined,
    });
  }

  for (const link of links) {
    if (link.kind === "partner") {
      const source = byId.get(nodeIdOf(link.source));
      const target = byId.get(nodeIdOf(link.target));
      if (!source || !target) continue;
      const sourceCenter = nodeCenter(source);
      const targetCenter = nodeCenter(target);
      connectors.push({
        id: link.id,
        linkIds: [link.id],
        strokes: [
          {
            kind: "partner",
            points: [
              anchorToward(source, targetCenter.x, targetCenter.y),
              anchorToward(target, sourceCenter.x, sourceCenter.y),
            ],
            arrow: false,
            sourceId: source.id,
            targetId: target.id,
          },
        ],
      });
      continue;
    }
    if (link.kind === "media") {
      const source = byId.get(nodeIdOf(link.source));
      const target = byId.get(nodeIdOf(link.target));
      if (!source || !target) continue;
      const sourceCenter = nodeCenter(source);
      const targetCenter = nodeCenter(target);
      connectors.push({
        id: link.id,
        linkIds: [link.id],
        strokes: [
          {
            kind: "media",
            points: [
              anchorToward(source, targetCenter.x, targetCenter.y),
              anchorToward(target, sourceCenter.x, sourceCenter.y),
            ],
            arrow: false,
            sourceId: source.id,
            targetId: target.id,
          },
        ],
      });
    }
  }

  return connectors;
}

function parentLane(
  lanes: LanePool,
  parent: GraphNode,
  junction: EdgePoint,
  sign: number,
) {
  const center = nodeCenter(parent);
  const start =
    center.y +
    sign * (nodeRadius(parent) + EDGE_CLEARANCE + LABEL_CLEARANCE);
  const minX = Math.min(center.x, junction.x) - TRUNK_X_CLEARANCE;
  const maxX = Math.max(center.x, junction.x) + TRUNK_X_CLEARANCE;
  return lanes.take(start, junction.y, minX, maxX);
}

function childLane(
  lanes: LanePool,
  child: GraphNode,
  junction: EdgePoint,
  sign: number,
) {
  const center = nodeCenter(child);
  const start =
    center.y -
    sign * (nodeRadius(child) + EDGE_CLEARANCE + LABEL_CLEARANCE);
  const minX = Math.min(center.x, junction.x) - TRUNK_X_CLEARANCE;
  const maxX = Math.max(center.x, junction.x) + TRUNK_X_CLEARANCE;
  return lanes.take(start, junction.y, minX, maxX);
}
