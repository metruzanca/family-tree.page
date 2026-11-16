export const MAX_PARENTS = 2;

export type RelationshipPerson = {
  id: string;
};

export type ParentRelationship = {
  id: string;
  type: "parent";
  source: string;
  target: string;
};

export type PartnerRelationship = {
  id: string;
  type: "partner";
  source: string;
  target: string;
};

export type AnalyzedRelationship = ParentRelationship | PartnerRelationship;

export type RelationshipConflict =
  | {
      kind: "parent-cycle";
      relationshipIds: string[];
      personIds: string[];
    }
  | {
      kind: "partner-ancestor";
      relationshipId: string;
      personIds: [string, string];
    };

export type GenerationAnalysis = {
  levels: Map<string, number>;
  conflicts: RelationshipConflict[];
};

export type PlainParentEdge = {
  parentId: string;
  childId: string;
};

export function createChildrenMap(edges: PlainParentEdge[]) {
  const children = new Map<string, string[]>();
  for (const edge of edges) {
    const list = children.get(edge.parentId) ?? [];
    list.push(edge.childId);
    children.set(edge.parentId, list);
  }
  return children;
}

export function isAncestorInMap(
  children: Map<string, string[]>,
  ancestorId: string,
  descendantId: string,
) {
  if (ancestorId === descendantId) return false;
  const stack = [ancestorId];
  const seen = new Set<string>([ancestorId]);
  while (stack.length) {
    const current = stack.pop()!;
    for (const next of children.get(current) ?? []) {
      if (next === descendantId) return true;
      if (seen.has(next)) continue;
      seen.add(next);
      stack.push(next);
    }
  }
  return false;
}

export function isAncestor(
  edges: PlainParentEdge[],
  ancestorId: string,
  descendantId: string,
) {
  return isAncestorInMap(createChildrenMap(edges), ancestorId, descendantId);
}

/**
 * Assigns every person to a generation row without letting contradictory data
 * run away. Parent cycles and partnerships between ancestors and descendants
 * are reported instead of pushing a child down a new row forever.
 */
