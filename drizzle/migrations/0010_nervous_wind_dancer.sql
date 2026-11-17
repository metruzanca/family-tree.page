ALTER TABLE "tree_members" ADD COLUMN "person_id" uuid;--> statement-breakpoint
ALTER TABLE "tree_members" ADD CONSTRAINT "tree_members_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tree_members_person_idx" ON "tree_members" USING btree ("person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tree_members_person_unique" ON "tree_members" USING btree ("tree_id","person_id") WHERE "tree_members"."person_id" is not null;