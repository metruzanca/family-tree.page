import { describe, expect, it } from "vitest";
import { exactFuzzyDate } from "./fuzzy-date";
import { parseGedcom } from "./gedcom-import";
import {
  defaultImportDecision,
  suggestGedcomMatches,
  type MatchPerson,
} from "./gedcom-match";

function existing(
  id: string,
  firstName: string,
  lastName: string,
  birthYear: number | null,
  extra: Partial<MatchPerson> = {},
): MatchPerson {
  return {
    id,
    firstName,
    lastName,
    maidenName: null,
    nickname: null,
    displayName: `${firstName} ${lastName}`,
    birthDate: birthYear === null ? null : exactFuzzyDate(birthYear),
    deathDate: null,
    sex: "unknown",
    ...extra,
  };
}

const parsed = parseGedcom(`0 @I1@ INDI
1 NAME Homer /Simpson/
1 SEX M
1 BIRT
2 DATE 1956
0 @I2@ INDI
1 NAME Mona /Simpson/
1 NAME Mona /Olsen/
2 TYPE maiden
1 SEX F
1 BIRT
2 DATE 1929
0 @I3@ INDI
1 NAME Zoe /Else/
1 SEX F
1 BIRT
2 DATE 1970
0 TRLR`);

const people = [
  existing("homer", "Homer", "Simpson", 1956, { sex: "male" }),
  existing("mona", "Mona", "Simpson", 1929, {
    maidenName: "Olsen",
    sex: "female",
  }),
];

describe("GEDCOM matching", () => {
  it("suggests a strong match for the same name and birth year", () => {
    const matches = suggestGedcomMatches(parsed, people);
    const homer = matches.get("I1")!;
    expect(homer.personId).toBe("homer");
    expect(homer.score).toBeGreaterThanOrEqual(90);
    expect(defaultImportDecision(homer)).toEqual({
      action: "merge",
      personId: "homer",
    });
  });

  it("uses the maiden name as a match signal", () => {
    const matches = suggestGedcomMatches(parsed, people);
    expect(matches.get("I2")?.personId).toBe("mona");
  });

  it("defaults an exact full name to merge even without dates", () => {
    expect(
      defaultImportDecision({
        xref: "x",
        personId: "ned",
        displayName: "Ned Flanders",
        score: 70,
        reasons: ["Same full name", "Same first name"],
      }),
    ).toEqual({ action: "merge", personId: "ned" });
  });

  it("does not suggest a match for a different person", () => {
    const matches = suggestGedcomMatches(parsed, people);
    const zoe = matches.get("I3")!;
    expect(zoe.personId).toBeNull();
    expect(defaultImportDecision(zoe)).toEqual({
      action: "create",
      personId: null,
    });
  });
});
