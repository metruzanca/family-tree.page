import type {
  GraphFile,
  GraphFileGroup,
  GraphPerson,
  GraphPersonEvent,
  GraphRelationship,
  TreeGraph,
} from "~/api/people-server";
import { exactFuzzyDate, type FuzzyDate } from "../fuzzy-date";

export function person(
  id: string,
  firstName: string,
  lastName: string,
  birthYear: number | null,
  extra: Partial<GraphPerson> = {},
): GraphPerson {
  return {
    id,
    firstName,
    lastName,
    displayName: `${firstName} ${lastName}`.trim(),
    maidenName: null,
    nickname: null,
    sex: "unknown",
    birthDate: birthYear === null ? null : exactFuzzyDate(birthYear),
    deathDate: null,
    birthPlace: null,
    deathPlace: null,
    bio: null,
    links: [],
    contactEmail: null,
    contactPhone: null,
    avatarFileId: null,
    ...extra,
  };
}

export function parentRelationship(
  id: string,
  parentId: string,
  childId: string,
  parentType: "biological" | "adoptive" | "foster" | "step" | "unknown" = "biological",
): GraphRelationship {
  return { id, type: "parent", source: parentId, target: childId, parentType };
}

export function partnerRelationship(
  id: string,
  aId: string,
  bId: string,
  extra: {
    status?: "married" | "partnered" | "divorced" | "separated" | "widowed" | "unknown";
    startDate?: FuzzyDate | null;
    endDate?: FuzzyDate | null;
  } = {},
): GraphRelationship {
  return {
    id,
    type: "partner",
    source: aId,
    target: bId,
    status: extra.status ?? "married",
    startDate: extra.startDate ?? null,
    endDate: extra.endDate ?? null,
  };
}

export function lifeEvent(
  id: string,
  personId: string,
  kind: GraphPersonEvent["kind"],
  options: {
    title?: string | null;
    place?: string | null;
    year?: number | null;
    description?: string | null;
    partnerPersonId?: string | null;
  } = {},
): GraphPersonEvent {
  return {
    id,
    personId,
    partnerPersonId: options.partnerPersonId ?? null,
    kind,
    title: options.title ?? null,
    place: options.place ?? null,
    date: options.year === undefined || options.year === null ? null : exactFuzzyDate(options.year),
    description: options.description ?? null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
  };
}

export function imageFile(
  id: string,
  personId: string,
  extra: Partial<GraphFile> = {},
): GraphFile {
  return {
    id,
    personId,
    groupId: null,
    name: "photo.jpg",
    mimeType: "image/jpeg",
    kind: "image",
    thumbUrl: null,
    width: 100,
    height: 100,
    sizeBytes: 1024,
    takenAt: null,
    facesScannedAt: null,
    faces: [],
    taggedPersonIds: [],
    createdAt: new Date("2026-01-01T00:00:00Z"),
    isAvatar: false,
    ...extra,
  };
}

export function treeGraph(input: {
  people: GraphPerson[];
  relationships?: GraphRelationship[];
  events?: GraphPersonEvent[];
  files?: GraphFile[];
  groups?: GraphFileGroup[];
}): Pick<TreeGraph, "people" | "relationships" | "events" | "files"> {
  return {
    people: input.people,
    relationships: input.relationships ?? [],
    events: input.events ?? [],
    files: input.files ?? [],
  };
}
