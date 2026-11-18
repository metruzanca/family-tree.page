import type { GraphPerson, GraphPersonEvent } from "~/api/people-server";
import { fuzzyYear, type FuzzyDate } from "../fuzzy-date";
import { personEventKindLabel, type PersonEventKind } from "../person-events";
import { eventsOf, personName, type ResearchIndex } from "./graph";

export type SurnameVariant = {
  surname: string;
  count: number;
};

export type SurnameEntry = {
  person: GraphPerson;
  surname: string;
};

export type SurnameGroup = {
  key: string;
  label: string;
  variants: SurnameVariant[];
  people: SurnameEntry[];
  earliestYear: number | null;
  latestYear: number | null;
};

export type PlaceEntryKind = "birth" | "death" | "event";

export type PlaceEntry = {
  person: GraphPerson;
  kind: PlaceEntryKind;
  label: string;
  place: string;
  date: FuzzyDate | null;
  eventKind: PersonEventKind | null;
};

export type PlaceGroup = {
  key: string;
  label: string;
  parts: string[];
  entries: PlaceEntry[];
  peopleCount: number;
};

export type PlaceIndex = {
  places: PlaceGroup[];
  missing: {
    births: number;
    events: number;
    people: GraphPerson[];
  };
};

export function normalizeSurname(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{Letter}]+/gu, "");
}

const SOUNDEX_CODES: Record<string, string> = {
  b: "1",
  f: "1",
  p: "1",
  v: "1",
  c: "2",
  g: "2",
  j: "2",
  k: "2",
  q: "2",
  s: "2",
  x: "2",
  z: "2",
  d: "3",
  t: "3",
  l: "4",
  m: "5",
  n: "5",
  r: "6",
};

/**
 * Classic Soundex, used only to narrow the candidate list before an edit
 * distance check. Names outside the Latin alphabet fall back to their
 * normalized form as the bucket key.
 */
export function soundex(value: string) {
  const normalized = normalizeSurname(value);
  if (!normalized) return "";
  if (!/^[a-z]/.test(normalized)) return normalized;

  const first = normalized[0].toUpperCase();
  let result = first;
  let lastCode = SOUNDEX_CODES[normalized[0]] ?? "";

  for (let position = 1; position < normalized.length && result.length < 4; position += 1) {
    const letter = normalized[position];
    if (letter === "h" || letter === "w") continue;
    const code = SOUNDEX_CODES[letter] ?? "";
    if (!code) {
      lastCode = "";
      continue;
    }
    if (code !== lastCode) result += code;
    lastCode = code;
  }

  return `${result}000`.slice(0, 4);
}

/** Levenshtein distance with an optional ceiling for early exit. */
export function editDistance(a: string, b: string, max = Number.POSITIVE_INFINITY) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let row = 1; row <= a.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= b.length; column += 1) {
      const substitution = a[row - 1] === b[column - 1] ? 0 : 1;
      current[column] = Math.min(
        previous[column] + 1,
        current[column - 1] + 1,
        previous[column - 1] + substitution,
      );
    }
    previous = current;
    if (Math.min(...previous) > max) return max + 1;
  }
  return previous[b.length];
}

function surnameEntries(index: ResearchIndex) {
  const entries: Array<SurnameEntry & { normalized: string; bucket: string }> = [];
  for (const person of index.people) {
    const names = [person.lastName, person.maidenName]
      .map(name => (name ?? "").trim())
      .filter(Boolean);
    for (const surname of new Set(names)) {
      const normalized = normalizeSurname(surname);
      if (!normalized) continue;
      entries.push({
        person,
        surname,
        normalized,
        bucket: soundex(normalized),
      });
    }
  }
  return entries;
}

type InternalSurnameGroup = {
  key: string;
  variants: Map<string, { surname: string; normalized: string; count: number }>;
  people: Map<string, SurnameEntry>;
};

/**
 * Groups surnames that are likely the same family under different spellings.
 * Soundex buckets the candidates, then an edit distance of two or less is what
 * actually merges them, so White and Wade stay apart.
 */
