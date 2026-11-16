import { describe, expect, it } from "vitest";
import type { GraphPerson } from "../api/people-server";
import {
  birthdayMatchesOn,
  calendarEvents,
  eventsOnDay,
  monthGrid,
  nextBirthday,
  occurrenceForYear,
  parseDateParts,
  sameDate,
  upcomingBirthdays,
} from "./calendar";

function person(overrides: Partial<GraphPerson> & { id: string }): GraphPerson {
  return {
    id: overrides.id,
    firstName: overrides.firstName ?? overrides.id,
    lastName: overrides.lastName ?? "Simpson",
    displayName: overrides.displayName ?? `${overrides.firstName ?? overrides.id} Simpson`,
    maidenName: null,
    nickname: null,
    birthDate: overrides.birthDate ?? null,
    deathDate: overrides.deathDate ?? null,
    birthPlace: null,
    deathPlace: null,
    bio: null,
    avatarFileId: null,
  };
}

describe("calendar helpers", () => {
  it("parses valid dates only", () => {
    expect(parseDateParts("1991-04-27")).toEqual({ year: 1991, month: 3, day: 27 });
    expect(parseDateParts("1991-02-29")).toBeNull();
    expect(parseDateParts("")).toBeNull();
    expect(parseDateParts(null)).toBeNull();
  });

  it("moves February 29 birthdays to February 28 in common years", () => {
    expect(occurrenceForYear({ year: 2000, month: 1, day: 29 }, 2024)).toEqual({
      year: 2024,
      month: 1,
      day: 29,
    });
    expect(occurrenceForYear({ year: 2000, month: 1, day: 29 }, 2025)).toEqual({
      year: 2025,
      month: 1,
      day: 28,
    });
  });

  it("finds the next birthday and age", () => {
    const next = nextBirthday("1991-04-27", { year: 2026, month: 3, day: 15 });
    expect(next).toEqual({
      date: { year: 2026, month: 3, day: 27 },
      age: 35,
      daysAway: 12,
    });
  });

  it("rolls over to next year after the birthday", () => {
    const next = nextBirthday("1991-04-27", { year: 2026, month: 4, day: 1 });
    expect(next?.date).toEqual({ year: 2027, month: 3, day: 27 });
    expect(next?.age).toBe(36);
  });

  it("lists only living people with known birthdays, soonest first", () => {
    const people = [
      person({ id: "mia", displayName: "Mia Simpson", birthDate: "1991-04-27" }),
      person({ id: "sam", displayName: "Sam Simpson", birthDate: "1988-04-20" }),
      person({ id: "giuseppe", birthDate: "1928-04-21", deathDate: "2004-11-02" }),
      person({ id: "unknown" }),
    ];
    const rows = upcomingBirthdays(people, { year: 2026, month: 3, day: 18 });
    expect(rows.map(row => row.person.id)).toEqual(["sam", "mia"]);
    expect(rows[0].daysAway).toBe(2);
    expect(rows[1].age).toBe(35);
  });

  it("builds a Monday-first six week grid", () => {
    const grid = monthGrid(2026, 3);
    expect(grid).toHaveLength(42);
    expect(grid[0].date).toEqual({ year: 2026, month: 2, day: 30 });
    expect(grid[0].inMonth).toBe(false);
    const firstOfApril = grid.find(day => sameDate(day.date, { year: 2026, month: 3, day: 1 }));
    expect(firstOfApril?.inMonth).toBe(true);
    expect(new Date(Date.UTC(2026, 3, 1)).getUTCDay()).toBe(3);
  });

  it("places birth and death anniversaries on the right days", () => {
    const giuseppe = person({
      id: "giuseppe",
      birthDate: "1928-03-14",
      deathDate: "2004-11-02",
    });
    const events = calendarEvents([giuseppe], 2026);
    expect(events).toHaveLength(2);
    expect(events[0].kind).toBe("birth");
    expect(events[0].years).toBe(98);
    expect(eventsOnDay(events, { year: 2026, month: 2, day: 14 })).toHaveLength(1);
    expect(eventsOnDay(events, { year: 2026, month: 10, day: 2 })).toHaveLength(1);
  });

  it("matches birthdays against an offset target day", () => {
    expect(birthdayMatchesOn("1991-04-27", { year: 2026, month: 3, day: 27 })).toBe(true);
    expect(birthdayMatchesOn("1991-04-27", { year: 2026, month: 3, day: 26 })).toBe(false);
    expect(birthdayMatchesOn("2000-02-29", { year: 2025, month: 1, day: 28 })).toBe(true);
  });
});
