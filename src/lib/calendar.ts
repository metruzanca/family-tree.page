import type { GraphPerson } from "~/api/people-server";

export type DateParts = {
  year: number;
  /** Zero-based month, matching Date. */
  month: number;
  day: number;
};

export type CalendarEventKind = "birth" | "death";

export type CalendarEvent = {
  key: string;
  person: GraphPerson;
  kind: CalendarEventKind;
  date: DateParts;
  /** Age reached on a birth anniversary, or years since a death. */
  years: number;
};

export type UpcomingBirthday = {
  person: GraphPerson;
  date: DateParts;
  age: number;
  daysAway: number;
};

export const BIRTHDAY_OFFSETS = {
  week_before: 7,
  day_before: 1,
  day_of: 0,
} as const;

export type BirthdayOffset = keyof typeof BIRTHDAY_OFFSETS;

const DAY_MS = 24 * 60 * 60 * 1000;

export function isLeapYear(year: number) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

export function daysInMonth(year: number, month: number) {
  if (month === 1) return isLeapYear(year) ? 29 : 28;
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

export function parseDateParts(value: string | null | undefined): DateParts | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  if (month < 0 || month > 11) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

export function dateFromParts(parts: DateParts) {
  return new Date(parts.year, parts.month, parts.day);
}

export function partsFromDate(date: Date): DateParts {
  return { year: date.getFullYear(), month: date.getMonth(), day: date.getDate() };
}

export function compareDateParts(a: DateParts, b: DateParts) {
  return a.year - b.year || a.month - b.month || a.day - b.day;
}

export function sameDate(a: DateParts, b: DateParts) {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

/**
 * Birthdays on February 29 fall on February 28 in years without a leap day.
 */
export function occurrenceForYear(date: DateParts, year: number): DateParts {
  if (date.month === 1 && date.day === 29 && !isLeapYear(year)) {
    return { year, month: 1, day: 28 };
  }
  return { year, month: date.month, day: date.day };
}

/** Day number since the Unix epoch, used to compare calendar days safely. */
export function dayNumber(parts: DateParts) {
  return Date.UTC(parts.year, parts.month, parts.day) / DAY_MS;
}

export function addDays(parts: DateParts, days: number): DateParts {
  const date = new Date(Date.UTC(parts.year, parts.month, parts.day + days));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth(),
    day: date.getUTCDate(),
  };
}

export function nextBirthday(
  birthDate: string | null | undefined,
  today: DateParts,
): { date: DateParts; age: number; daysAway: number } | null {
  const birth = parseDateParts(birthDate);
  if (!birth) return null;
  let date = occurrenceForYear(birth, today.year);
  if (compareDateParts(date, today) < 0) {
    date = occurrenceForYear(birth, today.year + 1);
  }
  return {
    date,
    age: date.year - birth.year,
    daysAway: dayNumber(date) - dayNumber(today),
  };
}

export function upcomingBirthdays(
  people: Pick<GraphPerson, "id" | "displayName" | "firstName" | "lastName" | "birthDate" | "deathDate" | "avatarFileId">[],
  today: DateParts,
  limit?: number,
): UpcomingBirthday[] {
  const rows: UpcomingBirthday[] = [];
  for (const person of people) {
    if (person.deathDate || !person.birthDate) continue;
    const next = nextBirthday(person.birthDate, today);
    if (!next) continue;
    rows.push({ person: person as GraphPerson, ...next });
  }
  rows.sort(
    (a, b) =>
      a.daysAway - b.daysAway ||
      a.person.displayName.localeCompare(b.person.displayName),
  );
  return typeof limit === "number" ? rows.slice(0, limit) : rows;
}

export function calendarEvents(
  people: GraphPerson[],
  year: number,
): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  for (const person of people) {
    const birth = parseDateParts(person.birthDate);
    const death = parseDateParts(person.deathDate);
    if (birth) {
      const date = occurrenceForYear(birth, year);
      events.push({
        key: `${person.id}:birth:${year}`,
        person,
        kind: "birth",
        date,
        years: year - birth.year,
      });
    }
    if (death) {
      const date = occurrenceForYear(death, year);
      events.push({
        key: `${person.id}:death:${year}`,
        person,
        kind: "death",
        date,
        years: year - death.year,
      });
    }
  }
  return events.sort(
    (a, b) => compareDateParts(a.date, b.date) || a.person.displayName.localeCompare(b.person.displayName),
  );
}

export function eventsOnDay(events: CalendarEvent[], day: DateParts) {
  return events.filter(event => sameDate(event.date, day));
}

export type MonthGridDay = {
  date: DateParts;
  inMonth: boolean;
};

/**
 * Returns six weeks of days so every month grid has the same height.
 * Weeks start on Monday.
 */
export function monthGrid(year: number, month: number): MonthGridDay[] {
  const first: DateParts = { year, month, day: 1 };
  const weekday = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const offset = (weekday + 6) % 7;
  const start = addDays(first, -offset);
  const days: MonthGridDay[] = [];
  for (let index = 0; index < 42; index += 1) {
    const date = addDays(start, index);
    days.push({ date, inMonth: date.month === month });
  }
  return days;
}

export function birthdayTargetDay(today: DateParts, offset: BirthdayOffset) {
  return addDays(today, BIRTHDAY_OFFSETS[offset]);
}

export function birthdayMatchesOn(
  birthDate: string | null | undefined,
  target: DateParts,
) {
  const birth = parseDateParts(birthDate);
  if (!birth) return false;
  const occurrence = occurrenceForYear(birth, target.year);
  return occurrence.month === target.month && occurrence.day === target.day;
}

export function formatMonthDay(parts: DateParts) {
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric" }).format(
    new Date(parts.year, parts.month, parts.day),
  );
}
