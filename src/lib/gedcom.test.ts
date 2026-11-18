import { describe, expect, it } from "vitest";
import { exactFuzzyDate, type FuzzyDate } from "./fuzzy-date";
import {
  buildGedcom,
  gedcomDate,
  gedcomName,
  type GedcomInput,
  type GedcomPerson,
} from "./gedcom";

const about = (year: number): FuzzyDate => ({
  start: { year, month: null, day: null },
  qualifier: "about",
});

const between = (start: number, end: number): FuzzyDate => ({
  start: { year: start, month: null, day: null },
  end: { year: end, month: null, day: null },
  qualifier: "between",
});

function person(
  id: string,
  firstName: string,
  lastName: string,
  extra: Partial<GedcomPerson> = {},
): GedcomPerson {
  return {
    id,
    firstName,
    lastName,
    maidenName: null,
    nickname: null,
    sex: "unknown",
    birthDate: exactFuzzyDate(1900),
    deathDate: null,
    birthPlace: null,
    deathPlace: null,
    bio: null,
    ...extra,
  };
}

function input(overrides: Partial<GedcomInput> = {}): GedcomInput {
  const people = [
    person("abe", "Abraham", "Simpson", {
      nickname: "Abe",
      birthDate: exactFuzzyDate(1920, 5, 19),
      birthPlace: "Springfield",
      bio: "Talks to his hat. Write to abe@example.com.",
    }),
    person("mona", "Mona", "Simpson", {
      maidenName: "Olsen",
      birthDate: exactFuzzyDate(1929, 3, 11),
    }),
    person("homer", "Homer", "Simpson", {
      birthDate: exactFuzzyDate(1956, 5, 12),
      deathDate: exactFuzzyDate(2000),
    }),
    person("bart", "Bart", "Simpson", {
      birthDate: exactFuzzyDate(1980, 4, 1),
    }),
    person("lisa", "Lisa", "Simpson", {
      birthDate: exactFuzzyDate(1982, 5, 9),
    }),
  ];
  return {
    treeName: "The Simpson family",
    treeDescription: "Three generations.",
    people,
    relationships: [
      { id: "p1", type: "parent", source: "abe", target: "homer" },
      { id: "p2", type: "parent", source: "mona", target: "homer" },
      { id: "p3", type: "parent", source: "homer", target: "bart" },
      { id: "p4", type: "parent", source: "homer", target: "lisa" },
      {
        id: "m1",
        type: "partner",
        source: "abe",
        target: "mona",
        status: "married",
        startDate: exactFuzzyDate(1950),
        endDate: null,
      },
    ],
    events: [
      {
        id: "e1",
        personId: "abe",
        kind: "military",
        title: "Army service",
        place: "Springfield",
        date: about(1941),
        description: "Enlisted after the draft notice.",
      },
    ],
    files: [
      {
        id: "f1",
        personId: "abe",
        originalName: "abe.jpg",
        mimeType: "image/jpeg",
      },
    ],
    generatedAt: new Date("2026-01-02T00:00:00.000Z"),
    ...overrides,
  };
}

function lines(gedcom: string) {
  return gedcom.split("\r\n").filter(Boolean);
}

describe("GEDCOM dates", () => {
  it("maps exact and partial dates", () => {
    expect(gedcomDate(exactFuzzyDate(1920, 5, 19))).toBe("19 MAY 1920");
    expect(gedcomDate(exactFuzzyDate(1920, 5))).toBe("MAY 1920");
    expect(gedcomDate(exactFuzzyDate(1920))).toBe("1920");
  });

  it("maps qualifiers to GEDCOM approximations", () => {
    expect(gedcomDate(about(1900))).toBe("ABT 1900");
    expect(gedcomDate({ start: { year: 1900, month: null, day: null }, qualifier: "before" })).toBe("BEF 1900");
    expect(gedcomDate({ start: { year: 1900, month: null, day: null }, qualifier: "after" })).toBe("AFT 1900");
    expect(gedcomDate(between(1890, 1900))).toBe("BET 1890 AND 1900");
  });

  it("falls back to a single bound when an end is missing", () => {
    expect(
      gedcomDate({
        start: { year: 1900, month: null, day: null },
        qualifier: "between",
      }),
    ).toBe("AFT 1900");
    expect(
      gedcomDate({
        start: { year: null, month: null, day: null },
        end: { year: 1900, month: null, day: null },
        qualifier: "between",
      }),
    ).toBe("BEF 1900");
  });

  it("omits dates with no year", () => {
    expect(gedcomDate(exactFuzzyDate(null, 5, 19))).toBeNull();
    expect(gedcomDate({ start: { year: null, month: null, day: null }, qualifier: "unknown" })).toBeNull();
    expect(gedcomDate(null)).toBeNull();
  });
});

describe("GEDCOM names", () => {
  it("uses the slash surname form", () => {
    expect(gedcomName("Abraham", "Simpson")).toBe("Abraham /Simpson/");
    expect(gedcomName("Mona", "")).toBe("Mona");
    expect(gedcomName("", "Simpson")).toBe("/Simpson/");
  });

  it("escapes at signs", () => {
    expect(gedcomName("A@B", "C@D")).toBe("A@@B /C@@D/");
  });
});

