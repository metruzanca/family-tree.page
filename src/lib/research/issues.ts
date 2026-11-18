import type { GraphPerson, GraphRelationship } from "~/api/people-server";
import {
  fuzzyDatesOverlap,
  fuzzyYear,
  fuzzyYearRange,
  type FuzzyDate,
} from "../fuzzy-date";
import { normalizeName } from "../duplicates";
import {
  childrenOf,
  parentsOf,
  partnersOf,
  personName,
  type ResearchIndex,
} from "./graph";

export type ResearchIssueSeverity = "warning" | "info";
export type ResearchIssueCategory =
  | "dates"
  | "relationships"
  | "records"
  | "duplicates";

export type ResearchIssue = {
  id: string;
  severity: ResearchIssueSeverity;
  category: ResearchIssueCategory;
  title: string;
  detail: string;
  personIds: string[];
};

const MINIMUM_PARENT_AGE = 12;

function definiteYear(value: FuzzyDate | null | undefined) {
  return fuzzyYear(value);
}

function sampleNames(people: GraphPerson[], limit = 4) {
  const names = people.slice(0, limit).map(personName);
  const remaining = people.length - names.length;
  if (!names.length) return "";
  if (remaining > 0) return `${names.join(", ")} and ${remaining} more`;
  return names.join(", ");
}

function issue(
  id: string,
  severity: ResearchIssueSeverity,
  category: ResearchIssueCategory,
  title: string,
  people: GraphPerson[],
  detail: string,
): ResearchIssue {
  return {
    id,
    severity,
    category,
    title,
    detail: `${detail} ${sampleNames(people)}`.trim(),
    personIds: people.map(person => person.id),
  };
}

/**
 * A research queue, not a validator. Warnings are contradictions that cannot
 * all be true, so one of the records is wrong. Info items are gaps worth
 * chasing rather than errors.
 */
