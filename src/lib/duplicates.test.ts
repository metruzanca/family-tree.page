import { describe, expect, it } from "vitest";
import { exactFuzzyDate } from "./fuzzy-date";
import {
  findDuplicateCandidates,
  normalizeName,
  scoreDuplicate,
  type DuplicatePerson,
} from "./duplicates";

function person(
  id: string,
  firstName: string,
  lastName: string,
  birthYear: number | null,
  extra: Partial<DuplicatePerson> = {},
): DuplicatePerson {
  return {
    id,
    displayName: `${firstName} ${lastName}`.trim(),
    firstName,
    lastName,
    maidenName: null,
    nickname: null,
    birthDate: birthYear === null ? null : exactFuzzyDate(birthYear),
    deathDate: null,
    ...extra,
  };
}

describe("duplicate detection", () => {
  it("normalizes accents, case, and punctuation", () => {
    expect(normalizeName("  José  O'Neill-Smith ")).toBe("jose o neill smith");
  });

  it("scores the same name and birth year highly", () => {
    const result = scoreDuplicate(
      { firstName: "Abraham", lastName: "Simpson", birthDate: exactFuzzyDate(1920) },
      person("a", "Abraham", "Simpson", 1920),
    );
    expect(result.score).toBeGreaterThanOrEqual(95);
    expect(result.reasons).toContain("Same full name");
    expect(result.reasons).toContain("Same birth year");
  });

  it("warns on the same name even without a date", () => {
    const candidates = findDuplicateCandidates(
      { firstName: "Abraham", lastName: "Simpson" },
      [person("a", "Abraham", "Simpson", null)],
    );
    expect(candidates).toHaveLength(1);
  });

  it("does not warn on a different name and year", () => {
    const candidates = findDuplicateCandidates(
      { firstName: "Lisa", lastName: "Simpson", birthDate: exactFuzzyDate(1982) },
      [person("a", "Bart", "Simpson", 1980)],
    );
    expect(candidates).toEqual([]);
  });

  it("matches a maiden name and a nickname", () => {
    const maiden = scoreDuplicate(
      { firstName: "Marge", lastName: "Simpson", maidenName: "Bouvier" },
      person("a", "Marge", "Bouvier", null),
    );
    expect(maiden.reasons).toContain("Maiden name matches");

    const nickname = scoreDuplicate(
      { firstName: "Abraham", lastName: "Simpson", nickname: "Abe" },
      person("a", "Abe", "Simpson", null),
    );
    expect(nickname.reasons).toContain("Nickname matches");
  });

  it("excludes the current person and respects the limit", () => {
    const candidates = findDuplicateCandidates(
      { firstName: "Abraham", lastName: "Simpson" },
      [
        person("a", "Abraham", "Simpson", 1920),
        person("b", "Abraham", "Simpson", 1921),
        person("c", "Abraham", "Simpson", 1922),
      ],
      { excludePersonId: "a", limit: 1 },
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0].id).not.toBe("a");
  });
});
