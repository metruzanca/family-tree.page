import { describe, expect, it } from "vitest";
import { buildBirthdayCalendar, type BirthdayPerson } from "./birthday-ical";

function person(overrides: Partial<BirthdayPerson> & { id: string }): BirthdayPerson {
  return {
    id: overrides.id,
    firstName: overrides.firstName ?? overrides.id,
    lastName: overrides.lastName ?? "Simpson",
    nickname: overrides.nickname ?? null,
    birthDate: overrides.birthDate ?? "1991-04-27",
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
          birthDate: "1928-03-14",
          deathDate: "2004-11-02",
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
      "DESCRIPTION:Born 1991.\\nSimpson family.\\nhttps://family-tree.page/trees/tree-1?person=mia\r\n",
    );
    expect(unfolded).toContain(
      "DESCRIPTION:Born 1928.\\nDied 2004.\\nSimpson family.\\nhttps://family-tree.page/trees/tree-1?person=giuseppe\r\n",
    );
    expect(body.match(/RRULE:FREQ=YEARLY\r\n/g)).toHaveLength(2);
  });

  it("uses the February 28 fallback rule for leap-day birthdays", () => {
    const body = buildBirthdayCalendar({
      userName: "Ada",
      origin: "https://family-tree.page",
      people: [person({ id: "leap", birthDate: "2000-02-29" })],
    });

    expect(body).toContain(
      "RRULE:FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=28,29;BYSETPOS=-1\r\n",
    );
  });

  it("skips people without a valid birth date", () => {
    const body = buildBirthdayCalendar({
      userName: "Ada",
      origin: "https://family-tree.page",
      people: [person({ id: "unknown", birthDate: "" })],
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
