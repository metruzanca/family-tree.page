import type { GraphModel, GraphNode, GenerationDirection } from "./graph";
import { nodeIdOf, nodeRadius, fileCardSize } from "./graph";

export const BASE_ROW_GAP = 210;
export const LANE_STEP = 9;
export const NODE_MARGIN = 12;
export const LABEL_RESERVE = 22;
export const EDGE_CLEARANCE = 10;
export const MEMBER_GAP = 30;
export const SIBLING_GAP = 46;
export const COMPONENT_GAP = 150;
export const MEDIA_PER_RING = 8;
export const MEDIA_RING_GAP = 16;
export const MEDIA_RING_STEP = 30;

export type Point = { x: number; y: number };

export type Bounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export type PersonCluster = {
  id: string;
  level: number;
  memberIds: string[];
  memberOffsets: Map<string, number>;
  width: number;
  centerX: number;
  left: number;
  right: number;
  parentClusterId: string | null;
  childClusterIds: string[];
  subtreeWidth: number;
};

export type FamilyPlan = {
  id: string;
  parentClusterId: string;
  parentLevel: number;
  childLevel: number;
  parentIds: string[];
  childIds: string[];
  junctionX: number;
  junctionLane: number;
  parentLanes: Map<string, number>;
  childLanes: Map<string, number>;
  maxLane: number;
  normalLaneCount: number;
};

export type ExceptionalLink = {
  linkId: string;
  parentId: string;
  childId: string;
  parentType?: "biological" | "adoptive" | "foster" | "step" | "unknown";
  parentGutterKey: number | null;
  childGutterKey: number | null;
  direction: "corridor" | "same-row" | "gutter";
};

export type GutterPlan = {
  parentLevel: number;
  childLevel: number;
  topY: number;
  bottomY: number;
  topClearance: number;
  bottomClearance: number;
  normalParentLanes: number;
  parentLanes: number;
  childLanes: number;
  extraLanes: number;
  down: 1 | -1;
};

export type GraphLayout = {
  positions: Map<string, Point>;
  personPositions: Map<string, Point>;
  clusters: PersonCluster[];
  clusterOf: Map<string, PersonCluster>;
  families: FamilyPlan[];
  exceptional: ExceptionalLink[];
  gutters: Map<number, GutterPlan>;
  rowYs: Map<number, number>;
  levels: number[];
  direction: GenerationDirection;
  networkBounds: Bounds;
};

/** parent cluster id -> child person id -> parent person ids in that cluster */
type ParentIndex = Map<string, Map<string, Set<string>>>;

type Demand = {
  normalParentLanes: number;
  exceptionalParentLanes: number;
  exceptionalChildLanes: number;
  extraLanes: number;
};

const PARTNER_WEIGHT = 4;

export function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function slotWidthFor(node: GraphNode) {
  const radius = nodeRadius(node);
  const label = node.name;
  const labelWidth = Math.min(240, label.length * 6.2 + 16);
  return Math.max(radius * 2 + 18, labelWidth);
}

function createDsu() {
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    const current = parent.get(id) ?? id;
    if (current === id) {
      parent.set(id, id);
      return id;
    }
    const root = find(current);
    parent.set(id, root);
    return root;
  };
  const union = (a: string, b: string) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent.set(rootA, rootB);
  };
  return { find, union };
}

function partnerPairs(model: GraphModel, memberIds: Set<string>) {
  const pairs: Array<[string, string]> = [];
  for (const link of model.links) {
    if (link.kind !== "partner") continue;
    const source = nodeIdOf(link.source);
    const target = nodeIdOf(link.target);
    if (!memberIds.has(source) || !memberIds.has(target)) continue;
    pairs.push([source, target]);
  }
  return pairs;
}

