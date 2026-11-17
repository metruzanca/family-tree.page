import { sql } from "drizzle-orm";
import type { FuzzyDate } from "../src/lib/fuzzy-date";
import type { ActivityChange } from "../src/lib/activity";
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const treeRole = pgEnum("tree_role", ["owner", "editor", "viewer"]);
export const parentType = pgEnum("parent_type", [
  "biological",
  "adoptive",
  "foster",
  "step",
  "unknown",
]);
export const partnershipStatus = pgEnum("partnership_status", [
  "married",
  "partnered",
  "divorced",
  "separated",
  "widowed",
  "unknown",
]);
export const fileKind = pgEnum("file_kind", ["image", "document", "other"]);
export const fileStatus = pgEnum("file_status", ["uploading", "ready", "failed"]);
export const shareLivingVisibility = pgEnum("share_living_visibility", [
  "hidden",
  "name",
  "full",
]);
export const personEventKind = pgEnum("person_event_kind", [
  "residence",
  "occupation",
  "education",
  "military",
  "immigration",
  "emigration",
  "burial",
  "other",
]);
export const fileTagSource = pgEnum("file_tag_source", ["manual", "face"]);
export const authTokenKind = pgEnum("auth_token_kind", [
  "email_verification",
  "password_reset",
  "email_change",
]);
export const birthdayEmailKind = pgEnum("birthday_email_kind", [
  "week_before",
  "day_before",
  "day_of",
]);
export const usageEventKind = pgEnum("usage_event_kind", [
  "file_uploaded",
  "file_deleted",
  "tree_created",
  "tree_deleted",
  "person_created",
  "person_deleted",
  "upload_rejected_quota",
  "upload_rejected_type",
  "upload_rejected_size",
  "rate_limited",
]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(),
  passwordHash: text("password_hash").notNull(),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  sessionVersion: integer("session_version").notNull().default(0),
  notifyBirthdayWeekBefore: boolean("notify_birthday_week_before")
    .notNull()
    .default(false),
  notifyBirthdayDayBefore: boolean("notify_birthday_day_before")
    .notNull()
    .default(false),
  notifyBirthdayDayOf: boolean("notify_birthday_day_of").notNull().default(true),
  /** Bytes of originals and thumbnails this account may store. */
  storageQuotaBytes: bigint("storage_quota_bytes", { mode: "number" })
    .notNull()
    .default(1073741824),
  /** Lifetime people this account may create. Raise per account for larger users. */
  peopleQuota: integer("people_quota").notNull().default(500),
  peopleCreatedCount: integer("people_created_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const birthdayEmailLog = pgTable(
  "birthday_email_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: birthdayEmailKind("kind").notNull(),
    sentOn: date("sent_on", { mode: "string" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  t => [uniqueIndex("birthday_email_log_unique").on(t.userId, t.kind, t.sentOn)],
);

export const calendarFeeds = pgTable(
  "calendar_feeds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  t => [
    uniqueIndex("calendar_feeds_active_user")
      .on(t.userId)
      .where(sql`${t.revokedAt} is null`),
  ],
);

export const authTokens = pgTable(
  "auth_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    kind: authTokenKind("kind").notNull(),
    /** The address a pending email change will switch to. */
    pendingEmail: text("pending_email"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  t => [index("auth_tokens_user_kind_idx").on(t.userId, t.kind)],
);

export const trees = pgTable("trees", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const treeMembers = pgTable(
  "tree_members",
  {
    treeId: uuid("tree_id")
      .notNull()
      .references(() => trees.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: treeRole("role").notNull().default("viewer"),
    /**
     * The person this member represents inside the tree. Used to centre the
     * focused view, so a cousin sees their own part of the family first.
     */
    personId: uuid("person_id").references(() => people.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  t => [
    primaryKey({ columns: [t.treeId, t.userId], name: "tree_members_pk" }),
    index("tree_members_user_idx").on(t.userId),
    index("tree_members_tree_idx").on(t.treeId),
    index("tree_members_person_idx").on(t.personId),
    uniqueIndex("tree_members_person_unique")
      .on(t.treeId, t.personId)
      .where(sql`${t.personId} is not null`),
  ],
);

export const treeInvites = pgTable(
  "tree_invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    treeId: uuid("tree_id")
      .notNull()
      .references(() => trees.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    role: treeRole("role").notNull().default("editor"),
    email: text("email"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    acceptedBy: uuid("accepted_by").references(() => users.id, { onDelete: "set null" }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  t => [index("tree_invites_tree_idx").on(t.treeId), index("tree_invites_email_idx").on(t.treeId, t.email)],
);

export const people = pgTable(
  "people",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    treeId: uuid("tree_id")
      .notNull()
      .references(() => trees.id, { onDelete: "cascade" }),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull().default(""),
    maidenName: text("maiden_name"),
    nickname: text("nickname"),
    birthDate: jsonb("birth_date").$type<FuzzyDate>(),
    deathDate: jsonb("death_date").$type<FuzzyDate>(),
    birthPlace: text("birth_place"),
    deathPlace: text("death_place"),
    bio: text("bio"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  t => [
    index("people_tree_idx").on(t.treeId),
    unique("people_id_tree_unique").on(t.id, t.treeId),
  ],
);

export const personEvents = pgTable(
  "person_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    treeId: uuid("tree_id")
      .notNull()
      .references(() => trees.id, { onDelete: "cascade" }),
    personId: uuid("person_id").notNull(),
    kind: personEventKind("kind").notNull().default("other"),
    title: text("title"),
    place: text("place"),
    date: jsonb("date").$type<FuzzyDate>(),
    description: text("description"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  t => [
    index("person_events_tree_idx").on(t.treeId),
    index("person_events_person_idx").on(t.personId),
    foreignKey({
      columns: [t.personId, t.treeId],
      foreignColumns: [people.id, people.treeId],
      name: "person_events_person_fk",
    }).onDelete("cascade"),
  ],
);

export const fileGroups = pgTable(
  "file_groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    treeId: uuid("tree_id")
      .notNull()
      .references(() => trees.id, { onDelete: "cascade" }),
    personId: uuid("person_id").notNull(),
    name: text("name").notNull().default("Album"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  t => [
    index("file_groups_tree_idx").on(t.treeId),
    index("file_groups_person_idx").on(t.personId),
    unique("file_groups_id_tree_unique").on(t.id, t.treeId),
    foreignKey({
      columns: [t.personId, t.treeId],
      foreignColumns: [people.id, people.treeId],
      name: "file_groups_person_fk",
    }).onDelete("cascade"),
  ],
);

export const parentChild = pgTable(
  "parent_child",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    treeId: uuid("tree_id")
      .notNull()
      .references(() => trees.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id").notNull(),
    childId: uuid("child_id").notNull(),
    parentType: parentType("parent_type").notNull().default("biological"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  t => [
    uniqueIndex("parent_child_unique").on(t.parentId, t.childId),
    index("parent_child_tree_idx").on(t.treeId),
    foreignKey({
      columns: [t.parentId, t.treeId],
      foreignColumns: [people.id, people.treeId],
      name: "parent_child_parent_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.childId, t.treeId],
      foreignColumns: [people.id, people.treeId],
      name: "parent_child_child_fk",
    }).onDelete("cascade"),
    check("parent_child_not_self", sql`${t.parentId} <> ${t.childId}`),
  ],
);

export const partnerships = pgTable(
  "partnerships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    treeId: uuid("tree_id")
      .notNull()
      .references(() => trees.id, { onDelete: "cascade" }),
    personAId: uuid("person_a_id").notNull(),
    personBId: uuid("person_b_id").notNull(),
    status: partnershipStatus("status").notNull().default("partnered"),
    startDate: jsonb("start_date").$type<FuzzyDate>(),
    endDate: jsonb("end_date").$type<FuzzyDate>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  t => [
    uniqueIndex("partnerships_unique").on(t.personAId, t.personBId),
    index("partnerships_tree_idx").on(t.treeId),
    foreignKey({
      columns: [t.personAId, t.treeId],
      foreignColumns: [people.id, people.treeId],
      name: "partnerships_a_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.personBId, t.treeId],
      foreignColumns: [people.id, people.treeId],
      name: "partnerships_b_fk",
    }).onDelete("cascade"),
    check("partnerships_order", sql`${t.personAId} < ${t.personBId}`),
  ],
);

export const files = pgTable(
  "files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    treeId: uuid("tree_id")
      .notNull()
      .references(() => trees.id, { onDelete: "cascade" }),
    personId: uuid("person_id").notNull(),
    groupId: uuid("group_id"),
    storageKey: text("storage_key").notNull().unique(),
    thumbKey: text("thumb_key"),
    thumbMime: text("thumb_mime"),
    originalName: text("original_name").notNull(),
    mimeType: text("mime_type").notNull(),
    kind: fileKind("kind").notNull().default("other"),
    sizeBytes: integer("size_bytes").notNull().default(0),
    thumbSizeBytes: integer("thumb_size_bytes"),
    width: integer("width"),
    height: integer("height"),
    takenAt: jsonb("taken_at").$type<FuzzyDate>(),
    status: fileStatus("status").notNull().default("uploading"),
    isAvatar: boolean("is_avatar").notNull().default(false),
    uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  t => [
    index("files_tree_idx").on(t.treeId),
    index("files_person_idx").on(t.personId),
    foreignKey({
      columns: [t.personId, t.treeId],
      foreignColumns: [people.id, people.treeId],
      name: "files_person_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.groupId, t.treeId],
      foreignColumns: [fileGroups.id, fileGroups.treeId],
      name: "files_group_fk",
    }).onDelete("cascade"),
    uniqueIndex("files_one_avatar_per_person")
      .on(t.personId)
      .where(sql`${t.isAvatar} = true`),
    unique("files_id_tree_unique").on(t.id, t.treeId),
  ],
);

export type FaceBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export const fileTags = pgTable(
  "file_tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    treeId: uuid("tree_id")
      .notNull()
      .references(() => trees.id, { onDelete: "cascade" }),
    fileId: uuid("file_id").notNull(),
    personId: uuid("person_id").notNull(),
    source: fileTagSource("source").notNull().default("manual"),
    faceBox: jsonb("face_box").$type<FaceBox>(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  t => [
    uniqueIndex("file_tags_file_person_unique").on(t.fileId, t.personId),
    index("file_tags_file_idx").on(t.fileId),
    index("file_tags_person_idx").on(t.personId),
    index("file_tags_tree_idx").on(t.treeId),
    foreignKey({
      columns: [t.fileId, t.treeId],
      foreignColumns: [files.id, files.treeId],
      name: "file_tags_file_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.personId, t.treeId],
      foreignColumns: [people.id, people.treeId],
      name: "file_tags_person_fk",
    }).onDelete("cascade"),
  ],
);

/**
 * Read-only links to a tree. Tokens are stored hashed so a database leak does
 * not expose working URLs. Living people are hidden or reduced to names unless
 * the owner explicitly opts into full details.
 */
export const treeShareLinks = pgTable(
  "tree_share_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    treeId: uuid("tree_id")
      .notNull()
      .references(() => trees.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    label: text("label").notNull().default("Shared tree"),
    livingVisibility: shareLivingVisibility("living_visibility")
      .notNull()
      .default("name"),
    includeMedia: boolean("include_media").notNull().default(false),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastAccessedAt: timestamp("last_accessed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  t => [index("tree_share_links_tree_idx").on(t.treeId)],
);

/**
 * Human-readable history of tree changes. Actor names are snapshotted so the
 * history survives an account deletion, and entity ids are intentionally not
 * foreign keys so a deleted person still keeps their timeline entry.
 */
export const treeActivity = pgTable(
  "tree_activity",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    treeId: uuid("tree_id")
      .notNull()
      .references(() => trees.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    actorName: text("actor_name").notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id"),
    personId: uuid("person_id"),
    summary: text("summary").notNull(),
    changes: jsonb("changes").$type<ActivityChange[]>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  t => [
    index("tree_activity_tree_created_idx").on(t.treeId, t.createdAt),
    index("tree_activity_tree_person_created_idx").on(t.treeId, t.personId, t.createdAt),
  ],
);

/**
 * Append-only counters used for quotas and abuse detection.
 *
 * The table deliberately holds no file names, no email addresses, and no
 * content. It is pruned after 90 days.
 */
export const usageEvents = pgTable(
  "usage_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: usageEventKind("kind").notNull(),
    bytes: bigint("bytes", { mode: "number" }).notNull().default(0),
    itemCount: integer("item_count").notNull().default(0),
    treeId: uuid("tree_id").references(() => trees.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  t => [
    index("usage_events_user_created_idx").on(t.userId, t.createdAt),
    index("usage_events_kind_created_idx").on(t.kind, t.createdAt),
  ],
);

/**
 * Claim markers for scheduled jobs that must not repeat after a restart or on
 * a second replica. The abuse digest inserts or updates its row atomically.
 */
export const jobRuns = pgTable("job_runs", {
  name: text("name").primaryKey(),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type CalendarFeed = typeof calendarFeeds.$inferSelect;
export type AuthToken = typeof authTokens.$inferSelect;
export type Tree = typeof trees.$inferSelect;
export type TreeMember = typeof treeMembers.$inferSelect;
export type TreeInvite = typeof treeInvites.$inferSelect;
export type Person = typeof people.$inferSelect;
export type PersonEvent = typeof personEvents.$inferSelect;
export type ParentChild = typeof parentChild.$inferSelect;
export type Partnership = typeof partnerships.$inferSelect;
export type FileGroup = typeof fileGroups.$inferSelect;
export type StoredFile = typeof files.$inferSelect;
export type FileTag = typeof fileTags.$inferSelect;
export type UsageEvent = typeof usageEvents.$inferSelect;
export type TreeActivity = typeof treeActivity.$inferSelect;
export type TreeShareLink = typeof treeShareLinks.$inferSelect;
