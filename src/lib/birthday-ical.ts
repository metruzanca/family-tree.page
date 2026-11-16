import { addDays, parseDateParts } from "./calendar";
import { buildICalendar, type ICalEvent } from "./ical";

export type BirthdayPerson = {
  id: string;
  firstName: string;
  lastName: string;
  nickname: string | null;
  birthDate: string;
  deathDate: string | null;
  treeId: string;
  treeName: string;
};

export type BirthdayCalendarInput = {
  userName: string;
  people: BirthdayPerson[];
  origin: string;
  now?: Date;
};

function displayName(person: BirthdayPerson) {
  return `${person.firstName} ${person.lastName}`.trim() || person.nickname || "Unnamed person";
}

const FEBRUARY_29_RULE = "FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=28,29;BYSETPOS=-1";

export function buildBirthdayCalendar(input: BirthdayCalendarInput) {
  const events: ICalEvent[] = [];

  for (const person of input.people) {
    const birth = parseDateParts(person.birthDate);
    if (!birth) continue;

    const details = [
      `Born ${birth.year}.`,
      person.deathDate ? `Died ${person.deathDate.slice(0, 4)}.` : null,
      `${person.treeName}.`,
      `${input.origin}/trees/${person.treeId}?person=${person.id}`,
    ].filter(Boolean);

    events.push({
      uid: `birth-${person.id}@family-tree`,
      start: birth,
      end: addDays(birth, 1),
      summary: `${displayName(person)}'s birthday`,
      description: details.join("\n"),
      recurrenceRule:
        birth.month === 1 && birth.day === 29 ? FEBRUARY_29_RULE : "FREQ=YEARLY",
    });
  }

  return buildICalendar({
    name: `${input.userName}'s family birthdays`,
    description: "Birthdays from every family tree you belong to.",
    events,
    now: input.now,
  });
}