function childParentSets(model: GraphModel, memberIds: Set<string>) {
  const parentsByChild = new Map<string, string[]>();
  for (const link of model.links) {
    if (link.kind !== "parent") continue;
    const parent = nodeIdOf(link.source);
    if (!memberIds.has(parent)) continue;
    const child = nodeIdOf(link.target);
    const list = parentsByChild.get(child) ?? [];
    list.push(parent);
    parentsByChild.set(child, list);
  }
  return [...parentsByChild.values()].filter(parents => parents.length > 1);
}

/**
 * Picks a member order that keeps partners adjacent when the partnership graph
 * allows it, and keeps co-parents close enough to share short parent arms.
 * Clusters are small, so an exhaustive search is both cheap and predictable.
 */
function orderMembers(
  ids: string[],
  pairs: Array<[string, string]>,
  parentSets: string[][],
): string[] {
  if (ids.length <= 1) return ids;
  const cost = (order: string[]) => {
    const position = new Map(order.map((id, index) => [id, index]));
    let value = 0;
    for (const [a, b] of pairs) {
      value += Math.abs((position.get(a) ?? 0) - (position.get(b) ?? 0)) * PARTNER_WEIGHT;
    }
    for (const parents of parentSets) {
      const positions = parents
        .map(id => position.get(id))
        .filter((index): index is number => index != null);
      if (positions.length < 2) continue;
      value += Math.max(...positions) - Math.min(...positions);
    }
    return value;
  };

  if (ids.length <= 7) {
    let best = ids;
    let bestCost = Number.POSITIVE_INFINITY;
    const used = new Set<string>();
    const current: string[] = [];
    const visit = () => {
      if (current.length === ids.length) {
        const value = cost(current);
        if (value < bestCost) {
          bestCost = value;
          best = current.slice();
        }
        return;
      }
      for (const id of ids) {
        if (used.has(id)) continue;
        used.add(id);
        current.push(id);
        visit();
        current.pop();
        used.delete(id);
      }
    };
    visit();
    return best;
  }

  // Large clusters are rare. Grow a path from the most connected member so
  // partners and co-parents still end up next to each other.
  const connection = new Map<string, number>(ids.map(id => [id, 0]));
  for (const [a, b] of pairs) {
    connection.set(a, (connection.get(a) ?? 0) + 3);
    connection.set(b, (connection.get(b) ?? 0) + 3);
  }
  for (const parents of parentSets) {
    for (const id of parents) {
      connection.set(id, (connection.get(id) ?? 0) + 1);
    }
  }
  const remaining = new Set(ids);
  const start = [...ids].sort(
    (a, b) =>
      (connection.get(b) ?? 0) - (connection.get(a) ?? 0) || a.localeCompare(b),
  )[0];
  const order: string[] = [start];
  remaining.delete(start);
  while (remaining.size) {
    const last = order[order.length - 1];
    const scored = [...remaining].map(id => {
      let score = 0;
      for (const [a, b] of pairs) {
        if ((a === last && b === id) || (b === last && a === id)) score += 6;
      }
      for (const parents of parentSets) {
        if (parents.includes(last) && parents.includes(id)) score += 2;
      }
      return { id, score };
    });
    scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    order.push(scored[0].id);
    remaining.delete(scored[0].id);
  }
  return order;
}

