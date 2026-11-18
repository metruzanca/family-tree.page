import { describe, expect, it } from "vitest";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import spec from "../../../openapi/roots-v1.json";
import { exactFuzzyDate } from "../../lib/fuzzy-date";
import { buildGedcom } from "../../lib/gedcom";
import type {
  ParentChild,
  Partnership,
  Person,
  PersonEvent,
  StoredFile,
  Tree,
} from "../../../drizzle/schema";
import {
  buildExportSnapshot,
  buildPersonDetail,
  buildRelationships,
  toGedcomInput,
} from "./build";
import type { ApiTreeData } from "./types";

const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
ajv.addSchema({ $id: "roots-spec", components: spec.components });

function validator(schema: string) {
  const validate = ajv.getSchema(`roots-spec#/components/schemas/${schema}`);
  if (!validate) throw new Error(`Missing schema ${schema}`);
  return validate;
}

function expectValid(schema: string, value: unknown) {
  const validate = validator(schema);
  const valid = validate(value);
  expect(
    valid,
    `${schema}: ${JSON.stringify(validate.errors?.slice(0, 3))}`,
  ).toBe(true);
}

const origin = "https://family-tree.example";
const createdAt = new Date("2025-11-01T12:00:00.000Z");
const updatedAt = new Date("2026-01-02T08:30:00.000Z");

const tree: Tree = {
  id: "3c7e9a1b-2d4f-4e6a-9b8c-0d1e2f3a4b5c",
  name: "The Simpson family",
  description: "Three generations around one couple.",
  createdBy: null,
  createdAt,
  updatedAt,
  deletedAt: null,
  purgeAfter: null,
  deletedBy: null,
  deletionReminderSentAt: null,
};

function person(
  id: string,
  firstName: string,
  lastName: string,
  extra: Partial<Person> = {},
): Person {
  return {
    id,
    treeId: tree.id,
    firstName,
    lastName,
    maidenName: null,
    nickname: null,
    sex: "unknown",
    birthDate: exactFuzzyDate(1920),
    deathDate: null,
    birthPlace: "Springfield",
    deathPlace: null,
    bio: null,
    links: [],
    contactEmail: null,
    contactPhone: null,
    createdBy: null,
    createdAt,
    updatedAt,
    ...extra,
  };
}

const abraham = person("f47ac10b-58cc-4372-a567-0e02b2c3d479", "Abraham", "Simpson", {
  nickname: "Abe",
  birthDate: exactFuzzyDate(1920, 5, 19),
  bio: "Talks to his hat.",
});
const mona = person("a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d", "Mona", "Simpson", {
  maidenName: "Olsen",
  birthDate: exactFuzzyDate(1929, 3, 11),
});
const homer = person("9b2f4a1c-3d5e-4f6a-8b7c-1d2e3f4a5b6c", "Homer", "Simpson", {
  birthDate: exactFuzzyDate(1956, 5, 12),
});

const parents: ParentChild[] = [
  {
    id: "6a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
    treeId: tree.id,
    parentId: abraham.id,
    childId: homer.id,
    parentType: "biological",
    createdAt,
  },
  {
    id: "0f8fad5b-d9cb-469f-a165-70867728950e",
    treeId: tree.id,
    parentId: mona.id,
    childId: homer.id,
    parentType: "biological",
    createdAt,
  },
];

const partnerships: Partnership[] = [
  {
    id: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
    treeId: tree.id,
    personAId: abraham.id,
    personBId: mona.id,
    status: "married",
    startDate: exactFuzzyDate(1950),
    endDate: null,
    createdAt,
  },
];

