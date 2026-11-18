import type { GraphFile, GraphFileGroup, GraphPerson } from "~/api/people-server";

/** `all`, the tree inbox, or a person id. Person ids are UUIDs. */
export type MediaLocation = "all" | "inbox" | (string & {});

export type MediaFilterOptions = {
  location?: MediaLocation;
  query?: string;
};

export function isInboxFile(file: Pick<GraphFile, "personId">) {
  return file.personId === null;
}

export function filterMediaFiles(files: GraphFile[], options: MediaFilterOptions = {}) {
  const location = options.location ?? "all";
  const term = options.query?.trim().toLowerCase() ?? "";

  return files.filter(file => {
    if (file.kind !== "image") return false;
    if (location === "inbox") {
      if (file.personId !== null) return false;
    } else if (location !== "all" && file.personId !== location) {
      return false;
    }
    if (term && !file.name.toLowerCase().includes(term)) return false;
    return true;
  });
}

/** The year a photo belongs to, taken from the photo date when known. */
export function mediaYear(file: GraphFile): number | null {
  return file.takenAt?.start.year ?? file.createdAt.getUTCFullYear();
}

/** Newest first, using the date taken when it is known. */
export function mediaSortTime(file: GraphFile): number {
  const taken = file.takenAt?.start;
  if (taken?.year) {
    return Date.UTC(taken.year, (taken.month ?? 1) - 1, taken.day ?? 1);
  }
  return file.createdAt.getTime();
}

export function sortMediaFiles(files: GraphFile[]): GraphFile[] {
  return [...files].sort(
    (left, right) =>
      mediaSortTime(right) - mediaSortTime(left) || right.id.localeCompare(left.id),
  );
}

export type MediaYearGroup = {
  year: number | null;
  files: GraphFile[];
};

export function groupMediaByYear(files: GraphFile[]): MediaYearGroup[] {
  const groups = new Map<number | null, GraphFile[]>();
  for (const file of files) {
    const year = mediaYear(file);
    groups.set(year, [...(groups.get(year) ?? []), file]);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => {
      if (left === null) return 1;
      if (right === null) return -1;
      return right - left;
    })
    .map(([year, groupFiles]) => ({ year, files: sortMediaFiles(groupFiles) }));
}

export type MediaFolder = {
  person: GraphPerson;
  count: number;
};

export function mediaFolders(
  people: GraphPerson[],
  files: GraphFile[],
): MediaFolder[] {
  const counts = new Map<string, number>();
  for (const file of files) {
    if (file.kind !== "image" || !file.personId) continue;
    counts.set(file.personId, (counts.get(file.personId) ?? 0) + 1);
  }
  return people
    .map(person => ({ person, count: counts.get(person.id) ?? 0 }))
    .sort((left, right) => left.person.displayName.localeCompare(right.person.displayName));
}

export function inboxFiles(files: GraphFile[]) {
  return files.filter(file => file.kind === "image" && file.personId === null);
}

export function filesForPerson(files: GraphFile[], personId: string) {
  return files.filter(file => file.kind === "image" && file.personId === personId);
}

/** Photos filed under a person that are not part of an album. */
export function looseFilesForPerson(files: GraphFile[], personId: string) {
  return files.filter(
    file => file.kind === "image" && file.personId === personId && !file.groupId,
  );
}

export function albumFiles(files: GraphFile[], groupId: string) {
  return files.filter(file => file.kind === "image" && file.groupId === groupId);
}

/** Albums that still have at least one photo, newest first. */
export function personAlbums(groups: GraphFileGroup[], files: GraphFile[], personId: string) {
  return groups
    .filter(
      group =>
        group.personId === personId &&
        files.some(file => file.kind === "image" && file.groupId === group.id),
    )
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
}
