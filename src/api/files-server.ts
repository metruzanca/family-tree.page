"use server";

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "../server/db";
import { files, people } from "../../drizzle/schema";
import { requireTreeMember } from "../server/guards";
import { requireUser } from "../server/auth-service";
import { AppError, runAction, type ActionResult } from "../server/errors";
import { prepareUploadSchema } from "../server/validation";
import {
  assertAllowedUpload,
  cleanupFile,
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

    const fileId = randomUUID();
    const keys = storageKeys(access.tree.id, parsed.personId, fileId);
    const kind = kindForMime(mimeType);

    await db.insert(files).values({
      id: fileId,
      treeId: access.tree.id,
      personId: parsed.personId,
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
