import type { GraphPerson } from "~/api/people-server";
import { shortestPath } from "../focus";
import { parentsOf, personName, type ResearchIndex } from "./graph";

export type KinshipKind =
  | "same"
  | "ancestor"
  | "descendant"
  | "sibling"
  | "aunt-uncle"
  | "niece-nephew"
  | "cousin"
  | "none";

export type KinshipResult = {
  kind: KinshipKind;
  label: string;
  detail: string;
  path: GraphPerson[];
};

const ORDINALS = [
  "first",
  "second",
  "third",
  "fourth",
  "fifth",
  "sixth",
  "seventh",
  "eighth",
  "ninth",
  "tenth",
];

function ordinal(degree: number) {
  return ORDINALS[degree - 1] ?? `${degree}th`;
}

function removedLabel(removed: number) {
  if (removed === 1) return "once removed";
  if (removed === 2) return "twice removed";
  if (removed === 3) return "three times removed";
  return `${removed} times removed`;
}

function greatPrefix(steps: number) {
  return "great-".repeat(Math.max(0, steps));
}

export function ancestorLabel(distance: number) {
  if (distance <= 0) return "self";
  if (distance === 1) return "parent";
  return `${greatPrefix(distance - 2)}grandparent`;
}

export function descendantLabel(distance: number) {
  if (distance <= 0) return "self";
  if (distance === 1) return "child";
  return `${greatPrefix(distance - 2)}grandchild`;
}

function ancestorDistances(index: ResearchIndex, personId: string) {
  const distances = new Map<string, number>();
  const queue: Array<{ id: string; distance: number }> = [{ id: personId, distance: 0 }];
  for (let position = 0; position < queue.length; position += 1) {
    const current = queue[position];
    if (distances.has(current.id)) continue;
    distances.set(current.id, current.distance);
    for (const parent of parentsOf(index, current.id)) {
      if (!distances.has(parent.person.id)) {
        queue.push({ id: parent.person.id, distance: current.distance + 1 });
      }
    }
  }
  return distances;
}

function pathBetween(index: ResearchIndex, fromId: string, toId: string) {
  const ids = shortestPath(index.relationships, fromId, toId) ?? [];
  return ids
    .map(id => index.peopleById.get(id))
    .filter((person): person is GraphPerson => Boolean(person));
}

/**
 * Names the relationship between two people in the terms a genealogist would
 * use. Without a recorded sex field the labels stay neutral: "aunt or uncle",
 * "sibling", "parent".
 */
export function describeKinship(
  index: ResearchIndex,
  fromId: string,
  toId: string,
): KinshipResult | null {
  const from = index.peopleById.get(fromId);
  const to = index.peopleById.get(toId);
  if (!from || !to) return null;

  const path = pathBetween(index, fromId, toId);

  if (fromId === toId) {
    return {
      kind: "same",
      label: "the same person",
      detail: personName(from),
      path,
    };
  }

  const fromAncestors = ancestorDistances(index, fromId);
  const toAncestors = ancestorDistances(index, toId);

  const asAncestor = fromAncestors.get(toId);
  if (asAncestor !== undefined) {
    return {
      kind: "ancestor",
      label: ancestorLabel(asAncestor),
      detail: `${personName(to)} is an ancestor of ${personName(from)}.`,
      path,
    };
  }

  const asDescendant = toAncestors.get(fromId);
  if (asDescendant !== undefined) {
    return {
      kind: "descendant",
      label: descendantLabel(asDescendant),
      detail: `${personName(to)} is a descendant of ${personName(from)}.`,
      path,
    };
  }

  let best:
    | { ancestorId: string; fromDistance: number; toDistance: number }
    | null = null;
  for (const [ancestorId, fromDistance] of fromAncestors) {
    if (fromDistance === 0) continue;
    const toDistance = toAncestors.get(ancestorId);
    if (toDistance === undefined || toDistance === 0) continue;
    if (
      !best ||
      fromDistance + toDistance < best.fromDistance + best.toDistance
    ) {
      best = { ancestorId, fromDistance, toDistance };
    }
  }

  if (best) {
    const ancestor = index.peopleById.get(best.ancestorId);
    const through = ancestor ? ` through ${personName(ancestor)}` : "";
    if (best.fromDistance === 1 && best.toDistance === 1) {
      return {
        kind: "sibling",
        label: "sibling",
        detail: `${personName(from)} and ${personName(to)} share a parent${through}.`,
        path,
      };
    }
    if (best.fromDistance === 1) {
      const greats = best.toDistance - 2;
      return {
        kind: "niece-nephew",
        label: `${greatPrefix(greats)}niece or ${greatPrefix(greats)}nephew`,
        detail: `${personName(to)} is the child of ${personName(from)}'s sibling${through}.`,
        path,
      };
    }
    if (best.toDistance === 1) {
      const greats = best.fromDistance - 2;
      return {
        kind: "aunt-uncle",
        label: `${greatPrefix(greats)}aunt or ${greatPrefix(greats)}uncle`,
        detail: `${personName(from)} is the child of ${personName(to)}'s sibling${through}.`,
        path,
      };
    }
    const degree = Math.min(best.fromDistance, best.toDistance) - 1;
    const removed = Math.abs(best.fromDistance - best.toDistance);
    return {
      kind: "cousin",
      label: `${ordinal(degree)} cousin${removed ? ` ${removedLabel(removed)}` : ""}`,
      detail: `Closest shared ancestor${through || " is not recorded"}.`,
      path,
    };
  }

  if (path.length > 1) {
    return {
      kind: "none",
      label: "related by marriage",
      detail:
        "No shared ancestor is recorded. The connection runs through partners, so the exact label depends on which line you follow.",
      path,
    };
  }

  return {
    kind: "none",
    label: "no relationship recorded",
    detail: "The tree has no path between these two people yet.",
    path,
  };
}

export function pathLabel(path: GraphPerson[]) {
  return path.map(personName).join(" > ");
}
