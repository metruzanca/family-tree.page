import { and, asc, eq, gt } from "drizzle-orm";
import { db } from "~/server/db";
import { treeActivity } from "../../../../../../drizzle/schema";
import { apiHandler, apiJson, apiOptions, requireTokenTree } from "~/server/api/http";
import { pageItems } from "~/server/api/cursor";
import { parseCursor, parseLimit, parseSince, searchParam } from "~/server/api/query";

function operationFor(action: string) {
  if (action.endsWith(".created") || action.endsWith(".uploaded")) return "create";
  if (action.endsWith(".deleted") || action.endsWith(".removed")) return "delete";
  if (action.endsWith(".restored")) return "restore";
  return "update";
}

/**
 * A polling feed derived from the human activity log. It is a change log, not
 * a byte-level diff: clients should fetch /export.json when they need a full
 * consistent snapshot.
 */
export const GET = apiHandler("changes:read", async (event, context) => {
  const tree = requireTokenTree(event, context);
  const limit = parseLimit(searchParam(event.request, "limit"), 100, 500);
  const cursor = parseCursor(searchParam(event.request, "cursor"));
  const since = parseSince(searchParam(event.request, "since"));

  const rows = await db
    .select()
    .from(treeActivity)
    .where(
      and(
        eq(treeActivity.treeId, tree.id),
        since ? gt(treeActivity.createdAt, since) : undefined,
      ),
    )
    .orderBy(asc(treeActivity.createdAt), asc(treeActivity.id));

  const changes = rows.map(row => ({
    id: row.id,
    action: row.action,
    op: operationFor(row.action),
    entityType: row.entityType,
    entityId: row.entityId,
    personId: row.personId,
    actorName: row.actorName,
    summary: row.summary,
    createdAt: row.createdAt.toISOString(),
  }));

  const page = pageItems(changes, {
    limit,
    cursor,
    key: change => ({ updatedAt: change.createdAt, id: change.id }),
  });

  return apiJson({
    since: since?.toISOString() ?? null,
    data: page.data,
    nextCursor: page.nextCursor,
    hasMore: page.hasMore,
  });
});

export const OPTIONS = apiOptions;
