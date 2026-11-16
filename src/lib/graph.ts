import type {
  GraphFile,
  GraphFileGroup,
  GraphPerson,
  GraphRelationship,
  TreeGraph,
} from "~/api/people-server";

export type GenerationDirection = "oldest-top" | "oldest-bottom";
export const GENERATION_SPACING = 190;
export const GENERATION_BAND = 58;

export type GraphNode = {
  id: string;
  kind: "person" | "file" | "group" | "union";
  name: string;
  person?: GraphPerson;
  file?: GraphFile;
  group?: GraphFileGroup;
  memberIds?: string[];
  parentIds?: string[];
  childIds?: string[];
  degree: number;
  val: number;
  level: number;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
};

export type GraphLink = {
  id: string;
  source: string | GraphNode;
  target: string | GraphNode;
  kind: "parent" | "partner" | "media" | "union";
  viaUnion?: boolean;
  parentType?: "biological" | "adoptive" | "foster" | "step" | "unknown";
  status?: string;
};

export type GraphModel = {
  nodes: GraphNode[];
  links: GraphLink[];
  semanticLinks: GraphLink[];
  generations: Map<string, number>;
};

export function fileNodeId(fileId: string) {
  return `file:${fileId}`;
}

export function groupNodeId(groupId: string) {
  return `group:${groupId}`;
}

