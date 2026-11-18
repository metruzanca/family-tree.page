import { loadApiTreeData } from "~/server/api/data";
import { toApiEvent } from "~/server/api/dto";
import { apiHandler, apiJson, apiOptions, requireTokenTree } from "~/server/api/http";
import { pageItems } from "~/server/api/cursor";
import { clean, parseCursor, parseLimit, searchParam } from "~/server/api/query";

export const GET = apiHandler("people:read", async (event, context) => {
  const tree = requireTokenTree(event, context);
  const limit = parseLimit(searchParam(event.request, "limit"));
  const cursor = parseCursor(searchParam(event.request, "cursor"));
  const personId = clean(searchParam(event.request, "personId"), 40);
  const kind = clean(searchParam(event.request, "kind"), 30);

  const data = await loadApiTreeData(tree);
  const events = data.events
    .filter(row =>
      personId ? row.personId === personId || row.partnerPersonId === personId : true,
    )
    .filter(row => (kind ? row.kind === kind : true))
    .map(toApiEvent);

  const page = pageItems(events, {
    limit,
    cursor,
    key: item => ({ updatedAt: item.updatedAt, id: item.id }),
  });

  return apiJson({
    data: page.data,
    nextCursor: page.nextCursor,
    hasMore: page.hasMore,
  });
});

export const OPTIONS = apiOptions;