export function buildResearchIssues(index: ResearchIndex): ResearchIssue[] {
  const issues: ResearchIssue[] = [];

  const impossibleDates: GraphPerson[] = [];
  for (const person of index.people) {
    if (!person.birthDate || !person.deathDate) continue;
    const birth = fuzzyYearRange(person.birthDate);
    const death = fuzzyYearRange(person.deathDate);
    if (death.end < birth.start) impossibleDates.push(person);
  }
  if (impossibleDates.length) {
    issues.push(
      issue(
        "death-before-birth",
        "warning",
        "dates",
        `${impossibleDates.length} ${impossibleDates.length === 1 ? "person dies" : "people die"} before birth`,
        impossibleDates,
        "The death year is earlier than the birth year.",
      ),
    );
  }

  const partnershipsOutOfOrder = index.relationships.filter(
    (
      relationship,
    ): relationship is Extract<GraphRelationship, { type: "partner" }> =>
      relationship.type === "partner" &&
      definiteYear(relationship.startDate) !== null &&
      definiteYear(relationship.endDate) !== null &&
      definiteYear(relationship.endDate)! < definiteYear(relationship.startDate)!,
  );
  if (partnershipsOutOfOrder.length) {
    const names = partnershipsOutOfOrder
      .map(relationship =>
        [index.peopleById.get(relationship.source), index.peopleById.get(relationship.target)]
          .filter((person): person is GraphPerson => Boolean(person))
          .map(personName)
          .join(" & "),
      )
      .slice(0, 4);
    issues.push({
      id: "partnership-end-before-start",
      severity: "warning",
      category: "dates",
      title: `${partnershipsOutOfOrder.length} ${
        partnershipsOutOfOrder.length === 1 ? "partnership ends" : "partnerships end"
      } before they start`,
      detail: names.join(", "),
      personIds: partnershipsOutOfOrder.flatMap(relationship => [
        relationship.source,
        relationship.target,
      ]),
    });
  }

  const earlyParents: GraphPerson[] = [];
  const posthumousChildren: GraphPerson[] = [];
  for (const child of index.people) {
    const childBirth = definiteYear(child.birthDate);
    if (childBirth === null) continue;
    for (const parent of parentsOf(index, child.id)) {
      const parentBirth = definiteYear(parent.person.birthDate);
      if (parentBirth !== null && childBirth - parentBirth < MINIMUM_PARENT_AGE) {
        earlyParents.push(child);
        break;
      }
    }
    for (const parent of parentsOf(index, child.id)) {
      const parentDeath = definiteYear(parent.person.deathDate);
      if (parentDeath !== null && childBirth > parentDeath + 1) {
        posthumousChildren.push(child);
        break;
      }
    }
  }
  if (earlyParents.length) {
    issues.push(
      issue(
        "parent-too-young",
        "warning",
        "relationships",
        `${earlyParents.length} ${
          earlyParents.length === 1 ? "person has" : "people have"
        } a parent under ${MINIMUM_PARENT_AGE}`,
        earlyParents,
        "Check the birth year of the child, the parent, or the relationship.",
      ),
    );
  }
  if (posthumousChildren.length) {
    issues.push(
      issue(
        "child-after-parent-death",
        "warning",
        "relationships",
        `${posthumousChildren.length} ${
          posthumousChildren.length === 1 ? "child is born" : "children are born"
        } more than a year after a parent died`,
        posthumousChildren,
        "A posthumous birth is possible, but a gap this size usually means a wrong date or the wrong parent.",
      ),
    );
  }

  const marriedBeforeBirth: GraphPerson[] = [];
  for (const relationship of index.relationships) {
    if (relationship.type !== "partner") continue;
    const start = definiteYear(relationship.startDate);
    if (start === null) continue;
    const a = index.peopleById.get(relationship.source);
    const b = index.peopleById.get(relationship.target);
    const partners = [a, b].filter((person): person is GraphPerson => Boolean(person));
    if (partners.some(person => {
      const birth = definiteYear(person.birthDate);
      return birth !== null && birth > start;
    })) {
      marriedBeforeBirth.push(...partners);
    }
  }
  if (marriedBeforeBirth.length) {
    issues.push(
      issue(
        "partnership-before-birth",
        "warning",
        "dates",
        `${marriedBeforeBirth.length} ${
          marriedBeforeBirth.length === 1 ? "person" : "people"
        } in a partnership that starts before they were born`,
        [...new Map(marriedBeforeBirth.map(person => [person.id, person])).values()],
        "The partnership start year is earlier than a partner's birth year.",
      ),
    );
  }

  const crowdedParentSets: GraphPerson[] = [];
  for (const [childId, links] of index.parents) {
    if (new Set(links.map(link => link.person.id)).size > 2) {
      const child = index.peopleById.get(childId);
      if (child) crowdedParentSets.push(child);
    }
  }
  if (crowdedParentSets.length) {
    issues.push(
      issue(
        "too-many-parents",
        "warning",
        "relationships",
        `${crowdedParentSets.length} ${
          crowdedParentSets.length === 1 ? "person has" : "people have"
        } more than two parents`,
        crowdedParentSets,
        "Adoptive, foster, and step parents are valid, but the pedigree chart can only place two.",
      ),
    );
  }

  const unconnected = index.people.filter(
    person =>
      !parentsOf(index, person.id).length &&
      !childrenOf(index, person.id).length &&
      !partnersOf(index, person.id).length &&
      index.people.length > 1,
  );
  if (unconnected.length) {
    issues.push(
      issue(
        "unconnected-people",
        "info",
        "relationships",
        `${unconnected.length} ${
          unconnected.length === 1 ? "person has" : "people have"
        } no recorded relationships`,
        unconnected,
        "They may be additions waiting for a link, or a scan the tree missed.",
      ),
    );
  }

  const missingBirthDate = index.people.filter(person => !person.birthDate);
  if (missingBirthDate.length) {
    issues.push(
      issue(
        "missing-birth-date",
        "info",
        "records",
        `${missingBirthDate.length} ${
          missingBirthDate.length === 1 ? "person has" : "people have"
        } no birth date`,
        missingBirthDate,
        "Even an approximate year makes ordering and duplicate checks work.",
      ),
    );
  }

  const missingBirthPlace = index.people.filter(
    person => person.birthDate && !person.birthPlace,
  );
  if (missingBirthPlace.length) {
    issues.push(
      issue(
        "missing-birth-place",
        "info",
        "records",
        `${missingBirthPlace.length} ${
          missingBirthPlace.length === 1 ? "birth has" : "births have"
        } no place`,
        missingBirthPlace,
        "The place index is how most record searches start.",
      ),
    );
  }

  const datedEventsWithoutPlace: Array<{ person: GraphPerson }> = [];
  for (const person of index.people) {
    for (const event of index.events.get(person.id) ?? []) {
      if (event.date && !event.place) datedEventsWithoutPlace.push({ person });
    }
  }
  if (datedEventsWithoutPlace.length) {
    issues.push(
      issue(
        "event-without-place",
        "info",
        "records",
        `${datedEventsWithoutPlace.length} ${
          datedEventsWithoutPlace.length === 1 ? "event has" : "events have"
        } a date but no place`,
        [
          ...new Map(
            datedEventsWithoutPlace.map(entry => [entry.person.id, entry.person]),
          ).values(),
        ],
        "Add the place so the event shows up in the place index.",
      ),
    );
  }

  const duplicateGroups = new Map<string, GraphPerson[]>();
  for (const person of index.people) {
    const key = normalizeName(`${person.firstName} ${person.lastName}`);
    if (!key) continue;
    duplicateGroups.set(key, [...(duplicateGroups.get(key) ?? []), person]);
  }
  const possibleDuplicates = [...duplicateGroups.values()].filter(group => {
    if (group.length < 2) return false;
    for (let left = 0; left < group.length; left += 1) {
      for (let right = left + 1; right < group.length; right += 1) {
        const a = group[left];
        const b = group[right];
        if (!a.birthDate || !b.birthDate) return true;
        if (fuzzyDatesOverlap(a.birthDate, b.birthDate)) return true;
      }
    }
    return false;
  });
  if (possibleDuplicates.length) {
    const people = possibleDuplicates.flat();
    issues.push({
      id: "possible-duplicates",
      severity: "info",
      category: "duplicates",
      title: `${possibleDuplicates.length} ${
        possibleDuplicates.length === 1 ? "name appears" : "names appear"
      } more than once`,
      detail: sampleNames(people),
      personIds: people.map(person => person.id),
    });
  }

  return issues.sort((left, right) => {
    if (left.severity !== right.severity) return left.severity === "warning" ? -1 : 1;
    return right.personIds.length - left.personIds.length || left.title.localeCompare(right.title);
  });
}

export const ISSUE_CATEGORY_LABELS: Record<ResearchIssueCategory, string> = {
  dates: "Dates",
  relationships: "Relationships",
  records: "Records",
  duplicates: "Duplicates",
};
