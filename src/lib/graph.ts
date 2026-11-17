import type {
  GraphFile,
  GraphFileGroup,
  GraphPerson,
  GraphRelationship,
  TreeGraph,
} from "~/api/people-server";
import { analyzeRelationships } from "./relationships";

export type GenerationDirection = "oldest-top" | "oldest-bottom";
export const GENERATION_SPACING = 190;
export const GENERATION_BAND = 58;
export const COMPONENT_GAP = 140;
export const COMPONENT_MIN_WIDTH = 200;
export const COMPONENT_PERSON_SPACING = 120;
const COMPONENT_NODE_PADDING = 14;

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

export type GraphComponent = {
  id: string;
  anchor: string;
  personIds: string[];
  nodeIds: string[];
  centerX: number;
  width: number;
};

export type GraphModel = {
  nodes: GraphNode[];
  links: GraphLink[];
  semanticLinks: GraphLink[];
  generations: Map<string, number>;
  components: GraphComponent[];
  byNode: Map<string, GraphComponent>;
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
  /**
   * People to draw. Generations still come from the whole tree, so hiding a
   * branch never shifts the rows that are visible.
   */
  visible?: ReadonlySet<string>,
): GraphModel {
  const generations = computeGenerations(data.people, data.relationships);
  const people = visible
    ? data.people.filter(person => visible.has(person.id))
    : data.people;
  const relationships = visible
    ? data.relationships.filter(
        relationship =>
          visible.has(relationship.source) && visible.has(relationship.target),
      )
    : data.relationships;
  const { components, byPerson } = personComponents(
    people,
    relationships,
    generations,
  );
  const degree = new Map<string, number>();
  for (const relationship of relationships) {
    degree.set(relationship.source, (degree.get(relationship.source) ?? 0) + 1);
    degree.set(relationship.target, (degree.get(relationship.target) ?? 0) + 1);
  }

  const nodes: GraphNode[] = [];
  for (const person of people) {
    const level = generations.get(person.id) ?? 0;
    const component = byPerson.get(person.id);
    const centerX = component?.centerX ?? 0;
    const spreadX = component ? Math.max(60, component.width / 2 - 60) : 90;
    const spot = initialSpot(person.id, level, direction, centerX, spreadX);
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

  for (const relationship of relationships) {
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
  for (const relationship of relationships) {
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

  const byNode = new Map<string, GraphComponent>();
  for (const node of nodes) {
    const ownerId =
      node.kind === "person"
        ? node.id
        : node.kind === "union"
          ? node.parentIds?.[0]
          : node.file?.personId ?? node.group?.personId;
    const component = ownerId ? byPerson.get(ownerId) : undefined;
    if (!component) continue;
    component.nodeIds.push(node.id);
    byNode.set(node.id, component);
  }

  return { nodes, links, semanticLinks, generations, components, byNode };
}

/**
 * Splits people into their connected families and gives each one a horizontal
 * band. A person who is not related to anyone yet is a component of their own,
 * so a newly added person never lands on top of the rest of the tree.
 */
export function personComponents(
  people: GraphPerson[],
  relationships: GraphRelationship[],
  levels: Map<string, number>,
): { components: GraphComponent[]; byPerson: Map<string, GraphComponent> } {
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

  const known = new Set(people.map(person => person.id));
  for (const personId of known) parent.set(personId, personId);
  for (const relationship of relationships) {
    if (!known.has(relationship.source) || !known.has(relationship.target)) continue;
    union(relationship.source, relationship.target);
  }

  const grouped = new Map<string, string[]>();
  for (const personId of known) {
    const root = find(personId);
    const list = grouped.get(root) ?? [];
    list.push(personId);
    grouped.set(root, list);
  }

  const components: GraphComponent[] = [...grouped.values()].map(personIds => {
    const anchor = [...personIds].sort((a, b) => a.localeCompare(b))[0];
    const rowCounts = new Map<number, number>();
    for (const personId of personIds) {
      const level = levels.get(personId) ?? 0;
      rowCounts.set(level, (rowCounts.get(level) ?? 0) + 1);
    }
    const widestRow = Math.max(1, ...rowCounts.values());
    return {
      id: anchor,
      anchor,
      personIds,
      nodeIds: [],
      centerX: 0,
      width: Math.max(COMPONENT_MIN_WIDTH, widestRow * COMPONENT_PERSON_SPACING),
    };
  });

  components.sort((a, b) => a.anchor.localeCompare(b.anchor));

  const total =
    components.reduce((sum, component) => sum + component.width, 0) +
    COMPONENT_GAP * Math.max(0, components.length - 1);
  let cursor = -total / 2;
  for (const component of components) {
    component.centerX = cursor + component.width / 2;
    cursor += component.width + COMPONENT_GAP;
  }

  const byPerson = new Map<string, GraphComponent>();
  for (const component of components) {
    for (const personId of component.personIds) byPerson.set(personId, component);
  }

  return { components, byPerson };
}

function componentNodeHalfWidth(node: GraphNode) {
  if (node.kind === "person") return nodeRadius(node) + COMPONENT_NODE_PADDING;
  if (node.kind === "union") return 6 + COMPONENT_NODE_PADDING;
  return Math.max(fileCardSize(node).width, fileCardSize(node).height) / 2 +
    COMPONENT_NODE_PADDING;
}

/**
 * Guarantees the bands stay apart after the simulation has run. Whole
 * components are shifted on the x axis only, so generation rows survive, and a
 * component that already has room is left untouched.
 */
export function packComponents(
  nodes: GraphNode[],
  components: GraphComponent[],
  byNode: Map<string, GraphComponent>,
  gap = COMPONENT_GAP,
) {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const spans = components
    .map(component => {
      const members: GraphNode[] = [];
      let minX = Number.POSITIVE_INFINITY;
      let maxX = Number.NEGATIVE_INFINITY;
      for (const nodeId of component.nodeIds) {
        const node = byId.get(nodeId);
        if (!node || node.x == null) continue;
        members.push(node);
        const half = componentNodeHalfWidth(node);
        minX = Math.min(minX, node.x - half);
        maxX = Math.max(maxX, node.x + half);
      }
      return { component, members, minX, maxX };
    })
    .filter(span => Number.isFinite(span.minX))
    .sort(
      (a, b) =>
        a.minX - b.minX || a.component.anchor.localeCompare(b.component.anchor),
    );

  let cursor: number | null = null;
  for (const span of spans) {
    if (cursor == null) {
      cursor = span.maxX + gap;
      span.component.centerX = (span.minX + span.maxX) / 2;
      continue;
    }
    const shift = Math.max(0, cursor - span.minX);
    if (shift > 0) {
      for (const node of span.members) {
        node.x = (node.x ?? 0) + shift;
        node.vx = 0;
      }
      span.minX += shift;
      span.maxX += shift;
    }
    span.component.centerX = (span.minX + span.maxX) / 2;
    cursor = span.maxX + gap;
  }
}

export function computeGenerations(
  people: GraphPerson[],
  relationships: GraphRelationship[],
): Map<string, number> {
  return analyzeRelationships(people, relationships).levels;
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
  centerX = 0,
  spreadX = 90,
) {
  const hash = hashString(id);
  const angle = ((hash % 1000) / 1000) * Math.PI * 2;
  const radius = 70 + (hash % 180);
  return {
    x: centerX + Math.cos(angle) * Math.min(spreadX, radius),
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