describe("GEDCOM export", () => {
  const gedcom = buildGedcom(input());
  const rows = lines(gedcom);

  it("wraps the file in a 5.5.1 header and trailer", () => {
    expect(rows[0]).toBe("0 HEAD");
    expect(rows.at(-1)).toBe("0 TRLR");
    expect(rows).toContain("2 VERS 5.5.1");
    expect(rows).toContain("2 FORM LINEAGE-LINKED");
    expect(rows).toContain("1 CHAR UTF-8");
    expect(rows).toContain("1 SUBM @SUBM1@");
  });

  it("writes one INDI record per person with a stable id", () => {
    const indi = rows.filter(line => /^0 @I[A-Z0-9]+@ INDI$/.test(line));
    expect(indi).toHaveLength(5);
    // Five individuals and one family carry the original ids.
    expect(rows.filter(line => line.startsWith("1 _ROOTS_ID "))).toHaveLength(6);
  });

  it("writes names, nicknames, and the maiden name", () => {
    expect(rows).toContain("1 NAME Abraham /Simpson/");
    expect(rows).toContain("2 NICK Abe");
    expect(rows).toContain("1 NAME Mona /Olsen/");
    expect(rows).toContain("2 TYPE maiden");
  });

  it("writes sex as unknown for every person", () => {
    expect(rows.filter(line => line === "1 SEX U")).toHaveLength(5);
  });

  it("uses sex for SEX tags and mixed-sex couple roles", () => {
    const out = buildGedcom(
      input({
        people: [
          person("aaa", "Ada", "One", { sex: "female" }),
          person("zzz", "Zed", "One", { sex: "male" }),
          person("kid", "Kit", "One"),
        ],
        relationships: [
          { id: "r1", type: "parent", source: "aaa", target: "kid" },
          { id: "r2", type: "parent", source: "zzz", target: "kid" },
          {
            id: "m1",
            type: "partner",
            source: "aaa",
            target: "zzz",
            status: "married",
            startDate: null,
            endDate: null,
          },
        ],
        events: [],
        files: [],
      }),
    );
    const outLines = lines(out);
    expect(outLines.filter(line => line === "1 SEX F")).toHaveLength(1);
    expect(outLines.filter(line => line === "1 SEX M")).toHaveLength(1);

    const xrefs = new Map<string, string>();
    for (let index = 0; index < outLines.length; index += 1) {
      const line = outLines[index];
      if (!line.startsWith("1 _ROOTS_ID ")) continue;
      const match = /^0 (@I[A-Z0-9]+@) INDI$/.exec(outLines[index - 1] ?? "");
      if (match) xrefs.set(line.slice("1 _ROOTS_ID ".length), match[1]);
    }
    expect(outLines).toContain(`1 HUSB ${xrefs.get("zzz")}`);
    expect(outLines).toContain(`1 WIFE ${xrefs.get("aaa")}`);
  });

  it("writes birth, death, places, and notes", () => {
    expect(rows).toContain("2 DATE 19 MAY 1920");
    expect(rows).toContain("2 PLAC Springfield");
    expect(rows).toContain("2 DATE 2000");
    expect(gedcom).toContain("abe@@example.com");
  });

  it("maps life events to standard tags", () => {
    expect(rows).toContain("1 MILI Army service");
    expect(rows).toContain("2 DATE ABT 1941");
    expect(rows).toContain("2 PLAC Springfield");
    expect(rows).toContain("2 NOTE Enlisted after the draft notice.");
  });

  it("creates families with parents, children, and a marriage", () => {
    const fam = rows.filter(line => /^0 @F[A-Z0-9]+@ FAM$/.test(line));
    expect(fam.length).toBe(2);
    expect(rows).toContain("1 MARR");
    expect(rows).toContain("2 DATE 1950");
    expect(rows.filter(line => line.startsWith("1 CHIL ")).length).toBe(3);
  });

  it("attaches media records", () => {
    expect(rows.some(line => /^0 @M[A-Z0-9]+@ OBJE$/.test(line))).toBe(true);
    expect(rows).toContain("1 FILE abe.jpg");
    expect(rows).toContain("2 FORM jpg");
  });

  it("keeps every line short enough for the format", () => {
    expect(rows.every(line => line.length <= 255)).toBe(true);
    expect(rows.every(line => /^\d+ (@[A-Z0-9]+@ )?[A-Z0-9_]+( .*)?$/.test(line))).toBe(true);
  });

  it("wraps a long note with CONC and CONT", () => {
    const long = "A very long biography. ".repeat(20);
    const out = buildGedcom(
      input({
        people: [person("a", "A", "One", { bio: `${long}\nSecond paragraph.` })],
        relationships: [],
        events: [],
        files: [],
      }),
    );
    const outLines = lines(out);
    expect(outLines.some(line => line.startsWith("1 NOTE "))).toBe(true);
    expect(outLines.some(line => line.startsWith("2 CONC "))).toBe(true);
    expect(outLines.some(line => line.startsWith("2 CONT "))).toBe(true);
    expect(outLines.every(line => line.length <= 255)).toBe(true);
  });

  it("is deterministic for the same input", () => {
    expect(buildGedcom(input())).toBe(gedcom);
  });

  it("writes a single-parent family", () => {
    const out = buildGedcom(
      input({
        people: [person("parent", "Pat", "Lane"), person("child", "Kit", "Lane")],
        relationships: [
          { id: "r1", type: "parent", source: "parent", target: "child" },
        ],
        events: [],
        files: [],
      }),
    );
    const outLines = lines(out);
    expect(outLines.some(line => line.startsWith("1 HUSB "))).toBe(true);
    expect(outLines.filter(line => line.startsWith("1 WIFE "))).toHaveLength(0);
    expect(outLines.some(line => line.startsWith("1 CHIL "))).toBe(true);
  });
});
