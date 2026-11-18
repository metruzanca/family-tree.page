import type { FuzzyDate } from "../../lib/fuzzy-date";
import { fuzzySortValue } from "../../lib/fuzzy-date";
import { API_VERSION } from "../../lib/api";
import type { PersonSex } from "../../lib/person-sex";
import type {
  ParentChild,
  Partnership,
  Person,
  PersonEvent,
  StoredFile,
  Tree,
} from "../../../drizzle/schema";

export type ApiMediaLinks = {
  fileId: string;
  thumbUrl: string | null;
  downloadUrl: string;
};

export type ApiPerson = {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  maidenName: string | null;
  nickname: string | null;
  sex: PersonSex;
  birthDate: FuzzyDate | null;
  deathDate: FuzzyDate | null;
  birthPlace: string | null;
  deathPlace: string | null;
  bio: string | null;
  living: boolean;
  avatar: ApiMediaLinks | null;
  createdAt: string;
  updatedAt: string;
};

export type ApiParentRelationship = {
  id: string;
  type: "parent";
  parentId: string;
  childId: string;
  parentType: ParentChild["parentType"];
  createdAt: string;
};

export type ApiPartnerRelationship = {
  id: string;
  type: "partner";
  personAId: string;
  personBId: string;
  status: Partnership["status"];
  startDate: FuzzyDate | null;
  endDate: FuzzyDate | null;
  createdAt: string;
};

export type ApiRelationship = ApiParentRelationship | ApiPartnerRelationship;

