import type { FuzzyDate } from "./fuzzy-date";
import { translate, type Locale } from "../i18n";
import type {
  GedcomImportedEvent,
  GedcomImportedFamily,
  GedcomImportedPerson,
  GedcomImportResult,
} from "./gedcom-import";
import type { PersonEventKind } from "./person-events";
import type { PersonSex } from "./person-sex";

export type ExistingImportPerson = {
  id: string;
  firstName: string;
  lastName: string;
  maidenName: string | null;
  nickname: string | null;
  sex: PersonSex;
  birthDate: FuzzyDate | null;
  deathDate: FuzzyDate | null;
  birthPlace: string | null;
  deathPlace: string | null;
  bio: string | null;
};

export type ExistingImportEvent = {
  personId: string;
  kind: PersonEventKind;
  title: string | null;
  place: string | null;
  description: string | null;
  date: FuzzyDate | null;
};

export type ImportAction = "create" | "merge" | "skip";

export type ImportDecision = {
  xref: string;
  action: ImportAction;
  personId?: string | null;
};

export type PersonMergeUpdate = Partial<
  Pick<
    ExistingImportPerson,
    | "firstName"
    | "lastName"
    | "maidenName"
    | "nickname"
    | "sex"
    | "birthDate"
    | "deathDate"
    | "birthPlace"
    | "deathPlace"
    | "bio"
  >
>;

export type PlannedMerge = {
  imported: GedcomImportedPerson;
  personId: string;
  update: PersonMergeUpdate;
};

export type PlannedFamily = Pick<
  GedcomImportedFamily,
  "partnerXrefs" | "childXrefs" | "status" | "startDate" | "endDate"
>;

export type PlannedEvent = {
  xref: string;
  event: GedcomImportedEvent;
};

export type ImportPlan = {
  creates: GedcomImportedPerson[];
  merges: PlannedMerge[];
  skips: GedcomImportedPerson[];
  families: PlannedFamily[];
  events: PlannedEvent[];
  errors: string[];
  counts: {
    create: number;
    merge: number;
    skip: number;
    parentLinks: number;
    partnerships: number;
    events: number;
    eventsSkipped: number;
  };
};

function dateSignature(date: FuzzyDate | null | undefined) {
  if (!date) return "";
  const parts = (value: FuzzyDate["start"] | null | undefined) =>
    value
      ? `${value.year ?? ""}-${value.month ?? ""}-${value.day ?? ""}`
      : "";
  return `${date.qualifier}:${parts(date.start)}:${parts(date.end)}`;
}

export function importEventKey(
  event: Pick<
    GedcomImportedEvent,
    "kind" | "title" | "place" | "description" | "date"
  >,
) {
  return [
    event.kind,
    event.title ?? "",
    event.place ?? "",
    event.description ?? "",
    dateSignature(event.date),
  ].join("|");
}

function fillText(current: string | null, incoming: string | null) {
  return (current ?? "").trim() ? current : incoming;
}

function mergeUpdate(
  existing: ExistingImportPerson,
  imported: GedcomImportedPerson,
): PersonMergeUpdate {
  const update: PersonMergeUpdate = {};
  if (
    (!existing.firstName.trim() || existing.firstName === "Unknown") &&
    imported.firstName &&
    imported.firstName !== "Unknown"
  ) {
    update.firstName = imported.firstName;
  }
  if (!existing.lastName.trim() && imported.lastName) {
    update.lastName = imported.lastName;
  }
  if (!existing.maidenName?.trim() && imported.maidenName) {
    update.maidenName = imported.maidenName;
  }
  if (!existing.nickname?.trim() && imported.nickname) {
    update.nickname = imported.nickname;
  }
  if (existing.sex === "unknown" && imported.sex !== "unknown") {
    update.sex = imported.sex;
  }
  if (!existing.birthDate && imported.birthDate) {
    update.birthDate = imported.birthDate;
  }
  if (!existing.deathDate && imported.deathDate) {
    update.deathDate = imported.deathDate;
  }
  if (!existing.birthPlace?.trim() && imported.birthPlace) {
    update.birthPlace = imported.birthPlace;
  }
  if (!existing.deathPlace?.trim() && imported.deathPlace) {
    update.deathPlace = imported.deathPlace;
  }
  if (!existing.bio?.trim() && imported.bio) {
    update.bio = imported.bio;
  }
  return update;
}

/**
 * Turns reviewed decisions into the exact set of creates, gap-filling merges,
 * relationships, and non-duplicate events to write. It performs no database
 * work, so the same plan drives the review UI and the server.
 */
