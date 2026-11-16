CREATE TYPE "public"."file_tag_source" AS ENUM('manual', 'face');--> statement-breakpoint
CREATE TABLE "file_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tree_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"source" "file_tag_source" DEFAULT 'manual' NOT NULL,
	"face_box" jsonb,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "taken_at" date;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_id_tree_unique" UNIQUE("id","tree_id");--> statement-breakpoint
ALTER TABLE "file_tags" ADD CONSTRAINT "file_tags_tree_id_trees_id_fk" FOREIGN KEY ("tree_id") REFERENCES "public"."trees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_tags" ADD CONSTRAINT "file_tags_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_tags" ADD CONSTRAINT "file_tags_file_fk" FOREIGN KEY ("file_id","tree_id") REFERENCES "public"."files"("id","tree_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_tags" ADD CONSTRAINT "file_tags_person_fk" FOREIGN KEY ("person_id","tree_id") REFERENCES "public"."people"("id","tree_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "file_tags_file_person_unique" ON "file_tags" USING btree ("file_id","person_id");--> statement-breakpoint
CREATE INDEX "file_tags_file_idx" ON "file_tags" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "file_tags_person_idx" ON "file_tags" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "file_tags_tree_idx" ON "file_tags" USING btree ("tree_id");