function buildClusters(
  model: GraphModel,
  peopleById: Map<string, GraphNode>,
): { clusters: PersonCluster[]; clusterOf: Map<string, PersonCluster> } {
  const dsu = createDsu();
  for (const node of model.people) dsu.find(node.id);

  for (const link of model.links) {
    if (link.kind !== "partner") continue;
    dsu.union(nodeIdOf(link.source), nodeIdOf(link.target));
  }

  // Co-parents belong together even without a partnership. Their shared child
  // is much easier to read when both parents sit in one run.
  const parentsByChild = new Map<string, string[]>();
  for (const link of model.links) {
    if (link.kind !== "parent") continue;
    const parent = nodeIdOf(link.source);
    const child = nodeIdOf(link.target);
    const list = parentsByChild.get(child) ?? [];
    list.push(parent);
    parentsByChild.set(child, list);
  }
  for (const parents of parentsByChild.values()) {
    const byLevel = new Map<number, string[]>();
    for (const parent of parents) {
      const node = peopleById.get(parent);
      if (!node) continue;
      const list = byLevel.get(node.level) ?? [];
      list.push(parent);
      byLevel.set(node.level, list);
    }
    for (const sameLevel of byLevel.values()) {
      for (let index = 1; index < sameLevel.length; index += 1) {
        dsu.union(sameLevel[0], sameLevel[index]);
      }
    }
  }

  const groups = new Map<string, string[]>();
  for (const node of model.people) {
    const root = dsu.find(node.id);
    const list = groups.get(root) ?? [];
    list.push(node.id);
    groups.set(root, list);
  }

  const clusters: PersonCluster[] = [];
  const clusterOf = new Map<string, PersonCluster>();
  for (const memberIdsRaw of groups.values()) {
    const memberIdsBase = [...memberIdsRaw].sort((a, b) => a.localeCompare(b));
    const memberSet = new Set(memberIdsBase);
    const pairs = partnerPairs(model, memberSet);
    const parentSets = childParentSets(model, memberSet);
    const memberIds = orderMembers(memberIdsBase, pairs, parentSets);
    const level = peopleById.get(memberIds[0])?.level ?? 0;
    const slots = new Map(memberIds.map(id => [id, slotWidthFor(peopleById.get(id)!)]));
    const width =
      memberIds.reduce((sum, id) => sum + (slots.get(id) ?? 0), 0) +
      MEMBER_GAP * Math.max(0, memberIds.length - 1);
    const memberOffsets = new Map<string, number>();
    let cursor = -width / 2;
    for (const id of memberIds) {
      const slot = slots.get(id) ?? 0;
      memberOffsets.set(id, cursor + slot / 2);
      cursor += slot + MEMBER_GAP;
    }
    const cluster: PersonCluster = {
      id: memberIdsBase[0],
      level,
      memberIds,
      memberOffsets,
      width,
      centerX: 0,
      left: 0,
      right: 0,
      parentClusterId: null,
      childClusterIds: [],
      subtreeWidth: width,
    };
    clusters.push(cluster);
    for (const id of memberIds) clusterOf.set(id, cluster);
  }
  clusters.sort((a, b) => a.id.localeCompare(b.id));
  return { clusters, clusterOf };
}

function buildParentIndex(
  model: GraphModel,
  clusterOf: Map<string, PersonCluster>,
): ParentIndex {
  const index: ParentIndex = new Map();
  for (const link of model.links) {
    if (link.kind !== "parent") continue;
    const parent = nodeIdOf(link.source);
    const child = nodeIdOf(link.target);
    const parentCluster = clusterOf.get(parent);
    if (!parentCluster) continue;
    let children = index.get(parentCluster.id);
    if (!children) {
      children = new Map();
      index.set(parentCluster.id, children);
    }
    const parents = children.get(child) ?? new Set<string>();
    parents.add(parent);
    children.set(child, parents);
  }
  return index;
}

