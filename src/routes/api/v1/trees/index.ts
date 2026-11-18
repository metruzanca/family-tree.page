import { loadApiTreeData } from "~/server/api/data";
import { toApiTree } from "~/server/api/dto";
import { apiHandler, apiJson, apiOptions } from "~/server/api/http";

/**
 * A token is bound to one tree, so this list always contains exactly that tree.
 * The endpoint exists so a client can discover its scope without hard-coding an
 * id.
 */
export const GET = apiHandler("tree:read", async (_event, context) => {
  const data = await loadApiTreeData(context.tree);
  return apiJson({
    data: [
      toApiTree(context.tree, {
        people: data.people.length,
        relationships: data.parents.length + data.partnerships.length,
        events: data.events.length,
        media: data.files.filter(file => file.personId !== null).length,
      }),
    ],
  });
});

export const OPTIONS = apiOptions;
