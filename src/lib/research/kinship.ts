import type { GraphPerson } from "~/api/people-server";
import { translate, type Locale, type TranslationKey } from "../../i18n";
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

const ORDINAL_KEYS: Record<number, TranslationKey> = {
  2: "research.kinship.ordinal.2",
  3: "research.kinship.ordinal.3",
  4: "research.kinship.ordinal.4",
  5: "research.kinship.ordinal.5",
  6: "research.kinship.ordinal.6",
  7: "research.kinship.ordinal.7",
  8: "research.kinship.ordinal.8",
  9: "research.kinship.ordinal.9",
  10: "research.kinship.ordinal.10",
};

function ordinal(degree: number, locale: Locale) {
  const key = ORDINAL_KEYS[degree];
  return key
    ? translate(locale, key)
    : translate(locale, "research.kinship.ordinal.many", { degree });
}

/**
 * The prefix that turns "aunt" into "great-aunt". English repeats "great-",
 * Italian puts "pro" in front of the noun ("prozio", "pro-prozio").
 */
function greatPrefix(steps: number, locale: Locale) {
  if (steps <= 0) return "";
  if (locale === "it") return `${"pro-".repeat(steps - 1)}pro`;
  return "great-".repeat(steps);
}

export function ancestorLabel(distance: number, locale: Locale = "en") {
  if (distance <= 0) return translate(locale, "research.kinship.self");
  if (distance === 1) return translate(locale, "research.kinship.ancestor.parent");
  if (distance === 2)
    return translate(locale, "research.kinship.ancestor.grandparent");
  if (distance === 3)
    return translate(locale, "research.kinship.ancestor.greatGrandparent");
  return translate(locale, "research.kinship.ancestor.far", {
    generation: distance,
  });
}

export function descendantLabel(distance: number, locale: Locale = "en") {
  if (distance <= 0) return translate(locale, "research.kinship.self");
  if (distance === 1) return translate(locale, "research.kinship.descendant.child");
  if (distance === 2)
    return translate(locale, "research.kinship.descendant.grandchild");
  if (distance === 3)
    return translate(locale, "research.kinship.descendant.greatGrandchild");
  return translate(locale, "research.kinship.descendant.far", {
    generation: distance,
  });
}

function cousinLabel(degree: number, removed: number, locale: Locale) {
  if (degree === 1 && !removed) {
    return translate(locale, "research.kinship.cousin.first");
  }
  if (degree === 1) {
    return translate(locale, "research.kinship.cousin.firstRemoved", {
      count: removed,
    });
  }
  const params = { ordinal: ordinal(degree, locale), count: removed };
  return removed
    ? translate(locale, "research.kinship.cousin.otherRemoved", params)
    : translate(locale, "research.kinship.cousin.other", params);
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
  locale: Locale = "en",
): KinshipResult | null {
  const from = index.peopleById.get(fromId);
  const to = index.peopleById.get(toId);
  if (!from || !to) return null;

  const path = pathBetween(index, fromId, toId);
  const fromName = personName(from, locale);
  const toName = personName(to, locale);

  if (fromId === toId) {
    return {
      kind: "same",
      label: translate(locale, "research.kinship.same"),
      detail: fromName,
      path,
    };
  }

  const fromAncestors = ancestorDistances(index, fromId);
  const toAncestors = ancestorDistances(index, toId);

  const asAncestor = fromAncestors.get(toId);
  if (asAncestor !== undefined) {
    return {
      kind: "ancestor",
      label: ancestorLabel(asAncestor, locale),
      detail: translate(locale, "research.kinship.detail.ancestor", {
        from: fromName,
        to: toName,
      }),
      path,
    };
  }

  const asDescendant = toAncestors.get(fromId);
  if (asDescendant !== undefined) {
    return {
      kind: "descendant",
      label: descendantLabel(asDescendant, locale),
      detail: translate(locale, "research.kinship.detail.descendant", {
        from: fromName,
        to: toName,
      }),
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
    const through = ancestor
      ? translate(locale, "research.kinship.through", {
          name: personName(ancestor, locale),
        })
      : "";
    if (best.fromDistance === 1 && best.toDistance === 1) {
      return {
        kind: "sibling",
        label: translate(locale, "research.kinship.sibling"),
        detail: translate(locale, "research.kinship.detail.sibling", {
          from: fromName,
          to: toName,
          through,
        }),
        path,
      };
    }
    if (best.fromDistance === 1) {
      const greats = best.toDistance - 2;
      return {
        kind: "niece-nephew",
        label: greats > 0
          ? translate(locale, "research.kinship.nieceNephew.great", {
              prefix: greatPrefix(greats, locale),
            })
          : translate(locale, "research.kinship.nieceNephew"),
        detail: translate(locale, "research.kinship.detail.nieceNephew", {
          from: fromName,
          to: toName,
          through,
        }),
        path,
      };
    }
    if (best.toDistance === 1) {
      const greats = best.fromDistance - 2;
      return {
        kind: "aunt-uncle",
        label: greats > 0
          ? translate(locale, "research.kinship.auntUncle.great", {
              prefix: greatPrefix(greats, locale),
            })
          : translate(locale, "research.kinship.auntUncle"),
        detail: translate(locale, "research.kinship.detail.auntUncle", {
          from: fromName,
          to: toName,
          through,
        }),
        path,
      };
    }
    const degree = Math.min(best.fromDistance, best.toDistance) - 1;
    const removed = Math.abs(best.fromDistance - best.toDistance);
    return {
      kind: "cousin",
      label: cousinLabel(degree, removed, locale),
      detail: ancestor
        ? translate(locale, "research.kinship.detail.cousin", { through })
        : translate(locale, "research.kinship.detail.cousinUnknown"),
      path,
    };
  }

  if (path.length > 1) {
    return {
      kind: "none",
      label: translate(locale, "research.kinship.marriage"),
      detail: translate(locale, "research.kinship.detail.marriage"),
      path,
    };
  }

  return {
    kind: "none",
    label: translate(locale, "research.kinship.none"),
    detail: translate(locale, "research.kinship.detail.none"),
    path,
  };
}

export function pathLabel(path: GraphPerson[], locale: Locale = "en") {
  return path
    .map(person => personName(person, locale))
    .join(translate(locale, "research.kinship.pathSeparator"));
}
