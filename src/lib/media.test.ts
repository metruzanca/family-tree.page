import { describe, expect, it } from "vitest";
import type { GraphFile, GraphPerson } from "~/api/people-server";
import {
  albumFiles,
  filesForPerson,
  filterMediaFiles,
  groupMediaByYear,
  inboxFiles,
  looseFilesForPerson,
  mediaFolders,
  mediaSortTime,
  mediaYear,
  personAlbums,
  sortMediaFiles,
} from "./media";

function image(
  id: string,
  personId: string | null,
  overrides: Partial<GraphFile> = {},
): GraphFile {
  return {
    id,
    personId,
    groupId: null,
    name: `${id}.jpg`,
    mimeType: "image/jpeg",
    kind: "image",
    thumbUrl: null,
    width: 100,
    height: 100,
    sizeBytes: 1000,
    takenAt: null,
    facesScannedAt: null,
    faces: [],
    taggedPersonIds: [],
    createdAt: new Date("2020-06-01T00:00:00Z"),
    isAvatar: false,
    ...overrides,
  };
}

function person(id: string, displayName: string): GraphPerson {
  return {
    id,
    firstName: displayName,
    lastName: "Test",
    displayName,
    maidenName: null,
    nickname: null,
    birthDate: null,
    deathDate: null,
    birthPlace: null,
    deathPlace: null,
    bio: null,
    avatarFileId: null,
    sex: "unknown",
    links: [],
    contactEmail: null,
    contactPhone: null,
  };
}

const document = image("doc", "alice", {
  kind: "document",
  mimeType: "application/pdf",
});

describe("filterMediaFiles", () => {
  const files = [
    image("alice-photo", "alice"),
    image("inbox-photo", null),
    document,
    image("bob-photo", "bob"),
  ];

  it("keeps images only", () => {
    expect(filterMediaFiles(files).map(file => file.id)).toEqual([
      "alice-photo",
      "inbox-photo",
      "bob-photo",
    ]);
  });

  it("filters the inbox", () => {
    expect(filterMediaFiles(files, { location: "inbox" }).map(file => file.id)).toEqual([
      "inbox-photo",
    ]);
  });

  it("filters by person", () => {
    expect(filterMediaFiles(files, { location: "bob" }).map(file => file.id)).toEqual([
      "bob-photo",
    ]);
  });

  it("matches names case-insensitively", () => {
    expect(filterMediaFiles(files, { query: "ALICE" }).map(file => file.id)).toEqual([
      "alice-photo",
    ]);
  });
});

describe("sorting and grouping", () => {
  it("sorts newest first using the photo date before the upload date", () => {
    const older = image("older", "alice", {
      takenAt: {
        start: { year: 1990, month: 4, day: 2 },
        qualifier: "exact",
      },
    });
    const newer = image("newer", "alice", {
      createdAt: new Date("2024-01-01T00:00:00Z"),
    });
    expect(sortMediaFiles([older, newer]).map(file => file.id)).toEqual([
      "newer",
      "older",
    ]);
    expect(mediaYear(older)).toBe(1990);
    expect(mediaSortTime(older)).toBeLessThan(mediaSortTime(newer));
  });

  it("groups by year with the newest year first and undated last", () => {
    const files = [
      image("a", "alice", {
        takenAt: { start: { year: 1990, month: 1, day: 1 }, qualifier: "exact" },
      }),
      image("b", "alice", { createdAt: new Date("2024-03-03T00:00:00Z") }),
      image("c", "alice", { createdAt: new Date("2024-01-01T00:00:00Z") }),
    ];
    expect(groupMediaByYear(files).map(group => [group.year, group.files.map(f => f.id)])).toEqual([
      [2024, ["b", "c"]],
      [1990, ["a"]],
    ]);
  });
});

describe("folders", () => {
  const files = [
    image("alice-1", "alice"),
    image("alice-2", "alice"),
    image("bob-1", "bob"),
    image("inbox-1", null),
    document,
  ];

  it("counts photos per person and sorts by name", () => {
    const folders = mediaFolders([person("bob", "Bob"), person("alice", "Alice")], files);
    expect(folders.map(folder => [folder.person.id, folder.count])).toEqual([
      ["alice", 2],
      ["bob", 1],
    ]);
  });

  it("lists the inbox and each person's photos", () => {
    expect(inboxFiles(files).map(file => file.id)).toEqual(["inbox-1"]);
    expect(filesForPerson(files, "bob").map(file => file.id)).toEqual(["bob-1"]);
  });

  it("splits albums from loose photos in a folder", () => {
    const album = {
      id: "album-1",
      personId: "alice",
      name: "Summer",
      count: 1,
      coverFileId: "alice-album",
      coverWidth: null,
      coverHeight: null,
      createdAt: new Date("2024-01-01T00:00:00Z"),
    };
    const withAlbum = [
      ...files,
      image("alice-album", "alice", { groupId: "album-1" }),
      image("old-album", "alice", { groupId: "album-gone" }),
    ];
    expect(looseFilesForPerson(withAlbum, "alice").map(file => file.id)).toEqual([
      "alice-1",
      "alice-2",
    ]);
    expect(albumFiles(withAlbum, "album-1").map(file => file.id)).toEqual([
      "alice-album",
    ]);
    expect(personAlbums([album], withAlbum, "alice").map(group => group.id)).toEqual([
      "album-1",
    ]);
  });
});
