import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "./db";
import {
  fileFaces,
  fileTags,
  files,
  people,
  type FileFace,
} from "../../drizzle/schema";
import { AppError } from "./errors";
import { touchTree } from "./file-service";
import {
  clampFaceBox,
  planFaceRescan,
  type DetectedFace,
} from "../lib/face-box";

async function getFaceFile(fileId: string, treeId: string) {
  const rows = await db
    .select({
      id: files.id,
      personId: files.personId,
      originalName: files.originalName,
      kind: files.kind,
      status: files.status,
    })
    .from(files)
    .where(and(eq(files.id, fileId), eq(files.treeId, treeId)))
    .limit(1);
  const file = rows[0];
  if (!file) throw new AppError("That file could not be found.");
  return file;
}

async function getFace(fileId: string, treeId: string, faceId: string) {
  const rows = await db
    .select()
    .from(fileFaces)
    .where(
      and(
        eq(fileFaces.id, faceId),
        eq(fileFaces.fileId, fileId),
        eq(fileFaces.treeId, treeId),
      ),
    )
    .limit(1);
  const face = rows[0];
  if (!face) throw new AppError("That face could not be found.");
  return face;
}

async function assertPersonInTree(treeId: string, personId: string) {
  const rows = await db
    .select({ id: people.id })
    .from(people)
    .where(and(eq(people.id, personId), eq(people.treeId, treeId)))
    .limit(1);
  if (!rows.length) throw new AppError("That person could not be found.");
}

async function removeFaceTag(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  fileId: string,
  treeId: string,
  personId: string,
) {
  const rows = await tx
    .select({ id: fileTags.id, source: fileTags.source })
    .from(fileTags)
    .where(
      and(
        eq(fileTags.fileId, fileId),
        eq(fileTags.treeId, treeId),
        eq(fileTags.personId, personId),
      ),
    )
    .limit(1);
  const tag = rows[0];
  // A manual tag means the editor said this person is in the photo even without
  // a face, so unlinking the face must not remove it.
  if (tag && tag.source === "face") {
    await tx.delete(fileTags).where(eq(fileTags.id, tag.id));
  }
}

export async function listFileFaces(fileId: string, treeId: string) {
  return db
    .select()
    .from(fileFaces)
    .where(and(eq(fileFaces.fileId, fileId), eq(fileFaces.treeId, treeId)));
}

/**
 * Stores what the browser detector found. Re-scans match boxes by overlap, so
 * links and "not a face" decisions survive.
 */
export async function recordDetectedFaces(input: {
  treeId: string;
  fileId: string;
  userId: string;
  faces: DetectedFace[];
}): Promise<FileFace[]> {
  const file = await getFaceFile(input.fileId, input.treeId);
  if (file.kind !== "image") {
    throw new AppError("Face detection only works on images.");
  }
  if (file.status !== "ready") {
    throw new AppError("That photo is still uploading.");
  }

  const existing = await listFileFaces(input.fileId, input.treeId);
  const detected = input.faces
    .map(face => ({ ...face, box: clampFaceBox(face.box) }))
    .filter(face => face.box.width > 0 && face.box.height > 0);
  const auto = existing.filter(face => face.source === "face");
  const plan = planFaceRescan(auto, detected);

  await db.transaction(async tx => {
    for (const update of plan.updates) {
      await tx
        .update(fileFaces)
        .set({ box: update.box, confidence: update.confidence, updatedAt: new Date() })
        .where(eq(fileFaces.id, update.id));
    }
    if (plan.removals.length) {
      await tx.delete(fileFaces).where(inArray(fileFaces.id, plan.removals));
    }
    if (plan.additions.length) {
      await tx.insert(fileFaces).values(
        plan.additions.map(face => ({
          treeId: input.treeId,
          fileId: input.fileId,
          box: face.box,
          confidence: face.confidence ?? null,
          status: "unassigned" as const,
          source: "face" as const,
          createdBy: input.userId,
        })),
      );
    }
    // A lone face in a photo is almost always the person the photo is filed
    // under. Only do this on the first check, so unlinking survives a re-scan.
    // An unfiled photo has nobody to link, so its box waits for an editor.
    if (existing.length === 0 && plan.additions.length === 1 && file.personId) {
      await tx
        .update(fileFaces)
        .set({
          personId: file.personId,
          status: "assigned",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(fileFaces.fileId, input.fileId),
            eq(fileFaces.treeId, input.treeId),
            eq(fileFaces.status, "unassigned"),
          ),
        );
    }
    await tx
      .update(files)
      .set({ facesScannedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(files.id, input.fileId), eq(files.treeId, input.treeId)));
  });

  await touchTree(input.treeId);
  return listFileFaces(input.fileId, input.treeId);
}

