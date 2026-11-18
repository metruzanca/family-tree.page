import { describe, expect, it } from "vitest";
import {
  buildFamilyUnits,
  buildResearchIndex,
  eventsOf,
  familiesForPerson,
  familyKey,
  sharedChildren,
} from "./graph";
import {
  lifeEvent,
  parentRelationship,
  partnerRelationship,
  person,
  treeGraph,
} from "./test-helpers";

function indexWithTwoMarriages() {
  const people = [
    person("dad", "Robert", "Hale", 1900),
    person("first-wife", "Mary", "Hale", 1902),
    person("second-wife", "Ellen", "Hale", 1910),
    person("child-a", "Ada", "Hale", 1925),
    person("child-b", "Ben", "Hale", 1928),
    person("child-c", "Cora", "Hale", 1940),
    person("single-parent", "Sam", "Reed", 1915),
    person("single-child", "Nell", "Reed", 1945),
    person("couple-one", "Jack", "Stone", 1890),
    person("couple-two", "Ivy", "Stone", 1895),
  ];
  const relationships = [
    partnerRelationship("p1", "dad", "first-wife"),
    partnerRelationship("p2", "dad", "second-wife"),
    partnerRelationship("p3", "couple-one", "couple-two"),
    parentRelationship("r1", "dad", "child-a"),
    parentRelationship("r2", "first-wife", "child-a"),
    parentRelationship("r3", "dad", "child-b"),
    parentRelationship("r4", "first-wife", "child-b"),
    parentRelationship("r5", "dad", "child-c"),
    parentRelationship("r6", "second-wife", "child-c"),
    parentRelationship("r7", "single-parent", "single-child"),
  ];
  return buildResearchIndex(treeGraph({ people, relationships }));
}

describe("family groups", () => {
  it("keeps each parent set as its own family sheet", () => {
    const units = buildFamilyUnits(indexWithTwoMarriages());
    const haleUnits = units.filter(unit => unit.parents[0]?.lastName === "Hale" || unit.parents[1]?.lastName === "Hale");
    const first = haleUnits.find(unit => unit.key === familyKey(["dad", "first-wife"]));
    const second = haleUnits.find(unit => unit.key === familyKey(["dad", "second-wife"]));

    expect(first?.children.map(child => child.id)).toEqual(["child-a", "child-b"]);
    expect(second?.children.map(child => child.id)).toEqual(["child-c"]);
  });

  it("records a single parent as a family of one", () => {
    const units = buildFamilyUnits(indexWithTwoMarriages());
    const single = units.find(unit => unit.key === familyKey(["single-parent"]));
    expect(single?.parents.map(parent => parent.id)).toEqual(["single-parent"]);
    expect(single?.children.map(child => child.id)).toEqual(["single-child"]);
  });

  it("includes couples with no recorded children", () => {
    const units = buildFamilyUnits(indexWithTwoMarriages());
    const couple = units.find(unit => unit.key === familyKey(["couple-one", "couple-two"]));
    expect(couple).toBeDefined();
    expect(couple?.children).toEqual([]);
    expect(couple?.partnership?.status).toBe("married");
  });

  it("sorts children by birth date", () => {
    const units = buildFamilyUnits(indexWithTwoMarriages());
    const first = units.find(unit => unit.key === familyKey(["dad", "first-wife"]));
    expect(first?.children.map(child => child.firstName)).toEqual(["Ada", "Ben"]);
  });

  it("offers the families where a person is a parent before the family where they are a child", () => {
    const index = indexWithTwoMarriages();
    const families = familiesForPerson(index, "dad");
    expect(families).toHaveLength(2);
    expect(families.every(unit => unit.parents.some(parent => parent.id === "dad"))).toBe(true);
  });

  it("finds the children shared with a specific partner", () => {
    const index = indexWithTwoMarriages();
    expect(sharedChildren(index, "dad", "first-wife").map(child => child.id)).toEqual([
      "child-a",
      "child-b",
    ]);
    expect(sharedChildren(index, "dad", "second-wife").map(child => child.id)).toEqual([
      "child-c",
    ]);
  });

  it("shows a shared marriage on both parents but lists it once per family", () => {
    const index = buildResearchIndex(
      treeGraph({
        people: [
          person("dad", "Robert", "Hale", 1900),
          person("wife", "Mary", "Hale", 1902),
        ],
        relationships: [partnerRelationship("p1", "dad", "wife")],
        events: [
          lifeEvent("wedding", "dad", "marriage", {
            partnerPersonId: "wife",
            year: 1924,
          }),
        ],
      }),
    );

    expect(eventsOf(index, "dad").map(event => event.id)).toEqual(["wedding"]);
    expect(eventsOf(index, "wife").map(event => event.id)).toEqual(["wedding"]);
    const unit = buildFamilyUnits(index).find(
      family => family.key === familyKey(["dad", "wife"]),
    );
    expect(unit?.events.map(event => event.id)).toEqual(["wedding"]);
  });
});
