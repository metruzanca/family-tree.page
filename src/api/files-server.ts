"use server";

import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../server/db";
import { fileGroups, fileTags, files, people, trees } from "../../drizzle/schema";
import { requireTreeMember } from "../server/guards";
import { requireUser } from "../server/auth-service";
import { AppError, runAction, type ActionResult } from "../server/errors";
import {
  assignFilesSchema,
  fileGroupSchema,
  fileIdsSchema,
  fileTagsSchema,
  fileTakenAtSchema,
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
import { unassignFacesForPeople } from "../server/face-service";
import { logActivityBestEffort, peopleNames } from "../server/activity";
import { notifyTreeChanged } from "../server/presence";
import {
  QuotaError,
  recordRejection,
  reserveStorage,
  recordUsage,
} from "../server/usage";
import { formatFuzzyDate, type FuzzyDate } from "../lib/fuzzy-date";

export type PreparedUpload = {
  fileId: string;
  original: { url: string; fields: Record<string, string>; contentType: string };
  thumb: { url: string; fields: Record<string, string>; contentType: string } | null;
};

export async function prepareUpload(input: {
  treeId: string;
  personId?: string | null;
  groupId?: string | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  thumbSizeBytes?: number | null;
  thumbMime?: string | null;
  width?: number | null;
  height?: number | null;
  takenAt?: FuzzyDate | null;
}): Promise<ActionResult<PreparedUpload>> {
  return runAction("files.prepareUpload", async () => {
    const access = await requireTreeMember(input.treeId, "editor");
    const parsed = prepareUploadSchema.parse(input);
    const mimeType = parsed.mimeType.split(";")[0].trim().toLowerCase();
    const thumbMime = parsed.thumbMime ?? null;
    const kind = kindForMime(mimeType);

    try {
      assertAllowedUpload(mimeType, parsed.sizeBytes, Boolean(thumbMime));
    } catch (error) {
      const typeRejected =
        kind === "other" ||
        ((mimeType === "image/heic" || mimeType === "image/heif") && !thumbMime);
      await recordRejection({
        userId: access.user.id,
        kind: typeRejected ? "upload_rejected_type" : "upload_rejected_size",
        treeId: access.tree.id,
        bytes: parsed.sizeBytes,
      });
      throw error;
    }

    const personId = parsed.personId ?? null;
    if (personId) {
      const personRows = await db
        .select({ id: people.id })
        .from(people)
        .where(and(eq(people.id, personId), eq(people.treeId, access.tree.id)))
        .limit(1);
      if (!personRows.length) throw new AppError("That person could not be found.");
    }

    if (parsed.groupId) {
      if (!personId) throw new AppError("Choose a person before adding an album.");
      const groupRows = await db
        .select({ id: fileGroups.id })
        .from(fileGroups)
        .where(
          and(
            eq(fileGroups.id, parsed.groupId),
            eq(fileGroups.treeId, access.tree.id),
            eq(fileGroups.personId, personId),
          ),
        )
        .limit(1);
      if (!groupRows.length) throw new AppError("That album could not be found.");
    }

    const fileId = randomUUID();
    const keys = storageKeys(access.tree.id, personId, fileId);
    const thumbReservation = thumbMime
      ? Math.min(parsed.thumbSizeBytes ?? MAX_THUMB_BYTES, MAX_THUMB_BYTES)
      : 0;

    try {
      await db.transaction(async tx => {
        await reserveStorage(tx, {
          userId: access.user.id,
          bytes: parsed.sizeBytes + thumbReservation,
        });
        await tx.insert(files).values({
          id: fileId,
          treeId: access.tree.id,
          personId,
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
          takenAt: parsed.takenAt,
          status: "uploading",
          uploadedBy: access.user.id,
        });
      });
    } catch (error) {
      if (error instanceof QuotaError) {
        await recordRejection({
          userId: access.user.id,
          kind: "upload_rejected_quota",
          treeId: access.tree.id,
          bytes: parsed.sizeBytes + thumbReservation,
        });
      }
      throw error;
    }

    try {
      const original = await createUploadPost(keys.original, mimeType, parsed.sizeBytes);
      const thumb = thumbMime
        ? await createUploadPost(
            keys.thumb,
            thumbMime,
            parsed.thumbSizeBytes ?? MAX_THUMB_BYTES,
          )
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
  return runAction("files.finalizeUpload", async () => {
    const user = await requireUser();
    const file = await getFileById(fileId);
    if (!file) throw new AppError("That upload could not be found.");
    await requireTreeMember(file.treeId, "editor");
    const updated = await finalizeFile(fileId, user.id);
    if (file.status !== "ready") {
      const personId = updated.personId;
      const names = await peopleNames(db, updated.treeId, personId ? [personId] : []);
      await logActivityBestEffort({
        treeId: updated.treeId,
        actor: user,
        action: "file.uploaded",
        entityType: "file",
        entityId: updated.id,
        personId,
        summary: personId
          ? `Uploaded ${updated.originalName} to ${names.get(personId) ?? "someone"}`
          : `Uploaded ${updated.originalName} to the tree inbox`,
      });
      await recordUsage({
        userId: user.id,
        kind: "file_uploaded",
        bytes: updated.sizeBytes + (updated.thumbSizeBytes ?? 0),
        itemCount: 1,
        treeId: updated.treeId,
      });
    }
    return { id: updated.id };
  });
}

export async function cancelUpload(fileId: string): Promise<ActionResult<undefined>> {
  return runAction("files.cancelUpload", async () => {
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
  return runAction("files.deleteFile", async () => {
    const access = await requireTreeMember(input.treeId, "editor");
    const file = await getFileById(input.fileId);
    if (!file || file.treeId !== access.tree.id) throw new AppError("That file could not be found.");
    const names = await peopleNames(db, access.tree.id, file.personId ? [file.personId] : []);
    const usage = await deleteFileRecord(input.fileId, access.user.id);
    await logActivityBestEffort({
      treeId: access.tree.id,
      actor: access.user,
      action: "file.deleted",
      entityType: "file",
      entityId: file.id,
      personId: file.personId,
      summary: file.personId
        ? `Deleted ${file.originalName} from ${names.get(file.personId) ?? "someone"}`
        : `Deleted ${file.originalName} from the tree inbox`,
    });
    await recordUsage({
      userId: access.user.id,
      kind: "file_deleted",
      bytes: usage.bytes,
      itemCount: usage.count,
      treeId: access.tree.id,
    });
    return undefined;
  });
}

export async function deleteFiles(input: {
  treeId: string;
  fileIds: string[];
}): Promise<ActionResult<{ deleted: number }>> {
  return runAction("files.deleteFiles", async () => {
    const access = await requireTreeMember(input.treeId, "editor");
    const parsed = fileIdsSchema.parse(input);
    const rows = await db
      .select({
        id: files.id,
        originalName: files.originalName,
        personId: files.personId,
      })
      .from(files)
      .where(
        and(eq(files.treeId, access.tree.id), inArray(files.id, parsed.fileIds)),
      );
    if (rows.length !== parsed.fileIds.length) {
      throw new AppError("One of those files could not be found.");
    }

    let bytes = 0;
    let count = 0;
    for (const row of rows) {
      const usage = await deleteFileRecord(row.id, access.user.id);
      bytes += usage.bytes;
      count += usage.count;
    }
    await recordUsage({
      userId: access.user.id,
      kind: "file_deleted",
      bytes,
      itemCount: count,
      treeId: access.tree.id,
    });
    await logActivityBestEffort({
      treeId: access.tree.id,
      actor: access.user,
      action: "file.deleted",
      entityType: "file",
      entityId: rows.length === 1 ? rows[0].id : null,
      personId: rows.length === 1 ? rows[0].personId : null,
      summary:
        rows.length === 1
          ? `Deleted ${rows[0].originalName}`
          : `Deleted ${rows.length} files`,
    });
    return { deleted: count };
  });
}

export async function assignFilesToPerson(input: {
  treeId: string;
  fileIds: string[];
  personId: string | null;
}): Promise<ActionResult<{ moved: number }>> {
  return runAction("files.assignFilesToPerson", async () => {
    const access = await requireTreeMember(input.treeId, "editor");
    const parsed = assignFilesSchema.parse(input);

    if (parsed.personId) {
      const personRows = await db
        .select({ id: people.id })
        .from(people)
        .where(and(eq(people.id, parsed.personId), eq(people.treeId, access.tree.id)))
        .limit(1);
      if (!personRows.length) throw new AppError("That person could not be found.");
    }

    const rows = await db
      .select({
        id: files.id,
        personId: files.personId,
        groupId: files.groupId,
        originalName: files.originalName,
      })
      .from(files)
      .where(
        and(eq(files.treeId, access.tree.id), inArray(files.id, parsed.fileIds)),
      );
    if (rows.length !== parsed.fileIds.length) {
      throw new AppError("One of those files could not be found.");
    }

    const changed = rows.filter(row => row.personId !== parsed.personId);
    if (!changed.length) return { moved: 0 };

    const names = await peopleNames(
      db,
      access.tree.id,
      parsed.personId ? [parsed.personId] : [],
    );
    const groupIds = [
      ...new Set(
        changed
          .map(row => row.groupId)
          .filter((groupId): groupId is string => Boolean(groupId)),
      ),
    ];

    await db.transaction(async tx => {
      await tx
        .update(files)
        .set({
          personId: parsed.personId,
          // An album belongs to the person it was created for, so a file that
          // changes hands leaves its album behind. A portrait stops being one.
          groupId: null,
          isAvatar: false,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(files.treeId, access.tree.id),
            inArray(
              files.id,
              changed.map(row => row.id),
            ),
          ),
        );

      for (const groupId of groupIds) {
        const remaining = await tx
          .select({ id: files.id })
          .from(files)
          .where(and(eq(files.groupId, groupId), eq(files.treeId, access.tree.id)))
          .limit(1);
        if (!remaining.length) {
          await tx
            .delete(fileGroups)
            .where(and(eq(fileGroups.id, groupId), eq(fileGroups.treeId, access.tree.id)));
        }
      }

      await tx
        .update(trees)
        .set({ updatedAt: new Date() })
        .where(eq(trees.id, access.tree.id));
    });

    const destination = parsed.personId
      ? names.get(parsed.personId) ?? "someone"
      : "the tree inbox";
    await logActivityBestEffort({
      treeId: access.tree.id,
      actor: access.user,
      action: "file.updated",
      entityType: "file",
      entityId: changed.length === 1 ? changed[0].id : null,
      personId: parsed.personId,
      summary:
        changed.length === 1
          ? `Filed ${changed[0].originalName} under ${destination}`
          : `Filed ${changed.length} files under ${destination}`,
    });
    notifyTreeChanged(access.tree.id);
    return { moved: changed.length };
  });
}

export async function createFileGroup(input: {
  treeId: string;
  personId: string;
  name: string;
}): Promise<ActionResult<{ id: string; name: string }>> {
  return runAction("files.createFileGroup", async () => {
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
    notifyTreeChanged(access.tree.id);
    return { id: group.id, name: group.name };
  });
}

export async function renameFileGroup(input: {
  groupId: string;
  name: string;
}): Promise<ActionResult<{ id: string; name: string }>> {
  return runAction("files.renameFileGroup", async () => {
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
    notifyTreeChanged(access.tree.id);
    await logActivityBestEffort({
      treeId: access.tree.id,
      actor: access.user,
      action: "group.renamed",
      entityType: "file_group",
      entityId: updated.id,
      personId: group.personId,
      summary: `Renamed album ${group.name} to ${updated.name}`,
    });
    return { id: updated.id, name: updated.name };
  });
}

export async function deleteFileGroup(groupId: string): Promise<ActionResult<undefined>> {
  return runAction("files.deleteFileGroup", async () => {
    const rows = await db
      .select()
      .from(fileGroups)
      .where(eq(fileGroups.id, groupId))
      .limit(1);
    const group = rows[0];
    if (!group) throw new AppError("That album could not be found.");
    const access = await requireTreeMember(group.treeId, "editor");
    const usage = await deleteFileGroupRecord(group.id, access.tree.id);
    await logActivityBestEffort({
      treeId: access.tree.id,
      actor: access.user,
      action: "group.deleted",
      entityType: "file_group",
      entityId: group.id,
      personId: group.personId,
      summary: `Deleted album ${group.name}`,
    });
    await recordUsage({
      userId: access.user.id,
      kind: "file_deleted",
      bytes: usage.bytes,
      itemCount: usage.count,
      treeId: access.tree.id,
    });
    return undefined;
  });
}

export async function setAvatar(input: {
  treeId: string;
  personId: string;
  fileId: string | null;
}): Promise<ActionResult<undefined>> {
  return runAction("files.setAvatar", async () => {
    const access = await requireTreeMember(input.treeId, "editor");
    const personRows = await db
      .select({ id: people.id })
      .from(people)
      .where(and(eq(people.id, input.personId), eq(people.treeId, access.tree.id)))
      .limit(1);
    if (!personRows.length) throw new AppError("That person could not be found.");
    const names = await peopleNames(db, access.tree.id, [input.personId]);
    await setAvatarRecord({
      treeId: access.tree.id,
      personId: input.personId,
      fileId: input.fileId,
      userId: access.user.id,
    });
    notifyTreeChanged(access.tree.id);
    await logActivityBestEffort({
      treeId: access.tree.id,
      actor: access.user,
      action: "file.updated",
      entityType: "file",
      entityId: input.fileId,
      personId: input.personId,
      summary: input.fileId
        ? `Set a portrait for ${names.get(input.personId) ?? "someone"}`
        : `Removed the portrait for ${names.get(input.personId) ?? "someone"}`,
    });
    return undefined;
  });
}

export async function updateFileTags(input: {
  treeId: string;
  fileId: string;
  personIds: string[];
}): Promise<ActionResult<string[]>> {
  return runAction("files.updateFileTags", async () => {
    const access = await requireTreeMember(input.treeId, "editor");
    const parsed = fileTagsSchema.parse(input);

    const fileRows = await db
      .select({
        id: files.id,
        personId: files.personId,
        originalName: files.originalName,
      })
      .from(files)
      .where(and(eq(files.id, parsed.fileId), eq(files.treeId, access.tree.id)))
      .limit(1);
    const file = fileRows[0];
    if (!file) throw new AppError("That file could not be found.");

    const desired = parsed.personIds.filter(personId => personId !== file.personId);
    if (desired.length) {
      const personRows = await db
        .select({ id: people.id })
        .from(people)
        .where(and(eq(people.treeId, access.tree.id), inArray(people.id, desired)));
      if (personRows.length !== desired.length) {
        throw new AppError("One of those people could not be found.");
      }
    }

    // Tagging a photo from the inbox files it under the first person picked,
    // so an editor can assign media by naming who is in it.
    const autoFilePersonId = file.personId === null && desired.length ? desired[0] : null;

    await db.transaction(async tx => {
      if (autoFilePersonId) {
        await tx
          .update(files)
          .set({ personId: autoFilePersonId, updatedAt: new Date() })
          .where(and(eq(files.id, file.id), eq(files.treeId, access.tree.id)));
      }
      const existing = await tx
        .select({ personId: fileTags.personId })
        .from(fileTags)
        .where(and(eq(fileTags.fileId, file.id), eq(fileTags.treeId, access.tree.id)));
      const currentIds = existing.map(row => row.personId);
      const toRemove = currentIds.filter(personId => !desired.includes(personId));
      const toAdd = desired.filter(personId => !currentIds.includes(personId));

      if (toRemove.length) {
        await tx
          .delete(fileTags)
          .where(
            and(
              eq(fileTags.fileId, file.id),
              eq(fileTags.treeId, access.tree.id),
              inArray(fileTags.personId, toRemove),
            ),
          );
        await unassignFacesForPeople(tx, {
          treeId: access.tree.id,
          fileId: file.id,
          personIds: toRemove,
        });
      }
      if (toAdd.length) {
        await tx.insert(fileTags).values(
          toAdd.map(personId => ({
            treeId: access.tree.id,
            fileId: file.id,
            personId,
            source: "manual" as const,
            createdBy: access.user.id,
          })),
        );
      }
      await tx
        .update(trees)
        .set({ updatedAt: new Date() })
        .where(eq(trees.id, access.tree.id));
    });

    notifyTreeChanged(access.tree.id);
    await logActivityBestEffort({
      treeId: access.tree.id,
      actor: access.user,
      action: "file.updated",
      entityType: "file",
      entityId: file.id,
      personId: autoFilePersonId ?? file.personId,
      summary: autoFilePersonId
        ? `Filed ${file.originalName} and tagged the people in it`
        : `Updated the people tagged in ${file.originalName}`,
    });

    return desired;
  });
}

export async function updateFileTakenAt(input: {
  treeId: string;
  fileId: string;
  takenAt: FuzzyDate | null;
}): Promise<ActionResult<undefined>> {
  return runAction("files.updateFileTakenAt", async () => {
    const access = await requireTreeMember(input.treeId, "editor");
    const parsed = fileTakenAtSchema.parse(input);
    const [file] = await db
      .select({ id: files.id, personId: files.personId, originalName: files.originalName })
      .from(files)
      .where(and(eq(files.id, parsed.fileId), eq(files.treeId, access.tree.id)))
      .limit(1);
    if (!file) throw new AppError("That file could not be found.");

    await db
      .update(files)
      .set({ takenAt: parsed.takenAt, updatedAt: new Date() })
      .where(and(eq(files.id, parsed.fileId), eq(files.treeId, access.tree.id)));
    await db
      .update(trees)
      .set({ updatedAt: new Date() })
      .where(eq(trees.id, access.tree.id));
    notifyTreeChanged(access.tree.id);
    await logActivityBestEffort({
      treeId: access.tree.id,
      actor: access.user,
      action: "file.updated",
      entityType: "file",
      entityId: file.id,
      personId: file.personId,
      summary: parsed.takenAt
        ? `Changed the date taken for ${file.originalName} to ${formatFuzzyDate(parsed.takenAt)}`
        : `Cleared the date taken for ${file.originalName}`,
    });
    return undefined;
  });
}
