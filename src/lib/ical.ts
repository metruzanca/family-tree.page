import type { DateParts } from "./calendar";

export type ICalEvent = {
  uid: string;
  start: DateParts;
  /** Exclusive end date, as required for all-day iCal events. */
  end: DateParts;
  summary: string;
  description?: string;
  recurrenceRule?: string;
};

export type ICalCalendar = {
  name: string;
  description?: string;
  events: ICalEvent[];
  now?: Date;
};

const CRLF = "\r\n";
const FOLD_LIMIT = 75;
const encoder = new TextEncoder();

/** Escapes text values as required by RFC 5545 section 3.3.11. */
export function escapeICalText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

/** Formats a calendar date as an all-day iCal value: YYYYMMDD. */
export function formatICalDate(parts: DateParts) {
  return `${String(parts.year).padStart(4, "0")}${String(parts.month + 1).padStart(2, "0")}${String(parts.day).padStart(2, "0")}`;
}

export function formatICalUtc(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}

/**
 * Folds long content lines at 75 octets. Continuation lines start with a
 * single space, and multi-byte UTF-8 characters are never split.
 */
export function foldICalLine(line: string) {
  if (encoder.encode(line).length <= FOLD_LIMIT) return line;

  const parts: string[] = [];
  let current = "";
  let currentBytes = 0;

  for (const character of line) {
    const characterBytes = encoder.encode(character).length;
    if (currentBytes + characterBytes > FOLD_LIMIT) {
      parts.push(current);
      current = " ";
      currentBytes = 1;
    }
    current += character;
    currentBytes += characterBytes;
  }
  parts.push(current);

  return parts.join(CRLF);
}

function eventLines(event: ICalEvent, stamp: string) {
  const lines = [
    "BEGIN:VEVENT",
    `UID:${escapeICalText(event.uid)}`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${formatICalDate(event.start)}`,
    `DTEND;VALUE=DATE:${formatICalDate(event.end)}`,
  ];

  if (event.recurrenceRule) lines.push(`RRULE:${event.recurrenceRule}`);
  lines.push(`SUMMARY:${escapeICalText(event.summary)}`);
  if (event.description) lines.push(`DESCRIPTION:${escapeICalText(event.description)}`);
  lines.push("TRANSP:TRANSPARENT", "STATUS:CONFIRMED", "END:VEVENT");

  return lines;
}

export function buildICalendar(calendar: ICalCalendar) {
  const stamp = formatICalUtc(calendar.now ?? new Date());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//family-tree//Birthdays//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeICalText(calendar.name)}`,
  ];

  if (calendar.description) {
    lines.push(`X-WR-CALDESC:${escapeICalText(calendar.description)}`);
  }

  lines.push(
    "REFRESH-INTERVAL;VALUE=DURATION:PT12H",
    "X-PUBLISHED-TTL:PT12H",
  );

  for (const event of calendar.events) {
    lines.push(...eventLines(event, stamp));
  }

  lines.push("END:VCALENDAR");

  return `${lines.map(foldICalLine).join(CRLF)}${CRLF}`;
}