export async function assignFaceRecord(input: {
  treeId: string;
  fileId: string;
  faceId: string;
  personId: string;
  userId: string;
}) {
  const file = await getFaceFile(input.fileId, input.treeId);
  await getFace(input.fileId, input.treeId, input.faceId);
  await assertPersonInTree(input.treeId, input.personId);

  await db.transaction(async tx => {
    // One person can only point at one face in a photo.
    await tx
      .update(fileFaces)
      .set({ personId: null, status: "unassigned", updatedAt: new Date() })
      .where(
        and(
          eq(fileFaces.fileId, input.fileId),
          eq(fileFaces.treeId, input.treeId),
          eq(fileFaces.personId, input.personId),
          ne(fileFaces.id, input.faceId),
        ),
      );
    await tx
      .update(fileFaces)
      .set({
        personId: input.personId,
        status: "assigned",
        updatedAt: new Date(),
      })
      .where(eq(fileFaces.id, input.faceId));
    // The owner of the photo is already linked by being filed under it.
    if (input.personId !== file.personId) {
      await tx
        .insert(fileTags)
        .values({
          treeId: input.treeId,
          fileId: input.fileId,
          personId: input.personId,
          source: "face",
          createdBy: input.userId,
        })
        .onConflictDoNothing({
          target: [fileTags.fileId, fileTags.personId],
        });
    }
  });

  await touchTree(input.treeId);
}

export async function clearFaceRecord(input: {
  treeId: string;
  fileId: string;
  faceId: string;
}) {
  const face = await getFace(input.fileId, input.treeId, input.faceId);

  await db.transaction(async tx => {
    await tx
      .update(fileFaces)
      .set({ personId: null, status: "unassigned", updatedAt: new Date() })
      .where(eq(fileFaces.id, face.id));
    if (face.personId) {
      await removeFaceTag(tx, face.fileId, face.treeId, face.personId);
    }
  });

  await touchTree(input.treeId);
  return { personId: face.personId };
}

export async function setFaceIgnoredRecord(input: {
  treeId: string;
  fileId: string;
  faceId: string;
  ignored: boolean;
}) {
  const face = await getFace(input.fileId, input.treeId, input.faceId);

  await db.transaction(async tx => {
    await tx
      .update(fileFaces)
      .set({
        personId: null,
        status: input.ignored ? "ignored" : "unassigned",
        updatedAt: new Date(),
      })
      .where(eq(fileFaces.id, face.id));
    if (face.personId) {
      await removeFaceTag(tx, face.fileId, face.treeId, face.personId);
    }
  });

  await touchTree(input.treeId);
  return { personId: face.personId };
}

export async function deleteFaceRecord(input: {
  treeId: string;
  fileId: string;
  faceId: string;
}) {
  const face = await getFace(input.fileId, input.treeId, input.faceId);

  await db.transaction(async tx => {
    if (face.personId) {
      await removeFaceTag(tx, face.fileId, face.treeId, face.personId);
    }
    await tx.delete(fileFaces).where(eq(fileFaces.id, face.id));
  });

  await touchTree(input.treeId);
  return { personId: face.personId };
}

/**
 * A box drawn by hand for a face the detector missed. It always carries the
 * person the editor picked, which is the whole point of drawing it.
 */
export async function addManualFaceRecord(input: {
  treeId: string;
  fileId: string;
  personId: string;
  box: DetectedFace["box"];
  userId: string;
}) {
  const file = await getFaceFile(input.fileId, input.treeId);
  await assertPersonInTree(input.treeId, input.personId);

  await db.transaction(async tx => {
    await tx
      .update(fileFaces)
      .set({ personId: null, status: "unassigned", updatedAt: new Date() })
      .where(
        and(
          eq(fileFaces.fileId, input.fileId),
          eq(fileFaces.treeId, input.treeId),
          eq(fileFaces.personId, input.personId),
        ),
      );
    await tx.insert(fileFaces).values({
      treeId: input.treeId,
      fileId: input.fileId,
      personId: input.personId,
      box: clampFaceBox(input.box),
      status: "assigned",
      source: "manual",
      createdBy: input.userId,
    });
    if (input.personId !== file.personId) {
      await tx
        .insert(fileTags)
        .values({
          treeId: input.treeId,
          fileId: input.fileId,
          personId: input.personId,
          source: "face",
          createdBy: input.userId,
        })
        .onConflictDoNothing({
          target: [fileTags.fileId, fileTags.personId],
        });
    }
  });

  await touchTree(input.treeId);
}

/**
 * Called when editors remove people from a photo through the tag picker. The
 * boxes stay, they just stop pointing at anyone.
 */
export async function unassignFacesForPeople(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  input: {
    treeId: string;
    fileId: string;
    personIds: string[];
  },
) {
  if (!input.personIds.length) return;
  await tx
    .update(fileFaces)
    .set({ personId: null, status: "unassigned", updatedAt: new Date() })
    .where(
      and(
        eq(fileFaces.fileId, input.fileId),
        eq(fileFaces.treeId, input.treeId),
        inArray(fileFaces.personId, input.personIds),
      ),
    );
}