export function buildSurnameIndex(index: ResearchIndex): SurnameGroup[] {
  const buckets = new Map<string, InternalSurnameGroup[]>();

  for (const entry of surnameEntries(index)) {
    const candidates = buckets.get(entry.bucket) ?? [];
    const match =
      candidates.find(group =>
        [...group.variants.values()].some(
          variant =>
            variant.normalized === entry.normalized ||
            editDistance(variant.normalized, entry.normalized, 2) <= 2,
        ),
      ) ?? null;

    const group: InternalSurnameGroup =
      match ?? { key: entry.bucket, variants: new Map(), people: new Map() };
    if (!match) {
      candidates.push(group);
      buckets.set(entry.bucket, candidates);
    }

    const variant = group.variants.get(entry.normalized) ?? {
      surname: entry.surname,
      normalized: entry.normalized,
      count: 0,
    };
    variant.count += 1;
    group.variants.set(entry.normalized, variant);
    group.people.set(`${entry.person.id}:${entry.normalized}`, {
      person: entry.person,
      surname: entry.surname,
    });
  }

  return [...buckets.values()]
    .flat()
    .map(group => {
      const variants = [...group.variants.values()]
        .map(variant => ({ surname: variant.surname, count: variant.count }))
        .sort((left, right) => right.count - left.count || left.surname.localeCompare(right.surname));
      const people = [...group.people.values()].sort((left, right) =>
        personName(left.person).localeCompare(personName(right.person)),
      );
      const years = people
        .map(entry => fuzzyYear(entry.person.birthDate))
        .filter((year): year is number => year !== null);
      return {
        key: `${group.key}:${variants[0]?.surname ?? ""}`,
        label: variants[0]?.surname ?? "",
        variants,
        people,
        earliestYear: years.length ? Math.min(...years) : null,
        latestYear: years.length ? Math.max(...years) : null,
      };
    })
    .sort(
      (left, right) =>
        right.people.length - left.people.length ||
        left.label.localeCompare(right.label),
    );
}

export function placeParts(place: string) {
  return place
    .split(",")
    .map(part => part.trim().replace(/\s+/g, " "))
    .filter(Boolean);
}

export function placeKey(place: string) {
  return placeParts(place)
    .map(part => part.toLowerCase())
    .join("|");
}

type InternalPlaceGroup = {
  key: string;
  labels: Map<string, number>;
  entries: PlaceEntry[];
  people: Set<string>;
};

export function buildPlaceIndex(index: ResearchIndex): PlaceIndex {
  const groups = new Map<string, InternalPlaceGroup>();
  const missingPeople = new Map<string, GraphPerson>();
  let missingBirths = 0;
  let missingEvents = 0;

  const add = (entry: PlaceEntry) => {
    const key = placeKey(entry.place);
    if (!key) return;
    const group: InternalPlaceGroup = groups.get(key) ?? {
      key,
      labels: new Map(),
      entries: [],
      people: new Set<string>(),
    };
    group.labels.set(entry.place, (group.labels.get(entry.place) ?? 0) + 1);
    group.entries.push(entry);
    group.people.add(entry.person.id);
    groups.set(key, group);
  };

  for (const person of index.people) {
    if (person.birthPlace) {
      add({
        person,
        kind: "birth",
        label: "Birth",
        place: person.birthPlace,
        date: person.birthDate,
        eventKind: null,
      });
    } else if (person.birthDate) {
      missingBirths += 1;
      missingPeople.set(person.id, person);
    }

    if (person.deathPlace) {
      add({
        person,
        kind: "death",
        label: "Death",
        place: person.deathPlace,
        date: person.deathDate,
        eventKind: null,
      });
    }

    for (const event of eventsOf(index, person.id)) {
      if (!event.place) {
        if (event.date) missingEvents += 1;
        continue;
      }
      add(placeEntryFromEvent(person, event));
    }
  }

  const places = [...groups.values()]
    .map(group => {
      const label =
        [...group.labels.entries()].sort(
          ([leftLabel, leftCount], [rightLabel, rightCount]) =>
            rightCount - leftCount || leftLabel.localeCompare(rightLabel),
        )[0]?.[0] ?? "";
      return {
        key: group.key,
        label,
        parts: placeParts(label),
        entries: group.entries.sort((left, right) => {
          const leftYear = fuzzyYear(left.date) ?? Number.POSITIVE_INFINITY;
          const rightYear = fuzzyYear(right.date) ?? Number.POSITIVE_INFINITY;
          return leftYear - rightYear || personName(left.person).localeCompare(personName(right.person));
        }),
        peopleCount: group.people.size,
      };
    })
    .sort(
      (left, right) =>
        right.entries.length - left.entries.length ||
        left.label.localeCompare(right.label),
    );

  return {
    places,
    missing: {
      births: missingBirths,
      events: missingEvents,
      people: [...missingPeople.values()],
    },
  };
}

export function placeEntryFromEvent(
  person: GraphPerson,
  event: GraphPersonEvent,
): PlaceEntry {
  return {
    person,
    kind: "event",
    label: event.title || personEventKindLabel(event.kind),
    place: event.place ?? "",
    date: event.date,
    eventKind: event.kind,
  };
}
