import { createHash } from "node:crypto";
import { fuzzySortValue, type FuzzyDate } from "./fuzzy-date";
import type { PersonEventKind } from "./person-events";
import { gedcomSex, type PersonSex } from "./person-sex";

export type GedcomPerson = {
  id: string;
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
};

export type GedcomParentRelationship = {
  id: string;
  type: "parent";
  source: string;
  target: string;
};

export type GedcomPartnerRelationship = {
  id: string;
  type: "partner";
  source: string;
  target: string;
  status: string;
  startDate: FuzzyDate | null;
  endDate: FuzzyDate | null;
};

export type GedcomRelationship =
  | GedcomParentRelationship
  | GedcomPartnerRelationship;

export type GedcomEvent = {
  id: string;
  personId: string;
  kind: PersonEventKind;
  title: string | null;
  place: string | null;
  date: FuzzyDate | null;
  description: string | null;
};

export type GedcomFile = {
  id: string;
  personId: string;
  originalName: string;
  mimeType: string;
};

export type GedcomInput = {
  treeName: string;
  treeDescription?: string | null;
  people: GedcomPerson[];
  relationships: GedcomRelationship[];
  events: GedcomEvent[];
  files: GedcomFile[];
  generatedAt?: Date;
};

const MONTHS = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
];

const MAX_VALUE_CHARS = 100;

