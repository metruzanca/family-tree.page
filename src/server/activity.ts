import { and, eq, inArray } from "drizzle-orm";
import { db } from "./db";
import {
  people,
  treeActivity,
  type Person,
  type PersonEvent,
} from "../../drizzle/schema";
import { personEventKindLabel } from "../lib/person-events";
import type {
  ActivityAction,
  ActivityChange,
  ActivityEntityType,
  ActivitySummaryParams,
} from "../lib/activity";
import type { TranslationKey } from "../i18n";
import { formatFuzzyDate, type FuzzyDate } from "../lib/fuzzy-date";
import { personSexLabel, type PersonSex } from "../lib/person-sex";
import { log } from "./logger";
import type { PersonEventInput, PersonInput } from "./validation";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type ActivityClient = Transaction | typeof db;

export type ActivityActor = {
  id: string;
  displayName: string;
};

type ActivityInput = {
  treeId: string;
  actor: ActivityActor;
  action: ActivityAction;
  entityType: ActivityEntityType;
  entityId?: string | null;
  personId?: string | null;
  summary: string;
  /** Dictionary key for `summary`; the UI prefers it over the English text. */
  summaryKey?: TranslationKey;
  /** Values interpolated into `summaryKey`. */
  summaryParams?: ActivitySummaryParams;
  changes?: ActivityChange[];
};

export function personName(
  person: Pick<Person, "firstName" | "lastName" | "nickname">,
) {
  return (
    `${person.firstName} ${person.lastName}`.trim() ||
    person.nickname ||
    "Unnamed person"
  );
}

export async function peopleNames(
  client: ActivityClient,
  treeId: string,
  ids: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (!unique.length) return new Map();
  const rows = await client
    .select({
      id: people.id,
      firstName: people.firstName,
      lastName: people.lastName,
      nickname: people.nickname,
    })
    .from(people)
    .where(and(eq(people.treeId, treeId), inArray(people.id, unique)));
  return new Map(rows.map(row => [row.id, personName(row)]));
}

export async function logActivity(client: ActivityClient, input: ActivityInput) {
  await client.insert(treeActivity).values({
    treeId: input.treeId,
    actorUserId: input.actor.id,
    actorName: input.actor.displayName,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    personId: input.personId ?? null,
    summary: input.summary,
    summaryKey: input.summaryKey ?? null,
    summaryParams: input.summaryParams ?? null,
    changes: input.changes?.length ? input.changes : null,
  });
}

/** File storage and other best-effort operations must not fail because of history. */
export async function logActivityBestEffort(input: ActivityInput) {
  try {
    await logActivity(db, input);
  } catch (error) {
    log.error("activity.write_failed", { action: input.action, error });
  }
}

const PERSON_FIELDS: {
  key: keyof PersonInput;
  label: string;
  labelKey: TranslationKey;
}[] = [
  { key: "firstName", label: "First name", labelKey: "tree.activity.field.firstName" },
  { key: "lastName", label: "Last name", labelKey: "tree.activity.field.lastName" },
  { key: "maidenName", label: "Maiden name", labelKey: "tree.activity.field.maidenName" },
  { key: "nickname", label: "Nickname", labelKey: "tree.activity.field.nickname" },
  { key: "sex", label: "Sex", labelKey: "tree.activity.field.sex" },
  { key: "birthDate", label: "Born", labelKey: "tree.activity.field.born" },
  { key: "deathDate", label: "Died", labelKey: "tree.activity.field.died" },
  { key: "birthPlace", label: "Birthplace", labelKey: "tree.activity.field.birthPlace" },
  { key: "deathPlace", label: "Resting place", labelKey: "tree.activity.field.restingPlace" },
  { key: "bio", label: "Life notes", labelKey: "tree.activity.field.lifeNotes" },
  { key: "links", label: "Links", labelKey: "tree.activity.field.links" },
  { key: "contactEmail", label: "Contact email", labelKey: "tree.activity.field.contactEmail" },
  { key: "contactPhone", label: "Contact phone", labelKey: "tree.activity.field.contactPhone" },
];

export function personChanges(before: Person, after: PersonInput): ActivityChange[] {
  const changes: ActivityChange[] = [];
  for (const field of PERSON_FIELDS) {
    const from = before[field.key as keyof Person] as unknown;
    const to = after[field.key];
    if (sameValue(from, to)) continue;
    changes.push({
      label: field.label,
      labelKey: field.labelKey,
      from: displayValue(field.key, from),
      to: displayValue(field.key, to),
    });
  }
  return changes;
}

const EVENT_FIELDS: {
  key: keyof PersonEventInput;
  label: string;
  labelKey: TranslationKey;
}[] = [
  { key: "kind", label: "Type", labelKey: "tree.activity.field.type" },
  { key: "partnerPersonId", label: "With", labelKey: "tree.activity.field.partner" },
  { key: "title", label: "Title", labelKey: "tree.activity.field.title" },
  { key: "place", label: "Place", labelKey: "tree.activity.field.place" },
  { key: "date", label: "Date", labelKey: "tree.activity.field.date" },
  { key: "description", label: "Notes", labelKey: "tree.activity.field.notes" },
];

export function personEventChanges(
  before: PersonEvent,
  after: PersonEventInput,
  names: Map<string, string> = new Map(),
): ActivityChange[] {
  const changes: ActivityChange[] = [];
  for (const field of EVENT_FIELDS) {
    const from = before[field.key as keyof PersonEvent] as unknown;
    const to = after[field.key];
    if (sameValue(from, to)) continue;
    changes.push({
      label: field.label,
      labelKey: field.labelKey,
      from: displayEventValue(field.key, from, names),
      to: displayEventValue(field.key, to, names),
    });
  }
  return changes;
}

function displayEventValue(
  key: keyof PersonEventInput,
  value: unknown,
  names: Map<string, string>,
): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (key === "date") return formatFuzzyDate(value as FuzzyDate) || null;
  if (key === "kind") return personEventKindLabel(value as PersonEvent["kind"]);
  if (key === "partnerPersonId") return names.get(String(value)) ?? null;
  const text = String(value);
  return text.length > 500 ? `${text.slice(0, 500)}…` : text;
}

function sameValue(a: unknown, b: unknown) {
  if (a === b) return true;
  if (a === null || a === undefined || b === null || b === undefined) {
    return (a ?? null) === (b ?? null);
  }
  if (typeof a === "object" || typeof b === "object") {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}

function displayValue(key: keyof PersonInput, value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (key === "birthDate" || key === "deathDate") {
    return formatFuzzyDate(value as FuzzyDate) || null;
  }
  if (key === "sex") {
    return personSexLabel(value as PersonSex);
  }
  if (key === "links") {
    const links = Array.isArray(value)
      ? (value as { url?: string }[]).map(link => link.url).filter(Boolean)
      : [];
    if (!links.length) return null;
    const text = links.join(", ");
    return text.length > 500 ? `${text.slice(0, 500)}…` : text;
  }
  const text = String(value);
  return text.length > 500 ? `${text.slice(0, 500)}…` : text;
}
