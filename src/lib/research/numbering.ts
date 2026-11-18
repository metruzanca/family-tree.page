import type { GraphPerson } from "~/api/people-server";
import { translate, type Locale } from "../../i18n";
import {
  childrenOf,
  parentsOf,
  sortPeopleByBirth,
  type ResearchIndex,
} from "./graph";

/**
 * Ahnentafel, the standard ancestor numbering. The subject is 1, a person's
 * parents are 2n and 2n+1, so an ancestor's number can be derived without
 * building the full chart.
 *
 * The tree model has no recorded sex, so the two parent slots are labelled
 * "parent A" (even) and "parent B" (odd) instead of father and mother. A sex
 * field is the first data-model follow-up: it would let these slots carry the
 * conventional labels without guessing.
 */
export type PedigreeRole = "self" | "parent-a" | "parent-b";

export type PedigreeSlot = {
  number: number;
  generation: number;
  person: GraphPerson | null;
  role: PedigreeRole;
  /** Parents recorded beyond the two this chart can place. */
  extraParents: GraphPerson[];
};

export type PedigreeGeneration = {
  generation: number;
  slots: PedigreeSlot[];
};

export type Pedigree = {
  root: GraphPerson;
  generations: PedigreeGeneration[];
  slots: PedigreeSlot[];
  /** True when an ancestor at the deepest level still has parents. */
  truncated: boolean;
};

export const MAX_PEDIGREE_GENERATIONS = 7;

export function pedigreeSlotLabel(slot: PedigreeSlot, locale: Locale = "en") {
  if (slot.role === "self") return translate(locale, "research.pedigree.role.self");
  if (slot.person?.sex === "male") return translate(locale, "research.pedigree.role.father");
  if (slot.person?.sex === "female") return translate(locale, "research.pedigree.role.mother");
  return translate(locale, "research.pedigree.role.parent");
}

export function generationOfAhnentafel(number: number) {
  if (number < 1) return 0;
  return Math.floor(Math.log2(number)) + 1;
}

export function buildPedigree(
  index: ResearchIndex,
  rootId: string,
  maxGenerations = MAX_PEDIGREE_GENERATIONS,
): Pedigree | null {
  const root = index.peopleById.get(rootId);
  if (!root) return null;

  const slots = new Map<number, PedigreeSlot>();
  slots.set(1, {
    number: 1,
    generation: 1,
    person: root,
    role: "self",
    extraParents: [],
  });

  let frontier = [1];
  let truncated = false;

  for (let generation = 1; generation < maxGenerations; generation += 1) {
    const next: number[] = [];
    for (const number of frontier) {
      const slot = slots.get(number);
      if (!slot?.person) continue;
      const parents = parentsOf(index, slot.person.id)
        .map(link => link.person)
        .sort(sortPeopleByBirth);
      const placed = parents.slice(0, 2);
      placed.forEach((parent, position) => {
        const childNumber = number * 2 + position;
        slots.set(childNumber, {
          number: childNumber,
          generation: generation + 1,
          person: parent,
          role: position === 0 ? "parent-a" : "parent-b",
          extraParents: [],
        });
        next.push(childNumber);
      });
      if (parents.length > 2) {
        slot.extraParents = parents.slice(2);
      }
    }
    frontier = next;
    if (!frontier.length) break;
    if (generation + 1 === maxGenerations) {
      truncated = frontier.some(number => {
        const slot = slots.get(number);
        return Boolean(slot?.person && parentsOf(index, slot.person.id).length);
      });
    }
  }

  const ordered = [...slots.values()].sort((a, b) => a.number - b.number);
  const generations: PedigreeGeneration[] = [];
  for (const slot of ordered) {
    const existing = generations.find(row => row.generation === slot.generation);
    if (existing) existing.slots.push(slot);
    else generations.push({ generation: slot.generation, slots: [slot] });
  }

  return { root, generations, slots: ordered, truncated };
}

