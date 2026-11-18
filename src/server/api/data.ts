import { and, eq } from "drizzle-orm";
import { db } from "../db";
import {
  fileTags,
  files,
  parentChild,
  partnerships,
  people,
  personEvents,
} from "../../../drizzle/schema";
import type { ApiTreeData } from "./types";
import type { Tree } from "../../../drizzle/schema";

/**
 * The v1 API is built for family-scale trees, which the account quota caps at
 * hundreds of people, so a request loads one consistent snapshot instead of
 * stitching paginated database queries together.
 */
export async function loadApiTreeData(tree: Tree): Promise<ApiTreeData> {
  const [peopleRows, parentRows, partnerRows, eventRows, fileRows, tagRows] =
    await Promise.all([
      db.select().from(people).where(eq(people.treeId, tree.id)),
      db.select().from(parentChild).where(eq(parentChild.treeId, tree.id)),
      db.select().from(partnerships).where(eq(partnerships.treeId, tree.id)),
      db.select().from(personEvents).where(eq(personEvents.treeId, tree.id)),
      db
        .select()
        .from(files)
        .where(and(eq(files.treeId, tree.id), eq(files.status, "ready"))),
      db
        .select({ fileId: fileTags.fileId, personId: fileTags.personId })
        .from(fileTags)
        .where(eq(fileTags.treeId, tree.id)),
    ]);

  return {
    tree,
    people: peopleRows,
    parents: parentRows,
    partnerships: partnerRows,
    events: eventRows,
    files: fileRows,
    tags: tagRows,
  };
}
