import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "../db";
import { files, type StoredFile } from "../../../drizzle/schema";

export async function loadApiMediaFile(
  treeId: string,
  fileId: string,
): Promise<StoredFile | null> {
  const rows = await db
    .select()
    .from(files)
    .where(
      and(
        eq(files.id, fileId),
        eq(files.treeId, treeId),
        eq(files.status, "ready"),
        // Inbox files have no person and are not part of the published tree.
        isNotNull(files.personId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}
