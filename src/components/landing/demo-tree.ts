import type {
  GraphFile,
  GraphFileGroup,
  GraphPerson,
  GraphRelationship,
  TreeGraph,
} from "~/api/people-server";
import { exactDateFromISO } from "~/lib/fuzzy-date";

/**
 * A static demo tree for the landing page. It is deliberately separate from the
 * seeded development tree so the marketing page never needs a database or login.
 *
 * The family is a fictional, simplified slice of the Simpsons: three generations
 * around one couple. The Simpsons belongs to its rights holders and this demo is
 * not affiliated with them. Portraits and photographs are original SVG
 * approximations drawn for this page, not official artwork.
 */

type PersonSeed = {
  id: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  birthPlace: string;
  bio: string;
  avatar: string;
};

const personSeeds: PersonSeed[] = [
  {
    id: "abraham",
    firstName: "Abraham",
    lastName: "Simpson",
    birthDate: "1920-03-17",
    birthPlace: "Springfield",
    bio: "Retired safety inspector, war veteran, and the loudest voice at the dinner table. Still keeps a photo of the old farm in his wallet.",
    avatar: "abraham",
  },
  {
    id: "mona",
    firstName: "Mona",
    lastName: "Simpson",
    birthDate: "1923-06-02",
    birthPlace: "Springfield",
    bio: "Homer's mother. Away for long stretches, and writes far more often than she visits.",
    avatar: "mona",
  },
  {
    id: "jackie",
    firstName: "Jackie",
    lastName: "Bouvier",
    birthDate: "1926-11-08",
    birthPlace: "Springfield",
    bio: "Marge's mother. Has an opinion about every haircut and a pearl necklace for every occasion.",
    avatar: "jackie",
  },
  {
    id: "clancy",
    firstName: "Clancy",
    lastName: "Bouvier",
    birthDate: "1924-01-15",
    birthPlace: "Springfield",
    bio: "Marge's father. Quiet, tidy, and happy to let somebody else do the talking.",
    avatar: "clancy",
  },
  {
    id: "homer",
    firstName: "Homer",
    lastName: "Simpson",
    birthDate: "1956-05-12",
    birthPlace: "Springfield",
    bio: "Works at the plant, eats at the kitchen table, and would usually rather be at Moe's.",
    avatar: "homer",
  },
  {
    id: "marge",
    firstName: "Marge",
    lastName: "Simpson",
    birthDate: "1956-10-01",
    birthPlace: "Springfield",
    bio: "Holds the house together. Keeps the photo albums, the birthday calendar, and the peace.",
    avatar: "marge",
  },
  {
    id: "selma",
    firstName: "Selma",
    lastName: "Bouvier",
    birthDate: "1954-05-12",
    birthPlace: "Springfield",
    bio: "Marge's older sister. Works at the DMV, smokes too much, and is fiercely loyal when it counts.",
    avatar: "selma",
  },
  {
    id: "patty",
    firstName: "Patty",
    lastName: "Bouvier",
    birthDate: "1954-05-12",
    birthPlace: "Springfield",
    bio: "Marge's older sister and Selma's twin. Also works at the DMV, and prefers the family at arm's length.",
    avatar: "patty",
  },
  {
    id: "bart",
    firstName: "Bart",
    lastName: "Simpson",
    birthDate: "1980-04-01",
    birthPlace: "Springfield",
    bio: "Fourth grade, skateboard, trouble. The one who will find every unlocked door in any house.",
    avatar: "bart",
  },
  {
    id: "lisa",
    firstName: "Lisa",
    lastName: "Simpson",
    birthDate: "1982-05-09",
    birthPlace: "Springfield",
    bio: "Second grade, saxophone, and a strong opinion about the school budget. Keeps the family honest.",
    avatar: "lisa",
  },
  {
    id: "maggie",
    firstName: "Maggie",
    lastName: "Simpson",
    birthDate: "1988-01-12",
    birthPlace: "Springfield",
    bio: "The youngest. Has said almost nothing, yet somehow sees everything.",
    avatar: "maggie",
  },
];

export const demoPeople: GraphPerson[] = personSeeds.map(person => ({
  id: person.id,
  firstName: person.firstName,
  lastName: person.lastName,
  displayName: `${person.firstName} ${person.lastName}`,
  maidenName: null,
  nickname: null,
  birthDate: exactDateFromISO(person.birthDate),
  deathDate: null,
  birthPlace: person.birthPlace,
  deathPlace: null,
  bio: person.bio,
  avatarFileId: `avatar:${person.avatar}`,
}));

const partnership = (
  id: string,
  source: string,
  target: string,
  status: "married" | "partnered",
  startDate: string | null,
): GraphRelationship => ({
  id,
  type: "partner",
  source,
  target,
  status,
  startDate: exactDateFromISO(startDate),
  endDate: null,
});

const parent = (id: string, source: string, target: string): GraphRelationship => ({
  id,
  type: "parent",
  source,
  target,
  parentType: "biological",
});