function escapeValue(value: string) {
  return value.replaceAll("@", "@@");
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function dateParts(value: FuzzyDate["start"]): string | null {
  if (value.year === null) return null;
  if (value.month !== null && value.day !== null) {
    return `${pad2(value.day)} ${MONTHS[value.month - 1]} ${value.year}`;
  }
  if (value.month !== null) {
    return `${MONTHS[value.month - 1]} ${value.year}`;
  }
  return String(value.year);
}

/**
 * GEDCOM 5.5.1 dates. A date with no year cannot be represented, so it is
 * omitted rather than invented. Between falls back to AFT or BEF when only one
 * end is known.
 */
export function gedcomDate(value: FuzzyDate | null | undefined): string | null {
  if (!value || value.qualifier === "unknown") return null;
  const start = dateParts(value.start);
  const end = value.end ? dateParts(value.end) : null;

  switch (value.qualifier) {
    case "about":
      return start ? `ABT ${start}` : null;
    case "before":
      return start ? `BEF ${start}` : null;
    case "after":
      return start ? `AFT ${start}` : null;
    case "between":
      if (start && end) return `BET ${start} AND ${end}`;
      if (start) return `AFT ${start}`;
      if (end) return `BEF ${end}`;
      return null;
    default:
      return start;
  }
}

export function gedcomName(firstName: string, lastName: string) {
  const given = escapeValue(firstName.trim());
  const surname = escapeValue(lastName.trim());
  if (!surname) return given;
  return given ? `${given} /${surname}/` : `/${surname}/`;
}

function chunks(value: string) {
  if (!value) return [""];
  const parts: string[] = [];
  for (let index = 0; index < value.length; index += MAX_VALUE_CHARS) {
    parts.push(value.slice(index, index + MAX_VALUE_CHARS));
  }
  return parts;
}

function pushLine(lines: string[], level: number, tag: string, value?: string | null) {
  const base = `${level} ${tag}`;
  lines.push(value ? `${base} ${value}` : base);
}

function pushXrefLine(
  lines: string[],
  level: number,
  xref: string,
  tag: string,
  value?: string | null,
) {
  const base = `${level} ${xref} ${tag}`;
  lines.push(value ? `${base} ${value}` : base);
}

/** Writes a value with CONT for paragraphs and CONC for long lines. */
function writeLong(lines: string[], level: number, tag: string, text: string) {
  const paragraphs = text.replace(/\r\n?/g, "\n").split("\n");
  const first = paragraphs.shift() ?? "";
  const firstChunks = chunks(first);
  pushLine(lines, level, tag, escapeValue(firstChunks[0]));
  for (const chunk of firstChunks.slice(1)) {
    pushLine(lines, level + 1, "CONC", escapeValue(chunk));
  }
  for (const paragraph of paragraphs) {
    const paragraphChunks = chunks(paragraph);
    pushLine(lines, level + 1, "CONT", escapeValue(paragraphChunks[0]));
    for (const chunk of paragraphChunks.slice(1)) {
      pushLine(lines, level + 1, "CONC", escapeValue(chunk));
    }
  }
}

function shortXref(prefix: string, value: string, seen: Set<string>) {
  const hash = createHash("sha256").update(value).digest("hex").toUpperCase();
  let id = `${prefix}${hash.slice(0, 16)}`;
  let suffix = 1;
  while (seen.has(id)) {
    id = `${prefix}${hash.slice(0, 14)}${pad2(suffix++)}`;
  }
  seen.add(id);
  return `@${id}@`;
}

function headerDate(date: Date) {
  return `${pad2(date.getUTCDate())} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

function eventTag(kind: PersonEventKind) {
  switch (kind) {
    case "residence":
      return "RESI";
    case "occupation":
      return "OCCU";
    case "education":
      return "EDUC";
    case "military":
      return "MILI";
    case "immigration":
      return "IMMI";
    case "emigration":
      return "EMIG";
    case "burial":
      return "BURI";
    default:
      return "EVEN";
  }
}

function eventType(kind: PersonEventKind, title: string | null) {
  switch (kind) {
    case "marriage":
      return "Marriage";
    case "divorce":
      return "Divorce";
    case "other":
      return title || "Event";
    default:
      return title || kind;
  }
}

function mediaFormat(mimeType: string) {
  switch (mimeType.toLowerCase()) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "application/pdf":
      return "pdf";
    case "text/plain":
      return "txt";
    default:
      return mimeType.split("/")[1]?.split(";")[0] || "bin";
  }
}

type FamilyGroup = {
  key: string;
  parentIds: string[];
  children: string[];
  partnership: GedcomPartnerRelationship | null;
};

function buildFamilyGroups(input: GedcomInput): FamilyGroup[] {
  const parentsByChild = new Map<string, string[]>();
  for (const relationship of input.relationships) {
    if (relationship.type !== "parent") continue;
    const parents = parentsByChild.get(relationship.target) ?? [];
    parents.push(relationship.source);
    parentsByChild.set(relationship.target, parents);
  }
  for (const [childId, parents] of parentsByChild) {
    parentsByChild.set(
      childId,
      [...new Set(parents)].sort(),
    );
  }

  const groups = new Map<string, FamilyGroup>();
  for (const person of input.people) {
    const parents = parentsByChild.get(person.id);
    if (!parents?.length) continue;
    const key = parents.join("|");
    const group = groups.get(key) ?? {
      key,
      parentIds: parents,
      children: [],
      partnership: null,
    };
    group.children.push(person.id);
    groups.set(key, group);
  }

  for (const relationship of input.relationships) {
    if (relationship.type !== "partner") continue;
    const parentIds = [relationship.source, relationship.target].sort();
    const key = parentIds.join("|");
    const group = groups.get(key) ?? {
      key,
      parentIds,
      children: [],
      partnership: null,
    };
    group.partnership = relationship;
    groups.set(key, group);
  }

  const byId = new Map(input.people.map(person => [person.id, person]));
  for (const group of groups.values()) {
    group.children.sort((left, right) => {
      const a = byId.get(left);
      const b = byId.get(right);
      return (
        fuzzySortValue(a?.birthDate) - fuzzySortValue(b?.birthDate) ||
        left.localeCompare(right)
      );
    });
  }

  const nameFor = (id: string) => {
    const person = byId.get(id);
    return person ? `${person.lastName} ${person.firstName}` : id;
  };

  return [...groups.values()]
    .filter(group => group.children.length || group.partnership)
    .sort((left, right) => {
      const leftName = left.parentIds.map(nameFor).join(" ");
      const rightName = right.parentIds.map(nameFor).join(" ");
      return leftName.localeCompare(rightName) || left.key.localeCompare(right.key);
    });
}

export function buildGedcom(input: GedcomInput): string {
  const lines: string[] = [];
  const generatedAt = input.generatedAt ?? new Date();
  const seenXrefs = new Set<string>();

  const personXref = new Map(
    input.people.map(person => [
      person.id,
      shortXref("I", person.id, seenXrefs),
    ]),
  );
  const fileXref = new Map(
    input.files
      .filter(file => personXref.has(file.personId))
      .map(file => [file.id, shortXref("M", file.id, seenXrefs)]),
  );
  const groups = buildFamilyGroups(input);
  const familyXref = new Map(
    groups.map(group => [
      group.key,
      shortXref("F", group.partnership?.id ?? group.key, seenXrefs),
    ]),
  );

  pushLine(lines, 0, "HEAD");
  pushLine(lines, 1, "SOUR", "ROOTS");
  pushLine(lines, 2, "VERS", "1.0.0");
  pushLine(lines, 2, "NAME", "Roots Family Tree");
  pushLine(lines, 2, "CORP", "Roots");
  pushLine(lines, 1, "GEDC");
  pushLine(lines, 2, "VERS", "5.5.1");
  pushLine(lines, 2, "FORM", "LINEAGE-LINKED");
  pushLine(lines, 1, "CHAR", "UTF-8");
  pushLine(lines, 1, "DATE", headerDate(generatedAt));
  pushLine(lines, 1, "SUBM", "@SUBM1@");
  writeLong(
    lines,
    1,
    "NOTE",
    "GEDCOM 5.5.1 has only HUSB and WIFE for a couple. When one partner is male and the other female, those roles follow sex. Otherwise they are assigned by stable partner order, so review same-sex and unknown-partner families after import.",
  );

  pushXrefLine(lines, 0, "@SUBM1@", "SUBM");
  pushLine(lines, 1, "NAME", escapeValue(input.treeName));
  if (input.treeDescription) {
    writeLong(lines, 1, "NOTE", input.treeDescription);
  }

  const eventsByPerson = new Map<string, GedcomEvent[]>();
  for (const event of input.events) {
    eventsByPerson.set(event.personId, [
      ...(eventsByPerson.get(event.personId) ?? []),
      event,
    ]);
  }
  for (const [personId, events] of eventsByPerson) {
    eventsByPerson.set(
      personId,
      [...events].sort(
        (left, right) =>
          fuzzySortValue(left.date) - fuzzySortValue(right.date) ||
          left.id.localeCompare(right.id),
      ),
    );
  }

  const filesByPerson = new Map<string, GedcomFile[]>();
  for (const file of input.files) {
    if (!personXref.has(file.personId)) continue;
    filesByPerson.set(file.personId, [
      ...(filesByPerson.get(file.personId) ?? []),
      file,
    ]);
  }

  for (const person of input.people) {
    pushXrefLine(lines, 0, personXref.get(person.id)!, "INDI");
    pushLine(lines, 1, "_ROOTS_ID", person.id);
    pushLine(lines, 1, "NAME", gedcomName(person.firstName, person.lastName));
    if (person.firstName.trim()) {
      pushLine(lines, 2, "GIVN", escapeValue(person.firstName.trim()));
    }
    if (person.lastName.trim()) {
      pushLine(lines, 2, "SURN", escapeValue(person.lastName.trim()));
    }
    if (person.nickname?.trim()) {
      pushLine(lines, 2, "NICK", escapeValue(person.nickname.trim()));
    }
    pushLine(lines, 1, "SEX", gedcomSex(person.sex));

    if (person.maidenName?.trim()) {
      pushLine(lines, 1, "NAME", gedcomName(person.firstName, person.maidenName));
      pushLine(lines, 2, "TYPE", "maiden");
      if (person.firstName.trim()) {
        pushLine(lines, 2, "GIVN", escapeValue(person.firstName.trim()));
      }
      pushLine(lines, 2, "SURN", escapeValue(person.maidenName.trim()));
    }

    const birthDate = gedcomDate(person.birthDate);
    if (birthDate || person.birthPlace) {
      pushLine(lines, 1, "BIRT");
      if (birthDate) pushLine(lines, 2, "DATE", birthDate);
      if (person.birthPlace) writeLong(lines, 2, "PLAC", person.birthPlace);
    }

    const deathDate = gedcomDate(person.deathDate);
    if (deathDate || person.deathPlace) {
      pushLine(lines, 1, "DEAT");
      if (deathDate) pushLine(lines, 2, "DATE", deathDate);
      if (person.deathPlace) writeLong(lines, 2, "PLAC", person.deathPlace);
    }

    if (person.bio?.trim()) {
      writeLong(lines, 1, "NOTE", person.bio.trim());
    }

    for (const event of eventsByPerson.get(person.id) ?? []) {
      const tag = eventTag(event.kind);
      const isCustom = tag === "EVEN";
      const value =
        isCustom ||
        event.kind === "residence" ||
        event.kind === "burial"
          ? null
          : event.title;
      pushLine(lines, 1, tag, value ? escapeValue(value) : undefined);
      if (isCustom) {
        pushLine(
          lines,
          2,
          "TYPE",
          escapeValue(eventType(event.kind, event.title)),
        );
      }
      const date = gedcomDate(event.date);
      if (date) pushLine(lines, 2, "DATE", date);
      if (event.place) writeLong(lines, 2, "PLAC", event.place);
      if (event.description?.trim()) {
        writeLong(lines, 2, "NOTE", event.description.trim());
      }
    }

    for (const file of filesByPerson.get(person.id) ?? []) {
      pushLine(lines, 1, "OBJE", fileXref.get(file.id));
    }
  }

  for (const group of groups) {
    const xref = familyXref.get(group.key)!;
    pushXrefLine(lines, 0, xref, "FAM");
    if (group.partnership) {
      pushLine(lines, 1, "_ROOTS_ID", group.partnership.id);
    }
    if (group.parentIds.length > 2) {
      writeLong(
        lines,
        1,
        "NOTE",
        "This family has more than two parents recorded. Only the first two are placed in HUSB and WIFE.",
      );
    }
    const parents = group.parentIds
      .map(id => input.people.find(person => person.id === id))
      .filter((person): person is GedcomPerson => Boolean(person));
    let husband = parents[0];
    let wife = parents[1];
    if (husband?.sex === "female" && wife?.sex === "male") {
      [husband, wife] = [wife, husband];
    }
    if (husband) pushLine(lines, 1, "HUSB", personXref.get(husband.id));
    if (wife) pushLine(lines, 1, "WIFE", personXref.get(wife.id));
    for (const childId of group.children) {
      const child = personXref.get(childId);
      if (child) pushLine(lines, 1, "CHIL", child);
    }

    const partnership = group.partnership;
    if (partnership) {
      const start = gedcomDate(partnership.startDate);
      const end = gedcomDate(partnership.endDate);
      switch (partnership.status) {
        case "married":
          pushLine(lines, 1, "MARR");
          if (start) pushLine(lines, 2, "DATE", start);
          break;
        case "divorced":
          if (start) {
            pushLine(lines, 1, "MARR");
            pushLine(lines, 2, "DATE", start);
          }
          pushLine(lines, 1, "DIV");
          if (end) pushLine(lines, 2, "DATE", end);
          break;
        case "separated":
          pushLine(lines, 1, "EVEN");
          pushLine(lines, 2, "TYPE", "Separation");
          if (end ?? start) pushLine(lines, 2, "DATE", end ?? start!);
          break;
        case "widowed":
          if (start) {
            pushLine(lines, 1, "MARR");
            pushLine(lines, 2, "DATE", start);
          }
          pushLine(lines, 1, "EVEN");
          pushLine(lines, 2, "TYPE", "Widowed");
          if (end) pushLine(lines, 2, "DATE", end);
          break;
        case "partnered":
          pushLine(lines, 1, "EVEN");
          pushLine(lines, 2, "TYPE", "Partnership");
          if (start) pushLine(lines, 2, "DATE", start);
          break;
        default:
          pushLine(lines, 1, "EVEN");
          pushLine(lines, 2, "TYPE", "Relationship");
          if (start) pushLine(lines, 2, "DATE", start);
          break;
      }
    }
  }

  for (const file of input.files) {
    const xref = fileXref.get(file.id);
    if (!xref) continue;
    pushXrefLine(lines, 0, xref, "OBJE");
    pushLine(lines, 1, "FILE", escapeValue(file.originalName));
    pushLine(lines, 2, "FORM", mediaFormat(file.mimeType));
    pushLine(lines, 1, "TITL", escapeValue(file.originalName));
    pushLine(lines, 1, "_ROOTS_FILE_ID", file.id);
  }

  pushLine(lines, 0, "TRLR");

  return `${lines.join("\r\n")}\r\n`;
}
