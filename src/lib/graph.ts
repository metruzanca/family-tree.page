import type { GraphFile, GraphPerson, GraphRelationship, TreeGraph } from "~/api/people-server";

export type GenerationDirection = "oldest-top" | "oldest-bottom";
export const GENERATION_SPACING = 190;
export const GENERATION_BAND = 58;

export type GraphNode = {
  id: string;
  kind: "person" | "file";
  name: string;
  person?: GraphPerson;
  file?: GraphFile;
  degree: number;
  val: number;
  level: number;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
  softX?: number;
};

export type GraphLink = {
  id: string;
  source: string | GraphNode;
  target: string | GraphNode;
  kind: "parent" | "partner" | "media";
  parentType?: "biological" | "adoptive" | "foster" | "step" | "unknown";
  status?: string;
};

export type GraphModel = {
  nodes: GraphNode[];
  links: GraphLink[];
  generations: Map<string, number>;
};

export function fileNodeId(fileId: string) {
  return `file:${fileId}`;
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

  const links: GraphLink[] = data.relationships.map(relationship => ({
    id: relationship.id,
    source: relationship.source,
    target: relationship.target,
    kind: relationship.type,
    parentType: relationship.type === "parent" ? relationship.parentType : undefined,
    status: relationship.type === "partner" ? relationship.status : undefined,
  }));

  if (showMedia) {
    const byPerson = new Map(nodes.map(node => [node.id, node]));
    for (const file of data.files) {
      if (file.isAvatar) continue;
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
      links.push({
        id: `media:${file.id}`,
        source: parent.id,
        target: fileNodeId(file.id),
        kind: "media",
      });
    }
  }

  return { nodes, links, generations };
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

export function nodeRadius(node: GraphNode) {
  if (node.kind === "file") return 11;
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
