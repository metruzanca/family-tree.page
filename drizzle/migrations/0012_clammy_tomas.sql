CREATE TYPE "public"."share_living_visibility" AS ENUM('hidden', 'name', 'full');--> statement-breakpoint
CREATE TABLE "tree_share_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tree_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"label" text DEFAULT 'Shared tree' NOT NULL,
	"living_visibility" "share_living_visibility" DEFAULT 'name' NOT NULL,
	"include_media" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"last_accessed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tree_share_links_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "tree_share_links" ADD CONSTRAINT "tree_share_links_tree_id_trees_id_fk" FOREIGN KEY ("tree_id") REFERENCES "public"."trees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tree_share_links" ADD CONSTRAINT "tree_share_links_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tree_share_links_tree_idx" ON "tree_share_links" USING btree ("tree_id");