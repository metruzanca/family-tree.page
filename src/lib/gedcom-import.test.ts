import { describe, expect, it } from "vitest";
import { exactFuzzyDate } from "./fuzzy-date";
import { buildGedcom, type GedcomInput } from "./gedcom";
import { parseGedcom, parseGedcomDate } from "./gedcom-import";

const SAMPLE = `0 HEAD
1 GEDC
2 VERS 5.5.1
1 CHAR UTF-8
0 @I1@ INDI
1 NAME Abraham /Simpson/
2 GIVN Abraham
2 SURN Simpson
2 NICK Abe
1 SEX M
1 BIRT
2 DATE 19 MAY 1920
2 PLAC Springfield
1 DEAT
2 DATE ABT 2000
1 NOTE First line
2 CONT Second line
1 OCCU Safety inspector
2 DATE 1950
0 @I2@ INDI
1 NAME Mona /Olsen/
2 TYPE maiden
1 SEX F
0 @I3@ INDI
1 NAME Homer /Simpson/
1 SEX M
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 CHIL @I3@
1 MARR
2 DATE 1950
0 TRLR
`;

describe("GEDCOM dates", () => {
  it("reads exact and partial dates", () => {
    expect(parseGedcomDate("19 MAY 1920").date).toEqual(exactFuzzyDate(1920, 5, 19));
    expect(parseGedcomDate("MAY 1920").date).toEqual(exactFuzzyDate(1920, 5));
    expect(parseGedcomDate("1920").date).toEqual(exactFuzzyDate(1920));
  });

  it("reads approximations and ranges", () => {
    expect(parseGedcomDate("ABT 1920").date?.qualifier).toBe("about");
    expect(parseGedcomDate("CAL 1920").date?.qualifier).toBe("about");
    expect(parseGedcomDate("EST 1920").date?.qualifier).toBe("about");
    expect(parseGedcomDate("BEF 1900").date?.qualifier).toBe("before");
    expect(parseGedcomDate("AFT 1900").date?.qualifier).toBe("after");
    expect(parseGedcomDate("BET 1890 AND 1900").date).toEqual({
      start: { year: 1890, month: null, day: null },
      end: { year: 1900, month: null, day: null },
      qualifier: "between",
    });
    expect(parseGedcomDate("FROM 1890 TO 1900").date?.qualifier).toBe("between");
    expect(parseGedcomDate("1900-1910").date?.qualifier).toBe("between");
  });

  it("handles single-sided ranges and calendars", () => {
    expect(parseGedcomDate("FROM 1890").date?.qualifier).toBe("after");
    expect(parseGedcomDate("TO 1900").date?.qualifier).toBe("before");
    expect(parseGedcomDate("@#DJULIAN@ 1750").date).toEqual(exactFuzzyDate(1750));
  });

  it("reports phrases and ambiguous years without inventing a date", () => {
    expect(parseGedcomDate("(spring 1918)").date).toBeNull();
    expect(parseGedcomDate("(spring 1918)").problem).toContain("phrase");
    expect(parseGedcomDate("1 JAN 20").date).toBeNull();
    expect(parseGedcomDate("1 JAN 20").problem).toContain("two-digit");
    expect(parseGedcomDate("31 FOO 1900").date).toBeNull();
    expect(parseGedcomDate("?").date).toBeNull();
    expect(parseGedcomDate("?").problem).toBeUndefined();
  });
});

