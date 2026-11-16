export function asDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value: Date | string | null | undefined) {
  const date = asDate(value);
  if (!date) return "";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

export function formatCalendarDate(value: string | null | undefined) {
  if (!value) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return formatDate(value);
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

export function formatYears(birthDate?: string | null, deathDate?: string | null) {
  const birth = birthDate ? birthDate.slice(0, 4) : "";
  const death = deathDate ? deathDate.slice(0, 4) : "";
  if (!birth && !death) return "";
  if (birth && death) return `${birth} - ${death}`;
  if (birth) return `Born ${birth}`;
  return `Died ${death}`;
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

export function formatRelative(value: Date | string | null | undefined) {
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
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  for (const [unit, ms] of units) {
    if (abs >= ms || unit === "minute") {
      return formatter.format(Math.round(diff / ms), unit);
    }
  }
  return "just now";
}

export function roleLabel(role: "owner" | "editor" | "viewer") {
  return role === "owner" ? "Owner" : role === "editor" ? "Editor" : "Viewer";
}
