import type { Person, StoredFile } from "../../../drizzle/schema";
import type { GedcomInput } from "../../lib/gedcom";
import {
  buildTreeSnapshot,
  toApiEvent,
  toApiMedia,
  toApiPerson,
  toApiRelationships,
  type ApiEvent,
  type ApiMedia,
  type ApiParentRelationship,
  type ApiPartnerRelationship,
  type ApiPerson,
  type ApiTreeSnapshot,
} from "./dto";
import type { ApiTreeData } from "./types";

export type PersonMapper = (person: Person) => ApiPerson;

export function createPersonMapper(
  data: ApiTreeData,
  origin: string,
): PersonMapper {
  const avatarByPerson = new Map<string, StoredFile>();
  for (const file of data.files) {
    if (file.isAvatar) avatarByPerson.set(file.personId, file);
  }
  return person => {
    const avatar = avatarByPerson.get(person.id);
    return toApiPerson(person, {
      origin,
      treeId: data.tree.id,
      avatarFileId: avatar?.id ?? null,
      hasAvatarThumb: Boolean(avatar?.thumbKey),
      createdAt: person.createdAt,
      updatedAt: person.updatedAt,
    });
  };
}

export function mapPeople(data: ApiTreeData, origin: string): ApiPerson[] {
  const mapper = createPersonMapper(data, origin);
  return data.people.map(mapper);
}

export type ApiPersonDetail = {
  person: ApiPerson;
  parents: ApiPerson[];
  children: ApiPerson[];
  partners: Array<{
    person: ApiPerson;
    relationship: ApiPartnerRelationship;
  }>;
  events: ApiEvent[];
  media: ApiMedia[];
};

export function buildPersonDetail(
  data: ApiTreeData,
  personId: string,
  origin: string,
): ApiPersonDetail | null {
  const person = data.people.find(row => row.id === personId);
  if (!person) return null;

  const byId = new Map(data.people.map(row => [row.id, row]));
  const mapper = createPersonMapper(data, origin);

  const parentLinks: ApiParentRelationship[] = data.parents
    .filter(row => row.childId === personId)
    .map(row => ({
      id: row.id,
      type: "parent",
      parentId: row.parentId,
      childId: row.childId,
      parentType: row.parentType,
      createdAt: row.createdAt.toISOString(),
    }));

  const parents = parentLinks
    .map(link => byId.get(link.parentId))
    .filter((row): row is Person => Boolean(row))
    .map(mapper);

  const children = data.parents
    .filter(row => row.parentId === personId)
    .map(row => byId.get(row.childId))
    .filter((row): row is Person => Boolean(row))
    .map(mapper);

  const partnerRelationships = data.partnerships.filter(
    row => row.personAId === personId || row.personBId === personId,
  );
  const partners = partnerRelationships.flatMap(row => {
    const otherId = row.personAId === personId ? row.personBId : row.personAId;
    const other = byId.get(otherId);
    if (!other) return [];
    const relationship: ApiPartnerRelationship = {
      id: row.id,
      type: "partner",
      personAId: row.personAId,
      personBId: row.personBId,
      status: row.status,
      startDate: row.startDate ?? null,
      endDate: row.endDate ?? null,
      createdAt: row.createdAt.toISOString(),
    };
    return [{ person: mapper(other), relationship }];
  });

  const events = data.events
    .filter(row => row.personId === personId)
    .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
    .map(toApiEvent);

  const taggedFileIds = new Set(
    data.tags.filter(tag => tag.personId === personId).map(tag => tag.fileId),
  );
  const media = data.files
    .filter(file => file.personId === personId || taggedFileIds.has(file.id))
    .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
    .map(file =>
      toApiMedia(file, {
        origin,
        treeId: data.tree.id,
        taggedPersonIds: data.tags
          .filter(tag => tag.fileId === file.id)
          .map(tag => tag.personId),
      }),
    );

  return {
    person: mapper(person),
    parents,
    children,
    partners,
    events,
    media,
  };
}

export function buildExportSnapshot(
  data: ApiTreeData,
  origin: string,
): ApiTreeSnapshot {
  return buildTreeSnapshot({
    tree: data.tree,
    people: data.people,
    parents: data.parents,
    partnerships: data.partnerships,
    events: data.events,
    files: data.files,
    tags: data.tags,
    origin,
  });
}

export function buildRelationships(data: ApiTreeData) {
  return toApiRelationships(data.parents, data.partnerships);
}

/** Maps the same consistent tree read into the GEDCOM serializer input. */
export function toGedcomInput(data: ApiTreeData): GedcomInput {
  return {
    treeName: data.tree.name,
    treeDescription: data.tree.description,
    people: data.people.map(person => ({
      id: person.id,
      firstName: person.firstName,
      lastName: person.lastName,
      maidenName: person.maidenName,
      nickname: person.nickname,
      sex: person.sex,
      birthDate: person.birthDate ?? null,
      deathDate: person.deathDate ?? null,
      birthPlace: person.birthPlace,
      deathPlace: person.deathPlace,
      bio: person.bio,
    })),
    relationships: [
      ...data.parents.map(
        row =>
          ({
            id: row.id,
            type: "parent" as const,
            source: row.parentId,
            target: row.childId,
          }),
      ),
      ...data.partnerships.map(
        row =>
          ({
            id: row.id,
            type: "partner" as const,
            source: row.personAId,
            target: row.personBId,
            status: row.status,
            startDate: row.startDate ?? null,
            endDate: row.endDate ?? null,
          }),
      ),
    ],
    events: data.events.map(row => ({
      id: row.id,
      personId: row.personId,
      kind: row.kind,
      title: row.title,
      place: row.place,
      date: row.date ?? null,
      description: row.description,
    })),
    files: data.files.map(row => ({
      id: row.id,
      personId: row.personId,
      originalName: row.originalName,
      mimeType: row.mimeType,
    })),
  };
}
