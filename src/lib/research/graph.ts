import type {
  GraphFile,
  GraphPerson,
  GraphPersonEvent,
  GraphRelationship,
  TreeGraph,
} from "~/api/people-server";
import { translate, type Locale } from "../../i18n";
import { compareFuzzyDates, type FuzzyDate } from "../fuzzy-date";

export type ParentType = Extract<GraphRelationship, { type: "parent" }>["parentType"];
export type PartnershipStatus = Extract<
  GraphRelationship,
  { type: "partner" }
>["status"];

export type ParentLink = {
  person: GraphPerson;
  parentType: ParentType;
};

export type PartnerLink = {
  person: GraphPerson;
  relationshipId: string;
  status: PartnershipStatus;
  startDate: FuzzyDate | null;
  endDate: FuzzyDate | null;
};

/**
 * A couple or single parent and the children recorded under them.
 *
 * Children are grouped by their exact parent set, so a second marriage and a
 * single-parent record each get their own sheet instead of being merged.
 */
export type FamilyUnit = {
  key: string;
  parents: GraphPerson[];
  children: GraphPerson[];
  partnership: PartnerLink | null;
  events: GraphPersonEvent[];
};

export type ResearchIndex = {
  people: GraphPerson[];
  peopleById: Map<string, GraphPerson>;
  parents: Map<string, ParentLink[]>;
  children: Map<string, GraphPerson[]>;
  partners: Map<string, PartnerLink[]>;
  events: Map<string, GraphPersonEvent[]>;
  files: Map<string, GraphFile[]>;
  /** Child groupings keyed by sorted parent ids. */
  parentSets: Map<string, { parentIds: string[]; childIds: string[] }>;
  relationships: GraphRelationship[];
};

const PARENT_TYPE_PRIORITY: Record<ParentType, number> = {
  biological: 0,
  adoptive: 1,
  foster: 2,
  step: 3,
  unknown: 4,
};

export function familyKey(parentIds: string[]) {
  return [...parentIds].sort().join("|");
}

export function personName(
  person: Pick<GraphPerson, "displayName" | "firstName" | "lastName" | "nickname">,
  locale: Locale = "en",
) {
  const full = `${person.firstName} ${person.lastName}`.trim();
  return (
    person.displayName ||
    full ||
    person.nickname ||
    translate(locale, "research.person.unnamed")
  );
}

