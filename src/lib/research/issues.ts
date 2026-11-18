import type { GraphPerson, GraphRelationship } from "~/api/people-server";
import {
  translate,
  type Locale,
  type TranslationKey,
  type TranslationParams,
} from "../../i18n";
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
  /** Key and params for the same title, so views can translate it. */
  titleKey: TranslationKey;
  titleParams: TranslationParams;
  detailKey: TranslationKey;
  detailParams: TranslationParams;
  personIds: string[];
};

const MINIMUM_PARENT_AGE = 12;

function definiteYear(value: FuzzyDate | null | undefined) {
  return fuzzyYear(value);
}

function sampleNames(people: GraphPerson[], locale: Locale = "en", limit = 4) {
  const names = people
    .slice(0, limit)
    .map(person => personName(person, locale));
  const remaining = people.length - names.length;
  if (!names.length) return "";
  if (remaining > 0) {
    return translate(locale, "research.issue.namesMore", {
      names: names.join(", "),
      count: remaining,
    });
  }
  return names.join(", ");
}

function issue(
  id: string,
  severity: ResearchIssueSeverity,
  category: ResearchIssueCategory,
  titleKey: TranslationKey,
  titleParams: TranslationParams,
  people: GraphPerson[],
  detailKey: TranslationKey,
  locale: Locale,
): ResearchIssue {
  const detailParams = { names: sampleNames(people, locale) };
  return {
    id,
    severity,
    category,
    title: translate(locale, titleKey, titleParams),
    titleKey,
    titleParams,
    detail: translate(locale, detailKey, detailParams),
    detailKey,
    detailParams,
    personIds: people.map(person => person.id),
  };
}

/**
 * A research queue, not a validator. Warnings are contradictions that cannot
 * all be true, so one of the records is wrong. Info items are gaps worth
 * chasing rather than errors.
 */
export function buildResearchIssues(
  index: ResearchIndex,
  locale: Locale = "en",
): ResearchIssue[] {
  const issues: ResearchIssue[] = [];

  const impossibleDates: GraphPerson[] = [];
  for (const person of index.people) {
    if (!person.birthDate || !person.deathDate) continue;
    const birth = fuzzyYearRange(person.birthDate);
    const death = fuzzyYearRange(person.deathDate);
    if (death.end < birth.start) impossibleDates.push(person);
  }
  if (impossibleDates.length) {
    const count = impossibleDates.length;
    issues.push(
      issue(
        "death-before-birth",
        "warning",
        "dates",
        "research.issue.deathBeforeBirth.title",
        { count },
        impossibleDates,
        "research.issue.deathBeforeBirth.detail",
        locale,
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
    const count = partnershipsOutOfOrder.length;
    const names = partnershipsOutOfOrder
      .map(relationship =>
        [index.peopleById.get(relationship.source), index.peopleById.get(relationship.target)]
          .filter((person): person is GraphPerson => Boolean(person))
          .map(person => personName(person, locale))
          .join(" & "),
      )
      .slice(0, 4);
    const detailParams = { names: names.join(", ") };
    issues.push({
      id: "partnership-end-before-start",
      severity: "warning",
      category: "dates",
      title: translate(locale, "research.issue.partnershipEndBeforeStart.title", {
        count,
      }),
      titleKey: "research.issue.partnershipEndBeforeStart.title",
      titleParams: { count },
      detail: translate(
        locale,
        "research.issue.partnershipEndBeforeStart.detail",
        detailParams,
      ),
      detailKey: "research.issue.partnershipEndBeforeStart.detail",
      detailParams,
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
        "research.issue.parentTooYoung.title",
        { count: earlyParents.length, age: MINIMUM_PARENT_AGE },
        earlyParents,
        "research.issue.parentTooYoung.detail",
        locale,
      ),
    );
  }
  if (posthumousChildren.length) {
    issues.push(
      issue(
        "child-after-parent-death",
        "warning",
        "relationships",
        "research.issue.childAfterParentDeath.title",
        { count: posthumousChildren.length },
        posthumousChildren,
        "research.issue.childAfterParentDeath.detail",
        locale,
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
        "research.issue.partnershipBeforeBirth.title",
        { count: marriedBeforeBirth.length },
        [...new Map(marriedBeforeBirth.map(person => [person.id, person])).values()],
        "research.issue.partnershipBeforeBirth.detail",
        locale,
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
        "research.issue.tooManyParents.title",
        { count: crowdedParentSets.length },
        crowdedParentSets,
        "research.issue.tooManyParents.detail",
        locale,
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
        "research.issue.unconnected.title",
        { count: unconnected.length },
        unconnected,
        "research.issue.unconnected.detail",
        locale,
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
        "research.issue.missingBirthDate.title",
        { count: missingBirthDate.length },
        missingBirthDate,
        "research.issue.missingBirthDate.detail",
        locale,
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
        "research.issue.missingBirthPlace.title",
        { count: missingBirthPlace.length },
        missingBirthPlace,
        "research.issue.missingBirthPlace.detail",
        locale,
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
        "research.issue.eventWithoutPlace.title",
        { count: datedEventsWithoutPlace.length },
        [
          ...new Map(
            datedEventsWithoutPlace.map(entry => [entry.person.id, entry.person]),
          ).values(),
        ],
        "research.issue.eventWithoutPlace.detail",
        locale,
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
    const count = possibleDuplicates.length;
    const detailParams = { names: sampleNames(people, locale) };
    issues.push({
      id: "possible-duplicates",
      severity: "info",
      category: "duplicates",
      title: translate(locale, "research.issue.possibleDuplicates.title", { count }),
      titleKey: "research.issue.possibleDuplicates.title",
      titleParams: { count },
      detail: translate(
        locale,
        "research.issue.possibleDuplicates.detail",
        detailParams,
      ),
      detailKey: "research.issue.possibleDuplicates.detail",
      detailParams,
      personIds: people.map(person => person.id),
    });
  }

  return issues.sort((left, right) => {
    if (left.severity !== right.severity) return left.severity === "warning" ? -1 : 1;
    return right.personIds.length - left.personIds.length || left.title.localeCompare(right.title);
  });
}

export const ISSUE_CATEGORY_KEYS: Record<ResearchIssueCategory, TranslationKey> = {
  dates: "research.issues.category.dates",
  relationships: "research.issues.category.relationships",
  records: "research.issues.category.records",
  duplicates: "research.issues.category.duplicates",
};

export const ISSUE_CATEGORY_LABELS: Record<ResearchIssueCategory, string> = {
  dates: translate("en", ISSUE_CATEGORY_KEYS.dates),
  relationships: translate("en", ISSUE_CATEGORY_KEYS.relationships),
  records: translate("en", ISSUE_CATEGORY_KEYS.records),
  duplicates: translate("en", ISSUE_CATEGORY_KEYS.duplicates),
};
