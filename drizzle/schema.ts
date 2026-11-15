import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
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

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  t => [
    primaryKey({ columns: [t.treeId, t.userId], name: "tree_members_pk" }),
    index("tree_members_user_idx").on(t.userId),
    index("tree_members_tree_idx").on(t.treeId),
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
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedBy: uuid("accepted_by").references(() => users.id, { onDelete: "set null" }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  t => [index("tree_invites_tree_idx").on(t.treeId)],
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
    birthDate: date("birth_date", { mode: "string" }),
    deathDate: date("death_date", { mode: "string" }),
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
    startDate: date("start_date", { mode: "string" }),
    endDate: date("end_date", { mode: "string" }),
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
    width: integer("width"),
    height: integer("height"),
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
  ],
);

export type User = typeof users.$inferSelect;
export type Tree = typeof trees.$inferSelect;
export type TreeMember = typeof treeMembers.$inferSelect;
export type Person = typeof people.$inferSelect;
export type ParentChild = typeof parentChild.$inferSelect;
export type Partnership = typeof partnerships.$inferSelect;
export type FileGroup = typeof fileGroups.$inferSelect;
export type StoredFile = typeof files.$inferSelect;
