CREATE TABLE "file_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tree_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"name" text DEFAULT 'Album' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "file_groups_id_tree_unique" UNIQUE("id","tree_id")
);
--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "group_id" uuid;--> statement-breakpoint
ALTER TABLE "file_groups" ADD CONSTRAINT "file_groups_tree_id_trees_id_fk" FOREIGN KEY ("tree_id") REFERENCES "public"."trees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_groups" ADD CONSTRAINT "file_groups_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_groups" ADD CONSTRAINT "file_groups_person_fk" FOREIGN KEY ("person_id","tree_id") REFERENCES "public"."people"("id","tree_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "file_groups_tree_idx" ON "file_groups" USING btree ("tree_id");--> statement-breakpoint
CREATE INDEX "file_groups_person_idx" ON "file_groups" USING btree ("person_id");--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_group_fk" FOREIGN KEY ("group_id","tree_id") REFERENCES "public"."file_groups"("id","tree_id") ON DELETE cascade ON UPDATE no action;