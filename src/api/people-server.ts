"use server";

import { and, eq, inArray } from "drizzle-orm";
import { db } from "../server/db";
import {
  fileGroups,
  fileTags,
  files,
  parentChild,
  partnerships,
  people,
  personEvents,
  trees,
  type ParentChild,
  type Partnership,
  type Person,
  type PersonEvent,
  type StoredFile,
} from "../../drizzle/schema";
import type { FuzzyDate } from "../lib/fuzzy-date";
import { requireTreeMember, type TreeRole } from "../server/guards";
import { AppError, runAction, type ActionResult } from "../server/errors";
import {
  addRelativeSchema,
  parentChildSchema,
  partnershipSchema,
  personEventSchema,
  personEventUpdateSchema,
  personSchema,
  personUpdateSchema,
  type PersonEventInput,
  type PersonInput,
} from "../server/validation";
import { deletePrefix, TREE_PREFIX } from "../server/storage";
import {
  assertRelationshipInvariants,
  dedupeParentEdges,
  type ParentEdgeRecord,
  type PartnershipRecord,
} from "../server/relationship-rules";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type GraphFile = {
  id: string;
  personId: string;
  groupId: string | null;
  name: string;
  mimeType: string;
  kind: "image" | "document" | "other";
  thumbUrl: string | null;
  width: number | null;
  height: number | null;
  sizeBytes: number;
  takenAt: FuzzyDate | null;
  taggedPersonIds: string[];
  createdAt: Date;
  isAvatar: boolean;
};

export type GraphFileGroup = {
  id: string;
  personId: string;
  name: string;
  count: number;
  coverFileId: string | null;
  coverWidth: number | null;
  coverHeight: number | null;
  createdAt: Date;
};

export type GraphPerson = {
  id: string;
  firstName: string;
  lastName: string;
  displayName: string;
  maidenName: string | null;
  nickname: string | null;
  birthDate: FuzzyDate | null;
  deathDate: FuzzyDate | null;
  birthPlace: string | null;
  deathPlace: string | null;
  bio: string | null;
  avatarFileId: string | null;
};

export type GraphRelationship =
  | {
      id: string;
      type: "parent";
      source: string;
      target: string;
      parentType: ParentChild["parentType"];
    }
  | {
      id: string;
      type: "partner";
      source: string;
      target: string;
      status: Partnership["status"];
      startDate: FuzzyDate | null;
      endDate: FuzzyDate | null;
    };

export type GraphPersonEvent = {
  id: string;
  personId: string;
  kind: PersonEvent["kind"];
  title: string | null;
  place: string | null;
  date: FuzzyDate | null;
  description: string | null;
  createdAt: Date;
};

export type TreeGraph = {
  tree: { id: string; name: string; description: string | null };
  role: TreeRole;
  people: GraphPerson[];
  relationships: GraphRelationship[];
  files: GraphFile[];
  groups: GraphFileGroup[];
  events: GraphPersonEvent[];
};

export function personDisplayName(person: Pick<Person, "firstName" | "lastName" | "nickname">) {
  const full = `${person.firstName} ${person.lastName}`.trim();
  return full || person.nickname || "Unnamed person";
}

