import type {
  GraphFile,
  GraphFileGroup,
  GraphPerson,
  GraphRelationship,
  TreeGraph,
} from "~/api/people-server";
import type { FuzzyDate } from "./fuzzy-date";
import { analyzeRelationships } from "./relationships";

export type ParentType =
  | "biological"
  | "adoptive"
  | "foster"
  | "step"
  | "unknown";

export type GraphNode = {
  id: string;
  /**
   * Junctions are layout-only nodes where a parent set meets its children.
   * They are never painted or clickable.
   */
  kind: "person" | "file" | "group" | "junction";
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
   * A parent link runs from a parent to a family junction, a child link runs
   * from that junction to a child. Partner links come from relationships.
   * Media links are the spring that keeps a photo or album near its owner;
   * the graph never paints them.
   */
  kind: "parent" | "child" | "partner" | "media";
  parentType?: ParentType;
  status?: string;
};

export type GraphModel = {
  nodes: GraphNode[];
  links: GraphLink[];
  generations: Map<string, number>;
  byId: Map<string, GraphNode>;
  people: GraphNode[];
  junctions: GraphNode[];
  mediaByOwner: Map<string, GraphNode[]>;
};

export type FamilyGroup = {
  parentIds: string[];
  childIds: string[];
  parentTypes: Map<string, ParentType>;
};

export function fileNodeId(fileId: string) {
  return `file:${fileId}`;
}

export function groupNodeId(groupId: string) {
  return `group:${groupId}`;
}

export function junctionNodeId(parentIds: Iterable<string>) {
  return `family:${[...parentIds].sort().join("+")}`;
}

export function nodeIdOf(endpoint: string | GraphNode) {
  return typeof endpoint === "string" ? endpoint : endpoint.id;
}

const PARENT_TYPE_PRIORITY: ParentType[] = [
  "biological",
  "adoptive",
  "foster",
  "step",
  "unknown",
];

/**
 * The dashed arm should show the strongest parent type in the group, so a
 * biological link always wins over a legal or informal one.
 */
function strongestParentType(current: ParentType | undefined, next: ParentType) {
  if (!current) return next;
  return PARENT_TYPE_PRIORITY.indexOf(next) < PARENT_TYPE_PRIORITY.indexOf(current)
    ? next
    : current;
}

/**
 * Groups children by the exact set of people recorded as their parents. Each
 * group becomes one family junction, so full siblings share a joint while
 * half-siblings hang from separate joints on the shared parent.
 */
export function groupChildrenByParents(
  relationships: GraphRelationship[],
): FamilyGroup[] {
  const parentsByChild = new Map<string, Map<string, ParentType>>();
  for (const relationship of relationships) {
    if (relationship.type !== "parent") continue;
    let parents = parentsByChild.get(relationship.target);
    if (!parents) {
      parents = new Map();
      parentsByChild.set(relationship.target, parents);
    }
    parents.set(
      relationship.source,
      strongestParentType(parents.get(relationship.source), relationship.parentType),
    );
  }

  const groups = new Map<string, FamilyGroup>();
  for (const [childId, parents] of parentsByChild) {
    if (!parents.size) continue;
    const parentIds = [...parents.keys()].sort();
    const key = parentIds.join("+");
    let group = groups.get(key);
    if (!group) {
      group = { parentIds, childIds: [], parentTypes: new Map() };
      groups.set(key, group);
    }
    for (const [parentId, type] of parents) {
      group.parentTypes.set(
        parentId,
        strongestParentType(group.parentTypes.get(parentId), type),
      );
    }
    group.childIds.push(childId);
  }

  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, group]) => ({
      parentIds: group.parentIds,
      childIds: [...group.childIds].sort(),
      parentTypes: group.parentTypes,
    }));
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

  const familyGroups = groupChildrenByParents(relationships);
  const junctions: GraphNode[] = familyGroups.map(group => ({
    id: junctionNodeId(group.parentIds),
    kind: "junction",
    name: "",
    degree: 0,
    level: Math.max(...group.parentIds.map(id => generations.get(id) ?? 0)),
  }));

  const nodes: GraphNode[] = [...junctions];
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
    if (relationship.type !== "partner") continue;
    links.push({
      id: relationship.id,
      source: relationship.source,
      target: relationship.target,
      kind: "partner",
      status: relationship.status,
    });
  }
  for (const group of familyGroups) {
    const junctionId = junctionNodeId(group.parentIds);
    for (const parentId of group.parentIds) {
      links.push({
        id: `${junctionId}:parent:${parentId}`,
        source: parentId,
        target: junctionId,
        kind: "parent",
        parentType: group.parentTypes.get(parentId),
      });
    }
    for (const childId of group.childIds) {
      links.push({
        id: `${junctionId}:child:${childId}`,
        source: junctionId,
        target: childId,
        kind: "child",
      });
    }
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
      if (!file.personId || !owners.has(file.personId)) continue;
      const ownerId = file.personId;
      const node: GraphNode = {
        id: fileNodeId(file.id),
        kind: "file",
        name: file.name,
        file,
        ownerId,
        degree: 1,
        level: generations.get(ownerId) ?? 0,
      };
      nodes.push(node);
      addMedia(mediaByOwner, ownerId, node);
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
    junctions,
    mediaByOwner,
  };
}

