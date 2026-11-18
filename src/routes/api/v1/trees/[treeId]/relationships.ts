import { loadApiTreeData } from "~/server/api/data";
import { buildRelationships } from "~/server/api/build";
import {
  apiHandler,
  apiJson,
  apiOptions,
  etagMatches,
  notModified,
  requireTokenTree,
  weakEtag,
} from "~/server/api/http";
import { clean, searchParam } from "~/server/api/query";

export const GET = apiHandler("people:read", async (event, context) => {
  const tree = requireTokenTree(event, context);
  const type = clean(searchParam(event.request, "type"), 20);
  const data = await loadApiTreeData(tree);
  const relationships = buildRelationships(data).filter(relationship =>
    type === "parent" || type === "partner" ? relationship.type === type : true,
  );
  const etag = weakEtag(
    tree.updatedAt,
    data.parents.length,
    data.partnerships.length,
    type,
  );
  if (etagMatches(event.request, etag)) return notModified(etag);
  return apiJson(
    { data: relationships },
    { headers: { ETag: etag, "Cache-Control": "private, no-cache" } },
  );
});

export const OPTIONS = apiOptions;