export function analyzeRelationships(
  people: RelationshipPerson[],
  relationships: AnalyzedRelationship[],
): GenerationAnalysis {
  const personIds = new Set(people.map(person => person.id));
  const parentRelationships = relationships.filter(
    (relationship): relationship is ParentRelationship => relationship.type === "parent",
  );
  const partnerRelationships = relationships.filter(
    (relationship): relationship is PartnerRelationship => relationship.type === "partner",
  );

  const allParentEdges: PlainParentEdge[] = parentRelationships.map(relationship => ({
    parentId: relationship.source,
    childId: relationship.target,
  }));
  const allChildren = createChildrenMap(allParentEdges);

  const conflicts: RelationshipConflict[] = [];
  const validPartnerships: PartnerRelationship[] = [];

  for (const partnership of partnerRelationships) {
    if (
      isAncestorInMap(allChildren, partnership.source, partnership.target) ||
      isAncestorInMap(allChildren, partnership.target, partnership.source)
    ) {
      conflicts.push({
        kind: "partner-ancestor",
        relationshipId: partnership.id,
        personIds: [partnership.source, partnership.target],
      });
      continue;
    }
    validPartnerships.push(partnership);
  }

  const groups = new Map<string, string>();
  const find = (id: string): string => {
    const current = groups.get(id) ?? id;
    if (current === id) {
      groups.set(id, id);
      return id;
    }
    const root = find(current);
    groups.set(id, root);
    return root;
  };
  const union = (a: string, b: string) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) groups.set(rootA, rootB);
  };

  for (const personId of personIds) groups.set(personId, personId);
  for (const partnership of validPartnerships) {
    union(partnership.source, partnership.target);
  }

  type GroupEdge = {
    from: string;
    to: string;
    relationshipIds: string[];
    personIds: string[];
  };
  const edges = new Map<string, GroupEdge>();

  for (const relationship of parentRelationships) {
    if (!personIds.has(relationship.source) || !personIds.has(relationship.target)) {
      continue;
    }
    const from = find(relationship.source);
    const to = find(relationship.target);
    if (from === to) {
      conflicts.push({
        kind: "parent-cycle",
        relationshipIds: [relationship.id],
        personIds: [relationship.source, relationship.target],
      });
      continue;
    }
    const key = `${from}->${to}`;
    const existing = edges.get(key);
    if (existing) {
      existing.relationshipIds.push(relationship.id);
      existing.personIds.push(relationship.source, relationship.target);
      continue;
    }
    edges.set(key, {
      from,
      to,
      relationshipIds: [relationship.id],
      personIds: [relationship.source, relationship.target],
    });
  }

  const adjacency = new Map<string, GroupEdge[]>();
  for (const edge of edges.values()) {
    const list = adjacency.get(edge.from) ?? [];
    list.push(edge);
    adjacency.set(edge.from, list);
  }

  const state = new Map<string, 0 | 1 | 2>();
  const skipped = new Set<string>();

  for (const start of adjacency.keys()) {
    if ((state.get(start) ?? 0) !== 0) continue;
    const stack: Array<{ node: string; index: number }> = [{ node: start, index: 0 }];
    state.set(start, 1);
    while (stack.length) {
      const frame = stack[stack.length - 1];
      const outgoing = adjacency.get(frame.node) ?? [];
      if (frame.index >= outgoing.length) {
        state.set(frame.node, 2);
        stack.pop();
        continue;
      }
      const edge = outgoing[frame.index];
      frame.index += 1;
      const targetState = state.get(edge.to) ?? 0;
      if (targetState === 1) {
        skipped.add(`${edge.from}->${edge.to}`);
        conflicts.push({
          kind: "parent-cycle",
          relationshipIds: [...new Set(edge.relationshipIds)],
          personIds: [...new Set(edge.personIds)],
        });
        continue;
      }
      if (targetState === 0) {
        state.set(edge.to, 1);
        stack.push({ node: edge.to, index: 0 });
      }
    }
  }

  const dagEdges = [...edges.values()].filter(
    edge => !skipped.has(`${edge.from}->${edge.to}`),
  );
  const groupLevels = new Map<string, number>();
  const indegree = new Map<string, number>();
  for (const personId of personIds) {
    const group = find(personId);
    groupLevels.set(group, groupLevels.get(group) ?? 0);
    indegree.set(group, indegree.get(group) ?? 0);
  }
  for (const edge of dagEdges) {
    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
  }

  const queue: string[] = [];
  for (const [group, count] of indegree) {
    if (count === 0) queue.push(group);
  }

  while (queue.length) {
    const group = queue.shift()!;
    const level = groupLevels.get(group) ?? 0;
    for (const edge of dagEdges) {
      if (edge.from !== group) continue;
      const nextLevel = level + 1;
      if (nextLevel > (groupLevels.get(edge.to) ?? 0)) {
        groupLevels.set(edge.to, nextLevel);
      }
      const remaining = (indegree.get(edge.to) ?? 1) - 1;
      indegree.set(edge.to, remaining);
      if (remaining === 0) queue.push(edge.to);
    }
  }

  const levels = new Map<string, number>();
  let minimum = Number.POSITIVE_INFINITY;
  for (const personId of personIds) {
    const level = groupLevels.get(find(personId)) ?? 0;
    levels.set(personId, level);
    minimum = Math.min(minimum, level);
  }
  if (Number.isFinite(minimum) && minimum !== 0) {
    for (const [id, level] of levels) levels.set(id, level - minimum);
  }

  const maxLevel = Math.max(0, groups.size - 1);
  for (const [id, level] of levels) {
    levels.set(id, Math.max(0, Math.min(maxLevel, level)));
  }

  return { levels, conflicts };
}

export function computeGenerations(
  people: RelationshipPerson[],
  relationships: AnalyzedRelationship[],
) {
  return analyzeRelationships(people, relationships).levels;
}