function dateKey(date: FuzzyDate | null | undefined) {
  if (!date) return "";
  const start = date.start;
  const end = date.end;
  return `${date.qualifier}:${start.year ?? ""}-${start.month ?? ""}-${start.day ?? ""}:${
    end ? `${end.year ?? ""}-${end.month ?? ""}-${end.day ?? ""}` : ""
  }`;
}

/**
 * A stable fingerprint of everything the canvas reads. Presence reconnects and
 * focus/visibility refreshes refetch the graph even when no row changed, and
 * rebuilds restart the force simulation (which can also re-fit the view). The
 * fingerprint lets GraphView skip those no-op updates. Rows are sorted by id so
 * a different query order does not count as a change, and fields the canvas
 * never draws (bio, events, member claims) are deliberately left out.
 */
export function graphModelKey(
  data: TreeGraph,
  showMedia: boolean,
  visible?: ReadonlySet<string>,
): string {
  const people = [...data.people]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(person =>
      [
        person.id,
        person.displayName,
        person.firstName,
        person.lastName,
        person.avatarFileId ?? "",
        dateKey(person.birthDate),
        dateKey(person.deathDate),
      ].join("|"),
    );
  const relationships = [...data.relationships]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(relationship =>
      [
        relationship.id,
        relationship.type,
        relationship.source,
        relationship.target,
        relationship.type === "parent"
          ? relationship.parentType ?? ""
          : relationship.status ?? "",
      ].join("|"),
    );
  const media: string[] = [];
  if (showMedia) {
    for (const group of [...data.groups].sort((a, b) => a.id.localeCompare(b.id))) {
      media.push(
        [
          "g",
          group.id,
          group.personId,
          group.name,
          String(group.count),
          group.coverFileId ?? "",
          group.coverWidth ?? "",
          group.coverHeight ?? "",
        ].join("|"),
      );
    }
    for (const file of [...data.files].sort((a, b) => a.id.localeCompare(b.id))) {
      media.push(
        [
          "f",
          file.id,
          file.personId,
          file.groupId ?? "",
          file.name,
          file.kind,
          file.thumbUrl ?? "",
          file.width ?? "",
          file.height ?? "",
          file.isAvatar ? "avatar" : "",
        ].join("|"),
      );
    }
  }
  const visibleKey = visible ? [...visible].sort().join(",") : "*";
  return [
    showMedia ? "media" : "no-media",
    visibleKey,
    ...people,
    ...relationships,
    ...media,
  ].join("\n");
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
  if (node.kind === "junction") return 6;
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