export type RegisterMode = "register" | "ngsq";

export type DescendantEntry = {
  person: GraphPerson;
  generation: number;
  /** Register subject number, or null for a child who is not carried forward. */
  number: number | null;
  /** Lowercase Roman label within the parent family, starting at i. */
  childLabel: string | null;
  hasDescendants: boolean;
  children: DescendantEntry[];
};

export type DescendantRegister = {
  root: DescendantEntry;
  mode: RegisterMode;
  truncated: boolean;
};

export const MAX_REGISTER_GENERATIONS = 9;

export function roman(value: number) {
  if (!Number.isInteger(value) || value < 1 || value > 3999) return String(value);
  const table: Array<[number, string]> = [
    [1000, "m"],
    [900, "cm"],
    [500, "d"],
    [400, "cd"],
    [100, "c"],
    [90, "xc"],
    [50, "l"],
    [40, "xl"],
    [10, "x"],
    [9, "ix"],
    [5, "v"],
    [4, "iv"],
    [1, "i"],
  ];
  let remaining = value;
  let result = "";
  for (const [amount, numeral] of table) {
    while (remaining >= amount) {
      result += numeral;
      remaining -= amount;
    }
  }
  return result;
}

/**
 * The Register system numbers only the people whose line is carried forward,
 * and labels each child with a lowercase Roman numeral. The NGSQ system
 * numbers everyone in reading order and marks continuing lines with a plus,
 * which the UI renders from `hasDescendants`.
 */
export function buildDescendantRegister(
  index: ResearchIndex,
  rootId: string,
  mode: RegisterMode = "register",
  maxGenerations = MAX_REGISTER_GENERATIONS,
): DescendantRegister | null {
  const root = index.peopleById.get(rootId);
  if (!root) return null;

  let nextNumber = 2;
  let truncated = false;

  const walk = (
    person: GraphPerson,
    generation: number,
    subjectNumber: number,
    childLabel: string | null,
    ancestors: Set<string>,
  ): DescendantEntry => {
    const kids = childrenOf(index, person.id)
      .filter(child => !ancestors.has(child.id))
      .sort(sortPeopleByBirth);
    const hasDescendants = kids.length > 0;

    const children: DescendantEntry[] = [];
    if (generation < maxGenerations) {
      kids.forEach((child, position) => {
        const label = roman(position + 1);
        const nextAncestors = new Set(ancestors).add(person.id);
        if (mode === "register") {
          const number = childHasLine(index, child, nextAncestors) ? nextNumber++ : null;
          children.push(walk(child, generation + 1, number ?? 0, label, nextAncestors));
          return;
        }
        const number = nextNumber++;
        children.push(walk(child, generation + 1, number, label, nextAncestors));
      });
    } else if (kids.length) {
      truncated = true;
    }

    return {
      person,
      generation,
      number: subjectNumber || null,
      childLabel,
      hasDescendants,
      children,
    };
  };

  const rootEntry = walk(root, 1, 1, null, new Set());

  // NGSQ numbers the root first, then each descendant in reading order.
  if (mode === "ngsq") {
    let counter = 1;
    const renumber = (entry: DescendantEntry) => {
      entry.number = counter++;
      entry.children.forEach(renumber);
    };
    renumber(rootEntry);
  }

  return { root: rootEntry, mode, truncated };
}

function childHasLine(
  index: ResearchIndex,
  person: GraphPerson,
  ancestors: Set<string>,
) {
  return childrenOf(index, person.id).some(child => !ancestors.has(child.id));
}

/** Flattens a register tree for a printable list, depth first. */
export function flattenRegister(root: DescendantEntry): DescendantEntry[] {
  const rows: DescendantEntry[] = [];
  const visit = (entry: DescendantEntry) => {
    rows.push(entry);
    entry.children.forEach(visit);
  };
  visit(root);
  return rows;
}