function assignParentClusters(
  model: GraphModel,
  clusterOf: Map<string, PersonCluster>,
  parentIndex: ParentIndex,
) {
  type Candidate = { cluster: PersonCluster; count: number };
  const candidatesByChild = new Map<PersonCluster, Map<string, Candidate>>();

  for (const link of model.links) {
    if (link.kind !== "parent") continue;
    const parent = nodeIdOf(link.source);
    const child = nodeIdOf(link.target);
    const parentCluster = clusterOf.get(parent);
    const childCluster = clusterOf.get(child);
    if (!parentCluster || !childCluster || parentCluster === childCluster) continue;
    let candidates = candidatesByChild.get(childCluster);
    if (!candidates) {
      candidates = new Map();
      candidatesByChild.set(childCluster, candidates);
    }
    const existing = candidates.get(parentCluster.id);
    if (existing) {
      existing.count += 1;
      continue;
    }
    candidates.set(parentCluster.id, { cluster: parentCluster, count: 1 });
  }

  for (const [childCluster, candidates] of candidatesByChild) {
    let best: Candidate | null = null;
    for (const candidate of candidates.values()) {
      if (!best) {
        best = candidate;
        continue;
      }
      if (candidate.cluster.level !== best.cluster.level) {
        if (candidate.cluster.level > best.cluster.level) best = candidate;
        continue;
      }
      if (candidate.count !== best.count) {
        if (candidate.count > best.count) best = candidate;
        continue;
      }
      if (candidate.cluster.id.localeCompare(best.cluster.id) < 0) best = candidate;
    }
    if (!best) continue;
    childCluster.parentClusterId = best.cluster.id;
    best.cluster.childClusterIds.push(childCluster.id);
  }

  const uniqueClusters = [...new Set(clusterOf.values())];
  for (const cluster of uniqueClusters) {
    cluster.childClusterIds = [...new Set(cluster.childClusterIds)];
  }

  // Group children by the parent subset so half-siblings from one partnership
  // stay together instead of interleaving with another partnership.
  const clusterById = new Map(uniqueClusters.map(cluster => [cluster.id, cluster]));
  for (const cluster of uniqueClusters) {
    if (!cluster.childClusterIds.length) continue;
    const children = parentIndex.get(cluster.id);
    const keys = new Map<string, string>();
    for (const childClusterId of cluster.childClusterIds) {
      const child = clusterById.get(childClusterId);
      if (!child) {
        keys.set(childClusterId, "");
        continue;
      }
      const parents: string[] = [];
      for (const memberId of child.memberIds) {
        const members = children?.get(memberId);
        if (members) parents.push(...members);
      }
      keys.set(childClusterId, [...new Set(parents)].sort().join("|"));
    }
    cluster.childClusterIds.sort(
      (a, b) =>
        (keys.get(a) ?? "").localeCompare(keys.get(b) ?? "") ||
        a.localeCompare(b),
    );
  }
}

function measureSubtree(cluster: PersonCluster, byId: Map<string, PersonCluster>) {
  let childrenWidth = 0;
  const children = cluster.childClusterIds
    .map(id => byId.get(id))
    .filter((child): child is PersonCluster => Boolean(child));
  for (const child of children) {
    measureSubtree(child, byId);
    childrenWidth += child.subtreeWidth;
  }
  childrenWidth += SIBLING_GAP * Math.max(0, children.length - 1);
  cluster.subtreeWidth = Math.max(cluster.width, childrenWidth);
  return cluster.subtreeWidth;
}

function placeCluster(
  cluster: PersonCluster,
  byId: Map<string, PersonCluster>,
  personX: Map<string, number>,
  parentIndex: ParentIndex,
) {
  const children = cluster.childClusterIds
    .map(id => byId.get(id))
    .filter((child): child is PersonCluster => Boolean(child));

  if (children.length) {
    const childrenWidth =
      children.reduce((sum, child) => sum + child.subtreeWidth, 0) +
      SIBLING_GAP * Math.max(0, children.length - 1);
    let cursor = cluster.left + (cluster.right - cluster.left - childrenWidth) / 2;
    for (const child of children) {
      child.left = cursor;
      child.right = cursor + child.subtreeWidth;
      placeCluster(child, byId, personX, parentIndex);
      cursor += child.subtreeWidth + SIBLING_GAP;
    }
  }

  if (children.length) {
    const children2 = parentIndex.get(cluster.id);
    const entryXs: number[] = [];
    for (const child of children) {
      for (const memberId of child.memberIds) {
        if (!children2?.has(memberId)) continue;
        const x = personX.get(memberId);
        if (x != null) entryXs.push(x);
      }
    }
    const desired = entryXs.length ? median(entryXs) : (cluster.left + cluster.right) / 2;
    const half = cluster.width / 2;
    cluster.centerX = Math.max(
      cluster.left + half,
      Math.min(cluster.right - half, desired),
    );
  } else {
    cluster.centerX = (cluster.left + cluster.right) / 2;
  }

  for (const memberId of cluster.memberIds) {
    personX.set(memberId, cluster.centerX + (cluster.memberOffsets.get(memberId) ?? 0));
  }
}