const events: PersonEvent[] = [
  {
    id: "c9bf9e57-1685-4c89-bafb-ff5af830be8a",
    treeId: tree.id,
    personId: abraham.id,
    partnerPersonId: null,
    kind: "military",
    title: "Army service",
    place: "Springfield",
    date: { start: { year: 1941, month: null, day: null }, qualifier: "about" },
    description: "Enlisted after the draft notice.",
    createdBy: null,
    createdAt,
    updatedAt,
  },
  {
    id: "d0cae47a-3b1c-4b0b-8c1d-2e3f4a5b6c7d",
    treeId: tree.id,
    personId: abraham.id,
    partnerPersonId: mona.id,
    kind: "marriage",
    title: null,
    place: "Springfield",
    date: exactFuzzyDate(1950),
    description: null,
    createdBy: null,
    createdAt,
    updatedAt,
  },
];

const files: StoredFile[] = [
  {
    id: "e6f1a7b2-3c4d-4e5f-9a6b-7c8d9e0f1a2b",
    treeId: tree.id,
    personId: abraham.id,
    groupId: null,
    storageKey: "trees/example/photo.jpg",
    thumbKey: "trees/example/photo-thumb.webp",
    thumbMime: "image/webp",
    originalName: "abe.jpg",
    mimeType: "image/jpeg",
    kind: "image",
    sizeBytes: 1024,
    thumbSizeBytes: 256,
    width: 800,
    height: 600,
    takenAt: null,
    facesScannedAt: null,
    status: "ready",
    isAvatar: true,
    uploadedBy: null,
    createdAt,
    updatedAt,
  },
];

const data: ApiTreeData = {
  tree,
  people: [abraham, mona, homer],
  parents,
  partnerships,
  events,
  files,
  tags: [{ fileId: files[0].id, personId: mona.id }],
};

describe("API DTO contract", () => {
  it("builds an export snapshot that matches the OpenAPI schema", () => {
    const snapshot = buildExportSnapshot(data, origin);
    expectValid("ExportSnapshot", snapshot);
    expect(snapshot.people).toHaveLength(3);
    expect(snapshot.tree.counts).toEqual({
      people: 3,
      relationships: 3,
      events: 2,
      media: 1,
    });
    expect(snapshot.media[0].taggedPersonIds).toEqual([mona.id]);
    expect(snapshot.people.find(row => row.id === abraham.id)?.avatar?.thumbUrl).toContain(
      "/media/",
    );
  });

  it("builds a person detail that matches the OpenAPI schema", () => {
    const detail = buildPersonDetail(data, homer.id, origin);
    expect(detail).not.toBeNull();
    expectValid("PersonDetail", detail);
    expect(detail!.parents.map(row => row.id).sort()).toEqual(
      [abraham.id, mona.id].sort(),
    );
  });

  it("includes a shared event on both participants", () => {
    const marriageId = "d0cae47a-3b1c-4b0b-8c1d-2e3f4a5b6c7d";
    const abrahamDetail = buildPersonDetail(data, abraham.id, origin);
    const monaDetail = buildPersonDetail(data, mona.id, origin);

    expect(abrahamDetail?.events.map(row => row.id)).toContain(marriageId);
    expect(monaDetail?.events.map(row => row.id)).toContain(marriageId);
    // The row keeps its canonical owner and partner; each viewer resolves the
    // other side themselves.
    expect(
      abrahamDetail?.events.find(row => row.id === marriageId)?.partnerPersonId,
    ).toBe(mona.id);
  });

  it("builds a relationship list that matches the OpenAPI schema", () => {
    expectValid("RelationshipsResponse", {
      data: buildRelationships(data),
    });
  });

  it("marks people without a death date as living", () => {
    const snapshot = buildExportSnapshot(data, origin);
    expect(snapshot.people.every(row => row.living)).toBe(true);
  });

  it("maps the same tree into a GEDCOM file", () => {
    const gedcom = buildGedcom({
      ...toGedcomInput(data),
      generatedAt: new Date("2026-01-02T00:00:00.000Z"),
    });
    expect(gedcom.startsWith("0 HEAD\r\n")).toBe(true);
    expect(gedcom.trimEnd().endsWith("0 TRLR")).toBe(true);
    expect(gedcom).toContain("1 NAME Abraham /Simpson/");
    expect(gedcom).toContain("1 MARR");
    expect(gedcom).toContain("1 CHIL ");
  });
});
