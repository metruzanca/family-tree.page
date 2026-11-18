import { describe, expect, it } from "vitest";
import { buildResearchIndex } from "./graph";
import {
  buildDescendantRegister,
  buildPedigree,
  flattenRegister,
  roman,
} from "./numbering";
import { parentRelationship, person, treeGraph } from "./test-helpers";

function familyIndex() {
  const people = [
    person("root", "Ada", "Lovelace", 1815),
    person("dad", "Byron", "Lovelace", 1788),
    person("mum", "Anne", "Milbanke", 1792),
    person("grandad", "John", "Lovelace", 1754),
    person("grandmum", "Mary", "Lovelace", 1760),
    person("other-grandad", "Ralph", "Milbanke", 1750),
    person("other-grandmum", "Judith", "Milbanke", 1755),
    person("child-one", "Anne", "Lovelace", 1837),
    person("child-two", "Esme", "Lovelace", 1840),
    person("grandchild", "Byron", "Lovelace", 1860),
    person("great-grandchild", "Mary", "Lovelace", 1885),
    person("niece", "Nell", "Lovelace", 1850),
  ];
  const relationships = [
    parentRelationship("r1", "dad", "root"),
    parentRelationship("r2", "mum", "root"),
    parentRelationship("r3", "grandad", "dad"),
    parentRelationship("r4", "grandmum", "dad"),
    parentRelationship("r5", "other-grandad", "mum"),
    parentRelationship("r6", "other-grandmum", "mum"),
    parentRelationship("r7", "root", "child-one"),
    parentRelationship("r8", "root", "child-two"),
    parentRelationship("r9", "child-one", "grandchild"),
    parentRelationship("r10", "grandchild", "great-grandchild"),
    parentRelationship("r11", "child-two", "niece"),
  ];
  return buildResearchIndex(treeGraph({ people, relationships }));
}

describe("Ahnentafel pedigree", () => {
  it("numbers the subject and both parent slots", () => {
    const pedigree = buildPedigree(familyIndex(), "root");
    expect(pedigree).not.toBeNull();
    const numbers = Object.fromEntries(
      pedigree!.slots.map(slot => [slot.number, slot.person?.id ?? null]),
    );
    expect(numbers[1]).toBe("root");
    expect(numbers[2]).toBe("dad");
    expect(numbers[3]).toBe("mum");
    expect(numbers[4]).toBe("grandad");
    expect(numbers[5]).toBe("grandmum");
    expect(numbers[6]).toBe("other-grandad");
    expect(numbers[7]).toBe("other-grandmum");
  });

  it("keeps empty slots out of the chart instead of inventing people", () => {
    const index = buildResearchIndex(
      treeGraph({ people: [person("solo", "Solo", "Lane", 1900)] }),
    );
    const pedigree = buildPedigree(index, "solo");
    expect(pedigree!.slots).toHaveLength(1);
    expect(pedigree!.slots[0].number).toBe(1);
    expect(pedigree!.truncated).toBe(false);
  });

  it("reports truncation when an ancestor has more parents than the limit", () => {
    const pedigree = buildPedigree(familyIndex(), "root", 2);
    expect(pedigree!.truncated).toBe(true);
  });
});

describe("descendant register", () => {
  it("assigns Register numbers only to lines that continue", () => {
    const register = buildDescendantRegister(familyIndex(), "root", "register");
    expect(register).not.toBeNull();
    const rows = flattenRegister(register!.root);
    const numbers = Object.fromEntries(rows.map(row => [row.person.id, row.number]));
    expect(numbers.root).toBe(1);
    expect(numbers["child-one"]).toBe(2);
    expect(numbers.grandchild).toBe(3);
    expect(numbers["great-grandchild"]).toBeNull();
    expect(numbers["child-two"]).toBe(4);
    expect(numbers.niece).toBeNull();
  });

  it("labels children with lowercase Roman numerals", () => {
    const register = buildDescendantRegister(familyIndex(), "root", "register");
    const rows = flattenRegister(register!.root);
    expect(rows.find(row => row.person.id === "child-one")?.childLabel).toBe("i");
    expect(rows.find(row => row.person.id === "child-two")?.childLabel).toBe("ii");
  });

  it("numbers everyone in reading order in the NGSQ system", () => {
    const register = buildDescendantRegister(familyIndex(), "root", "ngsq");
    const rows = flattenRegister(register!.root);
    expect(rows.map(row => [row.person.id, row.number])).toEqual([
      ["root", 1],
      ["child-one", 2],
      ["grandchild", 3],
      ["great-grandchild", 4],
      ["child-two", 5],
      ["niece", 6],
    ]);
    expect(rows.find(row => row.person.id === "child-two")?.hasDescendants).toBe(true);
    expect(rows.find(row => row.person.id === "child-one")?.hasDescendants).toBe(true);
  });

  it("survives a parent cycle without recursing forever", () => {
    const people = [person("a", "A", "One", 1900), person("b", "B", "One", 1920)];
    const index = buildResearchIndex(
      treeGraph({
        people,
        relationships: [
          parentRelationship("r1", "a", "b"),
          parentRelationship("r2", "b", "a"),
        ],
      }),
    );
    const register = buildDescendantRegister(index, "a", "ngsq");
    expect(flattenRegister(register!.root).length).toBeLessThanOrEqual(3);
  });
});

describe("roman numerals", () => {
  it("formats the values used by descendant labels", () => {
    expect(roman(1)).toBe("i");
    expect(roman(4)).toBe("iv");
    expect(roman(9)).toBe("ix");
    expect(roman(14)).toBe("xiv");
    expect(roman(40)).toBe("xl");
  });
});
