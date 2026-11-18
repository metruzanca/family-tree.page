import { describe, expect, it } from "vitest";
import { buildResearchIndex } from "./graph";
import {
  buildPlaceIndex,
  buildSurnameIndex,
  editDistance,
  normalizeSurname,
  placeKey,
  placeParts,
  soundex,
} from "./indexes";
import { lifeEvent, person, treeGraph } from "./test-helpers";

describe("surname matching", () => {
  it("strips accents and punctuation", () => {
    expect(normalizeSurname("  O'Neill-Smith ")).toBe("oneillsmith");
    expect(normalizeSurname("García")).toBe("garcia");
  });

  it("buckets common spelling variants together", () => {
    expect(soundex("Smith")).toBe(soundex("Smyth"));
    expect(soundex("Smith")).toBe("S530");
    expect(editDistance("smith", "smythe")).toBe(2);
    expect(editDistance("white", "wade", 2)).toBeGreaterThan(2);
  });
});

describe("surname index", () => {
  it("groups variants and counts every occurrence", () => {
    const index = buildResearchIndex(
      treeGraph({
        people: [
          person("a", "John", "Smith", 1900),
          person("b", "Mary", "Smyth", 1905),
          person("c", "Ann", "Smythe", 1910),
          person("d", "Ellen", "White", 1920),
          person("e", "Frank", "Wade", 1925),
          person("f", "Rose", "Jones", 1930, { maidenName: "Smith" }),
        ],
      }),
    );
    const groups = buildSurnameIndex(index);
    const smith = groups.find(group => group.variants.some(variant => variant.surname === "Smith"));
    const white = groups.find(group => group.variants.some(variant => variant.surname === "White"));
    const wade = groups.find(group => group.variants.some(variant => variant.surname === "Wade"));

    expect(smith?.people).toHaveLength(4);
    expect(smith?.variants.map(variant => variant.surname).sort()).toEqual([
      "Smith",
      "Smyth",
      "Smythe",
    ]);
    expect(smith?.earliestYear).toBe(1900);
    expect(smith?.latestYear).toBe(1930);
    expect(white?.key).not.toBe(wade?.key);
  });
});

describe("place index", () => {
  it("splits a place into a hierarchy and canonicalizes it", () => {
    expect(placeParts("Boston, Massachusetts, USA")).toEqual([
      "Boston",
      "Massachusetts",
      "USA",
    ]);
    expect(placeKey("Boston,  Massachusetts")).toBe(placeKey("boston, massachusetts"));
  });

  it("groups records that use the same place with different spacing or case", () => {
    const index = buildResearchIndex(
      treeGraph({
        people: [
          person("a", "Ada", "Lane", 1900, { birthPlace: "Boston, Massachusetts" }),
          person("b", "Ben", "Lane", 1902, {
            birthDate: null,
            birthPlace: "boston,  massachusetts",
          }),
          person("c", "Cora", "Lane", 1910, { birthPlace: "Salem, Massachusetts" }),
        ],
        events: [
          lifeEvent("e1", "c", "occupation", {
            place: "Boston, Massachusetts",
            year: 1930,
          }),
        ],
      }),
    );
    const placeIndex = buildPlaceIndex(index);
    const boston = placeIndex.places.find(group => placeKey(group.label) === placeKey("Boston, Massachusetts"));
    expect(boston?.entries).toHaveLength(3);
    expect(boston?.peopleCount).toBe(3);
    expect(boston?.label).toBe("Boston, Massachusetts");
  });

  it("counts records that are missing a place", () => {
    const index = buildResearchIndex(
      treeGraph({
        people: [person("a", "Ada", "Lane", 1900)],
        events: [lifeEvent("e1", "a", "occupation", { year: 1920 })],
      }),
    );
    const placeIndex = buildPlaceIndex(index);
    expect(placeIndex.missing.births).toBe(1);
    expect(placeIndex.missing.events).toBe(1);
    expect(placeIndex.missing.people.map(entry => entry.id)).toEqual(["a"]);
  });
});