export function freeJunctionX(
  desired: number,
  avoid: number[],
  used: number[],
) {
  let value = desired;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const clashes =
      avoid.some(column => Math.abs(column - value) < 5) ||
      used.some(column => Math.abs(column - value) < 8);
    if (!clashes) return value;
    const step = Math.floor(attempt / 2) + 1;
    value = desired + 5 * step * (attempt % 2 === 0 ? 1 : -1);
  }
  return value;
}

function buildFamilies(
  model: GraphModel,
  clusterOf: Map<string, PersonCluster>,
  personX: Map<string, number>,
): { families: FamilyPlan[]; exceptionalLinks: Array<{ linkId: string; parentId: string; childId: string; parentType?: ExceptionalLink["parentType"] }> } {
  const familyByCluster = new Map<
    string,
    {
      cluster: PersonCluster;
      parentIds: Set<string>;
      childIds: Set<string>;
      childLevel: number;
    }
  >();
  const exceptionalLinks: Array<{
    linkId: string;
    parentId: string;
    childId: string;
    parentType?: ExceptionalLink["parentType"];
  }> = [];

  for (const link of model.links) {
    if (link.kind !== "parent") continue;
    const parent = nodeIdOf(link.source);
    const child = nodeIdOf(link.target);
    const parentCluster = clusterOf.get(parent);
    const childCluster = clusterOf.get(child);
    const childNode = model.byId.get(child);
    if (!parentCluster || !childCluster || !childNode) continue;
    const normal =
      parentCluster !== childCluster &&
      childCluster.parentClusterId === parentCluster.id &&
      childNode.level === parentCluster.level + 1;
    if (!normal) {
      exceptionalLinks.push({
        linkId: link.id,
        parentId: parent,
        childId: child,
        parentType: link.parentType,
      });
      continue;
    }
    let family = familyByCluster.get(parentCluster.id);
    if (!family) {
      family = {
        cluster: parentCluster,
        parentIds: new Set(),
        childIds: new Set(),
        childLevel: childNode.level,
      };
      familyByCluster.set(parentCluster.id, family);
    }
    family.parentIds.add(parent);
    family.childIds.add(child);
  }

  const usedJunctions = new Map<number, number[]>();
  const families: FamilyPlan[] = [];
  for (const family of familyByCluster.values()) {
    const parentIds = [...family.parentIds].sort(
      (a, b) => (personX.get(a) ?? 0) - (personX.get(b) ?? 0) || a.localeCompare(b),
    );
    const childIds = [...family.childIds].sort((a, b) => a.localeCompare(b));
    const parentXs = parentIds.map(id => personX.get(id) ?? 0);
    const childXs = childIds.map(id => personX.get(id) ?? 0);
    const used = usedJunctions.get(family.cluster.level) ?? [];
    const junctionX = freeJunctionX(
      median(parentXs),
      [...parentXs, ...childXs],
      used,
    );
    used.push(junctionX);
    usedJunctions.set(family.cluster.level, used);

    const left = parentIds
      .filter(id => (personX.get(id) ?? 0) < junctionX - 0.5)
      .sort(
        (a, b) =>
          Math.abs((personX.get(a) ?? 0) - junctionX) -
          Math.abs((personX.get(b) ?? 0) - junctionX),
      );
    const right = parentIds
      .filter(id => (personX.get(id) ?? 0) > junctionX + 0.5)
      .sort(
        (a, b) =>
          Math.abs((personX.get(a) ?? 0) - junctionX) -
          Math.abs((personX.get(b) ?? 0) - junctionX),
      );
    const center = parentIds.filter(
      id => Math.abs((personX.get(id) ?? 0) - junctionX) <= 0.5,
    );

    const junctionLane = center.length
      ? 0
      : Math.max(1, left.length, right.length) - 1;
    const parentLanes = new Map<string, number>();
    left.forEach((id, index) => parentLanes.set(id, index));
    right.forEach((id, index) => parentLanes.set(id, index));
    for (const id of center) parentLanes.set(id, 0);

    const orderedChildren = [...childIds].sort((a, b) => {
      const distanceA = Math.abs((personX.get(a) ?? 0) - junctionX);
      const distanceB = Math.abs((personX.get(b) ?? 0) - junctionX);
      if (distanceA !== distanceB) return distanceB - distanceA;
      return a.localeCompare(b);
    });
    const childLanes = new Map<string, number>();
    orderedChildren.forEach((id, index) => {
      childLanes.set(id, junctionLane + 1 + index);
    });
    const maxLane = junctionLane + orderedChildren.length;

    families.push({
      id: family.cluster.id,
      parentClusterId: family.cluster.id,
      parentLevel: family.cluster.level,
      childLevel: family.childLevel,
      parentIds,
      childIds: orderedChildren,
      junctionX,
      junctionLane,
      parentLanes,
      childLanes,
      maxLane,
      normalLaneCount: Math.max(1, maxLane + 1),
    });
  }

  families.sort((a, b) => a.id.localeCompare(b.id));
  return { families, exceptionalLinks };
}

