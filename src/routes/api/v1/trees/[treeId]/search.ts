import { fuzzySortValue } from "~/lib/fuzzy-date";
import type { StoredFile } from "../../../../../../drizzle/schema";
import { loadApiTreeData } from "~/server/api/data";
import { mapPeople } from "~/server/api/build";
import { toApiEvent, toApiMedia } from "~/server/api/dto";
import {
  ApiError,
  apiHandler,
  apiJson,
  apiOptions,
  requireTokenTree,
} from "~/server/api/http";
import {
  clean,
  includesText,
  parseLimit,
  searchParam,
} from "~/server/api/query";
import { publicOrigin } from "~/server/config";

export const GET = apiHandler("people:read", async (event, context) => {
  const tree = requireTokenTree(event, context);
  const query = clean(searchParam(event.request, "q"), 100);
  const place = clean(searchParam(event.request, "place"), 100);
  const surname = clean(searchParam(event.request, "surname"), 80);
  const limit = parseLimit(searchParam(event.request, "limit"), 20, 100);

  if (!query && !place && !surname) {
    throw new ApiError(
      400,
      "Provide q, place, or surname to search.",
      "missing_query",
    );
  }

  const data = await loadApiTreeData(tree);
  const origin = publicOrigin();
  const people = mapPeople(data, origin);
  const personRows = new Map(data.people.map(row => [row.id, row]));

  const matchedPeople = people.filter(person => {
    if (query) {
      const hit = [
        person.fullName,
        person.maidenName,
        person.nickname,
        person.bio,
      ].some(value => includesText(value, query));
      if (!hit) return false;
    }
    if (place) {
      const hit =
        includesText(person.birthPlace, place) ||
        includesText(person.deathPlace, place);
      if (!hit) return false;
    }
    if (surname) {
      const hit =
        includesText(person.lastName, surname) ||
        includesText(person.maidenName, surname);
      if (!hit) return false;
    }
    return true;
  });
  const matchedPersonIds = new Set(matchedPeople.map(person => person.id));

  const matchedEvents = data.events
    .filter(event => {
      if (surname && !matchedPersonIds.has(event.personId)) return false;
      if (query) {
        const hit = [event.title, event.place, event.description].some(value =>
          includesText(value, query),
        );
        if (!hit) return false;
      }
      if (place && !includesText(event.place, place)) return false;
      return true;
    })
    .map(event => ({
      ...toApiEvent(event),
      personName: personRows.get(event.personId)
        ? `${personRows.get(event.personId)!.firstName} ${personRows.get(event.personId)!.lastName}`.trim()
        : null,
    }))
    .sort(
      (left, right) =>
        fuzzySortValue(left.date) - fuzzySortValue(right.date) ||
        left.id.localeCompare(right.id),
    );

  const tagsByFile = new Map<string, string[]>();
  for (const tag of data.tags) {
    tagsByFile.set(tag.fileId, [...(tagsByFile.get(tag.fileId) ?? []), tag.personId]);
  }

  const matchedMedia = data.files
    .filter((file): file is StoredFile & { personId: string } => {
      if (!file.personId) return false;
      if ((surname || place) && !matchedPersonIds.has(file.personId)) return false;
      if (query && !includesText(file.originalName, query)) return false;
      return true;
    })
    .map(file => ({
      ...toApiMedia(file, {
        origin,
        treeId: tree.id,
        taggedPersonIds: tagsByFile.get(file.id) ?? [],
      }),
      personName: personRows.get(file.personId)
        ? `${personRows.get(file.personId)!.firstName} ${personRows.get(file.personId)!.lastName}`.trim()
        : null,
    }));

  return apiJson({
    query: { q: query || null, place: place || null, surname: surname || null },
    people: matchedPeople.slice(0, limit),
    events: matchedEvents.slice(0, limit),
    media: matchedMedia.slice(0, limit),
    counts: {
      people: matchedPeople.length,
      events: matchedEvents.length,
      media: matchedMedia.length,
    },
  });
});

export const OPTIONS = apiOptions;
