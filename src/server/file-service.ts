import { and, eq } from "drizzle-orm";
import { fileTypeFromBuffer } from "file-type";
import { db } from "./db";
import {
  fileGroups,
  files,
  treeMembers,
  trees,
  type StoredFile,
} from "../../drizzle/schema";
import { AppError } from "./errors";
import {
  deleteKeys,
  getObjectBytes,
  headObject,
  TREE_PREFIX,
} from "./storage";

export const IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/heic",
  "image/heif",
]);

export const DOCUMENT_MIMES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.oasis.opendocument.text",
  "application/rtf",
  "text/plain",
  "text/markdown",
  "text/csv",
]);

export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
export const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024;
export const MAX_THUMB_BYTES = 2 * 1024 * 1024;

export type UploadKind = "image" | "document" | "other";

export function kindForMime(mimeType: string): UploadKind {
  if (IMAGE_MIMES.has(mimeType)) return "image";
  if (DOCUMENT_MIMES.has(mimeType)) return "document";
  return "other";
}

export function maxBytesFor(mimeType: string) {
  return kindForMime(mimeType) === "image" ? MAX_IMAGE_BYTES : MAX_DOCUMENT_BYTES;
}

export function assertAllowedUpload(mimeType: string, sizeBytes: number, hasThumb: boolean) {
  const kind = kindForMime(mimeType);
  if (kind === "other") throw new AppError("That file type is not supported yet.");
  if ((mimeType === "image/heic" || mimeType === "image/heif") && !hasThumb) {
    throw new AppError("This phone photo needs to be converted to JPEG before it can be uploaded.");
  }
  const limit = maxBytesFor(mimeType);
  if (sizeBytes > limit) {
    throw new AppError(
      kind === "image" ? "Images must be 20 MB or smaller." : "Documents must be 50 MB or smaller.",
    );
  }
}

export function storageKeys(treeId: string, personId: string, fileId: string) {
  const base = `${TREE_PREFIX}/${treeId}/people/${personId}/${fileId}`;
  return { original: `${base}/original`, thumb: `${base}/thumb` };
}

export function sanitizeFileName(name: string) {
  return name
    .replace(/[/\\]/g, "_")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 255) || "file";
}

export async function getFileById(fileId: string) {
  const rows = await db.select().from(files).where(eq(files.id, fileId)).limit(1);
  return rows[0] ?? null;
}

export async function getFileWithAccess(fileId: string, userId: string) {
  const file = await getFileById(fileId);
  if (!file) return null;
  const memberships = await db
    .select({ role: treeMembers.role })
    .from(treeMembers)
    .where(and(eq(treeMembers.treeId, file.treeId), eq(treeMembers.userId, userId)))
    .limit(1);
  if (!memberships.length) return null;
  return { file, role: memberships[0].role };
}

export async function finalizeFile(fileId: string, userId: string): Promise<StoredFile> {
  const file = await getFileById(fileId);
  if (!file) throw new AppError("That upload could not be found.");
  if (file.uploadedBy !== userId) throw new AppError("That upload does not belong to you.");
  if (file.status === "ready") return file;
  if (file.status === "failed") throw new AppError("That upload failed. Please try again.");

  try {
    const head = await headObject(file.storageKey);
    if (!head) throw new AppError("The upload did not reach storage. Please try again.");
    if (!head.ContentLength || head.ContentLength <= 0) {
      throw new AppError("The uploaded file is empty.");
    }
    if (head.ContentLength > maxBytesFor(file.mimeType)) {
      throw new AppError("The uploaded file is larger than the limit.");
    }

    const bytes = await getObjectBytes(file.storageKey, 4100);
    await assertDetectedType(file.mimeType, bytes);

    let thumbKey = file.thumbKey;
    let thumbSizeBytes: number | null = null;
    if (thumbKey) {
      const thumbHead = await headObject(thumbKey);
      if (!thumbHead || !thumbHead.ContentLength || thumbHead.ContentLength > MAX_THUMB_BYTES) {
        thumbKey = null;
      } else {
        thumbSizeBytes = thumbHead.ContentLength;
      }
    }

    const [updated] = await db
      .update(files)
      .set({
        status: "ready",
        sizeBytes: head.ContentLength,
        thumbKey,
        thumbSizeBytes,
        updatedAt: new Date(),
      })
      .where(eq(files.id, file.id))
      .returning();
    await touchTree(file.treeId);
    return updated;
  } catch (error) {
    await cleanupFile(file);
    throw error;
  }
}

