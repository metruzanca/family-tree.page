import {
  isValidPartialDate,
  type FuzzyDate,
  type PartialDate,
} from "./fuzzy-date";
import type { PersonEventKind } from "./person-events";
import { isPersonSex, type PersonSex } from "./person-sex";

export const MAX_GEDCOM_CHARS = 5_000_000;
export const MAX_IMPORT_PEOPLE = 5_000;
export const MAX_IMPORT_WARNINGS = 200;

export type GedcomWarningKind =
  | "line"
  | "date"
  | "name"
  | "sex"
  | "missing-person"
  | "duplicate-family"
  | "too-many-partners"
  | "media-skipped"
  | "sources-skipped"
  | "truncated"
  | "unsupported";

export type GedcomWarning = {
  kind: GedcomWarningKind;
  message: string;
  line?: number;
  xref?: string;
};

export type GedcomImportedEvent = {
  kind: PersonEventKind;
  title: string | null;
  place: string | null;
  date: FuzzyDate | null;
  description: string | null;
};

export type GedcomImportedPerson = {
  xref: string;
  firstName: string;
  lastName: string;
  maidenName: string | null;
  nickname: string | null;
  sex: PersonSex;
  birthDate: FuzzyDate | null;
  deathDate: FuzzyDate | null;
  birthPlace: string | null;
  deathPlace: string | null;
  bio: string | null;
  events: GedcomImportedEvent[];
  mediaRefs: string[];
};

export type GedcomImportedFamily = {
  xref: string;
  partnerXrefs: string[];
  childXrefs: string[];
  status: "married" | "partnered" | "divorced" | "separated" | "widowed" | "unknown";
  startDate: FuzzyDate | null;
  endDate: FuzzyDate | null;
};

export type GedcomImportResult = {
  people: GedcomImportedPerson[];
  families: GedcomImportedFamily[];
  warnings: GedcomWarning[];
  stats: {
    people: number;
    families: number;
    events: number;
    media: number;
    notes: number;
    sources: number;
    ignored: number;
    warnings: number;
    warningsHidden: number;
  };
};

type Node = {
  level: number;
  xref: string | null;
  tag: string;
  value: string;
  line: number;
  children: Node[];
};

const LINE_PATTERN = /^\s*(\d+)\s+(?:(@[^@\s]+@)\s+)?([A-Za-z0-9_]+)(?:\s(.*))?$/;
const MONTHS: Record<string, number> = {
  JAN: 1,
  JANUARY: 1,
  FEB: 2,
  FEBRUARY: 2,
  MAR: 3,
  MARCH: 3,
  APR: 4,
  APRIL: 4,
  MAY: 5,
  JUN: 6,
  JUNE: 6,
  JUL: 7,
  JULY: 7,
  AUG: 8,
  AUGUST: 8,
  SEP: 9,
  SEPT: 9,
  SEPTEMBER: 9,
  OCT: 10,
  OCTOBER: 10,
  NOV: 11,
  NOVEMBER: 11,
  DEC: 12,
  DECEMBER: 12,
};

const EVENT_KIND_BY_TAG: Record<string, PersonEventKind> = {
  BURI: "burial",
  CREM: "burial",
  RESI: "residence",
  CENS: "residence",
  OCCU: "occupation",
  EDUC: "education",
  GRAD: "education",
  MILI: "military",
  IMMI: "immigration",
  EMIG: "emigration",
  MARR: "marriage",
  DIV: "divorce",
  DIVF: "divorce",
};

const EXTRA_EVENT_LABELS: Record<string, string> = {
  CHR: "Christening",
  BAPM: "Baptism",
  BARM: "Bar mitzvah",
  BASM: "Bat mitzvah",
  BLES: "Blessing",
  CONF: "Confirmation",
  FCOM: "First communion",
  ORDN: "Ordination",
  NATU: "Naturalization",
  WILL: "Will",
  PROB: "Probate",
  ADOP: "Adoption",
  ANUL: "Annulment",
  ENGA: "Engagement",
  MARB: "Marriage banns",
  MARC: "Marriage contract",
  MARL: "Marriage license",
  MARS: "Marriage settlement",
  RETI: "Retirement",
  EVEN: "Event",
};