export function buildResearchIndex(graph: Pick<TreeGraph, "people" | "relationships" | "events" | "files">): ResearchIndex {
  const peopleById = new Map(graph.people.map(person => [person.id, person]));
  const parents = new Map<string, ParentLink[]>();
  const children = new Map<string, GraphPerson[]>();
  const partners = new Map<string, PartnerLink[]>();

  for (const relationship of graph.relationships) {
    if (relationship.type === "parent") {
      const parent = peopleById.get(relationship.source);
      const child = peopleById.get(relationship.target);
      if (!parent || !child) continue;

      const parentLinks = parents.get(child.id) ?? [];
      parentLinks.push({ person: parent, parentType: relationship.parentType });
      parents.set(child.id, parentLinks);

      const childLinks = children.get(parent.id) ?? [];
      childLinks.push(child);
      children.set(parent.id, childLinks);
      continue;
    }

    const a = peopleById.get(relationship.source);
    const b = peopleById.get(relationship.target);
    if (!a || !b) continue;
    const link = (
      person: GraphPerson,
      other: GraphPerson,
    ): PartnerLink => ({
      person: other,
      relationshipId: relationship.id,
      status: relationship.status,
      startDate: relationship.startDate,
      endDate: relationship.endDate,
    });
    partners.set(a.id, [...(partners.get(a.id) ?? []), link(a, b)]);
    partners.set(b.id, [...(partners.get(b.id) ?? []), link(b, a)]);
  }

  for (const [childId, links] of parents) {
    links.sort((left, right) => {
      const priority =
        PARENT_TYPE_PRIORITY[left.parentType] - PARENT_TYPE_PRIORITY[right.parentType];
      if (priority !== 0) return priority;
      const dates = compareFuzzyDates(left.person.birthDate, right.person.birthDate);
      return dates !== 0 ? dates : left.person.id.localeCompare(right.person.id);
    });
    parents.set(childId, links);
  }

  for (const [parentId, links] of children) {
    children.set(
      parentId,
      [...links].sort(sortPeopleByBirth),
    );
  }

  const events = new Map<string, GraphPersonEvent[]>();
  // A shared marriage or divorce belongs on both timelines.
  for (const event of graph.events) {
    const participants = new Set([event.personId, event.partnerPersonId ?? null]);
    for (const personId of participants) {
      if (!personId || !peopleById.has(personId)) continue;
      events.set(personId, [...(events.get(personId) ?? []), event]);
    }
  }
  for (const [personId, list] of events) {
    events.set(
      personId,
      [...list].sort((left, right) => {
        const dates = compareFuzzyDates(left.date, right.date);
        return dates !== 0 ? dates : left.id.localeCompare(right.id);
      }),
    );
  }

  const files = new Map<string, GraphFile[]>();
  for (const file of graph.files) {
    const ownerIds = new Set([
      ...(file.personId ? [file.personId] : []),
      ...file.taggedPersonIds,
    ]);
    for (const personId of ownerIds) {
      if (!peopleById.has(personId)) continue;
      files.set(personId, [...(files.get(personId) ?? []), file]);
    }
  }
  for (const [personId, list] of files) {
    files.set(
      personId,
      [...list].sort((left, right) => compareFuzzyDates(left.takenAt, right.takenAt)),
    );
  }

  const parentSets = new Map<string, { parentIds: string[]; childIds: string[] }>();
  for (const [childId, links] of parents) {
    const parentIds = [...new Set(links.map(link => link.person.id))].sort();
    const key = familyKey(parentIds);
    const set = parentSets.get(key) ?? { parentIds, childIds: [] };
    set.childIds.push(childId);
    parentSets.set(key, set);
  }
  for (const set of parentSets.values()) {
    set.childIds.sort((left, right) => {
      const a = peopleById.get(left);
      const b = peopleById.get(right);
      if (!a || !b) return left.localeCompare(right);
      return sortPeopleByBirth(a, b);
    });
  }

  return {
    people: graph.people,
    peopleById,
    parents,
    children,
    partners,
    events,
    files,
    parentSets,
    relationships: graph.relationships,
  };
}

export function sortPeopleByBirth(a: GraphPerson, b: GraphPerson) {
  const dates = compareFuzzyDates(a.birthDate, b.birthDate);
  if (dates !== 0) return dates;
  return personName(a).localeCompare(personName(b));
}

export function parentsOf(index: ResearchIndex, personId: string) {
  return index.parents.get(personId) ?? [];
}

export function childrenOf(index: ResearchIndex, personId: string) {
  return index.children.get(personId) ?? [];
}

export function partnersOf(index: ResearchIndex, personId: string) {
  return index.partners.get(personId) ?? [];
}

export function eventsOf(index: ResearchIndex, personId: string) {
  return index.events.get(personId) ?? [];
}

export function filesOf(index: ResearchIndex, personId: string) {
  return index.files.get(personId) ?? [];
}

export function siblingsOf(index: ResearchIndex, personId: string) {
  const siblings = new Map<string, GraphPerson>();
  for (const parent of parentsOf(index, personId)) {
    for (const child of childrenOf(index, parent.person.id)) {
      if (child.id !== personId) siblings.set(child.id, child);
    }
  }
  return [...siblings.values()].sort(sortPeopleByBirth);
}

export function sharedChildren(
  index: ResearchIndex,
  personId: string,
  partnerId: string,
) {
  return childrenOf(index, personId).filter(child =>
    parentsOf(index, child.id).some(parent => parent.person.id === partnerId),
  );
}

export function partnershipBetween(
  index: ResearchIndex,
  aId: string,
  bId: string,
) {
  return partnersOf(index, aId).find(link => link.person.id === bId) ?? null;
}