function nonAdjacentPartnerCount(model: GraphModel, cluster: PersonCluster) {
  const index = new Map(cluster.memberIds.map((id, position) => [id, position]));
  let count = 0;
  for (const link of model.links) {
    if (link.kind !== "partner") continue;
    const a = index.get(nodeIdOf(link.source));
    const b = index.get(nodeIdOf(link.target));
    if (a == null || b == null) continue;
    if (Math.abs(a - b) > 1) count += 1;
  }
  return count;
}

function maxRadiusByLevel(model: GraphModel) {
  const radii = new Map<number, number>();
  for (const node of model.people) {
    radii.set(node.level, Math.max(radii.get(node.level) ?? 0, nodeRadius(node)));
  }
  return radii;
}

function adjacentLevel(levels: number[], level: number, direction: -1 | 1) {
  const index = levels.indexOf(level);
  if (index < 0) return null;
  return levels[index + direction] ?? null;
}

export function layoutGraph(
  model: GraphModel,
  direction: GenerationDirection,
): GraphLayout {
  const down: 1 | -1 = direction === "oldest-top" ? 1 : -1;
  const peopleById = new Map(
    model.people.map(node => [node.id, node] as const),
  );
  const { clusters, clusterOf } = buildClusters(model, peopleById);
  const parentIndex = buildParentIndex(model, clusterOf);
  assignParentClusters(model, clusterOf, parentIndex);

  const byId = new Map(clusters.map(cluster => [cluster.id, cluster]));
  const roots = clusters.filter(cluster => !cluster.parentClusterId);
  roots.sort((a, b) => a.id.localeCompare(b.id));
  for (const root of roots) measureSubtree(root, byId);

  const total =
    roots.reduce((sum, root) => sum + root.subtreeWidth, 0) +
    COMPONENT_GAP * Math.max(0, roots.length - 1);
  let cursor = -total / 2;
  for (const root of roots) {
    root.left = cursor;
    root.right = cursor + root.subtreeWidth;
    cursor += root.subtreeWidth + COMPONENT_GAP;
  }

  const personX = new Map<string, number>();
  for (const root of roots) placeCluster(root, byId, personX, parentIndex);

  const { families, exceptionalLinks } = buildFamilies(model, clusterOf, personX);

  const presentLevels = [...new Set(model.people.map(node => node.level))].sort(
    (a, b) => a - b,
  );
  const radii = maxRadiusByLevel(model);
  const demands = new Map<number, Demand>();
  const demandFor = (level: number) => {
    let demand = demands.get(level);
    if (!demand) {
      demand = {
        normalParentLanes: 0,
        exceptionalParentLanes: 0,
        exceptionalChildLanes: 0,
        extraLanes: 0,
      };
      demands.set(level, demand);
    }
    return demand;
  };

  for (const family of families) {
    demandFor(family.parentLevel).normalParentLanes = Math.max(
      demandFor(family.parentLevel).normalParentLanes,
      family.normalLaneCount,
    );
  }

  // Partner brackets need a lane on the side of a row away from its children.
  // Children always live on higher generation levels, so that side is the
  // previous present level, whichever way the rows are drawn.
  for (const cluster of clusters) {
    const count = nonAdjacentPartnerCount(model, cluster);
    if (!count) continue;
    const neighbour =
      adjacentLevel(presentLevels, cluster.level, -1) ??
      adjacentLevel(presentLevels, cluster.level, 1);
    if (neighbour == null) continue;
    demandFor(Math.min(cluster.level, neighbour)).extraLanes += count;
  }

  const exceptional: ExceptionalLink[] = [];
  for (const entry of exceptionalLinks) {
    const parentNode = model.byId.get(entry.parentId);
    const childNode = model.byId.get(entry.childId);
    if (!parentNode || !childNode) continue;
    const sameLevel = parentNode.level === childNode.level;
    const adjacent = Math.abs(childNode.level - parentNode.level) === 1;
    let parentGutterKey: number | null = null;
    let childGutterKey: number | null = null;
    let direction: ExceptionalLink["direction"] = "corridor";

    if (sameLevel) {
      const neighbour =
        adjacentLevel(presentLevels, parentNode.level, -1) ??
        adjacentLevel(presentLevels, parentNode.level, 1);
      if (neighbour != null) {
        const key = Math.min(parentNode.level, neighbour);
        parentGutterKey = key;
        childGutterKey = key;
        demandFor(key).extraLanes += 2;
      }
      direction = "same-row";
    } else if (adjacent) {
      const key = Math.min(parentNode.level, childNode.level);
      parentGutterKey = key;
      // A shared run lane plus one lane per parent arm. Two lanes per link is
      // enough even when every parent sits on the same side of the junction.
      demandFor(key).exceptionalParentLanes += 2;
      direction = "gutter";
    } else {
      const towardChild = childNode.level > parentNode.level ? 1 : -1;
      const nextParent = adjacentLevel(
        presentLevels,
        parentNode.level,
        towardChild as 1 | -1,
      );
      if (nextParent != null) {
        const key = Math.min(parentNode.level, nextParent);
        parentGutterKey = key;
        demandFor(key).exceptionalParentLanes += 1;
      }
      const nextChild = adjacentLevel(
        presentLevels,
        childNode.level,
        (towardChild === 1 ? -1 : 1) as 1 | -1,
      );
      if (nextChild != null) {
        const key = Math.min(childNode.level, nextChild);
        childGutterKey = key;
        demandFor(key).exceptionalChildLanes += 1;
      }
    }

    exceptional.push({
      linkId: entry.linkId,
      parentId: entry.parentId,
      childId: entry.childId,
      parentType: entry.parentType,
      parentGutterKey,
      childGutterKey,
      direction,
    });
  }

  const rowYs = new Map<number, number>();
  const gutters = new Map<number, GutterPlan>();
  if (presentLevels.length) rowYs.set(presentLevels[0], 0);
  let cumulative = 0;
  for (let index = 0; index < presentLevels.length - 1; index += 1) {
    const parentLevel = presentLevels[index];
    const childLevel = presentLevels[index + 1];
    const demand = demandFor(parentLevel);
    const normalParentLanes = Math.max(1, demand.normalParentLanes);
    const parentLanes = normalParentLanes + demand.exceptionalParentLanes;
    const childLanes = demand.exceptionalChildLanes;
    const extraLanes = demand.extraLanes;
    const topClearance =
      (radii.get(parentLevel) ?? 0) +
      (down > 0 ? LABEL_RESERVE : 0) +
      NODE_MARGIN;
    const bottomClearance =
      (radii.get(childLevel) ?? 0) +
      (down < 0 ? LABEL_RESERVE : 0) +
      NODE_MARGIN;
    const laneCount = parentLanes + childLanes + extraLanes;
    const gap = Math.max(
      BASE_ROW_GAP,
      topClearance + bottomClearance + (laneCount + 1) * LANE_STEP,
    );
    cumulative += gap;
    rowYs.set(childLevel, down * cumulative);
    gutters.set(parentLevel, {
      parentLevel,
      childLevel,
      topY: down * (cumulative - gap),
      bottomY: down * cumulative,
      topClearance,
      bottomClearance,
      normalParentLanes,
      parentLanes,
      childLanes,
      extraLanes,
      down,
    });
  }

  const personPositions = new Map<string, Point>();
  for (const node of model.people) {
    personPositions.set(node.id, {
      x: personX.get(node.id) ?? 0,
      y: rowYs.get(node.level) ?? 0,
    });
  }

  const positions = new Map(personPositions);
  placeMediaRing(model, personPositions, positions);

  return {
    positions,
    personPositions,
    clusters,
    clusterOf,
    families,
    exceptional,
    gutters,
    rowYs,
    levels: presentLevels,
    direction,
    networkBounds: boundsOf(model, positions),
  };
}

