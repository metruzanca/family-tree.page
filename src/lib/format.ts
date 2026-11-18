import { localeTag, translate, type Locale } from "../i18n";
import { formatFuzzyYears, type FuzzyDate } from "./fuzzy-date";

export function asDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(
  value: Date | string | null | undefined,
  locale: Locale = "en",
) {
  const date = asDate(value);
  if (!date) return "";
  return new Intl.DateTimeFormat(localeTag(locale), {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

export function formatYears(
  birthDate?: FuzzyDate | null,
  deathDate?: FuzzyDate | null,
  locale: Locale = "en",
) {
  return formatFuzzyYears(birthDate, deathDate, locale);
}

export function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

export function formatRelative(
  value: Date | string | null | undefined,
  locale: Locale = "en",
) {
  const date = asDate(value);
  if (!date) return "";
  const diff = date.getTime() - Date.now();
  const abs = Math.abs(diff);
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 365 * 24 * 60 * 60_000],
    ["month", 30 * 24 * 60 * 60_000],
    ["week", 7 * 24 * 60 * 60_000],
    ["day", 24 * 60 * 60_000],
    ["hour", 60 * 60_000],
    ["minute", 60_000],
  ];
  const formatter = new Intl.RelativeTimeFormat(localeTag(locale), { numeric: "auto" });
  for (const [unit, ms] of units) {
    if (abs >= ms || unit === "minute") {
      return formatter.format(Math.round(diff / ms), unit);
    }
  }
  return translate(locale, "date.justNow");
}

export type Role = "owner" | "editor" | "viewer";

export function roleKey(role: Role) {
  return role === "owner"
    ? ("common.roleOwner" as const)
    : role === "editor"
      ? ("common.roleEditor" as const)
      : ("common.roleViewer" as const);
}

/** English label for emails and other non-UI output. */
export function roleLabel(role: Role) {
  return role === "owner" ? "Owner" : role === "editor" ? "Editor" : "Viewer";
}
