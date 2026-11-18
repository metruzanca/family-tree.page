import { describe, expect, it } from "vitest";
import { exactFuzzyDate } from "./fuzzy-date";
import {
  PERSON_EVENT_OPTIONS,
  buildLifeTimeline,
  canonicalEventPair,
  eventInvolvesPerson,
  eventPartnerOf,
  personEventKindLabel,
  type ChildBirthSource,
  type PersonEventKind,
} from "./person-events";

const createdAt = new Date("2026-01-01T00:00:00Z");

function event(id: string, date: ReturnType<typeof exactFuzzyDate> | null, order = 0) {
  return {
    id,
    kind: "residence" as PersonEventKind,
    title: id,
    place: null,
    date,
    description: null,
    createdAt: new Date(createdAt.getTime() + order),
  };
}

function child(overrides: Partial<ChildBirthSource> & { id: string }): ChildBirthSource {
  return {
    id: overrides.id,
    displayName: overrides.displayName ?? overrides.id,
    birthDate: overrides.birthDate ?? null,
    birthPlace: overrides.birthPlace ?? null,
  };
}

describe("person event kinds", () => {
  it("offers marriage and divorce, keeping other last", () => {
    const values = PERSON_EVENT_OPTIONS.map(option => option.value);
    expect(values).toContain("marriage");
    expect(values).toContain("divorce");
    expect(values.at(-1)).toBe("other");
    expect(personEventKindLabel("marriage")).toBe("Marriage");
    expect(personEventKindLabel("divorce")).toBe("Divorce");
  });
});

describe("shared events", () => {
  const wedding = { personId: "ana", partnerPersonId: "bo" };

  it("belongs to both participants", () => {
    expect(eventInvolvesPerson(wedding, "ana")).toBe(true);
    expect(eventInvolvesPerson(wedding, "bo")).toBe(true);
    expect(eventInvolvesPerson(wedding, "cy")).toBe(false);
  });

  it("resolves the other participant from each side", () => {
    expect(eventPartnerOf(wedding, "ana")).toBe("bo");
    expect(eventPartnerOf(wedding, "bo")).toBe("ana");
    expect(eventPartnerOf(wedding, "cy")).toBeNull();
  });

  it("treats an event without a partner as one person's own", () => {
    const solo = { personId: "ana", partnerPersonId: null };
    expect(eventPartnerOf(solo, "ana")).toBeNull();
    expect(eventInvolvesPerson(solo, "bo")).toBe(false);
  });

  it("keeps the row's owner and partner when edited from either side", () => {
    expect(
      canonicalEventPair({ ownerId: "ana", viewerId: "ana", otherPersonId: "bo" }),
    ).toEqual({ personId: "ana", partnerPersonId: "bo" });
    expect(
      canonicalEventPair({ ownerId: "ana", viewerId: "bo", otherPersonId: "ana" }),
    ).toEqual({ personId: "ana", partnerPersonId: "bo" });
  });

  it("moves a shared event to the editor's timeline when the spouse changes", () => {
    expect(
      canonicalEventPair({ ownerId: "ana", viewerId: "bo", otherPersonId: "cy" }),
    ).toEqual({ personId: "bo", partnerPersonId: "cy" });
    expect(
      canonicalEventPair({ ownerId: "ana", viewerId: "ana", otherPersonId: "cy" }),
    ).toEqual({ personId: "ana", partnerPersonId: "cy" });
  });

  it("unshares an event when the partner is cleared", () => {
    expect(
      canonicalEventPair({ ownerId: "ana", viewerId: "bo", otherPersonId: null }),
    ).toEqual({ personId: "ana", partnerPersonId: null });
  });
});

describe("buildLifeTimeline", () => {
  it("interleaves a parent's events with the births of their children", () => {
    const entries = buildLifeTimeline(
      [event("moved", exactFuzzyDate(1985)), event("retired", exactFuzzyDate(2010))],
      [
        child({
          id: "ana",
          displayName: "Ana",
          birthDate: exactFuzzyDate(1980),
          birthPlace: "Springfield",
        }),
        child({ id: "bo", displayName: "Bo", birthDate: exactFuzzyDate(2000) }),
      ],
    );

    expect(
      entries.map(entry => (entry.type === "event" ? entry.event.id : entry.name)),
    ).toEqual(["Ana", "moved", "Bo", "retired"]);
    const ana = entries[0];
    expect(ana.type).toBe("child-birth");
    if (ana.type === "child-birth") {
      expect(ana.date).toEqual(exactFuzzyDate(1980));
      expect(ana.personId).toBe("ana");
      expect(ana.place).toBe("Springfield");
    }
  });

  it("skips children without a birth date", () => {
    const entries = buildLifeTimeline(
      [],
      [
        child({ id: "known", displayName: "Known", birthDate: exactFuzzyDate(1990) }),
        child({ id: "unknown", displayName: "Unknown" }),
      ],
    );

    expect(entries).toHaveLength(1);
    expect(entries[0].type).toBe("child-birth");
  });

  it("keeps undated events last and orders same-day events by creation", () => {
    const entries = buildLifeTimeline(
      [
        event("undated", null),
        event("second", exactFuzzyDate(1970), 1),
        event("first", exactFuzzyDate(1970), 0),
      ],
      [child({ id: "kid", displayName: "Kid", birthDate: exactFuzzyDate(1970) })],
    );

    expect(
      entries.map(entry => (entry.type === "event" ? entry.event.id : entry.name)),
    ).toEqual(["first", "second", "Kid", "undated"]);
  });

  it("sorts births on the same day by name", () => {
    const entries = buildLifeTimeline(
      [],
      [
        child({ id: "z", displayName: "Zoe", birthDate: exactFuzzyDate(1999) }),
        child({ id: "a", displayName: "Ada", birthDate: exactFuzzyDate(1999) }),
      ],
    );

    expect(entries.map(entry => (entry.type === "child-birth" ? entry.name : ""))).toEqual([
      "Ada",
      "Zoe",
    ]);
  });
});
