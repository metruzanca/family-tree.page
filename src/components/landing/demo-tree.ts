import type {
  GraphFile,
  GraphFileGroup,
  GraphPerson,
  GraphRelationship,
  TreeGraph,
} from "~/api/people-server";
import type { GraphNode } from "~/lib/graph";

/**
 * A static demo tree for the landing page. It is deliberately separate from the
 * seeded development tree so the marketing page never needs a database or login.
 *
 * The family is a fictional slice of the Britannian imperial line from Code Geass.
 * Code Geass belongs to Sunrise and this demo is not affiliated with it. Marianne
 * and Gabrielle are the only consorts named in the source material; Helena and
 * Elise are placeholder names for the unnamed "li" and "el" consorts.
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
    id: "charles",
    firstName: "Charles",
    lastName: "zi Britannia",
    birthDate: "1955-04-14",
    birthPlace: "Pendragon",
    bio: "The 98th Emperor of Britannia. Believes struggle is the only honest teacher, and says so at every dinner.",
    avatar: "charles",
  },
  {
    id: "marianne",
    firstName: "Marianne",
    lastName: "vi Britannia",
    birthDate: "1959-11-03",
    birthPlace: "Pendragon",
    bio: "Empress consort, former Knightmare test pilot, and the only person who can interrupt the Emperor mid-sentence.",
    avatar: "marianne",
  },
  {
    id: "gabrielle",
    firstName: "Gabrielle",
    lastName: "la Britannia",
    birthDate: "1963-02-18",
    birthPlace: "Pendragon",
    bio: "Consort, patron of the arts, and keeper of the palace's impossible guest list.",
    avatar: "gabrielle",
  },
  {
    id: "helena",
    firstName: "Helena",
    lastName: "li Britannia",
    birthDate: "1962-07-09",
    birthPlace: "Pendragon",
    bio: "Consort and mother of Cornelia and Euphemia. Prefers the garden to the throne room.",
    avatar: "helena",
  },
  {
    id: "elise",
    firstName: "Elise",
    lastName: "el Britannia",
    birthDate: "1964-09-26",
    birthPlace: "Pendragon",
    bio: "Consort and mother of Schneizel. Keeps the library in better order than the court.",
    avatar: "elise",
  },
  {
    id: "lelouch",
    firstName: "Lelouch",
    lastName: "vi Britannia",
    birthDate: "2000-12-05",
    birthPlace: "Pendragon",
    bio: "Eleventh prince, exiled to Japan, and a far better chess player than he lets on.",
    avatar: "lelouch",
  },
  {
    id: "nunnally",
    firstName: "Nunnally",
    lastName: "vi Britannia",
    birthDate: "2003-10-25",
    birthPlace: "Pendragon",
    bio: "Ninth princess. Gentle, observant, and the only one who can make Lelouch stop scheming for five minutes.",
    avatar: "nunnally",
  },
  {
    id: "clovis",
    firstName: "Clovis",
    lastName: "la Britannia",
    birthDate: "1994-03-14",
    birthPlace: "Pendragon",
    bio: "Third prince and viceroy. Treats a portrait commission like a state occasion.",
    avatar: "clovis",
  },
  {
    id: "cornelia",
    firstName: "Cornelia",
    lastName: "li Britannia",
    birthDate: "1992-01-04",
    birthPlace: "Pendragon",
    bio: "Second princess and commander. Wins the argument and the war.",
    avatar: "cornelia",
  },
  {
    id: "euphemia",
    firstName: "Euphemia",
    lastName: "li Britannia",
    birthDate: "2001-07-11",
    birthPlace: "Pendragon",
    bio: "Third princess. Kind enough to make the whole court uncomfortable.",
    avatar: "euphemia",
  },
  {
    id: "schneizel",
    firstName: "Schneizel",
    lastName: "el Britannia",
    birthDate: "1991-06-02",
    birthPlace: "Pendragon",
    bio: "Second prince and prime minister. Calm, courteous, and always three moves ahead.",
    avatar: "schneizel",
  },
];

export const demoPeople: GraphPerson[] = personSeeds.map(person => ({
  id: person.id,
  firstName: person.firstName,
  lastName: person.lastName,
  displayName: `${person.firstName} ${person.lastName}`,
  maidenName: null,
  nickname: null,
  birthDate: person.birthDate,
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
): GraphRelationship => ({
  id,
  type: "partner",
  source,
  target,
  status,
  startDate: status === "married" ? "1989-06-17" : null,
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
  partnership("partner:charles-marianne", "charles", "marianne", "married"),
  partnership("partner:charles-gabrielle", "charles", "gabrielle", "partnered"),
  partnership("partner:charles-helena", "charles", "helena", "partnered"),
  partnership("partner:charles-elise", "charles", "elise", "partnered"),

  parent("parent:charles-lelouch", "charles", "lelouch"),
  parent("parent:marianne-lelouch", "marianne", "lelouch"),
  parent("parent:charles-nunnally", "charles", "nunnally"),
  parent("parent:marianne-nunnally", "marianne", "nunnally"),

  parent("parent:charles-clovis", "charles", "clovis"),
  parent("parent:gabrielle-clovis", "gabrielle", "clovis"),

  parent("parent:charles-cornelia", "charles", "cornelia"),
  parent("parent:helena-cornelia", "helena", "cornelia"),
  parent("parent:charles-euphemia", "charles", "euphemia"),
  parent("parent:helena-euphemia", "helena", "euphemia"),

  parent("parent:charles-schneizel", "charles", "schneizel"),
  parent("parent:elise-schneizel", "elise", "schneizel"),
];

const thumbUrl = (name: string) => `/landing/media/thumbs/${name}.jpg`;
const fullUrl = (name: string) => `/landing/media/full/${name}.jpg`;

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
  mimeType: "image/jpeg",
  kind: options.kind ?? "image",
  thumbUrl: thumbUrl(thumb),
  width: 360,
  height: 240,
  sizeBytes: 44_000,
  createdAt: new Date(options.createdAt ?? "2017-05-12T00:00:00Z"),
  isAvatar: false,
});

export const demoFiles: GraphFile[] = [
  file("file:palace", "charles", "The Imperial Palace", "palace", { createdAt: "2017-05-12" }),
  file("file:villa", "lelouch", "Aries Villa", "villa", { createdAt: "2017-05-19" }),
  file("file:letter", "nunnally", "Letter from the Empress", "letter", {
    kind: "document",
    createdAt: "2017-06-01",
  }),
  file("file:court-1", "schneizel", "The Imperial Court, I", "court-1", {
    groupId: "group:court",
    createdAt: "2017-06-02",
  }),
  file("file:court-2", "schneizel", "The Imperial Court, II", "court-2", {
    groupId: "group:court",
    createdAt: "2017-06-02",
  }),
  file("file:court-3", "schneizel", "The Imperial Court, III", "court-3", {
    groupId: "group:court",
    createdAt: "2017-06-02",
  }),
];

export const demoGroups: GraphFileGroup[] = [
  {
    id: "group:court",
    personId: "schneizel",
    name: "The Imperial Court",
    count: 3,
    coverFileId: "album:court",
    coverWidth: 360,
    coverHeight: 240,
    createdAt: new Date("2017-06-02T00:00:00Z"),
  },
];

export const demoTree: TreeGraph = {
  tree: {
    id: "demo:britannia",
    name: "The Britannian family",
    description:
      "A fictional slice of the imperial line. Click a face, open a photo, and follow the branches.",
  },
  role: "viewer",
  people: demoPeople,
  relationships: demoRelationships,
  files: demoFiles,
  groups: demoGroups,
};

const avatarUrls: Record<string, string> = Object.fromEntries(
  personSeeds.map(person => [`avatar:${person.avatar}`, `/landing/people/${person.avatar}.png`]),
);

const groupCoverUrls: Record<string, string> = {
  "album:court": thumbUrl("court-1"),
};

/** Thumbnail resolver passed to GraphView, so demo assets never hit the file API. */
export function demoThumbUrl(fileId: string) {
  return avatarUrls[fileId] ?? groupCoverUrls[fileId] ?? "/landing/people/charles.png";
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
  "file:palace": media(
    "file:palace",
    "The Imperial Palace",
    "palace",
    "The colonnade at Pendragon, photographed before the court moved indoors for the winter.",
  ),
  "file:villa": media(
    "file:villa",
    "Aries Villa",
    "villa",
    "The quiet house and the long walk where Lelouch and Nunnally spent their first years.",
  ),
  "file:letter": media(
    "file:letter",
    "Letter from the Empress",
    "letter",
    "Marianne's note to Nunnally, sealed with the imperial crest and far too much ribbon.",
    "document",
  ),
  "file:court-1": media(
    "file:court-1",
    "The Imperial Court, I",
    "court-1",
    "The ceiling of the east hall, lit for the winter audience.",
  ),
  "file:court-2": media(
    "file:court-2",
    "The Imperial Court, II",
    "court-2",
    "The long gallery, where the court waits before an audience with the Emperor.",
  ),
  "file:court-3": media(
    "file:court-3",
    "The Imperial Court, III",
    "court-3",
    "The crystal chandelier in the antechamber, looking up.",
  ),
};

