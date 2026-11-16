import { describe, expect, it } from "vitest";
import { buildBirthdayCalendar, type BirthdayPerson } from "./birthday-ical";
import { exactFuzzyDate } from "./fuzzy-date";

function person(overrides: Partial<BirthdayPerson> & { id: string }): BirthdayPerson {
  return {
    id: overrides.id,
    firstName: overrides.firstName ?? overrides.id,
    lastName: overrides.lastName ?? "Simpson",
    nickname: overrides.nickname ?? null,
    birthDate: overrides.birthDate ?? exactFuzzyDate(1991, 4, 27),
    deathDate: overrides.deathDate ?? null,
    treeId: overrides.treeId ?? "tree-1",
    treeName: overrides.treeName ?? "Simpson family",
  };
}

describe("birthday calendar", () => {
  it("builds one recurring all-day event per person", () => {
    const body = buildBirthdayCalendar({
      userName: "Ada",
      origin: "https://family-tree.page",
      now: new Date(Date.UTC(2026, 10, 16, 12, 0, 0)),
      people: [
        person({ id: "mia", firstName: "Mia", lastName: "Simpson" }),
        person({
          id: "giuseppe",
          firstName: "Giuseppe",
          lastName: "Simpson",
          birthDate: exactFuzzyDate(1928, 3, 14),
          deathDate: exactFuzzyDate(2004, 11, 2),
        }),
      ],
    });

    const unfolded = body.replace(/\r\n /g, "");
    expect(unfolded).toContain("X-WR-CALNAME:Ada's family birthdays\r\n");
    expect(unfolded).toContain("UID:birth-mia@family-tree\r\n");
    expect(unfolded).toContain("DTSTART;VALUE=DATE:19910427\r\n");
    expect(unfolded).toContain("DTEND;VALUE=DATE:19910428\r\n");
    expect(unfolded).toContain("SUMMARY:Mia Simpson's birthday\r\n");
    expect(unfolded).toContain(
      "DESCRIPTION:Born Apr 27\\, 1991.\\nSimpson family.\\nhttps://family-tree.page/trees/tree-1?person=mia\r\n",
    );
    expect(unfolded).toContain(
      "DESCRIPTION:Born Mar 14\\, 1928.\\nDied Nov 2\\, 2004.\\nSimpson family.\\nhttps://family-tree.page/trees/tree-1?person=giuseppe\r\n",
    );
    expect(body.match(/RRULE:FREQ=YEARLY\r\n/g)).toHaveLength(2);
  });

  it("uses the February 28 fallback rule for leap-day birthdays", () => {
    const body = buildBirthdayCalendar({
      userName: "Ada",
      origin: "https://family-tree.page",
      people: [person({ id: "leap", birthDate: exactFuzzyDate(2000, 2, 29) })],
    });

    expect(body).toContain(
      "RRULE:FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=28,29;BYSETPOS=-1\r\n",
    );
  });

  it("skips people without a month and day", () => {
    const body = buildBirthdayCalendar({
      userName: "Ada",
      origin: "https://family-tree.page",
      people: [person({ id: "unknown", birthDate: exactFuzzyDate(1952) })],
    });

    expect(body).not.toContain("BEGIN:VEVENT");
  });

  it("falls back to a nickname when a person has no full name", () => {
    const body = buildBirthdayCalendar({
      userName: "Ada",
      origin: "https://family-tree.page",
      people: [
        person({ id: "nick", firstName: "", lastName: "", nickname: "Nicky" }),
      ],
    });

    expect(body).toContain("SUMMARY:Nicky's birthday\r\n");
  });
});
