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
} from "../lib/activity";
import { formatFuzzyDate, type FuzzyDate } from "../lib/fuzzy-date";
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

const PERSON_FIELDS: { key: keyof PersonInput; label: string }[] = [
  { key: "firstName", label: "First name" },
  { key: "lastName", label: "Last name" },
  { key: "maidenName", label: "Maiden name" },
  { key: "nickname", label: "Nickname" },
  { key: "birthDate", label: "Born" },
  { key: "deathDate", label: "Died" },
  { key: "birthPlace", label: "Birthplace" },
  { key: "deathPlace", label: "Resting place" },
  { key: "bio", label: "Life notes" },
];

export function personChanges(before: Person, after: PersonInput): ActivityChange[] {
  const changes: ActivityChange[] = [];
  for (const field of PERSON_FIELDS) {
    const from = before[field.key as keyof Person] as unknown;
    const to = after[field.key];
    if (sameValue(from, to)) continue;
    changes.push({
      label: field.label,
      from: displayValue(field.key, from),
      to: displayValue(field.key, to),
    });
  }
  return changes;
}

const EVENT_FIELDS: { key: keyof PersonEventInput; label: string }[] = [
  { key: "kind", label: "Type" },
  { key: "title", label: "Title" },
  { key: "place", label: "Place" },
  { key: "date", label: "Date" },
  { key: "description", label: "Notes" },
];

export function personEventChanges(
  before: PersonEvent,
  after: PersonEventInput,
): ActivityChange[] {
  const changes: ActivityChange[] = [];
  for (const field of EVENT_FIELDS) {
    const from = before[field.key as keyof PersonEvent] as unknown;
    const to = after[field.key];
    if (sameValue(from, to)) continue;
    changes.push({
      label: field.label,
      from: displayEventValue(field.key, from),
      to: displayEventValue(field.key, to),
    });
  }
  return changes;
}

function displayEventValue(key: keyof PersonEventInput, value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (key === "date") return formatFuzzyDate(value as FuzzyDate) || null;
  if (key === "kind") return personEventKindLabel(value as PersonEvent["kind"]);
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
  const text = String(value);
  return text.length > 500 ? `${text.slice(0, 500)}…` : text;
}