function placeMediaRing(
  model: GraphModel,
  personPositions: Map<string, Point>,
  positions: Map<string, Point>,
) {
  for (const [ownerId, media] of model.mediaByOwner) {
    const owner = personPositions.get(ownerId);
    if (!owner) continue;
    const ownerNode = model.byId.get(ownerId);
    if (!ownerNode) continue;
    const sorted = [...media].sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "group" ? -1 : 1;
      return a.id.localeCompare(b.id);
    });
    const baseAngle = ((ownerId.length * 37 + sorted.length * 11) % 360) / 180 * Math.PI;
    sorted.forEach((node, index) => {
      const ring = Math.floor(index / MEDIA_PER_RING);
      const indexInRing = index % MEDIA_PER_RING;
      const countInRing = Math.min(
        MEDIA_PER_RING,
        sorted.length - ring * MEDIA_PER_RING,
      );
      const card = fileCardSize(node);
      const cardRadius = Math.max(card.width, card.height) / 2;
      const radius =
        nodeRadius(ownerNode) +
        MEDIA_RING_GAP +
        cardRadius +
        ring * MEDIA_RING_STEP;
      const angle =
        baseAngle +
        (indexInRing / Math.max(1, countInRing)) * Math.PI * 2 +
        ring * 0.34;
      positions.set(node.id, {
        x: owner.x + Math.cos(angle) * radius,
        y: owner.y + Math.sin(angle) * radius,
      });
    });
  }
}

