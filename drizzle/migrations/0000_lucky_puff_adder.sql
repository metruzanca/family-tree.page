CREATE TYPE "public"."file_kind" AS ENUM('image', 'document', 'other');--> statement-breakpoint
CREATE TYPE "public"."file_status" AS ENUM('uploading', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."parent_type" AS ENUM('biological', 'adoptive', 'foster', 'step', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."partnership_status" AS ENUM('married', 'partnered', 'divorced', 'separated', 'widowed', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."tree_role" AS ENUM('owner', 'editor', 'viewer');--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tree_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"thumb_key" text,
	"thumb_mime" text,
	"original_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"kind" "file_kind" DEFAULT 'other' NOT NULL,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"width" integer,
	"height" integer,
	"status" "file_status" DEFAULT 'uploading' NOT NULL,
	"is_avatar" boolean DEFAULT false NOT NULL,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "files_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
CREATE TABLE "parent_child" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tree_id" uuid NOT NULL,
	"parent_id" uuid NOT NULL,
	"child_id" uuid NOT NULL,
	"parent_type" "parent_type" DEFAULT 'biological' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "parent_child_not_self" CHECK ("parent_child"."parent_id" <> "parent_child"."child_id")
);
--> statement-breakpoint
CREATE TABLE "partnerships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tree_id" uuid NOT NULL,
	"person_a_id" uuid NOT NULL,
	"person_b_id" uuid NOT NULL,
	"status" "partnership_status" DEFAULT 'partnered' NOT NULL,
	"start_date" date,
	"end_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "partnerships_order" CHECK ("partnerships"."person_a_id" < "partnerships"."person_b_id")
);
--> statement-breakpoint
CREATE TABLE "people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tree_id" uuid NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text DEFAULT '' NOT NULL,
	"maiden_name" text,
	"nickname" text,
	"birth_date" date,
	"death_date" date,
	"birth_place" text,
	"death_place" text,
	"bio" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "people_id_tree_unique" UNIQUE("id","tree_id")
);
--> statement-breakpoint
CREATE TABLE "tree_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tree_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"role" "tree_role" DEFAULT 'editor' NOT NULL,
	"created_by" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_by" uuid,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tree_invites_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "tree_members" (
	"tree_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "tree_role" DEFAULT 'viewer' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tree_members_pk" PRIMARY KEY("tree_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "trees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_tree_id_trees_id_fk" FOREIGN KEY ("tree_id") REFERENCES "public"."trees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_person_fk" FOREIGN KEY ("person_id","tree_id") REFERENCES "public"."people"("id","tree_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parent_child" ADD CONSTRAINT "parent_child_tree_id_trees_id_fk" FOREIGN KEY ("tree_id") REFERENCES "public"."trees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parent_child" ADD CONSTRAINT "parent_child_parent_fk" FOREIGN KEY ("parent_id","tree_id") REFERENCES "public"."people"("id","tree_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parent_child" ADD CONSTRAINT "parent_child_child_fk" FOREIGN KEY ("child_id","tree_id") REFERENCES "public"."people"("id","tree_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partnerships" ADD CONSTRAINT "partnerships_tree_id_trees_id_fk" FOREIGN KEY ("tree_id") REFERENCES "public"."trees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partnerships" ADD CONSTRAINT "partnerships_a_fk" FOREIGN KEY ("person_a_id","tree_id") REFERENCES "public"."people"("id","tree_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partnerships" ADD CONSTRAINT "partnerships_b_fk" FOREIGN KEY ("person_b_id","tree_id") REFERENCES "public"."people"("id","tree_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_tree_id_trees_id_fk" FOREIGN KEY ("tree_id") REFERENCES "public"."trees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tree_invites" ADD CONSTRAINT "tree_invites_tree_id_trees_id_fk" FOREIGN KEY ("tree_id") REFERENCES "public"."trees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tree_invites" ADD CONSTRAINT "tree_invites_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tree_invites" ADD CONSTRAINT "tree_invites_accepted_by_users_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tree_members" ADD CONSTRAINT "tree_members_tree_id_trees_id_fk" FOREIGN KEY ("tree_id") REFERENCES "public"."trees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tree_members" ADD CONSTRAINT "tree_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trees" ADD CONSTRAINT "trees_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "files_tree_idx" ON "files" USING btree ("tree_id");--> statement-breakpoint
CREATE INDEX "files_person_idx" ON "files" USING btree ("person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "files_one_avatar_per_person" ON "files" USING btree ("person_id") WHERE "files"."is_avatar" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "parent_child_unique" ON "parent_child" USING btree ("parent_id","child_id");--> statement-breakpoint
CREATE INDEX "parent_child_tree_idx" ON "parent_child" USING btree ("tree_id");--> statement-breakpoint
CREATE UNIQUE INDEX "partnerships_unique" ON "partnerships" USING btree ("person_a_id","person_b_id");--> statement-breakpoint
CREATE INDEX "partnerships_tree_idx" ON "partnerships" USING btree ("tree_id");--> statement-breakpoint
CREATE INDEX "people_tree_idx" ON "people" USING btree ("tree_id");--> statement-breakpoint
CREATE INDEX "tree_invites_tree_idx" ON "tree_invites" USING btree ("tree_id");--> statement-breakpoint
CREATE INDEX "tree_members_user_idx" ON "tree_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tree_members_tree_idx" ON "tree_members" USING btree ("tree_id");