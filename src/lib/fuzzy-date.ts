export type PartialDate = {
  year: number | null;
  /** 1-12. */
  month: number | null;
  /** 1-31. */
  day: number | null;
};

export type FuzzyDateQualifier =
  | "exact"
  | "about"
  | "before"
  | "after"
  | "between"
  | "unknown";

/**
 * A date that may be partial, approximate, or a range. This is deliberately a
 * value object rather than a database date so "about 1920", "before 1900", and
 * a birthday with no known year all survive a round trip.
 */
export type FuzzyDate = {
  start: PartialDate;
  end?: PartialDate | null;
  qualifier: FuzzyDateQualifier;
};

export type BirthdayParts = {
  year: number | null;
  /** 1-12. */
  month: number;
  day: number;
};

const QUALIFIERS: FuzzyDateQualifier[] = [
  "exact",
  "about",
  "before",
  "after",
  "between",
  "unknown",
];

export function isLeapYear(year: number) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

export function daysInMonth(year: number | null, month: number) {
  if (month === 2) return isLeapYear(year ?? 2000) ? 29 : 28;
  return new Date(Date.UTC(year ?? 2000, month, 0)).getUTCDate();
}

export function emptyPartialDate(): PartialDate {
  return { year: null, month: null, day: null };
}

export function isQualifier(value: unknown): value is FuzzyDateQualifier {
  return typeof value === "string" && QUALIFIERS.includes(value as FuzzyDateQualifier);
}

export function isEmptyPartialDate(value: PartialDate | null | undefined) {
  return !value || (value.year === null && value.month === null && value.day === null);
}

export function isValidPartialDate(value: PartialDate): boolean {
  if (value.year !== null && (!Number.isInteger(value.year) || value.year < 1 || value.year > 9999)) {
    return false;
  }
  if (value.month !== null && (!Number.isInteger(value.month) || value.month < 1 || value.month > 12)) {
    return false;
  }
  if (value.day !== null && (!Number.isInteger(value.day) || value.day < 1 || value.day > 31)) {
    return false;
  }
  if (value.month === null && value.day !== null) return false;
  if (value.month !== null && value.day !== null) {
    if (value.day > daysInMonth(value.year, value.month)) return false;
  }
  return true;
}

export function isValidFuzzyDate(value: FuzzyDate): boolean {
  if (!isQualifier(value.qualifier)) return false;
  if (!isValidPartialDate(value.start)) return false;
  if (value.qualifier === "between") {
    if (!value.end || !isValidPartialDate(value.end)) return false;
    if (isEmptyPartialDate(value.start) || isEmptyPartialDate(value.end)) return false;
  }
  return true;
}

export function isEmptyFuzzyDate(value: FuzzyDate | null | undefined) {
  return (
    !value ||
    (value.qualifier === "unknown" && isEmptyPartialDate(value.start)) ||
    (isEmptyPartialDate(value.start) && isEmptyPartialDate(value.end ?? null))
  );
}

export function exactFuzzyDate(
  year: number | null,
  month: number | null = null,
  day: number | null = null,
): FuzzyDate {
  return {
    start: { year, month, day },
    qualifier: "exact",
  };
}

export function exactDateFromISO(value: string | null | undefined): FuzzyDate | null {
  const parts = partialDateFromISO(value);
  if (!parts) return null;
  return { start: parts, qualifier: "exact" };
}

export function partialDateFromISO(value: string | null | undefined): PartialDate | null {
  if (!value) return null;
  const match = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(value.trim());
  if (!match) return null;
  const parts: PartialDate = {
    year: Number(match[1]),
    month: match[2] ? Number(match[2]) : null,
    day: match[3] ? Number(match[3]) : null,
  };
  return isValidPartialDate(parts) ? parts : null;
}

function formatter(options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(undefined, { ...options, timeZone: "UTC" });
}

export function formatPartialDate(
  parts: PartialDate | null | undefined,
  options: { longMonth?: boolean } = {},
): string {
  if (!parts || isEmptyPartialDate(parts)) return "";

  const formatOptions: Intl.DateTimeFormatOptions = { timeZone: "UTC" };
  if (parts.year !== null) formatOptions.year = "numeric";
  if (parts.month !== null) formatOptions.month = options.longMonth ? "long" : "short";
  if (parts.day !== null) formatOptions.day = "numeric";

  const date = new Date(
    Date.UTC(parts.year ?? 2000, (parts.month ?? 1) - 1, parts.day ?? 1),
  );
  return formatter(formatOptions).format(date);
}

