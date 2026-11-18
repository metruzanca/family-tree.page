import { loadApiTreeData } from "~/server/api/data";
import { buildPersonDetail } from "~/server/api/build";
import {
  apiHandler,
  apiJson,
  apiOptions,
  notFound,
  requireTokenTree,
} from "~/server/api/http";
import { publicOrigin } from "~/server/config";
import { isUuid } from "~/server/ids";

export const GET = apiHandler("people:read", async (event, context) => {
  const tree = requireTokenTree(event, context);
  const personId = event.params.personId;
  if (!personId || !isUuid(personId)) {
    throw notFound("That person is not in this tree.");
  }

  const data = await loadApiTreeData(tree);
  const detail = buildPersonDetail(data, personId, publicOrigin());
  if (!detail) throw notFound("That person is not in this tree.");
  return apiJson(detail);
});

export const OPTIONS = apiOptions;