export async function getTreeGraph(treeId: string): Promise<TreeGraph> {
  const access = await requireTreeMember(treeId);
  const [peopleRows, parentRows, partnerRows, fileRows, groupRows, tagRows, eventRows] =
    await Promise.all([
      db.select().from(people).where(eq(people.treeId, treeId)),
      db.select().from(parentChild).where(eq(parentChild.treeId, treeId)),
      db.select().from(partnerships).where(eq(partnerships.treeId, treeId)),
      db
        .select()
        .from(files)
        .where(and(eq(files.treeId, treeId), eq(files.status, "ready"))),
      db.select().from(fileGroups).where(eq(fileGroups.treeId, treeId)),
      db
        .select({ fileId: fileTags.fileId, personId: fileTags.personId })
        .from(fileTags)
        .where(eq(fileTags.treeId, treeId)),
      db.select().from(personEvents).where(eq(personEvents.treeId, treeId)),
    ]);

  const tagsByFile = new Map<string, string[]>();
  for (const tag of tagRows) {
    const list = tagsByFile.get(tag.fileId) ?? [];
    list.push(tag.personId);
    tagsByFile.set(tag.fileId, list);
  }

  const avatarByPerson = new Map<string, string>();
  for (const file of fileRows) {
    if (file.isAvatar) avatarByPerson.set(file.personId, file.id);
  }

  const groupViews: GraphFileGroup[] = groupRows
    .map(group => {
      const groupFiles = fileRows.filter(file => file.groupId === group.id);
      const cover =
        groupFiles.find(file => file.kind === "image" && file.thumbKey) ??
        groupFiles.find(file => file.kind === "image") ??
        groupFiles[0];
      return {
        id: group.id,
        personId: group.personId,
        name: group.name,
        count: groupFiles.length,
        coverFileId: cover?.thumbKey ? cover.id : null,
        coverWidth: cover?.width ?? null,
        coverHeight: cover?.height ?? null,
        createdAt: group.createdAt,
      };
    })
    .filter(group => group.count > 0);

  return {
    tree: {
      id: access.tree.id,
      name: access.tree.name,
      description: access.tree.description,
    },
    role: access.role,
    people: peopleRows.map(person => ({
      id: person.id,
      firstName: person.firstName,
      lastName: person.lastName,
      displayName: personDisplayName(person),
      maidenName: person.maidenName,
      nickname: person.nickname,
      birthDate: person.birthDate,
      deathDate: person.deathDate,
      birthPlace: person.birthPlace,
      deathPlace: person.deathPlace,
      bio: person.bio,
      avatarFileId: avatarByPerson.get(person.id) ?? null,
    })),
    relationships: [
      ...parentRows.map(row => ({
        id: row.id,
        type: "parent" as const,
        source: row.parentId,
        target: row.childId,
        parentType: row.parentType,
      })),
      ...partnerRows.map(row => ({
        id: row.id,
        type: "partner" as const,
        source: row.personAId,
        target: row.personBId,
        status: row.status,
        startDate: row.startDate,
        endDate: row.endDate,
      })),
    ],
    files: fileRows.map(file => toGraphFile(file, tagsByFile.get(file.id) ?? [])),
    groups: groupViews,
    events: eventRows.map(event => ({
      id: event.id,
      personId: event.personId,
      kind: event.kind,
      title: event.title,
      place: event.place,
      date: event.date,
      description: event.description,
      createdAt: event.createdAt,
    })),
  };
}

function toGraphFile(file: StoredFile, taggedPersonIds: string[]): GraphFile {
  return {
    id: file.id,
    personId: file.personId,
    groupId: file.groupId,
    name: file.originalName,
    mimeType: file.mimeType,
    kind: file.kind,
    thumbUrl: file.thumbKey ? `/api/files/${file.id}/thumb` : null,
    width: file.width,
    height: file.height,
    sizeBytes: file.sizeBytes,
    takenAt: file.takenAt,
    taggedPersonIds,
    createdAt: file.createdAt,
    isAvatar: file.isAvatar,
  };
}

export async function createPerson(
  input: { treeId: string } & PersonInput,
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const access = await requireTreeMember(input.treeId, "editor");
    const parsed = personSchema.parse(input);
    const [person] = await db
      .insert(people)
      .values({
        treeId: access.tree.id,
        firstName: parsed.firstName,
        lastName: parsed.lastName,
        maidenName: parsed.maidenName,
        nickname: parsed.nickname,
        birthDate: parsed.birthDate,
        deathDate: parsed.deathDate,
        birthPlace: parsed.birthPlace,
        deathPlace: parsed.deathPlace,
        bio: parsed.bio,
        createdBy: access.user.id,
      })
      .returning();
    await touchTree(access.tree.id);
    return { id: person.id };
  });
}

export async function updatePerson(
  input: { treeId: string; personId: string } & PersonInput,
): Promise<ActionResult<undefined>> {
  return runAction(async () => {
    const access = await requireTreeMember(input.treeId, "editor");
    const parsed = personUpdateSchema.parse(input);
    const updated = await db
      .update(people)
      .set({
        firstName: parsed.firstName,
        lastName: parsed.lastName,
        maidenName: parsed.maidenName,
        nickname: parsed.nickname,
        birthDate: parsed.birthDate,
        deathDate: parsed.deathDate,
        birthPlace: parsed.birthPlace,
        deathPlace: parsed.deathPlace,
        bio: parsed.bio,
        updatedAt: new Date(),
      })
      .where(and(eq(people.id, input.personId), eq(people.treeId, access.tree.id)))
      .returning({ id: people.id });
    if (!updated.length) throw new AppError("That person could not be found.");
    await touchTree(access.tree.id);
    return undefined;
  });
}

