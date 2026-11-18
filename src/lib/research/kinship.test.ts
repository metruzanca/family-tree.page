import { describe, expect, it } from "vitest";
import { buildResearchIndex } from "./graph";
import { describeKinship } from "./kinship";
import {
  parentRelationship,
  partnerRelationship,
  person,
  treeGraph,
} from "./test-helpers";

function kinshipIndex() {
  const people = [
    person("grandparent", "Grace", "Line", 1900),
    person("parent", "Pat", "Line", 1930),
    person("aunt", "Alice", "Line", 1933),
    person("subject", "Sam", "Line", 1960),
    person("cousin", "Cora", "Line", 1965),
    person("cousin-child", "Cleo", "Line", 1990),
    person("spouse", "Sky", "Other", 1962),
    person("stranger", "Zoe", "Else", 1970),
  ];
  const relationships = [
    parentRelationship("r1", "grandparent", "parent"),
    parentRelationship("r2", "grandparent", "aunt"),
    parentRelationship("r3", "parent", "subject"),
    parentRelationship("r4", "aunt", "cousin"),
    parentRelationship("r5", "cousin", "cousin-child"),
    partnerRelationship("p1", "subject", "spouse"),
  ];
  return buildResearchIndex(treeGraph({ people, relationships }));
}

describe("kinship labels", () => {
  const index = kinshipIndex();

  it("names direct ancestors and descendants", () => {
    expect(describeKinship(index, "subject", "parent")?.label).toBe("parent");
    expect(describeKinship(index, "subject", "grandparent")?.label).toBe("grandparent");
    expect(describeKinship(index, "parent", "subject")?.label).toBe("child");
  });

  it("names aunts, uncles, nieces and nephews", () => {
    expect(describeKinship(index, "subject", "aunt")?.label).toBe("aunt or uncle");
    expect(describeKinship(index, "aunt", "subject")?.label).toBe("niece or nephew");
  });

  it("counts cousins and removals", () => {
    expect(describeKinship(index, "subject", "cousin")?.label).toBe("first cousin");
    expect(describeKinship(index, "subject", "cousin-child")?.label).toBe(
      "first cousin once removed",
    );
  });

  it("identifies the same person", () => {
    expect(describeKinship(index, "subject", "subject")?.label).toBe("the same person");
  });

  it("distinguishes marriage from a blood line", () => {
    expect(describeKinship(index, "subject", "spouse")?.label).toBe("related by marriage");
    expect(describeKinship(index, "subject", "stranger")?.label).toBe(
      "no relationship recorded",
    );
  });

  it("returns a readable path through the family", () => {
    const result = describeKinship(index, "subject", "cousin")!;
    expect(result.path.map(person => person.id)).toEqual([
      "subject",
      "parent",
      "grandparent",
      "aunt",
      "cousin",
    ]);
  });
});
