"use server";

import { runAction, type ActionResult } from "../server/errors";
import { requireTreeMember } from "../server/guards";
import { db } from "../server/db";
import { getFileById } from "../server/file-service";
import {
  addManualFaceRecord,
  assignFaceRecord,
  clearFaceRecord,
  deleteFaceRecord,
  recordDetectedFaces,
  setFaceIgnoredRecord,
} from "../server/face-service";
import {
  addManualFaceSchema,
  assignFaceSchema,
  faceTargetSchema,
  ignoreFaceSchema,
  recordFacesSchema,
  type RecordedFaceInput,
} from "../server/validation";
import { logActivityBestEffort, peopleNames } from "../server/activity";

export async function recordFileFaces(input: {
  treeId: string;
  fileId: string;
  faces: RecordedFaceInput[];
}): Promise<ActionResult<{ count: number }>> {
  return runAction("faces.recordFileFaces", async () => {
    const access = await requireTreeMember(input.treeId, "editor");
    const parsed = recordFacesSchema.parse(input);
    const faces = await recordDetectedFaces({
      treeId: access.tree.id,
      fileId: parsed.fileId,
      userId: access.user.id,
      faces: parsed.faces,
    });
    return { count: faces.length };
  });
}

export async function assignFileFace(input: {
  treeId: string;
  fileId: string;
  faceId: string;
  personId: string;
}): Promise<ActionResult<undefined>> {
  return runAction("faces.assignFileFace", async () => {
    const access = await requireTreeMember(input.treeId, "editor");
    const parsed = assignFaceSchema.parse(input);
    await assignFaceRecord({
      treeId: access.tree.id,
      fileId: parsed.fileId,
      faceId: parsed.faceId,
      personId: parsed.personId,
      userId: access.user.id,
    });
    await logLink(access, parsed.fileId, parsed.personId, "Linked a face to");
    return undefined;
  });
}

export async function addManualFileFace(input: {
  treeId: string;
  fileId: string;
  personId: string;
  box: RecordedFaceInput["box"];
}): Promise<ActionResult<undefined>> {
  return runAction("faces.addManualFileFace", async () => {
    const access = await requireTreeMember(input.treeId, "editor");
    const parsed = addManualFaceSchema.parse(input);
    await addManualFaceRecord({
      treeId: access.tree.id,
      fileId: parsed.fileId,
      personId: parsed.personId,
      box: parsed.box,
      userId: access.user.id,
    });
    await logLink(access, parsed.fileId, parsed.personId, "Drew a face for");
    return undefined;
  });
}

export async function unlinkFileFace(input: {
  treeId: string;
  fileId: string;
  faceId: string;
}): Promise<ActionResult<undefined>> {
  return runAction("faces.unlinkFileFace", async () => {
    const access = await requireTreeMember(input.treeId, "editor");
    const parsed = faceTargetSchema.parse(input);
    const result = await clearFaceRecord({
      treeId: access.tree.id,
      fileId: parsed.fileId,
      faceId: parsed.faceId,
    });
    if (result.personId) {
      await logUnlink(access, parsed.fileId, result.personId);
    }
    return undefined;
  });
}

export async function setFileFaceIgnored(input: {
  treeId: string;
  fileId: string;
  faceId: string;
  ignored: boolean;
}): Promise<ActionResult<undefined>> {
  return runAction("faces.setFileFaceIgnored", async () => {
    const access = await requireTreeMember(input.treeId, "editor");
    const parsed = ignoreFaceSchema.parse(input);
    const result = await setFaceIgnoredRecord({
      treeId: access.tree.id,
      fileId: parsed.fileId,
      faceId: parsed.faceId,
      ignored: parsed.ignored,
    });
    if (parsed.ignored && result.personId) {
      await logUnlink(access, parsed.fileId, result.personId);
    }
    return undefined;
  });
}

export async function deleteFileFace(input: {
  treeId: string;
  fileId: string;
  faceId: string;
}): Promise<ActionResult<undefined>> {
  return runAction("faces.deleteFileFace", async () => {
    const access = await requireTreeMember(input.treeId, "editor");
    const parsed = faceTargetSchema.parse(input);
    const result = await deleteFaceRecord({
      treeId: access.tree.id,
      fileId: parsed.fileId,
      faceId: parsed.faceId,
    });
    if (result.personId) {
      await logUnlink(access, parsed.fileId, result.personId);
    }
    return undefined;
  });
}

type TreeAccess = Awaited<ReturnType<typeof requireTreeMember>>;

async function fileLabel(access: TreeAccess, fileId: string) {
  const file = await getFileById(fileId);
  return file && file.treeId === access.tree.id ? file.originalName : "a photo";
}

async function personLabel(access: TreeAccess, personId: string) {
  const names = await peopleNames(db, access.tree.id, [personId]);
  return names.get(personId) ?? "someone";
}

async function logLink(
  access: TreeAccess,
  fileId: string,
  personId: string,
  verb: string,
) {
  const [name, label] = await Promise.all([
    personLabel(access, personId),
    fileLabel(access, fileId),
  ]);
  await logActivityBestEffort({
    treeId: access.tree.id,
    actor: access.user,
    action: "file.updated",
    entityType: "file",
    entityId: fileId,
    personId,
    summary: `${verb} ${name} in ${label}`,
  });
}

async function logUnlink(access: TreeAccess, fileId: string, personId: string) {
  const [name, label] = await Promise.all([
    personLabel(access, personId),
    fileLabel(access, fileId),
  ]);
  await logActivityBestEffort({
    treeId: access.tree.id,
    actor: access.user,
    action: "file.updated",
    entityType: "file",
    entityId: fileId,
    personId,
    summary: `Unlinked ${name} from a face in ${label}`,
  });
}
