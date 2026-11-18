import { describe, expect, it } from "vitest";
import { exactFuzzyDate, type FuzzyDate } from "../fuzzy-date";
import { buildDossier, buildTimeline } from "./dossier";
import { buildResearchIndex } from "./graph";
import {
  imageFile,
  lifeEvent,
  parentRelationship,
  partnerRelationship,
  person,
  treeGraph,
} from "./test-helpers";

const about = (year: number): FuzzyDate => ({
  start: { year, month: null, day: null },
  qualifier: "about",
});

function dossierIndex() {
  const people = [
    person("subject", "Nora", "Bly", 1900, {
      maidenName: "Marsh",
      birthPlace: "Boston, Massachusetts",
      deathDate: exactFuzzyDate(1970),
      deathPlace: "Salem, Massachusetts",
      bio: "A researcher.",
    }),
    person("father", "Elias", "Bly", 1870),
    person("mother", "Ruth", "Bly", 1875),
    person("sibling", "Owen", "Bly", 1903),
    person("partner", "James", "Nora", 1898),
    person("child", "Ada", "Nora", 1925),
  ];
  const relationships = [
    parentRelationship("r1", "father", "subject"),
    parentRelationship("r2", "mother", "subject"),
    parentRelationship("r3", "father", "sibling"),
    parentRelationship("r4", "mother", "sibling"),
    partnerRelationship("r5", "subject", "partner"),
    parentRelationship("r6", "subject", "child"),
    parentRelationship("r7", "partner", "child"),
  ];
  const events = [
    lifeEvent("e1", "subject", "occupation", {
      title: "Newspaper editor",
      place: "Salem, Massachusetts",
      year: 1920,
    }),
    lifeEvent("e2", "subject", "residence", { place: "Salem, Massachusetts" }),
  ];
  return buildResearchIndex(
    treeGraph({
      people,
      relationships,
      events,
      files: [
        imageFile("f1", "subject"),
        imageFile("f2", "child", { taggedPersonIds: ["subject"] }),
      ],
    }),
  );
}

describe("person dossier", () => {
  it("merges dates and life events into one timeline", () => {
    const dossier = buildDossier(dossierIndex(), "subject")!;
    expect(dossier.timeline.map(item => item.label)).toEqual([
      "Birth",
      "Newspaper editor",
      "Death",
      "Residence",
    ]);
  });

  it("keeps undated events at the end rather than pretending they are year zero", () => {
    const subject = person("a", "A", "One", 1900, {
      deathDate: exactFuzzyDate(1950),
    });
    const timeline = buildTimeline(subject, [
      lifeEvent("e1", "a", "residence", { place: "Nowhere" }),
      lifeEvent("e2", "a", "occupation", { year: 1920 }),
    ]);
    expect(timeline.map(item => item.label)).toEqual(["Birth", "Occupation", "Death", "Residence"]);
  });

  it("separates partners and the children shared with each", () => {
    const dossier = buildDossier(dossierIndex(), "subject")!;
    expect(dossier.partners).toHaveLength(1);
    expect(dossier.partners[0].person.id).toBe("partner");
    expect(dossier.partners[0].children.map(child => child.id)).toEqual(["child"]);
    expect(dossier.parents.map(parent => parent.person.id).sort()).toEqual(["father", "mother"]);
    expect(dossier.siblings.map(sibling => sibling.id)).toEqual(["sibling"]);
  });

  it("collects photos the person owns and photos they are tagged in", () => {
    const dossier = buildDossier(dossierIndex(), "subject")!;
    expect(dossier.files.map(file => file.id).sort()).toEqual(["f1", "f2"]);
  });

  it("calculates an age at death and flags an approximate one", () => {
    expect(buildDossier(dossierIndex(), "subject")!.ageAtDeath).toBe(70);
    expect(buildDossier(dossierIndex(), "subject")!.ageAtDeathApproximate).toBe(false);

    const vague = buildResearchIndex(
      treeGraph({
        people: [
          person("vague", "Vera", "Vale", 1900, {
            birthDate: about(1900),
            deathDate: about(1970),
          }),
        ],
      }),
    );
    const dossier = buildDossier(vague, "vague")!;
    expect(dossier.ageAtDeath).toBe(70);
    expect(dossier.ageAtDeathApproximate).toBe(true);
  });

  it("lists the gaps a researcher would chase", () => {
    const sparse = buildResearchIndex(
      treeGraph({ people: [person("lonely", "Lone", "Wolf", null)] }),
    );
    const dossier = buildDossier(sparse, "lonely")!;
    expect(dossier.missing).toContain("No birth date");
    expect(dossier.missing).toContain("No parents recorded");
    expect(dossier.missing).toContain("No photos or documents");
  });
});