describe("GEDCOM import", () => {
  it("reads people, names, sex, dates, places, notes, and events", () => {
    const result = parseGedcom(SAMPLE);
    expect(result.stats.people).toBe(3);
    expect(result.stats.families).toBe(1);
    expect(result.stats.events).toBe(1);

    const abe = result.people.find(person => person.xref === "I1")!;
    expect(abe.firstName).toBe("Abraham");
    expect(abe.lastName).toBe("Simpson");
    expect(abe.nickname).toBe("Abe");
    expect(abe.sex).toBe("male");
    expect(abe.birthDate).toEqual(exactFuzzyDate(1920, 5, 19));
    expect(abe.birthPlace).toBe("Springfield");
    expect(abe.deathDate?.qualifier).toBe("about");
    expect(abe.bio).toBe("First line\nSecond line");
    expect(abe.events).toEqual([
      {
        kind: "occupation",
        title: "Safety inspector",
        place: null,
        date: exactFuzzyDate(1950),
        description: null,
      },
    ]);

    const mona = result.people.find(person => person.xref === "I2")!;
    expect(mona.maidenName).toBe("Olsen");
    expect(mona.sex).toBe("female");
  });

  it("reads families, partners, children, and marriage dates", () => {
    const result = parseGedcom(SAMPLE);
    expect(result.families).toEqual([
      {
        xref: "F1",
        partnerXrefs: ["I1", "I2"],
        childXrefs: ["I3"],
        status: "married",
        startDate: exactFuzzyDate(1950),
        endDate: null,
      },
    ]);
  });

  it("accepts a BOM and CRLF line endings", () => {
    const result = parseGedcom(`\uFEFF${SAMPLE.replaceAll("\n", "\r\n")}`);
    expect(result.stats.people).toBe(3);
    expect(result.warnings.filter(warning => warning.kind === "line")).toEqual([]);
  });

  it("reads multiple names, maiden names, and aliases", () => {
    const result = parseGedcom(`0 @I1@ INDI
1 NAME Mona /Simpson/
1 NAME Mona /Olsen/
2 TYPE maiden
1 NAME Mona /Bouvier/
2 TYPE aka
1 SEX F
0 TRLR`);
    const person = result.people[0];
    expect(person.lastName).toBe("Simpson");
    expect(person.maidenName).toBe("Olsen");
    expect(person.nickname).toBe("Mona");
  });

  it("warns when a person has no name", () => {
    const result = parseGedcom("0 @I1@ INDI\n1 SEX U\n0 TRLR");
    expect(result.people[0].firstName).toBe("Unknown");
    expect(result.warnings.some(warning => warning.kind === "name")).toBe(true);
  });

  it("resolves note records and unescapes at signs", () => {
    const result = parseGedcom(`0 @N1@ NOTE A note with abe@@example.com
1 CONT and a second line
0 @I1@ INDI
1 NAME A /One/
1 NOTE @N1@
0 TRLR`);
    expect(result.people[0].bio).toBe("A note with abe@example.com\nand a second line");
    expect(result.stats.notes).toBe(1);
  });

  it("warns about missing people in families", () => {
    const result = parseGedcom(`0 @I1@ INDI
1 NAME A /One/
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I404@
1 CHIL @I405@
0 TRLR`);
    expect(result.families).toEqual([]);
    expect(result.warnings.filter(warning => warning.kind === "missing-person")).toHaveLength(2);
  });

  it("merges duplicate families", () => {
    const result = parseGedcom(`0 @I1@ INDI
1 NAME A /One/
0 @I2@ INDI
1 NAME B /One/
0 @I3@ INDI
1 NAME C /One/
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 CHIL @I3@
1 MARR
2 DATE 1950
0 @F2@ FAM
1 HUSB @I2@
1 WIFE @I1@
1 DIV
2 DATE 1970
0 TRLR`);
    expect(result.families).toHaveLength(1);
    expect(result.families[0].status).toBe("divorced");
    expect(result.families[0].startDate).toEqual(exactFuzzyDate(1950));
    expect(result.families[0].endDate).toEqual(exactFuzzyDate(1970));
    expect(result.families[0].childXrefs).toEqual(["I3"]);
    expect(result.warnings.some(warning => warning.kind === "duplicate-family")).toBe(true);
  });

  it("reports media and sources that cannot be imported", () => {
    const result = parseGedcom(`0 @M1@ OBJE
1 FILE photo.jpg
2 FORM jpg
0 @S1@ SOUR
1 TITL Census
0 @I1@ INDI
1 NAME A /One/
1 OBJE @M1@
1 SOUR @S1@
0 TRLR`);
    expect(result.stats.media).toBe(1);
    expect(result.stats.sources).toBe(1);
    expect(result.warnings.some(warning => warning.kind === "media-skipped")).toBe(true);
    expect(result.warnings.some(warning => warning.kind === "sources-skipped")).toBe(true);
  });

  it("reports malformed lines without failing the whole file", () => {
    const result = parseGedcom(`0 @I1@ INDI
1 NAME A /One/
this line is broken
0 TRLR`);
    expect(result.stats.people).toBe(1);
    expect(result.warnings.some(warning => warning.kind === "line")).toBe(true);
  });

  it("returns an empty result for an empty file", () => {
    const result = parseGedcom("");
    expect(result.people).toEqual([]);
    expect(result.families).toEqual([]);
    expect(result.stats.people).toBe(0);
  });

  it("round-trips an exported tree", () => {
    const input: GedcomInput = {
      treeName: "The Simpson family",
      people: [
        {
          id: "abe",
          firstName: "Abraham",
          lastName: "Simpson",
          maidenName: null,
          nickname: "Abe",
          sex: "male",
          birthDate: exactFuzzyDate(1920, 5, 19),
          deathDate: { start: { year: 2000, month: null, day: null }, qualifier: "about" },
          birthPlace: "Springfield",
          deathPlace: null,
          bio: "Talks to his hat.",
        },
        {
          id: "mona",
          firstName: "Mona",
          lastName: "Simpson",
          maidenName: "Olsen",
          nickname: null,
          sex: "female",
          birthDate: exactFuzzyDate(1929, 3, 11),
          deathDate: null,
          birthPlace: null,
          deathPlace: null,
          bio: null,
        },
        {
          id: "homer",
          firstName: "Homer",
          lastName: "Simpson",
          maidenName: null,
          nickname: null,
          sex: "male",
          birthDate: exactFuzzyDate(1956, 5, 12),
          deathDate: null,
          birthPlace: null,
          deathPlace: null,
          bio: null,
        },
      ],
      relationships: [
        { id: "p1", type: "parent", source: "abe", target: "homer" },
        { id: "p2", type: "parent", source: "mona", target: "homer" },
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
          date: { start: { year: 1941, month: null, day: null }, qualifier: "about" },
          description: "Enlisted after the draft notice.",
        },
      ],
      files: [],
      generatedAt: new Date("2026-01-01T00:00:00.000Z"),
    };

    const result = parseGedcom(buildGedcom(input));
    expect(result.stats.people).toBe(3);
    expect(result.stats.families).toBe(1);

    const abe = result.people.find(person => person.firstName === "Abraham")!;
    expect(abe.lastName).toBe("Simpson");
    expect(abe.nickname).toBe("Abe");
    expect(abe.sex).toBe("male");
    expect(abe.birthDate).toEqual(exactFuzzyDate(1920, 5, 19));
    expect(abe.deathDate?.qualifier).toBe("about");
    expect(abe.bio).toBe("Talks to his hat.");
    expect(abe.events[0].kind).toBe("military");
    expect(abe.events[0].title).toBe("Army service");

    const mona = result.people.find(person => person.firstName === "Mona")!;
    expect(mona.maidenName).toBe("Olsen");
    expect(mona.sex).toBe("female");

    const family = result.families[0];
    expect(family.partnerXrefs).toHaveLength(2);
    expect(family.childXrefs).toHaveLength(1);
    expect(family.status).toBe("married");
    expect(family.startDate).toEqual(exactFuzzyDate(1950));
  });
});