async function assertDetectedType(declaredMime: string, bytes: Uint8Array) {
  const detected = await fileTypeFromBuffer(bytes);
  if (!detected) {
    if (
      declaredMime.startsWith("text/") ||
      declaredMime === "application/rtf" ||
      declaredMime === "application/msword"
    ) {
      return;
    }
    throw new AppError("The file contents do not match its file type.");
  }

  if (declaredMime.startsWith("image/")) {
    if (!detected.mime.startsWith("image/")) {
      throw new AppError("That file is not a valid image.");
    }
    return;
  }

  if (declaredMime === "application/pdf") {
    if (detected.mime !== "application/pdf") {
      throw new AppError("That file is not a valid PDF.");
    }
    return;
  }

  if (declaredMime.includes("wordprocessingml") || declaredMime.includes("opendocument")) {
    if (!["application/zip", "application/x-zip-compressed"].includes(detected.mime)) {
      throw new AppError("That document does not look valid.");
    }
    return;
  }

  if (declaredMime === "application/msword") {
    if (!["application/x-cfb", "application/msword"].includes(detected.mime)) {
      throw new AppError("That document does not look valid.");
    }
    return;
  }

  if (declaredMime === "application/rtf") {
    if (!["text/rtf", "application/rtf"].includes(detected.mime)) {
      throw new AppError("That document does not look valid.");
    }
  }
}

export async function cleanupFile(file: StoredFile) {
  try {
    const keys = [file.storageKey, file.thumbKey].filter((key): key is string => Boolean(key));
    await deleteKeys(keys);
  } catch (error) {
    console.error("Could not remove upload objects", error);
  }
  await db.delete(files).where(eq(files.id, file.id));
}

export type DeletedUsage = { bytes: number; count: number };

export async function deleteFileRecord(fileId: string, userId: string): Promise<DeletedUsage> {
  const file = await getFileById(fileId);
  if (!file) throw new AppError("That file could not be found.");
  const memberships = await db
    .select({ role: treeMembers.role })
    .from(treeMembers)
    .where(and(eq(treeMembers.treeId, file.treeId), eq(treeMembers.userId, userId)))
    .limit(1);
  if (!memberships.length || memberships[0].role === "viewer") {
    throw new AppError("You do not have permission to delete this file.");
  }
  const groupId = file.groupId;
  const usage = {
    bytes: file.sizeBytes + (file.thumbSizeBytes ?? 0),
    count: 1,
  };
  await cleanupFile(file);
  if (groupId) {
    const remaining = await db
      .select({ id: files.id })
      .from(files)
      .where(and(eq(files.groupId, groupId), eq(files.treeId, file.treeId)))
      .limit(1);
    if (!remaining.length) {
      await db
        .delete(fileGroups)
        .where(and(eq(fileGroups.id, groupId), eq(fileGroups.treeId, file.treeId)));
    }
  }
  await touchTree(file.treeId);
  return usage;
}

export async function deleteFileGroup(
  groupId: string,
  treeId: string,
): Promise<DeletedUsage> {
  const groupRows = await db
    .select()
    .from(fileGroups)
    .where(and(eq(fileGroups.id, groupId), eq(fileGroups.treeId, treeId)))
    .limit(1);
  const group = groupRows[0];
  if (!group) throw new AppError("That album could not be found.");
  const groupFiles = await db
    .select()
    .from(files)
    .where(and(eq(files.groupId, groupId), eq(files.treeId, treeId)));
  const keys = groupFiles
    .flatMap(file => [file.storageKey, file.thumbKey])
    .filter((key): key is string => Boolean(key));
  const usage = groupFiles.reduce<DeletedUsage>(
    (sum, file) => ({
      bytes: sum.bytes + file.sizeBytes + (file.thumbSizeBytes ?? 0),
      count: sum.count + 1,
    }),
    { bytes: 0, count: 0 },
  );
  if (keys.length) {
    try {
      await deleteKeys(keys);
    } catch (error) {
      console.error("Could not remove album objects", error);
    }
  }
  await db
    .delete(fileGroups)
    .where(and(eq(fileGroups.id, groupId), eq(fileGroups.treeId, treeId)));
  await touchTree(treeId);
  return usage;
}

export async function setAvatarRecord(input: {
  treeId: string;
  personId: string;
  fileId: string | null;
  userId: string;
}) {
  await db.transaction(async tx => {
    await tx
      .update(files)
      .set({ isAvatar: false, updatedAt: new Date() })
      .where(and(eq(files.treeId, input.treeId), eq(files.personId, input.personId)));

    if (input.fileId) {
      const rows = await tx
        .select()
        .from(files)
        .where(
          and(
            eq(files.id, input.fileId),
            eq(files.treeId, input.treeId),
            eq(files.personId, input.personId),
          ),
        )
        .limit(1);
      const file = rows[0];
      if (!file) throw new AppError("That photo could not be found.");
      if (file.kind !== "image" || file.status !== "ready") {
        throw new AppError("Choose an uploaded image to use as the portrait.");
      }
      await tx
        .update(files)
        .set({ isAvatar: true, updatedAt: new Date() })
        .where(eq(files.id, file.id));
    }

    await tx.update(trees).set({ updatedAt: new Date() }).where(eq(trees.id, input.treeId));
  });
}

async function touchTree(treeId: string) {
  await db.update(trees).set({ updatedAt: new Date() }).where(eq(trees.id, treeId));
}