export const demoAlbum = {
  id: "group:court",
  name: "The Imperial Court",
  files: ["file:court-1", "file:court-2", "file:court-3"].map(id => demoMediaById[id]),
};

/**
 * The landing hero uses a fixed, hand-authored layout instead of the force
 * simulation. A royal family with several consorts is too wide for the generic
 * auto layout to keep labels readable, and a fixed layout renders faster.
 */
const demoPositions: Record<string, { x: number; y: number }> = {
  gabrielle: { x: -250, y: 0 },
  marianne: { x: -125, y: 0 },
  charles: { x: 0, y: 0 },
  helena: { x: 125, y: 0 },
  elise: { x: 250, y: 0 },

  clovis: { x: -250, y: 200 },
  lelouch: { x: -165, y: 200 },
  nunnally: { x: -85, y: 200 },
  cornelia: { x: 85, y: 200 },
  euphemia: { x: 165, y: 200 },
  schneizel: { x: 250, y: 200 },

  "file:file:palace": { x: 0, y: -120 },
  "file:file:villa": { x: -250, y: 320 },
  "file:file:letter": { x: -85, y: 320 },
  "group:group:court": { x: 250, y: 320 },
};

export function demoLayout(node: GraphNode) {
  return demoPositions[node.id] ?? null;
}
