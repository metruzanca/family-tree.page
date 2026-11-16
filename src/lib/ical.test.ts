import { describe, expect, it } from "vitest";
import {
  buildICalendar,
  escapeICalText,
  foldICalLine,
  formatICalDate,
  formatICalUtc,
} from "./ical";

describe("iCal helpers", () => {
  it("escapes text values", () => {
    expect(escapeICalText("Born, 1991; died \\ later\nnext line")).toBe(
      "Born\\, 1991\\; died \\\\ later\\nnext line",
    );
  });

  it("formats all-day dates", () => {
    expect(formatICalDate({ year: 2026, month: 3, day: 7 })).toBe("20260407");
    expect(formatICalDate({ year: 999, month: 0, day: 1 })).toBe("09990101");
  });

  it("formats UTC timestamps", () => {
    expect(formatICalUtc(new Date(Date.UTC(2026, 10, 16, 8, 5, 3)))).toBe(
      "20261116T080503Z",
    );
  });

  it("folds long lines at 75 octets without splitting characters", () => {
    const line = `DESCRIPTION:${"Zoë ".repeat(30)}`;
    const folded = foldICalLine(line);
    const physicalLines = folded.split("\r\n");

    expect(physicalLines.length).toBeGreaterThan(1);
    for (const physical of physicalLines) {
      expect(new TextEncoder().encode(physical).length).toBeLessThanOrEqual(75);
    }
    expect(folded.replace(/\r\n /g, "")).toBe(line);
  });

  it("builds a calendar with recurring all-day events", () => {
    const body = buildICalendar({
      name: "Ada's family birthdays",
      description: "Birthdays from every tree.",
      now: new Date(Date.UTC(2026, 10, 16, 12, 0, 0)),
      events: [
        {
          uid: "birth-person-1@family-tree",
          start: { year: 1991, month: 3, day: 27 },
          end: { year: 1991, month: 3, day: 28 },
          summary: "Mia Simpson's birthday",
          description: "Born 1991.\nSimpson family.",
          recurrenceRule: "FREQ=YEARLY",
        },
      ],
    });

    expect(body).toContain("BEGIN:VCALENDAR\r\n");
    expect(body).toContain("VERSION:2.0\r\n");
    expect(body).toContain("PRODID:-//family-tree//Birthdays//EN\r\n");
    expect(body).toContain("X-WR-CALNAME:Ada's family birthdays\r\n");
    expect(body).toContain("REFRESH-INTERVAL;VALUE=DURATION:PT12H\r\n");
    expect(body).toContain("DTSTAMP:20261116T120000Z\r\n");
    expect(body).toContain("DTSTART;VALUE=DATE:19910427\r\n");
    expect(body).toContain("DTEND;VALUE=DATE:19910428\r\n");
    expect(body).toContain("RRULE:FREQ=YEARLY\r\n");
    expect(body).toContain("SUMMARY:Mia Simpson's birthday\r\n");
    expect(body).toContain("DESCRIPTION:Born 1991.\\nSimpson family.\r\n");
    expect(body).toContain("TRANSP:TRANSPARENT\r\n");
    expect(body.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });
});
