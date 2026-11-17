import { describe, expect, it } from "vitest";
import type {
  GraphFile,
  GraphFileGroup,
  GraphPerson,
  TreeGraphData,
} from "~/api/people-server";
import { isLivingPerson, sanitizeSharedGraph } from "./share";

function person(id: string, overrides: Partial<GraphPerson> = {}): GraphPerson {
  return {
    id,
    firstName: id,
    lastName: "Test",
    displayName: `${id} Test`,
    maidenName: null,
    nickname: null,
    birthDate: null,
    deathDate: null,
    birthPlace: "Springfield",
    deathPlace: null,
    bio: "A life well lived.",
    avatarFileId: `avatar-${id}`,
    ...overrides,
  };
}

function image(id: string, personId: string, groupId: string | null = null): GraphFile {
  return {
    id,
    personId,
    groupId,
    name: id,
    mimeType: "image/jpeg",
    kind: "image",
    thumbUrl: null,
    width: 100,
    height: 100,
    sizeBytes: 1000,
    takenAt: null,
    taggedPersonIds: [],
    createdAt: new Date("2020-01-01T00:00:00Z"),
    isAvatar: false,
  };
}

function document(id: string, personId: string): GraphFile {
  return { ...image(id, personId), kind: "document", mimeType: "application/pdf" };
}

function graph(overrides: Partial<TreeGraphData> = {}): TreeGraphData {
  const album: GraphFileGroup = {
    id: "group-1",
    personId: "living",
    name: "Album",
    count: 1,
    coverFileId: "living-image",
    coverWidth: 100,
    coverHeight: 100,
    createdAt: new Date("2020-01-01T00:00:00Z"),
  };
  return {
    tree: { id: "tree-1", name: "Test tree", description: null },
    people: [person("living"), person("dead", { deathDate: { start: { year: 1990, month: null, day: null }, qualifier: "exact" } })],
    relationships: [
      { id: "rel-1", type: "parent", source: "dead", target: "living", parentType: "biological" },
    ],
    files: [
      image("living-image", "living", "group-1"),
      image("dead-image", "dead"),
      document("living-doc", "living"),
    ],
    groups: [album],
    events: [
      {
        id: "event-1",
        personId: "living",
        kind: "residence",
        title: "Moved",
        place: null,
        date: null,
        description: null,
        createdAt: new Date("2020-01-01T00:00:00Z"),
      },
      {
        id: "event-2",
        personId: "dead",
        kind: "burial",
        title: "Buried",
        place: null,
        date: null,
        description: null,
        createdAt: new Date("2020-01-01T00:00:00Z"),
      },
    ],
    ...overrides,
  };
}

const thumb = (fileId: string) => `/share/token/files/${fileId}/thumb`;

describe("isLivingPerson", () => {
  it("treats a person without a death date as living", () => {
    expect(isLivingPerson(person("a"))).toBe(true);
  });

  it("treats a person with a death date as deceased", () => {
    expect(isLivingPerson(person("a", { deathDate: { start: { year: 1990, month: null, day: null }, qualifier: "exact" } }))).toBe(false);
  });
});

describe("sanitizeSharedGraph", () => {
  it("hides living people and anything that points at them", () => {
    const shared = sanitizeSharedGraph(graph(), {
      livingVisibility: "hidden",
      includeMedia: true,
      thumbUrl: thumb,
    });

    expect(shared.people.map(p => p.id)).toEqual(["dead"]);
    expect(shared.relationships).toEqual([]);
    expect(shared.files.map(f => f.id)).toEqual(["dead-image"]);
    expect(shared.groups).toEqual([]);
    expect(shared.events.map(e => e.id)).toEqual(["event-2"]);
  });

  it("reduces living people to names without dates, places, bio, or portrait", () => {
    const shared = sanitizeSharedGraph(graph(), {
      livingVisibility: "name",
      includeMedia: false,
      thumbUrl: thumb,
    });

    const living = shared.people.find(p => p.id === "living")!;
    expect(living.displayName).toBe("living Test");
    expect(living.birthDate).toBeNull();
    expect(living.birthPlace).toBeNull();
    expect(living.bio).toBeNull();
    expect(living.avatarFileId).toBeNull();
    expect(shared.relationships).toHaveLength(1);
    expect(shared.files).toEqual([]);
    expect(shared.groups).toEqual([]);
    expect(shared.events.map(e => e.id)).toEqual(["event-2"]);
  });

  it("keeps full details for living people when visibility allows it", () => {
    const shared = sanitizeSharedGraph(graph(), {
      livingVisibility: "full",
      includeMedia: true,
      thumbUrl: thumb,
    });

    const living = shared.people.find(p => p.id === "living")!;
    expect(living.birthPlace).toBe("Springfield");
    expect(living.avatarFileId).toBe("avatar-living");
    expect(shared.events).toHaveLength(2);
  });

  it("limits media to images and rewrites thumbnails when media is on", () => {
    const shared = sanitizeSharedGraph(graph(), {
      livingVisibility: "name",
      includeMedia: true,
      thumbUrl: thumb,
    });

    expect(shared.files.map(file => file.id)).toEqual(["dead-image"]);
    expect(shared.files[0].thumbUrl).toBe("/share/token/files/dead-image/thumb");
    expect(shared.groups).toEqual([]);
  });

  it("drops an album when none of its files survive", () => {
    const shared = sanitizeSharedGraph(graph(), {
      livingVisibility: "hidden",
      includeMedia: true,
      thumbUrl: thumb,
    });

    expect(shared.groups).toEqual([]);
  });
});
