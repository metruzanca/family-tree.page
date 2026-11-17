import type {
  GraphPerson,
  TreeGraph,
  TreeGraphData,
} from "~/api/people-server";

export type LivingVisibility = "hidden" | "name" | "full";

export type SharedGraphOptions = {
  livingVisibility: LivingVisibility;
  includeMedia: boolean;
  /** Builds a share-scoped thumbnail URL for a file. */
  thumbUrl: (fileId: string) => string;
};

/**
 * A person is considered living unless the tree records a death date. This is
 * deliberately conservative: an unknown death date never exposes someone.
 */
export function isLivingPerson(
  person: Pick<GraphPerson, "deathDate">,
): boolean {
  return !person.deathDate;
}

export function sanitizeSharedGraph(
  graph: TreeGraphData,
  options: SharedGraphOptions,
): TreeGraph {
  const livingIds = new Set(
    graph.people.filter(person => isLivingPerson(person)).map(person => person.id),
  );
  const hiddenIds =
    options.livingVisibility === "hidden" ? new Set(livingIds) : new Set<string>();

  const people = graph.people
    .filter(person => !hiddenIds.has(person.id))
    .map(person => {
      const isLiving = livingIds.has(person.id);
      if (options.livingVisibility === "name" && isLiving) {
        return {
          ...person,
          birthDate: null,
          deathDate: null,
          birthPlace: null,
          deathPlace: null,
          bio: null,
          avatarFileId: null,
        };
      }
      if (!options.includeMedia) {
        return { ...person, avatarFileId: null };
      }
      return person;
    });

  const visiblePersonIds = new Set(people.map(person => person.id));
  const canShowLivingMedia = (personId: string) =>
    options.livingVisibility === "full" || !livingIds.has(personId);

  const relationships = graph.relationships.filter(
    relationship =>
      visiblePersonIds.has(relationship.source) &&
      visiblePersonIds.has(relationship.target),
  );

  const files = options.includeMedia
    ? graph.files
        .filter(
          file =>
            visiblePersonIds.has(file.personId) &&
            file.kind === "image" &&
            canShowLivingMedia(file.personId),
        )
        .map(file => ({
          ...file,
          thumbUrl: options.thumbUrl(file.id),
          // Face boxes point at people. Shared graphs never carry them.
          faces: [],
          facesScannedAt: null,
          taggedPersonIds: file.taggedPersonIds.filter(
            personId =>
              visiblePersonIds.has(personId) && canShowLivingMedia(personId),
          ),
        }))
    : [];

  const visibleFileIds = new Set(files.map(file => file.id));
  const groups = options.includeMedia
    ? graph.groups
        .filter(
          group =>
            visiblePersonIds.has(group.personId) &&
            canShowLivingMedia(group.personId) &&
            files.some(file => file.groupId === group.id),
        )
        .map(group => {
          const groupFiles = files.filter(file => file.groupId === group.id);
          const cover =
            groupFiles.find(file => file.id === group.coverFileId) ?? groupFiles[0];
          return {
            ...group,
            count: groupFiles.length,
            coverFileId:
              cover && visibleFileIds.has(cover.id) ? cover.id : null,
            coverWidth: cover?.width ?? null,
            coverHeight: cover?.height ?? null,
          };
        })
    : [];

  const events = graph.events.filter(
    event =>
      visiblePersonIds.has(event.personId) &&
      (options.livingVisibility === "full" || !livingIds.has(event.personId)),
  );

  return {
    tree: graph.tree,
    role: "viewer",
    viewerPersonId: null,
    people,
    relationships,
    files,
    groups,
    events,
  };
}