export async function deletePerson(input: {
  treeId: string;
  personId: string;
}): Promise<ActionResult<undefined>> {
  return runAction(async () => {
    const access = await requireTreeMember(input.treeId, "editor");
    try {
      await deletePrefix(`${TREE_PREFIX}/${input.treeId}/people/${input.personId}/`);
    } catch (error) {
      console.error("Could not remove person files from storage", error);
    }
    const deleted = await db
      .delete(people)
      .where(and(eq(people.id, input.personId), eq(people.treeId, access.tree.id)))
      .returning({ id: people.id });
    if (!deleted.length) throw new AppError("That person could not be found.");
    await touchTree(access.tree.id);
    return undefined;
  });
}

export async function createParentChild(input: {
  treeId: string;
  parentId: string;
  childId: string;
  parentType?: "biological" | "adoptive" | "foster" | "step" | "unknown";
}): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const access = await requireTreeMember(input.treeId, "editor");
    const parsed = parentChildSchema.parse(input);
    await assertPeopleInTree(access.tree.id, [parsed.parentId, parsed.childId]);

    return db.transaction(async tx => {
      await lockTree(tx, access.tree.id);
      const parentEdges = await loadParentEdges(tx, access.tree.id);
      const partnershipRows = await loadPartnerships(tx, access.tree.id);
      if (
        parentEdges.some(
          edge => edge.parentId === parsed.parentId && edge.childId === parsed.childId,
        )
      ) {
        throw new AppError("Those two people are already connected as parent and child.");
      }

      assertRelationshipInvariants({
        parentEdges,
        partnerships: partnershipRows,
        addParentEdges: [
          { id: "new", parentId: parsed.parentId, childId: parsed.childId },
        ],
      });

      const [relationship] = await tx
        .insert(parentChild)
        .values({
          treeId: access.tree.id,
          parentId: parsed.parentId,
          childId: parsed.childId,
          parentType: parsed.parentType,
        })
        .returning();
      await tx.update(trees).set({ updatedAt: new Date() }).where(eq(trees.id, access.tree.id));
      return { id: relationship.id };
    });
  });
}

export async function deleteParentChild(input: {
  treeId: string;
  relationshipId: string;
}): Promise<ActionResult<undefined>> {
  return runAction(async () => {
    const access = await requireTreeMember(input.treeId, "editor");
    const deleted = await db
      .delete(parentChild)
      .where(
        and(eq(parentChild.id, input.relationshipId), eq(parentChild.treeId, access.tree.id)),
      )
      .returning({ id: parentChild.id });
    if (!deleted.length) throw new AppError("That relationship could not be found.");
    await touchTree(access.tree.id);
    return undefined;
  });
}

export async function createPartnership(input: {
  treeId: string;
  personAId: string;
  personBId: string;
  status?: "married" | "partnered" | "divorced" | "separated" | "widowed" | "unknown";
  startDate?: string | null;
  endDate?: string | null;
}): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const access = await requireTreeMember(input.treeId, "editor");
    const parsed = partnershipSchema.parse(input);
    if (parsed.personAId === parsed.personBId) {
      throw new AppError("A person cannot be their own partner.");
    }
    await assertPeopleInTree(access.tree.id, [parsed.personAId, parsed.personBId]);
    const [personAId, personBId] = [parsed.personAId, parsed.personBId].sort();

    return db.transaction(async tx => {
      await lockTree(tx, access.tree.id);
      const parentEdges = await loadParentEdges(tx, access.tree.id);
      const partnershipRows = await loadPartnerships(tx, access.tree.id);
      if (
        partnershipRows.some(
          row => row.personAId === personAId && row.personBId === personBId,
        )
      ) {
        throw new AppError("Those two people are already partners.");
      }

      assertRelationshipInvariants({
        parentEdges,
        partnerships: partnershipRows,
        addPartnership: { id: "new", personAId, personBId },
      });

      const [relationship] = await tx
        .insert(partnerships)
        .values({
          treeId: access.tree.id,
          personAId,
          personBId,
          status: parsed.status,
          startDate: parsed.startDate,
          endDate: parsed.endDate,
        })
        .returning();
      await tx.update(trees).set({ updatedAt: new Date() }).where(eq(trees.id, access.tree.id));
      return { id: relationship.id };
    });
  });
}

export async function updatePartnership(input: {
  treeId: string;
  relationshipId: string;
  status: "married" | "partnered" | "divorced" | "separated" | "widowed" | "unknown";
  startDate?: string | null;
  endDate?: string | null;
}): Promise<ActionResult<undefined>> {
  return runAction(async () => {
    const access = await requireTreeMember(input.treeId, "editor");
    const parsed = partnershipSchema
      .pick({ status: true, startDate: true, endDate: true })
      .parse(input);
    const updated = await db
      .update(partnerships)
      .set({ status: parsed.status, startDate: parsed.startDate, endDate: parsed.endDate })
      .where(
        and(
          eq(partnerships.id, input.relationshipId),
          eq(partnerships.treeId, access.tree.id),
        ),
      )
      .returning({ id: partnerships.id });
    if (!updated.length) throw new AppError("That relationship could not be found.");
    await touchTree(access.tree.id);
    return undefined;
  });
}

