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
const PARTNER_GAP = 46;
const UNIT_GAP = 58;
const MEDIA_ROW_GAP = 0.85;
const MEDIA_SPACING = 40;

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
  const relationships = dedupeRelationships(
    visible
      ? data.relationships.filter(
          relationship =>
            visible.has(relationship.source) && visible.has(relationship.target),
        )
      : data.relationships,
  );
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

  const positions = layoutPeople(
    people,
    relationships,
    generations,
    components,
    byPerson,
    degree,
    direction,
  );

  const nodes: GraphNode[] = [];
  for (const person of people) {
    const level = generations.get(person.id) ?? 0;
    const position = positions.get(person.id);
    nodes.push({
      id: person.id,
      kind: "person",
      name: person.displayName,
      person,
      degree: degree.get(person.id) ?? 0,
      val: 1,
      level,
      x: position?.x ?? 0,
      y: position?.y ?? generationRowY(level, direction),
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
  const personColumns = nodes
    .filter(node => node.kind === "person")
    .map(node => node.x ?? 0);
  const usedUnionX: number[] = [];
  for (const union of unions.values()) {
    const parentNodes = union.parentIds
      .map(id => byId.get(id))
      .filter((node): node is GraphNode => Boolean(node));
    const childNodes = union.childIds
      .map(id => byId.get(id))
      .filter((node): node is GraphNode => Boolean(node));
    const x = unionX(parentNodes, childNodes, personColumns, usedUnionX);
    usedUnionX.push(x);
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
      x,
      y: generationRowY(union.level, direction),
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
    const media: Array<{ id: string; ownerId: string; node: GraphNode }> = [];
    for (const group of data.groups) {
      const parent = byPerson.get(group.personId);
      if (!parent) continue;
      media.push({
        id: groupNodeId(group.id),
        ownerId: group.personId,
        node: {
          id: groupNodeId(group.id),
          kind: "group",
          name: group.name,
          group,
          degree: 1,
          val: 0.7,
          level: parent.level,
        },
      });
    }
    for (const file of data.files) {
      if (file.isAvatar || file.groupId) continue;
      const parent = byPerson.get(file.personId);
      if (!parent) continue;
      media.push({
        id: fileNodeId(file.id),
        ownerId: file.personId,
        node: {
          id: fileNodeId(file.id),
          kind: "file",
          name: file.name,
          file,
          degree: 1,
          val: 0.35,
          level: parent.level,
        },
      });
    }
    layoutMedia(media, byPerson, generations, direction);
    for (const item of media) nodes.push(item.node);
    for (const item of media) {
      const link: GraphLink = {
        id:
          item.node.kind === "group"
            ? `group-media:${item.node.group!.id}`
            : `media:${item.node.file!.id}`,
        source: item.ownerId,
        target: item.id,
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
 * Chooses a junction x that sits over the children, away from every other
 * junction, so two vertical trunks can never run along the same column.
 */
function unionX(
  parents: GraphNode[],
  children: GraphNode[],
  personColumns: number[],
  used: number[],
) {
  const childXs = children.map(node => node.x ?? 0);
  const parentXs = parents.map(node => node.x ?? 0);
  const childMid =
    childXs.length > 0
      ? (Math.min(...childXs) + Math.max(...childXs)) / 2
      : null;
  const parentMid =
    parentXs.length > 0
      ? (Math.min(...parentXs) + Math.max(...parentXs)) / 2
      : 0;
  let x = childMid ?? parentMid;
  if (childXs.length) {
    const margin = 12;
    x = Math.max(
      Math.min(...childXs) - margin,
      Math.min(Math.max(...childXs) + margin, x),
    );
  }
  // A junction directly over a person would make its trunk share that
  // person's vertical column, so arms and trunk could paint over each other.
  const columns = [...childXs, ...parentXs, ...personColumns];
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const onColumn = columns.some(column => Math.abs(column - x) < 3);
    const clashes = used.some(other => Math.abs(other - x) < 8);
    if (!onColumn && !clashes) return x;
    const step = Math.floor(attempt / 2) + 1;
    x += 6 * step * (attempt % 2 === 0 ? 1 : -1);
  }
  return x;
}

type LayoutUnit = {
  id: string;
  level: number;
  personIds: string[];
  width: number;
  index: number;
};

/**
 * Places people in stable, ordered rows. Partner clusters stay together and a
 * barycenter sweep orders each row by where its parents and children sit, which
 * removes most of the crossing that a force layout produces.
 */
function layoutPeople(
  people: GraphPerson[],
  relationships: GraphRelationship[],
  generations: Map<string, number>,
  components: GraphComponent[],
  byPerson: Map<string, GraphComponent>,
  degree: Map<string, number>,
  direction: GenerationDirection,
) {
  const radiusOf = (id: string) => personRadiusForDegree(degree.get(id) ?? 0);
  const personById = new Map(people.map(person => [person.id, person]));
  const slotWidthOf = (id: string) => {
    const radius = radiusOf(id);
    const label = personById.get(id)?.displayName ?? id;
    const labelWidth = Math.min(220, label.length * 6.2 + 16);
    return Math.max(radius * 2 + 20, labelWidth);
  };
  const positions = new Map<string, { x: number; y: number }>();
  const componentLayouts = new Map<
    GraphComponent,
    { rows: Map<number, LayoutUnit[]>; levels: number[] }
  >();

  for (const component of components) {
    const units = buildUnits(component, relationships, generations);
    const unitOf = new Map<string, LayoutUnit>();
    for (const unit of units) {
      for (const personId of unit.personIds) unitOf.set(personId, unit);
    }

    const parentUnits = new Map<string, Set<string>>();
    const childUnits = new Map<string, Set<string>>();
    for (const relationship of relationships) {
      if (relationship.type !== "parent") continue;
      const from = unitOf.get(relationship.source);
      const to = unitOf.get(relationship.target);
      if (!from || !to || from.id === to.id) continue;
      const parents = parentUnits.get(to.id) ?? new Set<string>();
      parents.add(from.id);
      parentUnits.set(to.id, parents);
      const children = childUnits.get(from.id) ?? new Set<string>();
      children.add(to.id);
      childUnits.set(from.id, children);
    }

    const rows = new Map<number, LayoutUnit[]>();
    for (const unit of units) {
      const list = rows.get(unit.level) ?? [];
      list.push(unit);
      rows.set(unit.level, list);
    }
    const levels = [...rows.keys()].sort((a, b) => a - b);
    for (const level of levels) {
      const row = rows.get(level)!;
      row.sort((a, b) => a.id.localeCompare(b.id));
      row.forEach((unit, index) => {
        unit.index = index;
        unit.width = unitWidth(unit, slotWidthOf);
      });
    }

    const unitById = new Map(units.map(unit => [unit.id, unit]));
    const barycenter = (
      unit: LayoutUnit,
      links: Map<string, Set<string>>,
    ) => {
      const neighbors = links.get(unit.id);
      if (!neighbors?.size) return null;
      let sum = 0;
      let count = 0;
      for (const id of neighbors) {
        const neighbor = unitById.get(id);
        if (!neighbor) continue;
        sum += neighbor.index;
        count += 1;
      }
      return count ? sum / count : null;
    };

    for (let pass = 0; pass < 4; pass += 1) {
      for (let index = 1; index < levels.length; index += 1) {
        sortRow(rows.get(levels[index])!, unit =>
          barycenter(unit, parentUnits),
        );
      }
      for (let index = levels.length - 2; index >= 0; index -= 1) {
        sortRow(rows.get(levels[index])!, unit =>
          barycenter(unit, childUnits),
        );
      }
    }

    let width = COMPONENT_MIN_WIDTH;
    for (const level of levels) {
      width = Math.max(width, rowWidth(rows.get(level)!));
    }
    component.width = width;
    componentLayouts.set(component, { rows, levels });
  }

  const total =
    components.reduce((sum, component) => sum + component.width, 0) +
    COMPONENT_GAP * Math.max(0, components.length - 1);
  let cursor = -total / 2;
  for (const component of components) {
    component.centerX = cursor + component.width / 2;
    cursor += component.width + COMPONENT_GAP;
  }

  for (const component of components) {
    const layout = componentLayouts.get(component);
    if (!layout) continue;
    for (const level of layout.levels) {
      const row = layout.rows.get(level)!;
      const width = rowWidth(row);
      let x = component.centerX - width / 2;
      const y = generationRowY(level, direction);
      for (const unit of row) {
        let memberX = x;
        for (const personId of unit.personIds) {
          const slot = slotWidthOf(personId);
          positions.set(personId, { x: memberX + slot / 2, y });
          memberX += slot + PARTNER_GAP;
        }
        x += unit.width + UNIT_GAP;
      }
    }
  }

  // Newly added people who are not connected to anyone still belong to a
  // component of their own, so the row loop above has already placed them.
  for (const person of people) {
    if (!positions.has(person.id)) {
      const component = byPerson.get(person.id);
      positions.set(person.id, {
        x: component?.centerX ?? 0,
        y: generationRowY(generations.get(person.id) ?? 0, direction),
      });
    }
  }

  return positions;
}

function buildUnits(
  component: GraphComponent,
  relationships: GraphRelationship[],
  generations: Map<string, number>,
): LayoutUnit[] {
  const members = new Set(component.personIds);
  const partners = new Map<string, string[]>();
  for (const relationship of relationships) {
    if (relationship.type !== "partner") continue;
    if (!members.has(relationship.source) || !members.has(relationship.target)) {
      continue;
    }
    if (relationship.source === relationship.target) continue;
    addNeighbor(partners, relationship.source, relationship.target);
    addNeighbor(partners, relationship.target, relationship.source);
  }

  const seen = new Set<string>();
  const groups: string[][] = [];
  for (const personId of [...component.personIds].sort()) {
    if (seen.has(personId)) continue;
    const stack = [personId];
    const group: string[] = [];
    seen.add(personId);
    while (stack.length) {
      const current = stack.pop()!;
      group.push(current);
      for (const next of partners.get(current) ?? []) {
        if (seen.has(next)) continue;
        seen.add(next);
        stack.push(next);
      }
    }
    groups.push(group);
  }

  const units: LayoutUnit[] = [];
  for (const group of groups) {
    const byLevel = new Map<number, string[]>();
    for (const personId of group) {
      const level = generations.get(personId) ?? 0;
      const list = byLevel.get(level) ?? [];
      list.push(personId);
      byLevel.set(level, list);
    }
    for (const [level, personIds] of byLevel) {
      const ordered = orderPartnerMembers(personIds, partners);
      units.push({
        id: `${level}:${ordered[0]}`,
        level,
        personIds: ordered,
        width: 0,
        index: 0,
      });
    }
  }
  return units;
}

/**
 * Walks partnership chains so a couple, or a chain of remarriages, sits in a
 * contiguous run and each dashed partner line stays between two neighbours.
 */
function orderPartnerMembers(ids: string[], partners: Map<string, string[]>) {
  const allowed = new Set(ids);
  const degree = new Map(
    ids.map(id => [
      id,
      (partners.get(id) ?? []).filter(next => allowed.has(next)).length,
    ]),
  );
  const leaves = [...ids]
    .filter(id => (degree.get(id) ?? 0) <= 1)
    .sort((a, b) => a.localeCompare(b));
  const starts = leaves.length ? leaves : [...ids].sort((a, b) => a.localeCompare(b));
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const start of starts) {
    if (seen.has(start)) continue;
    let current: string | null = start;
    while (current && !seen.has(current)) {
      seen.add(current);
      ordered.push(current);
      const next: string | undefined = (partners.get(current) ?? [])
        .filter(id => allowed.has(id) && !seen.has(id))
        .sort((a, b) => a.localeCompare(b))[0];
      current = next ?? null;
    }
  }
  for (const id of [...ids].sort((a, b) => a.localeCompare(b))) {
    if (!seen.has(id)) ordered.push(id);
  }
  return ordered;
}

function addNeighbor(map: Map<string, string[]>, source: string, target: string) {
  const list = map.get(source) ?? [];
  list.push(target);
  map.set(source, list);
}

function sortRow(
  row: LayoutUnit[],
  barycenter: (unit: LayoutUnit) => number | null,
) {
  const current = new Map(row.map(unit => [unit.id, unit.index]));
  row.sort((a, b) => {
    const left = barycenter(a) ?? current.get(a.id) ?? 0;
    const right = barycenter(b) ?? current.get(b.id) ?? 0;
    if (left !== right) return left - right;
    return a.id.localeCompare(b.id);
  });
  row.forEach((unit, index) => {
    unit.index = index;
  });
}

function unitWidth(unit: LayoutUnit, slotWidthOf: (id: string) => number) {
  return unit.personIds.reduce(
    (sum, personId, index) =>
      sum + slotWidthOf(personId) + (index > 0 ? PARTNER_GAP : 0),
    0,
  );
}

function rowWidth(row: LayoutUnit[]) {
  return (
    row.reduce((sum, unit) => sum + unit.width, 0) +
    UNIT_GAP * Math.max(0, row.length - 1)
  );
}

/**
 * Media lives under the deepest visible generation, ordered by owner x. It is
 * deliberately outside the generation rows so showing photos never moves a
 * person.
 */
function layoutMedia(
  media: Array<{ id: string; ownerId: string; node: GraphNode }>,
  byPerson: Map<string, GraphNode>,
  generations: Map<string, number>,
  direction: GenerationDirection,
) {
  if (!media.length) return;
  let deepest = 0;
  for (const level of generations.values()) deepest = Math.max(deepest, level);
  const rowY = generationRowY(deepest + MEDIA_ROW_GAP, direction);
  media.sort((a, b) => {
    const left = byPerson.get(a.ownerId)?.x ?? 0;
    const right = byPerson.get(b.ownerId)?.x ?? 0;
    if (left !== right) return left - right;
    return a.id.localeCompare(b.id);
  });
  const width = media.length * MEDIA_SPACING;
  const start = -width / 2 + MEDIA_SPACING / 2;
  media.forEach((item, index) => {
    item.node.x = start + index * MEDIA_SPACING;
    item.node.y = rowY;
  });
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
 * Guarantees the bands stay apart after a layout has run. Whole components are
 * shifted on the x axis only, so generation rows survive, and a component that
 * already has room is left untouched.
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