function boundsOf(
  model: GraphModel,
  positions: Map<string, Point>,
): Bounds {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const node of model.nodes) {
    const position = positions.get(node.id);
    if (!position) continue;
    const half =
      node.kind === "person" ? nodeRadius(node) : fileCardSize(node).width / 2;
    const halfY =
      node.kind === "person" ? nodeRadius(node) : fileCardSize(node).height / 2;
    minX = Math.min(minX, position.x - half);
    maxX = Math.max(maxX, position.x + half);
    minY = Math.min(minY, position.y - halfY);
    maxY = Math.max(maxY, position.y + halfY);
  }
  if (!Number.isFinite(minX)) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Lane coordinates. Lanes start just outside the parent row and step toward
 * the child row, so every horizontal run stays in the empty gutter.
 */
export function parentLaneY(gutter: GutterPlan, lane: number) {
  return gutter.topY + gutter.down * (gutter.topClearance + lane * LANE_STEP);
}

export function childLaneY(gutter: GutterPlan, lane: number) {
  return gutter.bottomY - gutter.down * (gutter.bottomClearance + lane * LANE_STEP);
}

export function bracketLaneY(
  rowY: number,
  radius: number,
  rowDirection: 1 | -1,
  lane: number,
) {
  return (
    rowY +
    rowDirection * (radius + EDGE_CLEARANCE + 6 + lane * LANE_STEP)
  );
}
