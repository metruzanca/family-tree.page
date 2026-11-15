"use server";

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "../server/db";
import { fileGroups, files, people, trees } from "../../drizzle/schema";
import { requireTreeMember } from "../server/guards";
import { requireUser } from "../server/auth-service";
import { AppError, runAction, type ActionResult } from "../server/errors";
import {
  fileGroupSchema,
  prepareUploadSchema,
  renameFileGroupSchema,
} from "../server/validation";
import {
  assertAllowedUpload,
  cleanupFile,
  deleteFileGroup as deleteFileGroupRecord,
  deleteFileRecord,
  finalizeFile,
  getFileById,
  kindForMime,
  maxBytesFor,
  MAX_THUMB_BYTES,
  sanitizeFileName,
  setAvatarRecord,
  storageKeys,
} from "../server/file-service";
import { createUploadPost } from "../server/storage";

export type PreparedUpload = {
  fileId: string;
  original: { url: string; fields: Record<string, string>; contentType: string };
  thumb: { url: string; fields: Record<string, string>; contentType: string } | null;
};

export async function prepareUpload(input: {
  treeId: string;
  personId: string;
  groupId?: string | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  thumbMime?: string | null;
  width?: number | null;
  height?: number | null;
}): Promise<ActionResult<PreparedUpload>> {
  return runAction(async () => {
    const access = await requireTreeMember(input.treeId, "editor");
    const parsed = prepareUploadSchema.parse(input);
    const mimeType = parsed.mimeType.split(";")[0].trim().toLowerCase();
    const thumbMime = parsed.thumbMime ?? null;
    assertAllowedUpload(mimeType, parsed.sizeBytes, Boolean(thumbMime));

    const personRows = await db
      .select({ id: people.id })
      .from(people)
      .where(and(eq(people.id, parsed.personId), eq(people.treeId, access.tree.id)))
      .limit(1);
    if (!personRows.length) throw new AppError("That person could not be found.");

    if (parsed.groupId) {
      const groupRows = await db
        .select({ id: fileGroups.id })
        .from(fileGroups)
        .where(
          and(
            eq(fileGroups.id, parsed.groupId),
            eq(fileGroups.treeId, access.tree.id),
            eq(fileGroups.personId, parsed.personId),
          ),
        )
        .limit(1);
      if (!groupRows.length) throw new AppError("That album could not be found.");
    }

    const fileId = randomUUID();
    const keys = storageKeys(access.tree.id, parsed.personId, fileId);
    const kind = kindForMime(mimeType);

    await db.insert(files).values({
      id: fileId,
      treeId: access.tree.id,
      personId: parsed.personId,
      groupId: parsed.groupId ?? null,
      storageKey: keys.original,
      thumbKey: thumbMime ? keys.thumb : null,
      thumbMime,
      originalName: sanitizeFileName(parsed.fileName),
      mimeType,
      kind,
      sizeBytes: parsed.sizeBytes,
      width: parsed.width ?? null,
      height: parsed.height ?? null,
      status: "uploading",
      uploadedBy: access.user.id,
    });

    try {
      const original = await createUploadPost(keys.original, mimeType, maxBytesFor(mimeType));
      const thumb = thumbMime
        ? await createUploadPost(keys.thumb, thumbMime, MAX_THUMB_BYTES)
        : null;
      return {
        fileId,
        original: { ...original, contentType: mimeType },
        thumb: thumb ? { ...thumb, contentType: thumbMime! } : null,
      };
    } catch (error) {
      await db.delete(files).where(eq(files.id, fileId));
      throw error;
    }
  });
}

export async function finalizeUpload(fileId: string): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const user = await requireUser();
    const file = await getFileById(fileId);
    if (!file) throw new AppError("That upload could not be found.");
    await requireTreeMember(file.treeId, "editor");
    const updated = await finalizeFile(fileId, user.id);
    return { id: updated.id };
  });
}

export async function cancelUpload(fileId: string): Promise<ActionResult<undefined>> {
  return runAction(async () => {
    const user = await requireUser();
    const file = await getFileById(fileId);
    if (!file) return undefined;
    await requireTreeMember(file.treeId, "editor");
    if (file.uploadedBy !== user.id) throw new AppError("That upload does not belong to you.");
    if (file.status !== "uploading") return undefined;
    await cleanupFile(file);
    return undefined;
  });
}

export async function deleteFile(input: {
  treeId: string;
  fileId: string;
}): Promise<ActionResult<undefined>> {
  return runAction(async () => {
    const access = await requireTreeMember(input.treeId, "editor");
    const file = await getFileById(input.fileId);
    if (!file || file.treeId !== access.tree.id) throw new AppError("That file could not be found.");
    await deleteFileRecord(input.fileId, access.user.id);
    return undefined;
  });
}

export async function createFileGroup(input: {
  treeId: string;
  personId: string;
  name: string;
}): Promise<ActionResult<{ id: string; name: string }>> {
  return runAction(async () => {
    const access = await requireTreeMember(input.treeId, "editor");
    const parsed = fileGroupSchema.parse(input);
    const personRows = await db
      .select({ id: people.id })
      .from(people)
      .where(and(eq(people.id, parsed.personId), eq(people.treeId, access.tree.id)))
      .limit(1);
    if (!personRows.length) throw new AppError("That person could not be found.");
    const [group] = await db
      .insert(fileGroups)
      .values({
        treeId: access.tree.id,
        personId: parsed.personId,
        name: parsed.name,
        createdBy: access.user.id,
      })
      .returning();
    return { id: group.id, name: group.name };
  });
}

export async function renameFileGroup(input: {
  groupId: string;
  name: string;
}): Promise<ActionResult<{ id: string; name: string }>> {
  return runAction(async () => {
    const parsed = renameFileGroupSchema.parse(input);
    const rows = await db
      .select()
      .from(fileGroups)
      .where(eq(fileGroups.id, parsed.groupId))
      .limit(1);
    const group = rows[0];
    if (!group) throw new AppError("That album could not be found.");
    const access = await requireTreeMember(group.treeId, "editor");
    const [updated] = await db
      .update(fileGroups)
      .set({ name: parsed.name, updatedAt: new Date() })
      .where(and(eq(fileGroups.id, group.id), eq(fileGroups.treeId, access.tree.id)))
      .returning();
    await db
      .update(trees)
      .set({ updatedAt: new Date() })
      .where(eq(trees.id, access.tree.id));
    return { id: updated.id, name: updated.name };
  });
}

export async function deleteFileGroup(groupId: string): Promise<ActionResult<undefined>> {
  return runAction(async () => {
    const rows = await db
      .select()
      .from(fileGroups)
      .where(eq(fileGroups.id, groupId))
      .limit(1);
    const group = rows[0];
    if (!group) throw new AppError("That album could not be found.");
    const access = await requireTreeMember(group.treeId, "editor");
    await deleteFileGroupRecord(group.id, access.tree.id);
    return undefined;
  });
}

export async function setAvatar(input: {
  treeId: string;
  personId: string;
  fileId: string | null;
}): Promise<ActionResult<undefined>> {
  return runAction(async () => {
    const access = await requireTreeMember(input.treeId, "editor");
    const personRows = await db
      .select({ id: people.id })
      .from(people)
      .where(and(eq(people.id, input.personId), eq(people.treeId, access.tree.id)))
      .limit(1);
    if (!personRows.length) throw new AppError("That person could not be found.");
    await setAvatarRecord({
      treeId: access.tree.id,
      personId: input.personId,
      fileId: input.fileId,
      userId: access.user.id,
    });
    return undefined;
  });
}