export function planImport(input: {
  parsed: GedcomImportResult;
  existingPeople: ExistingImportPerson[];
  existingEvents: ExistingImportEvent[];
  decisions: ImportDecision[];
  locale?: Locale;
}): ImportPlan {
  const locale = input.locale ?? "en";
  const errors: string[] = [];
  const personByXref = new Map(
    input.parsed.people.map(person => [person.xref, person]),
  );
  const existingById = new Map(
    input.existingPeople.map(person => [person.id, person]),
  );

  const decisions = new Map<string, ImportDecision>();
  for (const decision of input.decisions) {
    if (decisions.has(decision.xref)) {
      errors.push(
        translate(locale, "tree.import.plan.duplicateDecision", {
          xref: decision.xref,
        }),
      );
      continue;
    }
    decisions.set(decision.xref, decision);
  }

  for (const decision of input.decisions) {
    if (!personByXref.has(decision.xref)) {
      errors.push(
        translate(locale, "tree.import.plan.unknownPerson", {
          xref: decision.xref,
        }),
      );
    }
  }
  for (const person of input.parsed.people) {
    if (!decisions.has(person.xref)) {
      errors.push(
        translate(locale, "tree.import.plan.chooseAction", {
          name: `${person.firstName} ${person.lastName}`.trim(),
        }),
      );
    }
  }

  const mergeTargets = new Map<string, string>();
  const included = new Set<string>();
  const creates: GedcomImportedPerson[] = [];
  const merges: PlannedMerge[] = [];
  const skips: GedcomImportedPerson[] = [];

  for (const person of input.parsed.people) {
    const decision = decisions.get(person.xref);
    if (!decision) {
      skips.push(person);
      continue;
    }
    if (decision.action === "skip") {
      skips.push(person);
      continue;
    }
    if (decision.action === "create") {
      creates.push(person);
      included.add(person.xref);
      continue;
    }

    const personId = decision.personId ?? "";
    const existing = existingById.get(personId);
    if (!existing) {
      errors.push(
        translate(locale, "tree.import.plan.chooseMergeTarget", {
          name: `${person.firstName} ${person.lastName}`.trim(),
        }),
      );
      skips.push(person);
      continue;
    }
    const previous = mergeTargets.get(personId);
    if (previous) {
      errors.push(
        translate(locale, "tree.import.plan.mergeConflict", {
          name: `${existing.firstName} ${existing.lastName}`.trim(),
        }),
      );
    }
    mergeTargets.set(personId, person.xref);
    merges.push({
      imported: person,
      personId,
      update: mergeUpdate(existing, person),
    });
    included.add(person.xref);
  }

  const existingEventKeys = new Map<string, Set<string>>();
  for (const event of input.existingEvents) {
    const set = existingEventKeys.get(event.personId) ?? new Set<string>();
    set.add(importEventKey(event));
    existingEventKeys.set(event.personId, set);
  }

  const events: PlannedEvent[] = [];
  const plannedEventKeys = new Set<string>();
  let eventsSkipped = 0;
  for (const person of input.parsed.people) {
    if (!included.has(person.xref)) continue;
    const decision = decisions.get(person.xref);
    const targetId =
      decision?.action === "merge" ? (decision.personId ?? null) : null;
    for (const event of person.events) {
      const key = importEventKey(event);
      const duplicate =
        (targetId && existingEventKeys.get(targetId)?.has(key)) ||
        plannedEventKeys.has(`${person.xref}|${key}`);
      if (duplicate) {
        eventsSkipped += 1;
        continue;
      }
      plannedEventKeys.add(`${person.xref}|${key}`);
      events.push({ xref: person.xref, event });
    }
  }

  const families: PlannedFamily[] = [];
  let parentLinks = 0;
  let partnerships = 0;
  for (const family of input.parsed.families) {
    const partnerXrefs = family.partnerXrefs.filter(xref =>
      included.has(xref),
    );
    const childXrefs = family.childXrefs.filter(xref => included.has(xref));
    if (!partnerXrefs.length) continue;
    if (partnerXrefs.length < 2 && !childXrefs.length) continue;
    families.push({
      partnerXrefs,
      childXrefs,
      status: family.status,
      startDate: family.startDate,
      endDate: family.endDate,
    });
    parentLinks += partnerXrefs.length * childXrefs.length;
    if (partnerXrefs.length === 2) partnerships += 1;
  }

  return {
    creates,
    merges,
    skips,
    families,
    events,
    errors,
    counts: {
      create: creates.length,
      merge: merges.length,
      skip: skips.length,
      parentLinks,
      partnerships,
      events: events.length,
      eventsSkipped,
    },
  };
}
