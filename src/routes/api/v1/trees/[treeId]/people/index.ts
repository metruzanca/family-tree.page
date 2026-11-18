import { loadApiTreeData } from "~/server/api/data";
import { mapPeople } from "~/server/api/build";
import { apiHandler, apiJson, apiOptions, requireTokenTree } from "~/server/api/http";
import { pageItems } from "~/server/api/cursor";
import {
  clean,
  includesText,
  parseCursor,
  parseLimit,
  searchParam,
} from "~/server/api/query";
import { publicOrigin } from "~/server/config";

export const GET = apiHandler("people:read", async (event, context) => {
  const tree = requireTokenTree(event, context);
  const limit = parseLimit(searchParam(event.request, "limit"));
  const cursor = parseCursor(searchParam(event.request, "cursor"));
  const query = clean(searchParam(event.request, "q"), 100);
  const surname = clean(searchParam(event.request, "surname"), 80);

  const data = await loadApiTreeData(tree);
  let people = mapPeople(data, publicOrigin());

  if (query) {
    people = people.filter(person =>
      [person.fullName, person.maidenName, person.nickname].some(value =>
        includesText(value, query),
      ),
    );
  }
  if (surname) {
    people = people.filter(
      person =>
        includesText(person.lastName, surname) ||
        includesText(person.maidenName, surname),
    );
  }

  const page = pageItems(people, {
    limit,
    cursor,
    key: person => ({ updatedAt: person.updatedAt, id: person.id }),
  });

  return apiJson({
    data: page.data,
    nextCursor: page.nextCursor,
    hasMore: page.hasMore,
  });
});

export const OPTIONS = apiOptions;
