CREATE TYPE "public"."file_face_status" AS ENUM('unassigned', 'assigned', 'ignored');--> statement-breakpoint
CREATE TABLE "file_faces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tree_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"person_id" uuid,
	"box" jsonb NOT NULL,
	"confidence" real,
	"status" "file_face_status" DEFAULT 'unassigned' NOT NULL,
	"source" "file_tag_source" DEFAULT 'face' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "faces_scanned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "file_faces" ADD CONSTRAINT "file_faces_tree_id_trees_id_fk" FOREIGN KEY ("tree_id") REFERENCES "public"."trees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_faces" ADD CONSTRAINT "file_faces_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_faces" ADD CONSTRAINT "file_faces_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_faces" ADD CONSTRAINT "file_faces_file_fk" FOREIGN KEY ("file_id","tree_id") REFERENCES "public"."files"("id","tree_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "file_faces_file_idx" ON "file_faces" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "file_faces_person_idx" ON "file_faces" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "file_faces_tree_idx" ON "file_faces" USING btree ("tree_id");--> statement-breakpoint
CREATE UNIQUE INDEX "file_faces_person_unique" ON "file_faces" USING btree ("file_id","person_id") WHERE "file_faces"."person_id" is not null;--> statement-breakpoint
ALTER TABLE "file_tags" DROP COLUMN "face_box";