export function formatFuzzyDate(
  value: FuzzyDate | null | undefined,
  options: { longMonth?: boolean } = {},
): string {
  if (!value) return "";
  const start = formatPartialDate(value.start, options);

  switch (value.qualifier) {
    case "unknown":
      return "Unknown";
    case "about":
      return start ? `c. ${start}` : "Unknown";
    case "before":
      return start ? `before ${start}` : "Unknown";
    case "after":
      return start ? `after ${start}` : "Unknown";
    case "between": {
      const end = formatPartialDate(value.end, options);
      if (!start && !end) return "Unknown";
      if (!end) return start;
      return `${start} to ${end}`;
    }
    default:
      return start || "Unknown";
  }
}

function yearLabel(value: FuzzyDate | null | undefined): string {
  if (!value) return "";
  const year = value.start.year;
  switch (value.qualifier) {
    case "about":
      return year === null ? "?" : `c. ${year}`;
    case "before":
      return year === null ? "?" : `before ${year}`;
    case "after":
      return year === null ? "?" : `after ${year}`;
    case "between":
      return `${year ?? "?"}-${value.end?.year ?? "?"}`;
    case "unknown":
      return "?";
    default:
      return year === null ? "?" : String(year);
  }
}

export function formatFuzzyYearRange(
  birthDate: FuzzyDate | null | undefined,
  deathDate: FuzzyDate | null | undefined,
) {
  const birth = yearLabel(birthDate);
  const death = yearLabel(deathDate);
  if (birth && death) return `${birth} - ${death}`;
  return birth || death;
}

export function formatFuzzyYears(
  birthDate: FuzzyDate | null | undefined,
  deathDate: FuzzyDate | null | undefined,
) {
  const birth = yearLabel(birthDate);
  const death = yearLabel(deathDate);
  if (!birth && !death) return "";
  if (birth && death) return `${birth} - ${death}`;
  if (birth) return `Born ${birth}`;
  return `Died ${death}`;
}

export function fuzzyYear(value: FuzzyDate | null | undefined): number | null {
  return value?.start.year ?? null;
}

export function fuzzySortValue(value: FuzzyDate | null | undefined): number {
  if (!value || value.start.year === null) return Number.POSITIVE_INFINITY;
  return (
    value.start.year * 10_000 +
    (value.start.month ?? 1) * 100 +
    (value.start.day ?? 1)
  );
}

export function compareFuzzyDates(
  a: FuzzyDate | null | undefined,
  b: FuzzyDate | null | undefined,
) {
  return fuzzySortValue(a) - fuzzySortValue(b);
}

export type YearRange = { start: number; end: number };

/**
 * The plausible year span for a date. Used by duplicate detection, where an
 * exact year is a stronger signal than "about 1920".
 */
export function fuzzyYearRange(value: FuzzyDate | null | undefined): YearRange {
  if (!value) return { start: Number.NEGATIVE_INFINITY, end: Number.POSITIVE_INFINITY };
  const year = value.start.year;

  switch (value.qualifier) {
    case "before":
      return {
        start: Number.NEGATIVE_INFINITY,
        end: year ?? Number.POSITIVE_INFINITY,
      };
    case "after":
      return {
        start: year ?? Number.NEGATIVE_INFINITY,
        end: Number.POSITIVE_INFINITY,
      };
    case "between":
      return {
        start: year ?? Number.NEGATIVE_INFINITY,
        end: value.end?.year ?? Number.POSITIVE_INFINITY,
      };
    case "unknown":
      return { start: Number.NEGATIVE_INFINITY, end: Number.POSITIVE_INFINITY };
    default:
      return year === null
        ? { start: Number.NEGATIVE_INFINITY, end: Number.POSITIVE_INFINITY }
        : { start: year, end: year };
  }
}

export function fuzzyDatesOverlap(
  a: FuzzyDate | null | undefined,
  b: FuzzyDate | null | undefined,
) {
  const left = fuzzyYearRange(a);
  const right = fuzzyYearRange(b);
  return left.start <= right.end && right.start <= left.end;
}

/**
 * Returns the month and day used for birthdays and anniversaries. Approximate
 * dates are included when the day is known. Open-ended ranges are not.
 */
export function birthdayParts(value: FuzzyDate | null | undefined): BirthdayParts | null {
  if (!value) return null;
  if (value.qualifier !== "exact" && value.qualifier !== "about") return null;
  const { year, month, day } = value.start;
  if (month === null || day === null) return null;
  if (!isValidPartialDate({ year, month, day })) return null;
  return { year, month, day };
}