export const demoRelationships: GraphRelationship[] = [
  partnership("partner:abraham-mona", "abraham", "mona", "married", "1948-06-12"),
  partnership("partner:clancy-jackie", "clancy", "jackie", "married", "1952-04-20"),
  partnership("partner:homer-marge", "homer", "marge", "married", "1979-06-17"),

  parent("parent:abraham-homer", "abraham", "homer"),
  parent("parent:mona-homer", "mona", "homer"),

  parent("parent:clancy-marge", "clancy", "marge"),
  parent("parent:jackie-marge", "jackie", "marge"),
  parent("parent:clancy-selma", "clancy", "selma"),
  parent("parent:jackie-selma", "jackie", "selma"),
  parent("parent:clancy-patty", "clancy", "patty"),
  parent("parent:jackie-patty", "jackie", "patty"),

  parent("parent:homer-bart", "homer", "bart"),
  parent("parent:marge-bart", "marge", "bart"),
  parent("parent:homer-lisa", "homer", "lisa"),
  parent("parent:marge-lisa", "marge", "lisa"),
  parent("parent:homer-maggie", "homer", "maggie"),
  parent("parent:marge-maggie", "marge", "maggie"),
];

const thumbUrl = (name: string) => `/landing/media/thumbs/${name}.svg`;
const fullUrl = (name: string) => `/landing/media/full/${name}.svg`;

const file = (
  id: string,
  personId: string,
  name: string,
  thumb: string,
  options: { groupId?: string; kind?: "image" | "document"; createdAt?: string } = {},
): GraphFile => ({
  id,
  personId,
  groupId: options.groupId ?? null,
  name,
  mimeType: "image/svg+xml",
  kind: options.kind ?? "image",
  thumbUrl: thumbUrl(thumb),
  width: 360,
  height: 240,
  sizeBytes: 18_000,
  takenAt: exactDateFromISO(options.createdAt ?? null),
  facesScannedAt: null,
  faces: [],
  taggedPersonIds: [],
  createdAt: new Date(options.createdAt ?? "2017-05-12T00:00:00Z"),
  isAvatar: false,
});

export const demoFiles: GraphFile[] = [
  file("file:house", "homer", "742 Evergreen Terrace", "house", { createdAt: "2016-04-10" }),
  file("file:school", "bart", "Springfield Elementary", "school", { createdAt: "2017-09-06" }),
  file("file:notebook", "marge", "Marge's notebook", "notebook", {
    kind: "document",
    createdAt: "2018-02-14",
  }),
  file("file:couch-1", "homer", "Couch gag, I", "couch-1", {
    groupId: "group:couch",
    createdAt: "2018-03-02",
  }),
  file("file:couch-2", "homer", "Couch gag, II", "couch-2", {
    groupId: "group:couch",
    createdAt: "2018-03-02",
  }),
  file("file:couch-3", "homer", "Couch gag, III", "couch-3", {
    groupId: "group:couch",
    createdAt: "2018-03-02",
  }),
];

export const demoGroups: GraphFileGroup[] = [
  {
    id: "group:couch",
    personId: "homer",
    name: "Couch gags",
    count: 3,
    coverFileId: "album:couch",
    coverWidth: 360,
    coverHeight: 240,
    createdAt: new Date("2018-03-02T00:00:00Z"),
  },
];

export const demoTree: TreeGraph = {
  tree: {
    id: "demo:simpsons",
    name: "The Simpsons",
    description:
      "A fictional slice of Springfield. Click a face, open a photo, and follow the branches.",
  },
  role: "viewer",
  viewerPersonId: null,
  people: demoPeople,
  relationships: demoRelationships,
  files: demoFiles,
  groups: demoGroups,
  events: [],
};

const avatarUrls: Record<string, string> = Object.fromEntries(
  personSeeds.map(person => [`avatar:${person.avatar}`, `/landing/people/${person.avatar}.svg`]),
);

const groupCoverUrls: Record<string, string> = {
  "album:couch": thumbUrl("couch-1"),
};

/** Thumbnail resolver passed to GraphView, so demo assets never hit the file API. */
export function demoThumbUrl(fileId: string) {
  return avatarUrls[fileId] ?? groupCoverUrls[fileId] ?? "/landing/people/homer.svg";
}

export function demoPersonAvatar(person: GraphPerson) {
  return person.avatarFileId ? demoThumbUrl(person.avatarFileId) : null;
}

export type DemoMedia = {
  id: string;
  name: string;
  kind: "image" | "document";
  thumbUrl: string;
  fullUrl: string;
  caption: string;
};

const media = (
  id: string,
  name: string,
  asset: string,
  caption: string,
  kind: "image" | "document" = "image",
): DemoMedia => ({
  id,
  name,
  kind,
  thumbUrl: thumbUrl(asset),
  fullUrl: fullUrl(asset),
  caption,
});

export const demoMediaById: Record<string, DemoMedia> = {
  "file:house": media(
    "file:house",
    "742 Evergreen Terrace",
    "house",
    "The house, the hedge, and the driveway that has seen four bicycles and one trampoline.",
  ),
  "file:school": media(
    "file:school",
    "Springfield Elementary",
    "school",
    "The front steps where the bus stops, photographed on a suspiciously quiet morning.",
  ),
  "file:notebook": media(
    "file:notebook",
    "Marge's notebook",
    "notebook",
    "Groceries, birthdays, and the phone numbers of everyone who might need a reminder.",
    "document",
  ),
  "file:couch-1": media(
    "file:couch-1",
    "Couch gag, I",
    "couch-1",
    "The living room as it usually looks: one lamp, one television, and one very worn couch.",
  ),
  "file:couch-2": media(
    "file:couch-2",
    "Couch gag, II",
    "couch-2",
    "The same room, one donut later.",
  ),
  "file:couch-3": media(
    "file:couch-3",
    "Couch gag, III",
    "couch-3",
    "The same room again, decorated for a birthday nobody wrote down.",
  ),
};

export const demoAlbum = {
  id: "group:couch",
  name: "Couch gags",
  files: ["file:couch-1", "file:couch-2", "file:couch-3"].map(id => demoMediaById[id]),
};