export function buildGraphModel(
  data: TreeGraph,
  showMedia: boolean,
  direction: GenerationDirection = "oldest-top",
): GraphModel {
  const generations = computeGenerations(data.people, data.relationships);
  const degree = new Map<string, number>();
  for (const relationship of data.relationships) {
    degree.set(relationship.source, (degree.get(relationship.source) ?? 0) + 1);
    degree.set(relationship.target, (degree.get(relationship.target) ?? 0) + 1);
  }

  const nodes: GraphNode[] = [];
  for (const person of data.people) {
    const level = generations.get(person.id) ?? 0;
    const spot = initialSpot(person.id, level, direction);
    nodes.push({
      id: person.id,
      kind: "person",
      name: person.displayName,
      person,
      degree: degree.get(person.id) ?? 0,
      val: 1,
      level,
      x: spot.x,
      y: spot.y,
    });
  }

  const links: GraphLink[] = [];
  const semanticLinks: GraphLink[] = [];

  for (const relationship of data.relationships) {
    if (relationship.type !== "partner") continue;
    const link: GraphLink = {
      id: relationship.id,
      source: relationship.source,
      target: relationship.target,
      kind: "partner",
      status: relationship.status,
    };
    links.push(link);
    semanticLinks.push({ ...link });
  }

  type ParentEdge = {
    relationshipId: string;
    id: string;
    parentType: "biological" | "adoptive" | "foster" | "step" | "unknown";
  };
  const parentsByChild = new Map<string, ParentEdge[]>();
  for (const relationship of data.relationships) {
    if (relationship.type !== "parent") continue;
    const list = parentsByChild.get(relationship.target) ?? [];
    list.push({
      relationshipId: relationship.id,
      id: relationship.source,
      parentType: relationship.parentType,
    });
    parentsByChild.set(relationship.target, list);
  }

  type UnionRecord = {
    id: string;
    parentIds: string[];
    childIds: string[];
    level: number;
    parentTypeByChild: Map<string, "biological" | "adoptive" | "foster" | "step" | "unknown">;
  };
  const unions = new Map<string, UnionRecord>();

  for (const [childId, parentEdges] of parentsByChild) {
    const uniqueParents = [
      ...new Map(parentEdges.map(parent => [parent.id, parent])).values(),
    ];
    if (uniqueParents.length === 1) {
      const parent = uniqueParents[0];
      const link: GraphLink = {
        id: parent.relationshipId,
        source: parent.id,
        target: childId,
        kind: "parent",
        parentType: parent.parentType,
      };
      links.push(link);
      semanticLinks.push({ ...link });
      continue;
    }
    if (uniqueParents.length < 2) continue;

    const parentIds = uniqueParents.map(parent => parent.id).sort();
    const key = parentIds.join("|");
    let union = unions.get(key);
    if (!union) {
      union = {
        id: `union:${key}`,
        parentIds,
        childIds: [],
        level: Math.max(...parentIds.map(id => generations.get(id) ?? 0)) + 0.5,
        parentTypeByChild: new Map(),
      };
      unions.set(key, union);
    }
    union.childIds.push(childId);
    const nonBiological = uniqueParents.find(parent => parent.parentType !== "biological");
    union.parentTypeByChild.set(childId, nonBiological?.parentType ?? "biological");
    for (const parent of uniqueParents) {
      semanticLinks.push({
        id: parent.relationshipId,
        source: parent.id,
        target: childId,
        kind: "parent",
        parentType: parent.parentType,
      });
    }
  }

  const byId = new Map(nodes.map(node => [node.id, node]));
  for (const union of unions.values()) {
    const parentNodes = union.parentIds
      .map(id => byId.get(id))
      .filter((node): node is GraphNode => Boolean(node));
    const averageX =
      parentNodes.reduce((sum, node) => sum + (node.x ?? 0), 0) /
      Math.max(1, parentNodes.length);
    const hash = hashString(union.id);
    nodes.push({
      id: union.id,
      kind: "union",
      name: "",
      memberIds: [...union.parentIds, ...union.childIds],
      parentIds: union.parentIds,
      childIds: union.childIds,
      degree: 0,
      val: 0.2,
      level: union.level,
      x: averageX + ((hash % 40) - 20),
      y: generationRowY(union.level, direction) + ((hash % 30) - 15),
    });

    for (const parentId of union.parentIds) {
      links.push({
        id: `union-parent:${union.id}:${parentId}`,
        source: parentId,
        target: union.id,
        kind: "union",
      });
    }
    for (const childId of union.childIds) {
      links.push({
        id: `union-child:${union.id}:${childId}`,
        source: union.id,
        target: childId,
        kind: "parent",
        viaUnion: true,
        parentType: union.parentTypeByChild.get(childId) ?? "biological",
      });
    }
  }

  if (showMedia) {
    const byPerson = new Map(nodes.map(node => [node.id, node]));
    for (const group of data.groups) {
      const parent = byPerson.get(group.personId);
      if (!parent) continue;
      const level = parent.level;
      const offset = initialSpot(group.id, level, direction);
      nodes.push({
        id: groupNodeId(group.id),
        kind: "group",
        name: group.name,
        group,
        degree: 1,
        val: 0.7,
        level,
        x: (parent.x ?? 0) + offset.x * 0.4,
        y: (parent.y ?? 0) + offset.y * 0.4,
      });
      const link: GraphLink = {
        id: `group-media:${group.id}`,
        source: parent.id,
        target: groupNodeId(group.id),
        kind: "media",
      };
      links.push(link);
      semanticLinks.push({ ...link });
    }
    for (const file of data.files) {
      if (file.isAvatar || file.groupId) continue;
      const parent = byPerson.get(file.personId);
      if (!parent) continue;
      const level = parent.level;
      const offset = initialSpot(file.id, level, direction);
      nodes.push({
        id: fileNodeId(file.id),
        kind: "file",
        name: file.name,
        file,
        degree: 1,
        val: 0.35,
        level,
        x: (parent.x ?? 0) + offset.x * 0.35,
        y: (parent.y ?? 0) + offset.y * 0.35,
      });
      const link: GraphLink = {
        id: `media:${file.id}`,
        source: parent.id,
        target: fileNodeId(file.id),
        kind: "media",
      };
      links.push(link);
      semanticLinks.push({ ...link });
    }
  }

  return { nodes, links, semanticLinks, generations };
}

export function computeGenerations(
  people: GraphPerson[],
  relationships: GraphRelationship[],
): Map<string, number> {
  const levels = new Map(people.map(person => [person.id, 0]));
  const parentEdges = relationships.filter(
    (relationship): relationship is Extract<GraphRelationship, { type: "parent" }> =>
      relationship.type === "parent",
  );
  const partnerEdges = relationships.filter(
    (relationship): relationship is Extract<GraphRelationship, { type: "partner" }> =>
      relationship.type === "partner",
  );

  const maxRounds = Math.max(4, people.length * 2);
  for (let round = 0; round < maxRounds; round += 1) {
    let changed = false;
    for (const edge of parentEdges) {
      const parent = levels.get(edge.source) ?? 0;
      const child = levels.get(edge.target) ?? 0;
      if (child < parent + 1) {
        levels.set(edge.target, parent + 1);
        changed = true;
      }
    }
    for (const edge of partnerEdges) {
      const a = levels.get(edge.source) ?? 0;
      const b = levels.get(edge.target) ?? 0;
      const shared = Math.max(a, b);
      if (a !== shared) {
        levels.set(edge.source, shared);
        changed = true;
      }
      if (b !== shared) {
        levels.set(edge.target, shared);
        changed = true;
      }
    }
    if (!changed) break;
  }

  let minimum = 0;
  for (const value of levels.values()) minimum = Math.min(minimum, value);
  if (minimum !== 0) {
    for (const [key, value] of levels) levels.set(key, value - minimum);
  }
  return levels;
}