export type ApiEvent = {
  id: string;
  personId: string;
  /** The other person in a marriage or divorce, when recorded. */
  partnerPersonId: string | null;
  kind: PersonEvent["kind"];
  title: string | null;
  place: string | null;
  date: FuzzyDate | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ApiMedia = {
  id: string;
  personId: string;
  groupId: string | null;
  name: string;
  mimeType: string;
  kind: StoredFile["kind"];
  sizeBytes: number;
  width: number | null;
  height: number | null;
  takenAt: FuzzyDate | null;
  isAvatar: boolean;
  taggedPersonIds: string[];
  thumbUrl: string | null;
  downloadUrl: string;
  createdAt: string;
};

export type ApiTree = {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  counts: {
    people: number;
    relationships: number;
    events: number;
    media: number;
  };
};

export type ApiTreeSnapshot = {
  schemaVersion: string;
  generatedAt: string;
  tree: ApiTree;
  people: ApiPerson[];
  relationships: ApiRelationship[];
  events: ApiEvent[];
  media: ApiMedia[];
};

export type SnapshotInput = {
  tree: Tree;
  people: Person[];
  parents: ParentChild[];
  partnerships: Partnership[];
  events: PersonEvent[];
  files: StoredFile[];
  tags: Array<{ fileId: string; personId: string }>;
  origin: string;
  generatedAt?: Date;
};

function displayName(
  person: Pick<Person, "firstName" | "lastName" | "nickname">,
) {
  const full = `${person.firstName} ${person.lastName}`.trim();
  return full || person.nickname || "Unnamed person";
}

export function mediaLinks(
  origin: string,
  treeId: string,
  fileId: string,
  hasThumb: boolean,
): ApiMediaLinks {
  return {
    fileId,
    thumbUrl: hasThumb
      ? `${origin}/api/v1/trees/${treeId}/media/${fileId}/thumb`
      : null,
    downloadUrl: `${origin}/api/v1/trees/${treeId}/media/${fileId}/download`,
  };
}

export function toApiPerson(
  person: Pick<
    Person,
    | "id"
    | "firstName"
    | "lastName"
    | "maidenName"
    | "nickname"
    | "sex"
    | "birthDate"
    | "deathDate"
    | "birthPlace"
    | "deathPlace"
    | "bio"
  >,
  meta: {
    origin: string;
    treeId: string;
    avatarFileId: string | null;
    hasAvatarThumb: boolean;
    createdAt: Date;
    updatedAt: Date;
  },
): ApiPerson {
  return {
    id: person.id,
    firstName: person.firstName,
    lastName: person.lastName,
    fullName: displayName(person),
    maidenName: person.maidenName,
    nickname: person.nickname,
    sex: person.sex,
    birthDate: person.birthDate ?? null,
    deathDate: person.deathDate ?? null,
    birthPlace: person.birthPlace,
    deathPlace: person.deathPlace,
    bio: person.bio,
    living: !person.deathDate,
    avatar: meta.avatarFileId
      ? mediaLinks(meta.origin, meta.treeId, meta.avatarFileId, meta.hasAvatarThumb)
      : null,
    createdAt: meta.createdAt.toISOString(),
    updatedAt: meta.updatedAt.toISOString(),
  };
}

export function toApiRelationships(
  parents: ParentChild[],
  partnerships: Partnership[],
): ApiRelationship[] {
  return [
    ...parents.map(
      (row): ApiParentRelationship => ({
        id: row.id,
        type: "parent",
        parentId: row.parentId,
        childId: row.childId,
        parentType: row.parentType,
        createdAt: row.createdAt.toISOString(),
      }),
    ),
    ...partnerships.map(
      (row): ApiPartnerRelationship => ({
        id: row.id,
        type: "partner",
        personAId: row.personAId,
        personBId: row.personBId,
        status: row.status,
        startDate: row.startDate ?? null,
        endDate: row.endDate ?? null,
        createdAt: row.createdAt.toISOString(),
      }),
    ),
  ];
}

export function toApiEvent(row: PersonEvent): ApiEvent {
  return {
    id: row.id,
    personId: row.personId,
    partnerPersonId: row.partnerPersonId ?? null,
    kind: row.kind,
    title: row.title,
    place: row.place,
    date: row.date ?? null,
    description: row.description,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toApiMedia(
  file: StoredFile & { personId: string },
  options: {
    origin: string;
    treeId: string;
    taggedPersonIds: string[];
  },
): ApiMedia {
  return {
    id: file.id,
    personId: file.personId,
    groupId: file.groupId,
    name: file.originalName,
    mimeType: file.mimeType,
    kind: file.kind,
    sizeBytes: file.sizeBytes,
    width: file.width,
    height: file.height,
    takenAt: file.takenAt ?? null,
    isAvatar: file.isAvatar,
    taggedPersonIds: options.taggedPersonIds,
    thumbUrl: file.thumbKey
      ? `${options.origin}/api/v1/trees/${options.treeId}/media/${file.id}/thumb`
      : null,
    downloadUrl: `${options.origin}/api/v1/trees/${options.treeId}/media/${file.id}/download`,
    createdAt: file.createdAt.toISOString(),
  };
}

export function toApiTree(
  tree: Tree,
  counts: ApiTree["counts"],
): ApiTree {
  return {
    id: tree.id,
    name: tree.name,
    description: tree.description,
    createdAt: tree.createdAt.toISOString(),
    updatedAt: tree.updatedAt.toISOString(),
    counts,
  };
}

export function buildTreeSnapshot(input: SnapshotInput): ApiTreeSnapshot {
  const readyFiles = input.files.filter(file => file.status === "ready");
  const avatarByPerson = new Map<string, StoredFile>();
  for (const file of readyFiles) {
    if (file.isAvatar && file.personId) avatarByPerson.set(file.personId, file);
  }

  const tagsByFile = new Map<string, string[]>();
  for (const tag of input.tags) {
    const list = tagsByFile.get(tag.fileId) ?? [];
    list.push(tag.personId);
    tagsByFile.set(tag.fileId, list);
  }

  const sortedPeople = [...input.people].sort(
    (left, right) =>
      left.lastName.localeCompare(right.lastName) ||
      left.firstName.localeCompare(right.firstName) ||
      left.id.localeCompare(right.id),
  );

  const people = sortedPeople.map(person => {
    const avatar = avatarByPerson.get(person.id);
    return toApiPerson(person, {
      origin: input.origin,
      treeId: input.tree.id,
      avatarFileId: avatar?.id ?? null,
      hasAvatarThumb: Boolean(avatar?.thumbKey),
      createdAt: person.createdAt,
      updatedAt: person.updatedAt,
    });
  });

  const relationships = toApiRelationships(input.parents, input.partnerships);
  const events = [...input.events]
    .sort(
      (left, right) =>
        left.personId.localeCompare(right.personId) ||
        fuzzySortValue(left.date) - fuzzySortValue(right.date) ||
        left.id.localeCompare(right.id),
    )
    .map(toApiEvent);
  const media = [...readyFiles]
    .filter((file): file is StoredFile & { personId: string } => file.personId !== null)
    .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
    .map(file =>
      toApiMedia(file, {
        origin: input.origin,
        treeId: input.tree.id,
        taggedPersonIds: tagsByFile.get(file.id) ?? [],
      }),
    );

  return {
    schemaVersion: API_VERSION,
    generatedAt: (input.generatedAt ?? new Date()).toISOString(),
    tree: toApiTree(input.tree, {
      people: input.people.length,
      relationships: input.parents.length + input.partnerships.length,
      events: input.events.length,
      media: media.length,
    }),
    people,
    relationships,
    events,
    media,
  };
}
