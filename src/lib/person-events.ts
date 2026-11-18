import { compareFuzzyDates, type FuzzyDate } from "./fuzzy-date";
import { translate, type Locale, type TranslationKey } from "../i18n";

export const PERSON_EVENT_KINDS = [
  "residence",
  "occupation",
  "education",
  "military",
  "immigration",
  "emigration",
  "marriage",
  "divorce",
  "burial",
  "other",
] as const;

export type PersonEventKind = (typeof PERSON_EVENT_KINDS)[number];

export const PERSON_EVENT_OPTIONS: { value: PersonEventKind; label: string }[] = [
  { value: "residence", label: "Residence" },
  { value: "occupation", label: "Occupation" },
  { value: "education", label: "Education" },
  { value: "military", label: "Military service" },
  { value: "immigration", label: "Immigration" },
  { value: "emigration", label: "Emigration" },
  { value: "marriage", label: "Marriage" },
  { value: "divorce", label: "Divorce" },
  { value: "burial", label: "Burial" },
  { value: "other", label: "Other" },
];

export const PERSON_EVENT_KEYS: Record<PersonEventKind, TranslationKey> = {
  residence: "person.event.residence",
  occupation: "person.event.occupation",
  education: "person.event.education",
  military: "person.event.military",
  immigration: "person.event.immigration",
  emigration: "person.event.emigration",
  marriage: "person.event.marriage",
  divorce: "person.event.divorce",
  burial: "person.event.burial",
  other: "person.event.other",
};

export function personEventKey(kind: PersonEventKind): TranslationKey {
  return PERSON_EVENT_KEYS[kind] ?? "person.event.other";
}

export function personEventKindLabel(kind: PersonEventKind, locale: Locale = "en") {
  return translate(locale, personEventKey(kind));
}

/** The child fields a derived birth entry needs, kept free of API types. */
export type ChildBirthSource = {
  id: string;
  displayName: string;
  birthDate: FuzzyDate | null;
  birthPlace?: string | null;
};

type TimelineEventInput = {
  date: FuzzyDate | null;
  createdAt: Date;
};

export type LifeTimelineEntry<E> =
  | { type: "event"; event: E }
  | {
      type: "child-birth";
      personId: string;
      name: string;
      date: FuzzyDate;
      place: string | null;
    };

export type TimelineChildBirth = Extract<LifeTimelineEntry<never>, { type: "child-birth" }>;

function entryDate(entry: LifeTimelineEntry<TimelineEventInput>): FuzzyDate | null {
  return entry.type === "event" ? entry.event.date : entry.date;
}

/**
 * A person's timeline: their own events interleaved with the births of their
 * children. Only children with a known birth date contribute, so a parent's
 * timeline never fills with undated noise. Birth entries are derived from the
 * child's record and are not editable from the parent.
 */
export function buildLifeTimeline<E extends TimelineEventInput>(
  events: E[],
  children: ChildBirthSource[],
): LifeTimelineEntry<E>[] {
  const entries: LifeTimelineEntry<E>[] = [
    ...events.map(event => ({ type: "event" as const, event })),
    ...children
      .filter(
        (
          child,
        ): child is ChildBirthSource & { birthDate: FuzzyDate } =>
          child.birthDate !== null && child.birthDate !== undefined,
      )
      .map(child => ({
        type: "child-birth" as const,
        personId: child.id,
        name: child.displayName,
        date: child.birthDate,
        place: child.birthPlace ?? null,
      })),
  ];

  return entries.sort((a, b) => {
    const byDate = compareFuzzyDates(entryDate(a), entryDate(b));
    if (byDate) return byDate;
    if (a.type === "event" && b.type === "event") {
      return a.event.createdAt.getTime() - b.event.createdAt.getTime();
    }
    if (a.type === "child-birth" && b.type === "child-birth") {
      return a.name.localeCompare(b.name);
    }
    return a.type === "event" ? -1 : 1;
  });
}