export async function deletePartnership(input: {
  treeId: string;
  relationshipId: string;
}): Promise<ActionResult<undefined>> {
  return runAction(async () => {
    const access = await requireTreeMember(input.treeId, "editor");
    const deleted = await db
      .delete(partnerships)
      .where(
        and(
          eq(partnerships.id, input.relationshipId),
          eq(partnerships.treeId, access.tree.id),
        ),
      )
      .returning({ id: partnerships.id });
    if (!deleted.length) throw new AppError("That relationship could not be found.");
    await touchTree(access.tree.id);
    return undefined;
  });
}

export async function addRelative(input: {
  mode: "existing" | "new";
  treeId: string;
  anchorPersonId: string;
  relation: "parent" | "child" | "partner";
  personId?: string;
  person?: PersonInput;
  otherParentId?: string;
  parentType?: "biological" | "adoptive" | "foster" | "step" | "unknown";
  status?: "married" | "partnered" | "divorced" | "separated" | "widowed" | "unknown";
}): Promise<ActionResult<{ personId: string; relationshipIds: string[] }>> {
  return runAction(async () => {
    const access = await requireTreeMember(input.treeId, "editor");
    const parsed = addRelativeSchema.parse(input);

    if (parsed.otherParentId && parsed.relation !== "child") {
      throw new AppError("Choose another parent only when adding a child.");
    }
    if (parsed.otherParentId) {
      if (parsed.otherParentId === parsed.anchorPersonId) {
        throw new AppError("Choose someone other than this person.");
      }
      await assertPeopleInTree(access.tree.id, [parsed.otherParentId]);
    }

    return db.transaction(async tx => {
      await lockTree(tx, access.tree.id);

      const anchorRows = await tx
        .select({ id: people.id })
        .from(people)
        .where(and(eq(people.id, parsed.anchorPersonId), eq(people.treeId, access.tree.id)))
        .limit(1);
      if (!anchorRows.length) throw new AppError("That person could not be found.");

      let relativeId: string;
      if (parsed.mode === "existing") {
        const rows = await tx
          .select({ id: people.id })
          .from(people)
          .where(and(eq(people.id, parsed.personId), eq(people.treeId, access.tree.id)))
          .limit(1);
        if (!rows.length) throw new AppError("That person could not be found.");
        relativeId = parsed.personId;
      } else {
        const [created] = await tx
          .insert(people)
          .values({
            treeId: access.tree.id,
            firstName: parsed.person.firstName,
            lastName: parsed.person.lastName,
            maidenName: parsed.person.maidenName,
            nickname: parsed.person.nickname,
            birthDate: parsed.person.birthDate,
            deathDate: parsed.person.deathDate,
            birthPlace: parsed.person.birthPlace,
            deathPlace: parsed.person.deathPlace,
            bio: parsed.person.bio,
            createdBy: access.user.id,
          })
          .returning();
        relativeId = created.id;
      }

      if (relativeId === parsed.anchorPersonId) {
        throw new AppError("Choose someone other than this person.");
      }
      if (parsed.otherParentId && parsed.otherParentId === relativeId) {
        throw new AppError("Choose someone other than this person.");
      }

      const parentEdges = await loadParentEdges(tx, access.tree.id);
      const partnershipRows = await loadPartnerships(tx, access.tree.id);
      const relationshipIds: string[] = [];

      if (parsed.relation === "partner") {
        const [personAId, personBId] = [relativeId, parsed.anchorPersonId].sort();
        if (
          partnershipRows.some(
            row => row.personAId === personAId && row.personBId === personBId,
          )
        ) {
          throw new AppError("Those two people are already partners.");
        }

        assertRelationshipInvariants({
          parentEdges,
          partnerships: partnershipRows,
          addPartnership: { id: "new", personAId, personBId },
        });

        const [relationship] = await tx
          .insert(partnerships)
          .values({
            treeId: access.tree.id,
            personAId,
            personBId,
            status: parsed.status,
          })
          .returning();
        relationshipIds.push(relationship.id);
      } else {
        const proposed: ParentEdgeRecord[] = [];
        if (parsed.relation === "parent") {
          proposed.push({
            id: "new-parent",
            parentId: relativeId,
            childId: parsed.anchorPersonId,
          });
        } else {
          proposed.push({
            id: "new-anchor-parent",
            parentId: parsed.anchorPersonId,
            childId: relativeId,
          });
          if (parsed.otherParentId) {
            proposed.push({
              id: "new-other-parent",
              parentId: parsed.otherParentId,
              childId: relativeId,
            });
          }
        }

        const existing = new Set(
          parentEdges.map(edge => `${edge.parentId}:${edge.childId}`),
        );
        const missing = proposed.filter(
          edge => !existing.has(`${edge.parentId}:${edge.childId}`),
        );
        if (!missing.length) {
          throw new AppError("Those two people are already connected as parent and child.");
        }

        assertRelationshipInvariants({
          parentEdges,
          partnerships: partnershipRows,
          addParentEdges: dedupeParentEdges(proposed),
        });

        for (const edge of missing) {
          const [relationship] = await tx
            .insert(parentChild)
            .values({
              treeId: access.tree.id,
              parentId: edge.parentId,
              childId: edge.childId,
              parentType: parsed.parentType,
            })
            .returning({ id: parentChild.id });
          relationshipIds.push(relationship.id);
        }
      }

      await tx.update(trees).set({ updatedAt: new Date() }).where(eq(trees.id, access.tree.id));
      return { personId: relativeId, relationshipIds };
    });
  });
}

