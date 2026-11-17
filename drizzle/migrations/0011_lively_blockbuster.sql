CREATE TABLE "tree_activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tree_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"actor_name" text NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"person_id" uuid,
	"summary" text NOT NULL,
	"changes" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tree_activity" ADD CONSTRAINT "tree_activity_tree_id_trees_id_fk" FOREIGN KEY ("tree_id") REFERENCES "public"."trees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tree_activity" ADD CONSTRAINT "tree_activity_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tree_activity_tree_created_idx" ON "tree_activity" USING btree ("tree_id","created_at");--> statement-breakpoint
CREATE INDEX "tree_activity_tree_person_created_idx" ON "tree_activity" USING btree ("tree_id","person_id","created_at");