export function generationRowY(
  level: number,
  direction: GenerationDirection,
  spacing = GENERATION_SPACING,
) {
  return (direction === "oldest-top" ? 1 : -1) * level * spacing;
}

export function clampToGenerationBand(
  y: number,
  level: number,
  direction: GenerationDirection,
  spacing = GENERATION_SPACING,
  halfBand = GENERATION_BAND,
) {
  const row = generationRowY(level, direction, spacing);
  return Math.max(row - halfBand, Math.min(row + halfBand, y));
}

export function partnerGroups(relationships: GraphRelationship[]): string[][] {
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

  for (const relationship of relationships) {
    if (relationship.type !== "partner") continue;
    parent.set(relationship.source, parent.get(relationship.source) ?? relationship.source);
    parent.set(relationship.target, parent.get(relationship.target) ?? relationship.target);
    union(relationship.source, relationship.target);
  }

  const groups = new Map<string, string[]>();
  for (const id of parent.keys()) {
    const root = find(id);
    const list = groups.get(root) ?? [];
    list.push(id);
    groups.set(root, list);
  }
  return [...groups.values()].filter(group => group.length > 1);
}

export function initialSpot(
  id: string,
  level: number,
  direction: GenerationDirection = "oldest-top",
) {
  const hash = hashString(id);
  const angle = ((hash % 1000) / 1000) * Math.PI * 2;
  const radius = 70 + (hash % 180);
  return {
    x: Math.cos(angle) * radius,
    y: generationRowY(level, direction) + Math.sin(angle) * 48,
  };
}

export function neighborsOf(links: GraphLink[], id: string): Set<string> {
  const found = new Set<string>([id]);
  for (const link of links) {
    const source = typeof link.source === "string" ? link.source : link.source.id;
    const target = typeof link.target === "string" ? link.target : link.target.id;
    if (source === id) found.add(target);
    if (target === id) found.add(source);
  }
  return found;
}

const FILE_CARD_AREA = 22 * 22;
const GROUP_CARD_AREA = 32 * 32;
const MIN_MEDIA_ASPECT = 1 / 3;
const MAX_MEDIA_ASPECT = 3;

/**
 * Aspect ratio for a media card. Uploaded photos keep the shape they were shot
 * in, so the graph reads like scattered prints instead of a grid of squares.
 * Extreme panoramas and very tall portraits are clamped so a single card cannot
 * dominate the layout.
 */
export function mediaAspect(
  width: number | null | undefined,
  height: number | null | undefined,
) {
  if (!width || !height || width <= 0 || height <= 0) return 1;
  return Math.min(MAX_MEDIA_ASPECT, Math.max(MIN_MEDIA_ASPECT, width / height));
}

export type MediaCardSize = {
  width: number;
  height: number;
  aspect: number;
};

/**
 * Card size for a media node, scaled so every card covers roughly the same
 * area. A 3:2 photo and a 2:3 portrait therefore feel equally present while
 * keeping their real proportions.
 */
export function fileCardSize(node: GraphNode): MediaCardSize {
  const area = node.kind === "group" ? GROUP_CARD_AREA : FILE_CARD_AREA;
  const aspect =
    node.kind === "group"
      ? mediaAspect(node.group?.coverWidth, node.group?.coverHeight)
      : node.kind === "file" && node.file?.kind === "image"
        ? mediaAspect(node.file.width, node.file.height)
        : 1;
  return {
    width: Math.sqrt(area * aspect),
    height: Math.sqrt(area / aspect),
    aspect,
  };
}

export function nodeRadius(node: GraphNode) {
  if (node.kind === "union") return 6;
  if (node.kind === "file" || node.kind === "group") {
    const card = fileCardSize(node);
    return Math.max(card.width, card.height) / 2;
  }
  return Math.min(28, 12 + Math.sqrt(node.degree) * 4.2);
}

const branchPalette = [
  "#8fa98f",
  "#c49a45",
  "#bf6247",
  "#7f9aa8",
  "#a98fa5",
  "#9aa87f",
  "#c08a6a",
];

export function branchColor(name: string) {
  return branchPalette[hashString(name) % branchPalette.length];
}

export function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}