const NAME_SKIP_TAGS = new Set([
  "NAME",
  "SEX",
  "BIRT",
  "DEAT",
  "FAMC",
  "FAMS",
  "NOTE",
  "OBJE",
  "SOUR",
  "REFN",
  "RIN",
  "AFN",
  "RFN",
  "UID",
  "CHAN",
  "BAPL",
  "ENDL",
  "SLGC",
  "SUBM",
  "ADDR",
  "PHON",
  "EMAIL",
  "FAX",
  "WWW",
  "RESN",
  "ALIA",
  "ANCI",
  "DESI",
  "ASSO",
  "NCHI",
  "NMR",
  "PROP",
  "CAST",
  "DSCR",
  "IDNO",
  "NATI",
  "RELI",
  "SSN",
  "TITL",
  "LANG",
  "FAMF",
  "TEMP",
]);

class WarningLog {
  readonly items: GedcomWarning[] = [];
  total = 0;

  add(
    kind: GedcomWarningKind,
    message: string,
    extra: { line?: number; xref?: string | null } = {},
  ) {
    this.total += 1;
    if (this.items.length >= MAX_IMPORT_WARNINGS) return;
    this.items.push({
      kind,
      message,
      line: extra.line,
      xref: extra.xref ?? undefined,
    });
  }
}

function unescapeValue(value: string) {
  return value.replaceAll("@@", "@");
}

