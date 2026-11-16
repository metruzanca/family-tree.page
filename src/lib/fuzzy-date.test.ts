import { describe, expect, it } from "vitest";
import {
  birthdayParts,
  compareFuzzyDates,
  exactDateFromISO,
  exactFuzzyDate,
  formatFuzzyDate,
  formatFuzzyYears,
  fuzzyDatesOverlap,
  fuzzyYearRange,
  isValidFuzzyDate,
  isValidPartialDate,
  partialDateFromISO,
} from "./fuzzy-date";

describe("fuzzy dates", () => {
  it("parses full and partial ISO dates", () => {
    expect(partialDateFromISO("1952-04-18")).toEqual({ year: 1952, month: 4, day: 18 });
    expect(partialDateFromISO("1952-04")).toEqual({ year: 1952, month: 4, day: null });
    expect(partialDateFromISO("1952")).toEqual({ year: 1952, month: null, day: null });
    expect(partialDateFromISO("1952-02-30")).toBeNull();
    expect(partialDateFromISO("not a date")).toBeNull();
    expect(exactDateFromISO("1952-04-18")).toEqual({
      start: { year: 1952, month: 4, day: 18 },
      qualifier: "exact",
    });
  });

  it("validates partial dates", () => {
    expect(isValidPartialDate({ year: 1952, month: 4, day: 18 })).toBe(true);
    expect(isValidPartialDate({ year: 1952, month: null, day: 18 })).toBe(false);
    expect(isValidPartialDate({ year: null, month: 2, day: 29 })).toBe(true);
    expect(isValidPartialDate({ year: 1900, month: 2, day: 29 })).toBe(false);
  });

  it("validates qualifiers and ranges", () => {
    expect(isValidFuzzyDate(exactFuzzyDate(1952, 4, 18))).toBe(true);
    expect(
      isValidFuzzyDate({
        start: { year: 1890, month: null, day: null },
        end: { year: 1900, month: null, day: null },
        qualifier: "between",
      }),
    ).toBe(true);
    expect(
      isValidFuzzyDate({
        start: { year: 1890, month: null, day: null },
        qualifier: "between",
      }),
    ).toBe(false);
  });

  it("formats full, partial, and qualified dates", () => {
    expect(formatFuzzyDate(exactFuzzyDate(1952))).toBe("1952");
    expect(formatFuzzyDate(exactFuzzyDate(1952, 4))).toContain("1952");
    expect(formatFuzzyDate(exactFuzzyDate(1952, 4, 18))).toContain("1952");
    expect(formatFuzzyDate({ start: { year: 1952, month: null, day: null }, qualifier: "about" })).toBe(
      "c. 1952",
    );
    expect(
      formatFuzzyDate({ start: { year: 1900, month: null, day: null }, qualifier: "before" }),
    ).toBe("before 1900");
    expect(
      formatFuzzyDate({
        start: { year: 1890, month: null, day: null },
        end: { year: 1900, month: null, day: null },
        qualifier: "between",
      }),
    ).toBe("1890 to 1900");
    expect(formatFuzzyDate(null)).toBe("");
    expect(formatFuzzyDate({ start: { year: null, month: null, day: null }, qualifier: "unknown" })).toBe(
      "Unknown",
    );
  });

  it("formats year labels for graph and profile headers", () => {
    expect(
      formatFuzzyYears(exactFuzzyDate(1920, 5, 19), exactFuzzyDate(1987, 2, 2)),
    ).toBe("1920 - 1987");
    expect(formatFuzzyYears({ start: { year: 1920, month: null, day: null }, qualifier: "about" }, null)).toBe(
      "Born c. 1920",
    );
    expect(formatFuzzyYears(exactFuzzyDate(1920), null)).toBe("Born 1920");
    expect(formatFuzzyYears(null, exactFuzzyDate(1987))).toBe("Died 1987");
  });

  it("only treats dates with a known month and day as birthdays", () => {
    expect(birthdayParts(exactFuzzyDate(1952, 4, 18))).toEqual({
      year: 1952,
      month: 4,
      day: 18,
    });
    expect(birthdayParts(exactFuzzyDate(1952, 4))).toBeNull();
    expect(birthdayParts(exactFuzzyDate(null, 4, 18))).toEqual({
      year: null,
      month: 4,
      day: 18,
    });
    expect(
      birthdayParts({ start: { year: 1952, month: 4, day: 18 }, qualifier: "before" }),
    ).toBeNull();
  });

  it("sorts known years before unknown ones", () => {
    expect(compareFuzzyDates(exactFuzzyDate(1920), exactFuzzyDate(1987))).toBeLessThan(0);
    expect(compareFuzzyDates(exactFuzzyDate(1920), null)).toBeLessThan(0);
    expect(compareFuzzyDates(null, exactFuzzyDate(1920))).toBeGreaterThan(0);
  });

  it("builds plausible year ranges for duplicate checks", () => {
    expect(fuzzyYearRange(exactFuzzyDate(1920))).toEqual({ start: 1920, end: 1920 });
    expect(
      fuzzyYearRange({
        start: { year: 1890, month: null, day: null },
        end: { year: 1900, month: null, day: null },
        qualifier: "between",
      }),
    ).toEqual({ start: 1890, end: 1900 });
    expect(fuzzyYearRange(null).start).toBe(Number.NEGATIVE_INFINITY);
    expect(fuzzyDatesOverlap(exactFuzzyDate(1920), exactFuzzyDate(1920))).toBe(true);
    expect(fuzzyDatesOverlap(exactFuzzyDate(1920), exactFuzzyDate(1921))).toBe(false);
    expect(
      fuzzyDatesOverlap(
        { start: { year: 1920, month: null, day: null }, qualifier: "about" },
        exactFuzzyDate(1921),
      ),
    ).toBe(false);
  });
});