export async function createPersonEvent(
  input: { treeId: string; personId: string } & PersonEventInput,
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const access = await requireTreeMember(input.treeId, "editor");
    const parsed = personEventSchema.parse(input);
    await assertPeopleInTree(access.tree.id, [parsed.personId]);

    const [event] = await db
      .insert(personEvents)
      .values({
        treeId: access.tree.id,
        personId: parsed.personId,
        kind: parsed.kind,
        title: parsed.title,
        place: parsed.place,
        date: parsed.date,
        description: parsed.description,
        createdBy: access.user.id,
      })
      .returning({ id: personEvents.id });

    await touchTree(access.tree.id);
    return { id: event.id };
  });
}

export async function updatePersonEvent(
  input: { treeId: string; eventId: string } & PersonEventInput,
): Promise<ActionResult<undefined>> {
  return runAction(async () => {
    const access = await requireTreeMember(input.treeId, "editor");
    const parsed = personEventUpdateSchema.parse(input);
    const updated = await db
      .update(personEvents)
      .set({
        kind: parsed.kind,
        title: parsed.title,
        place: parsed.place,
        date: parsed.date,
        description: parsed.description,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(personEvents.id, parsed.eventId),
          eq(personEvents.treeId, access.tree.id),
        ),
      )
      .returning({ id: personEvents.id });
    if (!updated.length) throw new AppError("That event could not be found.");
    await touchTree(access.tree.id);
    return undefined;
  });
}

export async function deletePersonEvent(input: {
  treeId: string;
  eventId: string;
}): Promise<ActionResult<undefined>> {
  return runAction(async () => {
    const access = await requireTreeMember(input.treeId, "editor");
    const deleted = await db
      .delete(personEvents)
      .where(
        and(
          eq(personEvents.id, input.eventId),
          eq(personEvents.treeId, access.tree.id),
        ),
      )
      .returning({ id: personEvents.id });
    if (!deleted.length) throw new AppError("That event could not be found.");
    await touchTree(access.tree.id);
    return undefined;
  });
}

async function touchTree(treeId: string) {
  await db.update(trees).set({ updatedAt: new Date() }).where(eq(trees.id, treeId));
}

async function assertPeopleInTree(treeId: string, personIds: string[]) {
  const unique = [...new Set(personIds)];
  const rows = await db
    .select({ id: people.id })
    .from(people)
    .where(and(eq(people.treeId, treeId), inArray(people.id, unique)));
  if (rows.length !== unique.length) throw new AppError("That person could not be found.");
}

async function lockTree(tx: Transaction, treeId: string) {
  await tx.select({ id: trees.id }).from(trees).where(eq(trees.id, treeId)).for("update");
}

async function loadParentEdges(
  tx: Transaction,
  treeId: string,
): Promise<ParentEdgeRecord[]> {
  return tx
    .select({
      id: parentChild.id,
      parentId: parentChild.parentId,
      childId: parentChild.childId,
    })
    .from(parentChild)
    .where(eq(parentChild.treeId, treeId));
}

async function loadPartnerships(
  tx: Transaction,
  treeId: string,
): Promise<PartnershipRecord[]> {
  return tx
    .select({
      id: partnerships.id,
      personAId: partnerships.personAId,
      personBId: partnerships.personBId,
    })
    .from(partnerships)
    .where(eq(partnerships.treeId, treeId));
}
