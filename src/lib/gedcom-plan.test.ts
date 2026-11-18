import { describe, expect, it } from "vitest";
import { exactFuzzyDate } from "./fuzzy-date";
import { parseGedcom } from "./gedcom-import";
import { planImport, type ExistingImportPerson } from "./gedcom-plan";

const parsed = parseGedcom(`0 @I1@ INDI
1 NAME Homer /Simpson/
1 SEX M
1 BIRT
2 DATE 1956
2 PLAC Springfield
1 OCCU Safety inspector
2 DATE 1980
0 @I2@ INDI
1 NAME Marge /Simpson/
1 SEX F
1 BIRT
2 DATE 1956
0 @I3@ INDI
1 NAME Bart /Simpson/
1 SEX M
1 BIRT
2 DATE 1980
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 CHIL @I3@
1 MARR
2 DATE 1980
0 TRLR`);

function existing(
  id: string,
  firstName: string,
  lastName: string,
  extra: Partial<ExistingImportPerson> = {},
): ExistingImportPerson {
  return {
    id,
    firstName,
    lastName,
    maidenName: null,
    nickname: null,
    sex: "unknown",
    birthDate: null,
    deathDate: null,
    birthPlace: null,
    deathPlace: null,
    bio: null,
    ...extra,
  };
}

const people = [
  existing("homer", "Homer", "Simpson", {
    sex: "male",
    birthDate: exactFuzzyDate(1956),
  }),
  existing("marge", "Marge", "Simpson", {
    sex: "female",
    birthDate: exactFuzzyDate(1956),
  }),
];

describe("GEDCOM import planning", () => {
  it("creates new people and their relationships", () => {
    const plan = planImport({
      parsed,
      existingPeople: [],
      existingEvents: [],
      decisions: parsed.people.map(person => ({
        xref: person.xref,
        action: "create" as const,
      })),
    });
    expect(plan.errors).toEqual([]);
    expect(plan.counts).toMatchObject({
      create: 3,
      merge: 0,
      skip: 0,
      parentLinks: 2,
      partnerships: 1,
      events: 1,
    });
  });

  it("fills only empty fields when merging", () => {
    const plan = planImport({
      parsed,
      existingPeople: people,
      existingEvents: [],
      decisions: [
        { xref: "I1", action: "merge", personId: "homer" },
        { xref: "I2", action: "merge", personId: "marge" },
        { xref: "I3", action: "create" },
      ],
    });
    expect(plan.errors).toEqual([]);
    const homer = plan.merges.find(merge => merge.personId === "homer")!;
    expect(homer.update).toEqual({ birthPlace: "Springfield" });
    expect(homer.update.birthDate).toBeUndefined();
    expect(homer.update.sex).toBeUndefined();
  });

  it("does not overwrite an existing biography", () => {
    const withBio = [
      existing("homer", "Homer", "Simpson", { bio: "Existing story." }),
    ];
    const plan = planImport({
      parsed,
      existingPeople: withBio,
      existingEvents: [],
      decisions: [
        { xref: "I1", action: "merge", personId: "homer" },
        { xref: "I2", action: "create" },
        { xref: "I3", action: "create" },
      ],
    });
    expect(plan.merges[0].update.bio).toBeUndefined();
  });

  it("skips an event that already exists on the merged person", () => {
    const plan = planImport({
      parsed,
      existingPeople: people,
      existingEvents: [
        {
          personId: "homer",
          kind: "occupation",
          title: "Safety inspector",
          place: null,
          description: null,
          date: exactFuzzyDate(1980),
        },
      ],
      decisions: [
        { xref: "I1", action: "merge", personId: "homer" },
        { xref: "I2", action: "merge", personId: "marge" },
        { xref: "I3", action: "create" },
      ],
    });
    expect(plan.counts.events).toBe(0);
    expect(plan.counts.eventsSkipped).toBe(1);
  });

  it("rejects two imports merged into the same person", () => {
    const plan = planImport({
      parsed,
      existingPeople: people,
      existingEvents: [],
      decisions: [
        { xref: "I1", action: "merge", personId: "homer" },
        { xref: "I2", action: "merge", personId: "homer" },
        { xref: "I3", action: "create" },
      ],
    });
    expect(plan.errors.some(error => error.includes("same person"))).toBe(true);
  });

  it("rejects a merge without a target", () => {
    const plan = planImport({
      parsed,
      existingPeople: people,
      existingEvents: [],
      decisions: [
        { xref: "I1", action: "merge" },
        { xref: "I2", action: "create" },
        { xref: "I3", action: "create" },
      ],
    });
    expect(plan.errors.some(error => error.includes("Choose an existing person"))).toBe(true);
  });

  it("rejects a missing decision", () => {
    const plan = planImport({
      parsed,
      existingPeople: people,
      existingEvents: [],
      decisions: [{ xref: "I1", action: "create" }],
    });
    expect(plan.errors.length).toBeGreaterThan(0);
  });

  it("skips a person and their relationships", () => {
    const plan = planImport({
      parsed,
      existingPeople: people,
      existingEvents: [],
      decisions: [
        { xref: "I1", action: "merge", personId: "homer" },
        { xref: "I2", action: "merge", personId: "marge" },
        { xref: "I3", action: "skip" },
      ],
    });
    expect(plan.counts.skip).toBe(1);
    expect(plan.counts.parentLinks).toBe(0);
    expect(plan.counts.partnerships).toBe(1);
    expect(plan.events).toHaveLength(1);
    expect(plan.events.every(event => event.xref !== "I3")).toBe(true);
  });

  it("keeps the family when one partner is skipped", () => {
    const plan = planImport({
      parsed,
      existingPeople: people,
      existingEvents: [],
      decisions: [
        { xref: "I1", action: "merge", personId: "homer" },
        { xref: "I2", action: "skip" },
        { xref: "I3", action: "create" },
      ],
    });
    expect(plan.counts.parentLinks).toBe(1);
    expect(plan.counts.partnerships).toBe(0);
  });
});
