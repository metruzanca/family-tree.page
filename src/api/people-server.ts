"use server";

import { and, eq, inArray } from "drizzle-orm";
import { db } from "../server/db";
import {
  files,
  parentChild,
  partnerships,
  people,
  trees,
  type ParentChild,
  type Partnership,
  type Person,
  type StoredFile,
} from "../../drizzle/schema";
import { requireTreeMember, type TreeRole } from "../server/guards";
import { AppError, runAction, type ActionResult } from "../server/errors";
import {
  addRelativeSchema,
  parentChildSchema,
  partnershipSchema,
  personSchema,
  personUpdateSchema,
  type PersonInput,
} from "../server/validation";
import { deletePrefix, TREE_PREFIX } from "../server/storage";

export type GraphFile = {
  id: string;
  personId: string;
  name: string;
  mimeType: string;
  kind: "image" | "document" | "other";
  thumbUrl: string | null;
  width: number | null;
  height: number | null;
  sizeBytes: number;
  createdAt: Date;
  isAvatar: boolean;
};

export type GraphPerson = {
  id: string;
  firstName: string;
  lastName: string;
  displayName: string;
  maidenName: string | null;
  nickname: string | null;
  birthDate: string | null;
  deathDate: string | null;
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
      startDate: string | null;
      endDate: string | null;
    };

export type TreeGraph = {
  tree: { id: string; name: string; description: string | null };
  role: TreeRole;
  people: GraphPerson[];
  relationships: GraphRelationship[];
  files: GraphFile[];
};

export function personDisplayName(person: Pick<Person, "firstName" | "lastName" | "nickname">) {
  const full = `${person.firstName} ${person.lastName}`.trim();
  return full || person.nickname || "Unnamed person";
}

export async function getTreeGraph(treeId: string): Promise<TreeGraph> {
  const access = await requireTreeMember(treeId);
  const [peopleRows, parentRows, partnerRows, fileRows] = await Promise.all([
    db.select().from(people).where(eq(people.treeId, treeId)),
    db.select().from(parentChild).where(eq(parentChild.treeId, treeId)),
    db.select().from(partnerships).where(eq(partnerships.treeId, treeId)),
    db
      .select()
      .from(files)
      .where(and(eq(files.treeId, treeId), eq(files.status, "ready"))),
  ]);

  const avatarByPerson = new Map<string, string>();
  for (const file of fileRows) {
    if (file.isAvatar) avatarByPerson.set(file.personId, file.id);
  }

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
    files: fileRows.map(toGraphFile),
  };
}

function toGraphFile(file: StoredFile): GraphFile {
  return {
    id: file.id,
    personId: file.personId,
    name: file.originalName,
    mimeType: file.mimeType,
    kind: file.kind,
    thumbUrl: file.thumbKey ? `/api/files/${file.id}/thumb` : null,
    width: file.width,
    height: file.height,
    sizeBytes: file.sizeBytes,
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
    if (parsed.parentId === parsed.childId) throw new AppError("A person cannot be their own parent.");
    await assertNoCycle(access.tree.id, parsed.parentId, parsed.childId);
    const [relationship] = await db
      .insert(parentChild)
      .values({
        treeId: access.tree.id,
        parentId: parsed.parentId,
        childId: parsed.childId,
        parentType: parsed.parentType,
      })
      .returning();
    await touchTree(access.tree.id);
    return { id: relationship.id };
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
    if (parsed.personAId === parsed.personBId) throw new AppError("A person cannot be their own partner.");
    await assertPeopleInTree(access.tree.id, [parsed.personAId, parsed.personBId]);
    const [personAId, personBId] = [parsed.personAId, parsed.personBId].sort();
    const [relationship] = await db
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
    await touchTree(access.tree.id);
    return { id: relationship.id };
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
  parentType?: "biological" | "adoptive" | "foster" | "step" | "unknown";
  status?: "married" | "partnered" | "divorced" | "separated" | "widowed" | "unknown";
}): Promise<ActionResult<{ personId: string; relationshipId: string }>> {
  return runAction(async () => {
    const access = await requireTreeMember(input.treeId, "editor");
    const parsed = addRelativeSchema.parse(input);

    return db.transaction(async tx => {
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

      let relationshipId: string;
      if (parsed.relation === "partner") {
        const [personAId, personBId] = [relativeId, parsed.anchorPersonId].sort();
        const [relationship] = await tx
          .insert(partnerships)
          .values({
            treeId: access.tree.id,
            personAId,
            personBId,
            status: parsed.status,
          })
          .returning();
        relationshipId = relationship.id;
      } else {
        const parentId = parsed.relation === "parent" ? relativeId : parsed.anchorPersonId;
        const childId = parsed.relation === "parent" ? parsed.anchorPersonId : relativeId;
        await assertNoCycle(access.tree.id, parentId, childId, tx);
        const [relationship] = await tx
          .insert(parentChild)
          .values({
            treeId: access.tree.id,
            parentId,
            childId,
            parentType: parsed.parentType,
          })
          .returning();
        relationshipId = relationship.id;
      }

      await tx.update(trees).set({ updatedAt: new Date() }).where(eq(trees.id, access.tree.id));
      return { personId: relativeId, relationshipId };
    });
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

async function assertNoCycle(
  treeId: string,
  parentId: string,
  childId: string,
  tx: Pick<typeof db, "select"> = db,
) {
  if (parentId === childId) throw new AppError("A person cannot be their own parent.");
  const edges = await tx
    .select({ parentId: parentChild.parentId, childId: parentChild.childId })
    .from(parentChild)
    .where(eq(parentChild.treeId, treeId));
  const children = new Map<string, string[]>();
  for (const edge of edges) {
    const list = children.get(edge.parentId) ?? [];
    list.push(edge.childId);
    children.set(edge.parentId, list);
  }

  const stack = [childId];
  const seen = new Set<string>();
  while (stack.length) {
    const current = stack.pop()!;
    if (current === parentId) {
      throw new AppError("That relationship would create a loop in the family tree.");
    }
    if (seen.has(current)) continue;
    seen.add(current);
    for (const next of children.get(current) ?? []) stack.push(next);
  }
}
