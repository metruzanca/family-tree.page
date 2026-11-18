import type {
  GraphFile,
  GraphPerson,
  GraphPersonEvent,
} from "~/api/people-server";
import {
  formatFuzzyDate,
  formatFuzzyYears,
  fuzzySortValue,
  fuzzyYear,
  type FuzzyDate,
} from "../fuzzy-date";
import { personEventKindLabel, type PersonEventKind } from "../person-events";
import {
  childrenOf,
  eventsOf,
  filesOf,
  parentsOf,
  partnersOf,
  siblingsOf,
  sortPeopleByBirth,
  type ParentLink,
  type PartnerLink,
  type ResearchIndex,
} from "./graph";

export type TimelineItem = {
  id: string;
  kind: "birth" | "death" | "event";
  label: string;
  date: FuzzyDate | null;
  place: string | null;
  description: string | null;
  eventKind: PersonEventKind | null;
  sort: number;
};

export type DossierPartner = PartnerLink & {
  children: GraphPerson[];
};

export type PersonDossier = {
  person: GraphPerson;
  parents: ParentLink[];
  partners: DossierPartner[];
  children: GraphPerson[];
  siblings: GraphPerson[];
  timeline: TimelineItem[];
  files: GraphFile[];
  events: GraphPersonEvent[];
  missing: string[];
  lifespan: string;
  ageAtDeath: number | null;
  ageAtDeathApproximate: boolean;
};

const KIND_ORDER: Record<TimelineItem["kind"], number> = {
  birth: 0,
  event: 1,
  death: 2,
};

/**
 * Turns a person's dates and life events into one chronological page. Items
 * with no usable date sort last instead of pretending to be year zero.
 */
export function buildTimeline(
  person: GraphPerson,
  events: GraphPersonEvent[],
): TimelineItem[] {
  const items: TimelineItem[] = [];

  if (person.birthDate || person.birthPlace) {
    items.push({
      id: `${person.id}:birth`,
      kind: "birth",
      label: "Birth",
      date: person.birthDate,
      place: person.birthPlace,
      description: null,
      eventKind: null,
      sort: fuzzySortValue(person.birthDate),
    });
  }

  if (person.deathDate || person.deathPlace) {
    items.push({
      id: `${person.id}:death`,
      kind: "death",
      label: "Death",
      date: person.deathDate,
      place: person.deathPlace,
      description: null,
      eventKind: null,
      sort: fuzzySortValue(person.deathDate),
    });
  }

  for (const event of events) {
    items.push({
      id: event.id,
      kind: "event",
      label: event.title || personEventKindLabel(event.kind),
      date: event.date,
      place: event.place,
      description: event.description,
      eventKind: event.kind,
      sort: fuzzySortValue(event.date),
    });
  }

  return items.sort((left, right) => {
    if (left.sort !== right.sort) return left.sort - right.sort;
    const kind = KIND_ORDER[left.kind] - KIND_ORDER[right.kind];
    return kind !== 0 ? kind : left.label.localeCompare(right.label);
  });
}

function isExact(value: FuzzyDate | null | undefined) {
  return value?.qualifier === "exact";
}

function wholeYears(birthYear: number, deathYear: number) {
  return Math.max(0, deathYear - birthYear);
}

export function buildDossier(
  index: ResearchIndex,
  personId: string,
): PersonDossier | null {
  const person = index.peopleById.get(personId);
  if (!person) return null;

  const events = eventsOf(index, personId);
  const partners = partnersOf(index, personId).map(link => ({
    ...link,
    children: childrenOf(index, personId).filter(child =>
      parentsOf(index, child.id).some(parent => parent.person.id === link.person.id),
    ),
  }));
  const children = childrenOf(index, personId).sort(sortPeopleByBirth);
  const files = filesOf(index, personId);

  const birthYear = fuzzyYear(person.birthDate);
  const deathYear = fuzzyYear(person.deathDate);
  const ageAtDeath =
    birthYear !== null && deathYear !== null
      ? wholeYears(birthYear, deathYear)
      : null;
  const ageAtDeathApproximate =
    ageAtDeath !== null &&
    (!isExact(person.birthDate) || !isExact(person.deathDate));

  const missing: string[] = [];
  if (!person.birthDate) missing.push("No birth date");
  if (!person.birthPlace) missing.push("No birth place");
  if (!parentsOf(index, personId).length) missing.push("No parents recorded");
  if (!partners.length && !children.length) {
    missing.push("No partner or children recorded");
  }
  if (!events.length) missing.push("No life events recorded");
  if (!files.length) missing.push("No photos or documents");
  if (!person.bio) missing.push("No biography");

  const lifespan = formatFuzzyYears(person.birthDate, person.deathDate);

  return {
    person,
    parents: parentsOf(index, personId),
    partners,
    children,
    siblings: siblingsOf(index, personId),
    timeline: buildTimeline(person, events),
    files,
    events,
    missing,
    lifespan,
    ageAtDeath,
    ageAtDeathApproximate,
  };
}

export function timelineDateLabel(item: TimelineItem) {
  return formatFuzzyDate(item.date) || "Date unknown";
}

export function placeLabel(item: TimelineItem) {
  return item.place?.trim() || "Place not recorded";
}
