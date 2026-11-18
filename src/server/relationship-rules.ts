import { AppError, userMessage } from "./errors";
import {
  MAX_PARENTS,
  createChildrenMap,
  isAncestorInMap,
  type PlainParentEdge,
} from "../lib/relationships";

export type ParentEdgeRecord = PlainParentEdge & { id: string };

export type PartnershipRecord = {
  id: string;
  personAId: string;
  personBId: string;
};

export type RelationshipInvariantInput = {
  parentEdges: ParentEdgeRecord[];
  partnerships: PartnershipRecord[];
  addParentEdges?: ParentEdgeRecord[];
  addPartnership?: PartnershipRecord;
};

function edgeKey(parentId: string, childId: string) {
  return `${parentId}:${childId}`;
}

/**
 * Validates the whole relationship graph after a proposed change. This keeps
 * parent links acyclic, caps each person at two parents, and stops a person
 * from becoming both a partner and an ancestor of the same person.
 */
export function assertRelationshipInvariants(input: RelationshipInvariantInput) {
  const addedEdges = input.addParentEdges ?? [];
  const combined = [...input.parentEdges, ...addedEdges];

  for (const edge of combined) {
    if (edge.parentId === edge.childId) {
      throw new AppError(userMessage("person.error.selfParent"));
    }
  }

  for (const edge of addedEdges) {
    const parents = new Set<string>();
    for (const existing of combined) {
      if (existing.childId === edge.childId) parents.add(existing.parentId);
    }
    if (parents.size > MAX_PARENTS) {
      throw new AppError(userMessage("person.error.tooManyParents"));
    }
  }

  const children = createChildrenMap(combined);
  for (const edge of addedEdges) {
    if (isAncestorInMap(children, edge.childId, edge.parentId)) {
      throw new AppError(userMessage("person.error.loop"));
    }
  }

  const partnerships = input.addPartnership
    ? [...input.partnerships, input.addPartnership]
    : input.partnerships;
  const seen = new Set<string>();
  for (const partnership of partnerships) {
    const key = `${partnership.personAId}:${partnership.personBId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (
      isAncestorInMap(children, partnership.personAId, partnership.personBId) ||
      isAncestorInMap(children, partnership.personBId, partnership.personAId)
    ) {
      throw new AppError(userMessage("person.error.partnerAncestor"));
    }
  }
}

export function dedupeParentEdges(edges: ParentEdgeRecord[]) {
  const seen = new Set<string>();
  const unique: ParentEdgeRecord[] = [];
  for (const edge of edges) {
    const key = edgeKey(edge.parentId, edge.childId);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(edge);
  }
  return unique;
}
