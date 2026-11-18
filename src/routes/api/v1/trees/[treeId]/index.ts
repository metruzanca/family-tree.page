import { loadApiTreeData } from "~/server/api/data";
import { toApiTree } from "~/server/api/dto";
import {
  apiHandler,
  apiJson,
  apiOptions,
  etagMatches,
  notModified,
  requireTokenTree,
  weakEtag,
} from "~/server/api/http";

export const GET = apiHandler("tree:read", async (event, context) => {
  const tree = requireTokenTree(event, context);
  const data = await loadApiTreeData(tree);
  const counts = {
    people: data.people.length,
    relationships: data.parents.length + data.partnerships.length,
    events: data.events.length,
    media: data.files.filter(file => file.personId !== null).length,
  };
  const etag = weakEtag(
    tree.updatedAt,
    counts.people,
    counts.relationships,
    counts.events,
    counts.media,
  );
  if (etagMatches(event.request, etag)) return notModified(etag);
  return apiJson(toApiTree(tree, counts), {
    headers: {
      ETag: etag,
      "Cache-Control": "private, no-cache",
    },
  });
});

export const OPTIONS = apiOptions;