function collapse(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function clamp(
  value: string | null | undefined,
  max: number,
  label: string,
  warnings: WarningLog,
  line?: number,
) {
  if (!value) return null;
  const text = value.trim();
  if (!text) return null;
  if (text.length <= max) return text;
  warnings.add(
    "truncated",
    `${label} was longer than ${max} characters and was shortened.`,
    { line },
  );
  return text.slice(0, max);
}

function child(node: Node, tag: string) {
  return node.children.find(entry => entry.tag === tag) ?? null;
}

function children(node: Node, tag: string) {
  return node.children.filter(entry => entry.tag === tag);
}

function childValue(node: Node, tag: string) {
  const entry = child(node, tag);
  return entry ? collapse(entry.value) : "";
}

function allChildValues(node: Node, tag: string) {
  return children(node, tag).map(entry => collapse(entry.value)).filter(Boolean);
}

export function parseGedcomDate(value: string): {
  date: FuzzyDate | null;
  problem?: string;
} {
  let text = value.trim();
  if (!text || text === "?" || text.toUpperCase() === "UNKNOWN") {
    return { date: null };
  }

  text = text.replace(/^@#[A-Z]+@\s*/i, "");

  if (/^\(.*\)$/.test(text)) {
    return { date: null, problem: `Date phrase "${text}" cannot be represented.` };
  }

  const upper = text.toUpperCase();
  const prefix = /^(ABT|CAL|EST|INT|BEF|AFT)\s+(.+)$/.exec(upper);
  if (prefix) {
    const qualifier =
      prefix[1] === "BEF" ? "before" : prefix[1] === "AFT" ? "after" : "about";
    const inner = parseGedcomDate(prefix[2]);
    if (!inner.date) {
      return { date: null, problem: inner.problem ?? `Could not read date "${value}".` };
    }
    return {
      date: {
        start: inner.date.start,
        end: inner.date.end,
        qualifier,
      },
    };
  }

  const between = /^BET\s+(.+?)\s+AND\s+(.+)$/.exec(upper);
  if (between) {
    const start = parseDatePoint(between[1]);
    const end = parseDatePoint(between[2]);
    if (start.date && end.date) {
      return {
        date: { start: start.date, end: end.date, qualifier: "between" },
      };
    }
    return {
      date: null,
      problem: `Could not read the date range "${value}".`,
    };
  }

  const fromTo = /^FROM\s+(.+?)\s+TO\s+(.+)$/.exec(upper);
  if (fromTo) {
    const start = parseDatePoint(fromTo[1]);
    const end = parseDatePoint(fromTo[2]);
    if (start.date && end.date) {
      return {
        date: { start: start.date, end: end.date, qualifier: "between" },
      };
    }
  }

  const from = /^FROM\s+(.+)$/.exec(upper);
  if (from) {
    const point = parseDatePoint(from[1]);
    if (point.date) {
      return { date: { start: point.date, qualifier: "after" } };
    }
  }

  const to = /^TO\s+(.+)$/.exec(upper);
  if (to) {
    const point = parseDatePoint(to[1]);
    if (point.date) {
      return { date: { start: point.date, qualifier: "before" } };
    }
  }

  const range = /^(\d{3,4})\s*-\s*(\d{3,4})$/.exec(text);
  if (range) {
    const start = Number(range[1]);
    const end = Number(range[2]);
    if (start <= end) {
      return {
        date: {
          start: { year: start, month: null, day: null },
          end: { year: end, month: null, day: null },
          qualifier: "between",
        },
      };
    }
  }

  const point = parseDatePoint(text);
  if (point.date) return { date: { start: point.date, qualifier: "exact" } };
  return {
    date: null,
    problem: point.problem ?? `Could not read date "${value}".`,
  };
}

function parseDatePoint(value: string): { date: PartialDate | null; problem?: string } {
  const text = value.trim().toUpperCase().replace(/\s+/g, " ");
  const dayMonthYear = /^(\d{1,2})\s+([A-Z]+)\s+(\d{3,4})$/.exec(text);
  if (dayMonthYear) {
    const month = MONTHS[dayMonthYear[2]];
    if (month === undefined) {
      return { date: null, problem: `"${value}" has an unknown month.` };
    }
    const parts = buildParts(
      Number(dayMonthYear[3]),
      month,
      Number(dayMonthYear[1]),
    );
    return parts
      ? { date: parts }
      : { date: null, problem: `"${value}" is not a valid date.` };
  }

  const monthYear = /^([A-Z]+)\s+(\d{3,4})$/.exec(text);
  if (monthYear) {
    const month = MONTHS[monthYear[1]];
    if (month === undefined) {
      return { date: null, problem: `"${value}" has an unknown month.` };
    }
    const parts = buildParts(Number(monthYear[2]), month, null);
    return parts
      ? { date: parts }
      : { date: null, problem: `"${value}" is not a valid date.` };
  }

  const yearOnly = /^(\d{3,4})$/.exec(text);
  if (yearOnly) {
    const parts = buildParts(Number(yearOnly[1]), null, null);
    return parts
      ? { date: parts }
      : { date: null, problem: `"${value}" is not a valid year.` };
  }

  if (/^\d{1,2}\s+[A-Z]{3,9}\s+\d{1,2}$/.test(text)) {
    return {
      date: null,
      problem: `"${value}" uses a two-digit year, which is ambiguous.`,
    };
  }

  if (/^\d{1,2}$/.test(text)) {
    return {
      date: null,
      problem: `"${value}" uses a two-digit year, which is ambiguous.`,
    };
  }

  return { date: null, problem: `Could not read date "${value}".` };
}

function buildParts(
  year: number,
  month: number | null | undefined,
  day: number | null,
): PartialDate | null {
  if (!Number.isInteger(year) || year < 1 || year > 9999) return null;
  if (month === undefined && day !== null) return null;
  const parts: PartialDate = { year, month: month ?? null, day };
  return isValidPartialDate(parts) ? parts : null;
}

function readNote(
  node: Node,
  noteRecords: Map<string, string>,
): string | null {
  const raw = node.value.trim();
  const reference = /^@([^@]+)@$/.exec(raw);
  if (reference) {
    const note = noteRecords.get(reference[1]);
    return note ? unescapeValue(note).trim() || null : null;
  }
  const value = unescapeValue(raw).trim();
  return value || null;
}

function readNotes(node: Node, noteRecords: Map<string, string>) {
  return children(node, "NOTE")
    .map(entry => readNote(entry, noteRecords))
    .filter((value): value is string => Boolean(value));
}

function parseName(value: string) {
  const text = unescapeValue(value).trim();
  const firstSlash = text.indexOf("/");
  if (firstSlash === -1) {
    return { given: collapse(text), surname: "", suffix: "" };
  }
  const secondSlash = text.indexOf("/", firstSlash + 1);
  if (secondSlash === -1) {
    return { given: collapse(text), surname: "", suffix: "" };
  }
  return {
    given: collapse(text.slice(0, firstSlash)),
    surname: collapse(text.slice(firstSlash + 1, secondSlash)),
    suffix: collapse(text.slice(secondSlash + 1)),
  };
}

function nameType(node: Node) {
  return childValue(node, "TYPE").toLowerCase();
}

function readName(node: Node, warnings: WarningLog) {
  const parsed = parseName(node.value);
  const given = childValue(node, "GIVN") || parsed.given;
  const surname = childValue(node, "SURN") || parsed.surname;
  let suffix = childValue(node, "NSFX") || parsed.suffix;
  const prefix = childValue(node, "NPFX");
  if (suffix) {
    warnings.add(
      "name",
      `The name suffix "${suffix}" was moved into the last name because the app has no suffix field.`,
      { line: node.line },
    );
    suffix = collapse(`${surname} ${suffix}`);
  }
  return {
    given: collapse(`${prefix} ${given}`),
    surname: suffix || surname,
    nickname: childValue(node, "NICK"),
    type: nameType(node),
  };
}

function eventKindForEven(type: string): PersonEventKind {
  const normalized = type.toLowerCase();
  if (normalized.includes("marriage")) return "marriage";
  if (normalized.includes("divorce")) return "divorce";
  if (normalized.includes("residence")) return "residence";
  if (normalized.includes("occupation")) return "occupation";
  if (normalized.includes("education") || normalized.includes("graduation")) {
    return "education";
  }
  if (normalized.includes("military")) return "military";
  if (normalized.includes("immigration")) return "immigration";
  if (normalized.includes("emigration")) return "emigration";
  if (normalized.includes("burial") || normalized.includes("cremation")) {
    return "burial";
  }
  return "other";
}

function readEvent(
  node: Node,
  kind: PersonEventKind,
  noteRecords: Map<string, string>,
  warnings: WarningLog,
) {
  const dateValue = childValue(node, "DATE");
  let date: FuzzyDate | null = null;
  if (dateValue) {
    const parsed = parseGedcomDate(dateValue);
    date = parsed.date;
    if (parsed.problem) {
      warnings.add("date", parsed.problem, { line: node.line });
    }
  }
  const place = clamp(childValue(node, "PLAC"), 160, "Place", warnings, node.line);
  const notes = readNotes(node, noteRecords);
  const description = clamp(
    notes.join("\n\n") || null,
    2000,
    "Event note",
    warnings,
    node.line,
  );
  const type = childValue(node, "TYPE");
  const defaultLabel = EXTRA_EVENT_LABELS[node.tag] ?? null;
  const titleValue =
    node.tag === "OCCU" || node.tag === "EDUC" || node.tag === "MILI"
      ? unescapeValue(node.value).trim()
      : "";
  const title = clamp(
    titleValue || (node.tag === "EVEN" ? type || defaultLabel : defaultLabel),
    120,
    "Event title",
    warnings,
    node.line,
  );
  if (!date && !place && !description && !title) return null;
  return {
    kind,
    title,
    place,
    date,
    description,
  } satisfies GedcomImportedEvent;
}

function readPerson(
  record: Node,
  noteRecords: Map<string, string>,
  warnings: WarningLog,
) {
  if (!record.xref) {
    warnings.add("missing-person", "A person record has no id and was skipped.", {
      line: record.line,
    });
    return null;
  }

  const nameNodes = children(record, "NAME");
  const names = nameNodes.map(node => readName(node, warnings));
  const primary =
    names.find(name => !name.type.includes("maiden") && !name.type.includes("aka")) ??
    names[0] ??
    null;
  const maiden =
    names.find(name => name.type.includes("maiden") || name.type.includes("birth")) ??
    null;
  const aka =
    names.find(name => name.type.includes("aka") || name.type.includes("nick")) ??
    null;

  if (!primary) {
    warnings.add("name", "A person has no name and was imported as Unknown.", {
      line: record.line,
      xref: record.xref,
    });
  }

  const sexValue = childValue(record, "SEX").toUpperCase();
  const sex: PersonSex =
    sexValue === "M"
      ? "male"
      : sexValue === "F"
        ? "female"
        : sexValue === "O"
          ? "other"
          : "unknown";
  if (sexValue && !["M", "F", "O", "U", ""].includes(sexValue)) {
    warnings.add("sex", `Unrecognised sex "${sexValue}" was imported as unknown.`, {
      line: record.line,
      xref: record.xref,
    });
  }

  let birthDate: FuzzyDate | null = null;
  let birthPlace: string | null = null;
  let deathDate: FuzzyDate | null = null;
  let deathPlace: string | null = null;
  const bioParts: string[] = [];
  const events: GedcomImportedEvent[] = [];
  const personMedia = new Set<string>();

  for (const node of record.children) {
    if (node.tag === "BIRT" || node.tag === "DEAT") {
      const dateValue = childValue(node, "DATE");
      let date: FuzzyDate | null = null;
      if (dateValue) {
        const parsed = parseGedcomDate(dateValue);
        date = parsed.date;
        if (parsed.problem) {
          warnings.add("date", parsed.problem, { line: node.line, xref: record.xref });
        }
      }
      const place = clamp(
        childValue(node, "PLAC"),
        160,
        "Place",
        warnings,
        node.line,
      );
      if (node.tag === "BIRT") {
        birthDate = date;
        birthPlace = place;
      } else {
        deathDate = date;
        deathPlace = place;
      }
      const notes = readNotes(node, noteRecords);
      if (notes.length) {
        bioParts.push(`${node.tag === "BIRT" ? "Birth" : "Death"}: ${notes.join(" ")}`);
      }
      continue;
    }

    if (node.tag === "NOTE") {
      const note = readNote(node, noteRecords);
      if (note) bioParts.push(note);
      continue;
    }

    if (node.tag === "OBJE") {
      const ref = node.value.trim().replace(/^@|@$/g, "");
      const file = childValue(node, "FILE");
      if (ref) personMedia.add(ref);
      else if (file) personMedia.add(file);
      continue;
    }

    if (node.tag === "SOUR") {
      continue;
    }

    if (node.tag === "EVEN") {
      const type = childValue(node, "TYPE");
      const event = readEvent(
        node,
        eventKindForEven(type),
        noteRecords,
        warnings,
      );
      if (event) events.push(event);
      continue;
    }

    const kind = EVENT_KIND_BY_TAG[node.tag];
    if (kind) {
      const event = readEvent(node, kind, noteRecords, warnings);
      if (event) events.push(event);
      continue;
    }

    if (EXTRA_EVENT_LABELS[node.tag]) {
      const event = readEvent(node, "other", noteRecords, warnings);
      if (event) events.push(event);
      continue;
    }

    if (!NAME_SKIP_TAGS.has(node.tag) && !node.tag.startsWith("_")) {
      warnings.add(
        "unsupported",
        `The ${node.tag.toLowerCase()} tag was not imported.`,
        { line: node.line, xref: record.xref },
      );
    }
  }

  const bio = clamp(
    bioParts.join("\n\n") || null,
    4000,
    "Biography",
    warnings,
    record.line,
  );

  return {
    xref: record.xref,
    firstName: clamp(primary?.given || "Unknown", 80, "First name", warnings, record.line) || "Unknown",
    lastName: clamp(primary?.surname || "", 80, "Last name", warnings, record.line) || "",
    maidenName: maiden
      ? clamp(maiden.surname || null, 80, "Maiden name", warnings, record.line)
      : null,
    nickname: clamp(
      primary?.nickname || aka?.given || null,
      80,
      "Nickname",
      warnings,
      record.line,
    ),
    sex,
    birthDate,
    deathPlace,
    birthPlace,
    deathDate,
    bio,
    events,
    mediaRefs: [...personMedia],
  } satisfies GedcomImportedPerson;
}

function readFamily(
  record: Node,
  noteRecords: Map<string, string>,
  warnings: WarningLog,
): GedcomImportedFamily | null {
  if (!record.xref) {
    warnings.add("missing-person", "A family record has no id and was skipped.", {
      line: record.line,
    });
    return null;
  }

  let partnerXrefs = [
    ...allChildValues(record, "HUSB"),
    ...allChildValues(record, "WIFE"),
  ].map(value => value.replace(/^@|@$/g, ""));

  if (partnerXrefs.length > 2) {
    warnings.add(
      "too-many-partners",
      "A family has more than two partners. Only the first two were imported.",
      { line: record.line, xref: record.xref },
    );
    partnerXrefs = partnerXrefs.slice(0, 2);
  }

  const childXrefs = allChildValues(record, "CHIL").map(value =>
    value.replace(/^@|@$/g, ""),
  );

  let status: GedcomImportedFamily["status"] = "partnered";
  let startDate: FuzzyDate | null = null;
  let endDate: FuzzyDate | null = null;

  const readDate = (node: Node) => {
    const value = childValue(node, "DATE");
    if (!value) return null;
    const parsed = parseGedcomDate(value);
    if (parsed.problem) {
      warnings.add("date", parsed.problem, { line: node.line, xref: record.xref });
    }
    return parsed.date;
  };

  const marriage = child(record, "MARR");
  if (marriage) {
    status = "married";
    startDate = readDate(marriage);
  }
  const divorce = child(record, "DIV") ?? child(record, "DIVF");
  if (divorce) {
    status = "divorced";
    endDate = readDate(divorce);
  }

  for (const event of children(record, "EVEN")) {
    const type = childValue(event, "TYPE").toLowerCase();
    const date = readDate(event);
    if (type.includes("separation")) {
      status = "separated";
      endDate = date ?? endDate;
    } else if (type.includes("widow")) {
      status = "widowed";
      endDate = date ?? endDate;
    } else if (type.includes("partner") && status === "partnered") {
      startDate = date ?? startDate;
    }
  }

  const notes = readNotes(record, noteRecords);
  if (notes.length) {
    warnings.add(
      "unsupported",
      "Family notes were not imported because the app has no family notes field.",
      { line: record.line, xref: record.xref },
    );
  }

  return {
    xref: record.xref,
    partnerXrefs: [...new Set(partnerXrefs)],
    childXrefs: [...new Set(childXrefs)],
    status,
    startDate,
    endDate,
  };
}

const STATUS_RANK: Record<GedcomImportedFamily["status"], number> = {
  unknown: 0,
  partnered: 1,
  married: 2,
  widowed: 3,
  separated: 4,
  divorced: 5,
};

function mergeStatus(
  left: GedcomImportedFamily["status"],
  right: GedcomImportedFamily["status"],
) {
  return STATUS_RANK[left] >= STATUS_RANK[right] ? left : right;
}

function collectSources(node: Node, sources: Set<string>) {
  for (const child of node.children) {
    if (child.tag === "SOUR") {
      const raw = child.value.trim();
      const ref = raw.replace(/^@|@$/g, "");
      sources.add(ref || `line:${child.line}`);
    }
    collectSources(child, sources);
  }
}

function parseLines(text: string, warnings: WarningLog) {
  const roots: Node[] = [];
  const stack: Node[] = [];
  const lines = text.replace(/^\uFEFF/, "").split(/\r\n|\n|\r/);

  lines.forEach((raw, index) => {
    const lineNumber = index + 1;
    if (!raw.trim()) return;
    const match = LINE_PATTERN.exec(raw);
    if (!match) {
      warnings.add("line", `Line ${lineNumber} could not be read: ${raw.slice(0, 80)}`, {
        line: lineNumber,
      });
      return;
    }
    const level = Number(match[1]);
    const node: Node = {
      level,
      xref: match[2] ? match[2].replace(/^@|@$/g, "") : null,
      tag: match[3].toUpperCase(),
      value: match[4] ?? "",
      line: lineNumber,
      children: [],
    };

    while (stack.length && stack[stack.length - 1].level >= level) {
      stack.pop();
    }
    if (level === 0) {
      roots.push(node);
    } else if (!stack.length) {
      warnings.add("line", `Line ${lineNumber} has no parent and was skipped.`, {
        line: lineNumber,
      });
      return;
    } else {
      const parent = stack[stack.length - 1];
      if (level !== parent.level + 1) {
        warnings.add(
          "line",
          `Line ${lineNumber} skips a level. It was attached to the nearest parent.`,
          { line: lineNumber },
        );
      }
      parent.children.push(node);
    }
    stack.push(node);
  });

  return roots;
}

function foldContinuations(node: Node) {
  const kept: Node[] = [];
  for (const child of node.children) {
    if (child.tag === "CONC") {
      node.value += child.value;
      continue;
    }
    if (child.tag === "CONT") {
      node.value += `\n${child.value}`;
      continue;
    }
    kept.push(child);
  }
  node.children = kept;
  for (const child of node.children) foldContinuations(child);
}

/**
 * Parses a GEDCOM 5.5.1 file into people and families. It never throws for bad
 * records: it reports them as warnings and imports what it can.
 */
export function parseGedcom(text: string): GedcomImportResult {
  const warnings = new WarningLog();
  const roots = parseLines(text, warnings);
  for (const root of roots) foldContinuations(root);

  const noteRecords = new Map<string, string>();
  for (const root of roots) {
    if (root.tag === "NOTE" && root.xref) {
      noteRecords.set(root.xref.replace(/^@|@$/g, ""), root.value);
    }
  }

  const mediaRefs = new Set<string>();
  const sourceRefs = new Set<string>();
  let ignored = 0;
  const people: GedcomImportedPerson[] = [];
  const rawFamilies: GedcomImportedFamily[] = [];

  for (const root of roots) {
    switch (root.tag) {
      case "HEAD":
      case "TRLR":
      case "SUBM":
      case "REPO":
        break;
      case "NOTE":
        break;
      case "SOUR":
        sourceRefs.add(root.xref ?? `record:${root.line}`);
        break;
      case "OBJE": {
        const file = childValue(root, "FILE");
        const ref = root.xref ?? file;
        if (ref) mediaRefs.add(ref);
        break;
      }
      case "INDI": {
        const person = readPerson(root, noteRecords, warnings);
        if (person) {
          people.push(person);
          for (const ref of person.mediaRefs) mediaRefs.add(ref);
        }
        collectSources(root, sourceRefs);
        break;
      }
      case "FAM": {
        const family = readFamily(root, noteRecords, warnings);
        if (family) rawFamilies.push(family);
        collectSources(root, sourceRefs);
        break;
      }
      default:
        ignored += 1;
        break;
    }
  }

  const personByXref = new Map(people.map(person => [person.xref, person]));
  const merged = new Map<string, GedcomImportedFamily>();

  for (const family of rawFamilies) {
    const partners = family.partnerXrefs.filter(xref => {
      if (personByXref.has(xref)) return true;
      warnings.add(
        "missing-person",
        `A family refers to partner ${xref}, which is not in the file.`,
        { xref: family.xref },
      );
      return false;
    });
    const childRefs = family.childXrefs.filter(xref => {
      if (personByXref.has(xref)) return true;
      warnings.add(
        "missing-person",
        `A family refers to child ${xref}, which is not in the file.`,
        { xref: family.xref },
      );
      return false;
    });

    if (!partners.length) {
      if (childRefs.length) {
        warnings.add(
          "missing-person",
          "A family has children but no partners in the file. Those children were skipped.",
          { xref: family.xref },
        );
      }
      continue;
    }

    const key = [...partners].sort().join("|");
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, {
        ...family,
        partnerXrefs: partners,
        childXrefs: childRefs,
      });
      continue;
    }
    warnings.add(
      "duplicate-family",
      "Two family records with the same partners were merged.",
      { xref: family.xref },
    );
    existing.childXrefs = [...new Set([...existing.childXrefs, ...childRefs])];
    existing.startDate ??= family.startDate;
    existing.endDate ??= family.endDate;
    existing.status = mergeStatus(existing.status, family.status);
  }

  const families = [...merged.values()].filter(
    family => family.partnerXrefs.length > 0 && (family.partnerXrefs.length > 1 || family.childXrefs.length),
  );

  if (mediaRefs.size) {
    warnings.add(
      "media-skipped",
      `${mediaRefs.size} media reference${mediaRefs.size === 1 ? " was" : "s were"} skipped because GEDCOM files do not contain the files themselves.`,
    );
  }
  if (sourceRefs.size) {
    warnings.add(
      "sources-skipped",
      `${sourceRefs.size} source citation${sourceRefs.size === 1 ? " was" : "s were"} skipped because the app does not have source records yet.`,
    );
  }
  const eventCount = people.reduce((total, person) => total + person.events.length, 0);

  return {
    people,
    families,
    warnings: warnings.items,
    stats: {
      people: people.length,
      families: families.length,
      events: eventCount,
      media: mediaRefs.size,
      notes: noteRecords.size,
      sources: sourceRefs.size,
      ignored,
      warnings: warnings.total,
      warningsHidden: Math.max(0, warnings.total - warnings.items.length),
    },
  };
}
