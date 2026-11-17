import type {
  GraphFile,
  GraphFileGroup,
  GraphPerson,
  GraphRelationship,
  TreeGraph,
} from "~/api/people-server";
import { analyzeRelationships } from "./relationships";

export type GenerationDirection = "oldest-top" | "oldest-bottom";

export type GraphNode = {
  id: string;
  kind: "person" | "file" | "group";
  name: string;
  person?: GraphPerson;
  file?: GraphFile;
  group?: GraphFileGroup;
  /** Person who owns this media node. */
  ownerId?: string;
  degree: number;
  level: number;
  /** Render coordinates, assigned by GraphView from the layout. */
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
};

export type GraphLink = {
  id: string;
  source: string | GraphNode;
  target: string | GraphNode;
  /**
   * Parent and partner links come from relationships. Media links are the
   * spring that keeps a photo or album near the person who owns it; the graph
   * never paints them.
   */
  kind: "parent" | "partner" | "media";
  parentType?: "biological" | "adoptive" | "foster" | "step" | "unknown";
  status?: string;
};

export type GraphModel = {
  nodes: GraphNode[];
  links: GraphLink[];
  generations: Map<string, number>;
  byId: Map<string, GraphNode>;
  people: GraphNode[];
  mediaByOwner: Map<string, GraphNode[]>;
};

export function fileNodeId(fileId: string) {
  return `file:${fileId}`;
}

export function groupNodeId(groupId: string) {
  return `group:${groupId}`;
}

export function nodeIdOf(endpoint: string | GraphNode) {
  return typeof endpoint === "string" ? endpoint : endpoint.id;
}

function relationshipKey(relationship: GraphRelationship) {
  if (relationship.type === "partner") {
    return `partner:${[relationship.source, relationship.target].sort().join(":")}`;
  }
  return `parent:${relationship.source}:${relationship.target}`;
}

/**
 * A relationship row can be duplicated by legacy imports or replayed actions.
 * Two links between the same pair would draw on top of each other, so the graph
 * model always keeps a single edge per unordered pair and kind.
 */
export function dedupeRelationships(
  relationships: GraphRelationship[],
): GraphRelationship[] {
  const seen = new Set<string>();
  const unique: GraphRelationship[] = [];
  for (const relationship of relationships) {
    const key = relationshipKey(relationship);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(relationship);
  }
  return unique;
}

function personRadiusForDegree(degree: number) {
  return Math.min(28, 12 + Math.sqrt(degree) * 4.2);
}

/**
 * Builds the position-free graph. Generations always come from the whole tree
 * so hiding a branch never changes the generation of the people left on screen.
 */
export function buildGraphModel(
  data: TreeGraph,
  showMedia: boolean,
  visible?: ReadonlySet<string>,
): GraphModel {
  const generations = computeGenerations(data.people, data.relationships);
  const people = visible
    ? data.people.filter(person => visible.has(person.id))
    : data.people;
  const relationships = dedupeRelationships(
    visible
      ? data.relationships.filter(
          relationship =>
            visible.has(relationship.source) && visible.has(relationship.target),
        )
      : data.relationships,
  );

  const degree = new Map<string, number>();
  for (const relationship of relationships) {
    degree.set(relationship.source, (degree.get(relationship.source) ?? 0) + 1);
    degree.set(relationship.target, (degree.get(relationship.target) ?? 0) + 1);
  }

  const nodes: GraphNode[] = [];
  for (const person of people) {
    nodes.push({
      id: person.id,
      kind: "person",
      name: person.displayName,
      person,
      degree: degree.get(person.id) ?? 0,
      level: generations.get(person.id) ?? 0,
    });
  }

  const links: GraphLink[] = [];
  for (const relationship of relationships) {
    if (relationship.type === "partner") {
      links.push({
        id: relationship.id,
        source: relationship.source,
        target: relationship.target,
        kind: "partner",
        status: relationship.status,
      });
      continue;
    }
    links.push({
      id: relationship.id,
      source: relationship.source,
      target: relationship.target,
      kind: "parent",
      parentType: relationship.parentType,
    });
  }

  const mediaByOwner = new Map<string, GraphNode[]>();
  if (showMedia) {
    const owners = new Set(people.map(person => person.id));
    for (const group of data.groups) {
      if (!owners.has(group.personId)) continue;
      const node: GraphNode = {
        id: groupNodeId(group.id),
        kind: "group",
        name: group.name,
        group,
        ownerId: group.personId,
        degree: 1,
        level: generations.get(group.personId) ?? 0,
      };
      nodes.push(node);
      addMedia(mediaByOwner, group.personId, node);
    }
    for (const file of data.files) {
      if (file.isAvatar || file.groupId) continue;
      if (!owners.has(file.personId)) continue;
      const node: GraphNode = {
        id: fileNodeId(file.id),
        kind: "file",
        name: file.name,
        file,
        ownerId: file.personId,
        degree: 1,
        level: generations.get(file.personId) ?? 0,
      };
      nodes.push(node);
      addMedia(mediaByOwner, file.personId, node);
    }
    for (const [ownerId, media] of mediaByOwner) {
      for (const node of media) {
        links.push({
          id: `media:${ownerId}:${node.id}`,
          source: ownerId,
          target: node.id,
          kind: "media",
        });
      }
    }
  }

  return {
    nodes,
    links,
    generations,
    byId: new Map(nodes.map(node => [node.id, node])),
    people: nodes.filter(node => node.kind === "person"),
    mediaByOwner,
  };
}

function addMedia(
  mediaByOwner: Map<string, GraphNode[]>,
  ownerId: string,
  node: GraphNode,
) {
  const list = mediaByOwner.get(ownerId) ?? [];
  list.push(node);
  mediaByOwner.set(ownerId, list);
}

export function computeGenerations(
  people: GraphPerson[],
  relationships: GraphRelationship[],
): Map<string, number> {
  return analyzeRelationships(people, relationships).levels;
}

export function neighborsOf(links: GraphLink[], id: string): Set<string> {
  const found = new Set<string>([id]);
  for (const link of links) {
    const source = nodeIdOf(link.source);
    const target = nodeIdOf(link.target);
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
  if (node.kind === "file" || node.kind === "group") {
    const card = fileCardSize(node);
    return Math.max(card.width, card.height) / 2;
  }
  return personRadiusForDegree(node.degree);
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