/** The immediate family units a person belongs to, as a parent first. */
export function familiesForPerson(index: ResearchIndex, personId: string) {
  const all = buildFamilyUnits(index);
  const asParent = all.filter(unit =>
    unit.parents.some(parent => parent.id === personId),
  );
  if (asParent.length) return asParent;
  return all.filter(unit => unit.children.some(child => child.id === personId));
}

/** One shared event sits on both parents' timelines, so a family lists it once. */
function familyEvents(...lists: GraphPersonEvent[][]): GraphPersonEvent[] {
  const seen = new Set<string>();
  const events: GraphPersonEvent[] = [];
  for (const list of lists) {
    for (const event of list) {
      if (seen.has(event.id)) continue;
      seen.add(event.id);
      events.push(event);
    }
  }
  return events.sort((left, right) => {
    const dates = compareFuzzyDates(left.date, right.date);
    return dates !== 0 ? dates : left.id.localeCompare(right.id);
  });
}

export function buildFamilyUnits(index: ResearchIndex): FamilyUnit[] {
  const units: FamilyUnit[] = [];
  const covered = new Set<string>();

  for (const [key, set] of index.parentSets) {
    const order = new Map<string, number>();
    for (const childId of set.childIds) {
      parentsOf(index, childId).forEach((link, position) => {
        if (!order.has(link.person.id)) order.set(link.person.id, position);
      });
    }
    const parents = set.parentIds
      .map(id => index.peopleById.get(id))
      .filter((person): person is GraphPerson => Boolean(person))
      .sort(
        (left, right) =>
          (order.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
          (order.get(right.id) ?? Number.MAX_SAFE_INTEGER),
      );
    if (!parents.length) continue;
    const children = set.childIds
      .map(id => index.peopleById.get(id))
      .filter((person): person is GraphPerson => Boolean(person))
      .sort(sortPeopleByBirth);
    for (const parent of parents) covered.add(parent.id);
    for (const child of children) covered.add(child.id);
    units.push({
      key,
      parents,
      children,
      partnership:
        parents.length === 2
          ? partnershipBetween(index, parents[0].id, parents[1].id)
          : null,
      events: familyEvents(...parents.map(parent => eventsOf(index, parent.id))),
    });
  }

  for (const person of index.people) {
    for (const partner of partnersOf(index, person.id)) {
      if (person.id > partner.person.id) continue;
      const key = familyKey([person.id, partner.person.id]);
      if (units.some(unit => unit.key === key)) continue;
      if (childrenOf(index, person.id).some(child =>
        parentsOf(index, child.id).some(parent => parent.person.id === partner.person.id),
      )) {
        continue;
      }
      covered.add(person.id);
      covered.add(partner.person.id);
      units.push({
        key,
        parents: [person, partner.person],
        children: [],
        partnership: partner,
        events: familyEvents(
          eventsOf(index, person.id),
          eventsOf(index, partner.person.id),
        ),
      });
    }
  }

  for (const person of index.people) {
    if (covered.has(person.id)) continue;
    units.push({
      key: familyKey([person.id]),
      parents: [person],
      children: childrenOf(index, person.id).sort(sortPeopleByBirth),
      partnership: null,
      events: eventsOf(index, person.id),
    });
  }

  return units.sort((left, right) => {
    const leftName = left.parents[0] ? personName(left.parents[0]) : "";
    const rightName = right.parents[0] ? personName(right.parents[0]) : "";
    return leftName.localeCompare(rightName) || left.key.localeCompare(right.key);
  });
}

export function familyLabel(unit: FamilyUnit, locale: Locale = "en") {
  const separator = translate(locale, "research.family.separator");
  const names = unit.parents.map(parent => personName(parent, locale));
  const parents = names.length
    ? names.join(separator)
    : translate(locale, "research.family.unknownParents");
  const childCount = unit.children.length;
  const children = childCount
    ? translate(locale, "research.childCount", { count: childCount })
    : translate(locale, "research.family.noChildren");
  return translate(locale, "research.family.label", { parents, children });
}
