-- Reconciles the tree deletion schema for databases that applied 0015 before
-- 0014. Drizzle skips migrations older than the last recorded one, so 0014 is
-- never replayed in those environments. Every statement here is idempotent:
-- fresh databases that already ran 0014 are left untouched.
CREATE TABLE IF NOT EXISTS "tree_deletion_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tree_id" uuid NOT NULL,
	"requested_by" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tree_deletion_requests_tree_id_unique" UNIQUE("tree_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tree_deletion_approvals" (
	"request_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"approved_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tree_deletion_approvals_pk" PRIMARY KEY("request_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "trees" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "trees" ADD COLUMN IF NOT EXISTS "purge_after" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "trees" ADD COLUMN IF NOT EXISTS "deleted_by" uuid;--> statement-breakpoint
ALTER TABLE "trees" ADD COLUMN IF NOT EXISTS "deletion_reminder_sent_at" timestamp with time zone;--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tree_deletion_approvals_request_id_tree_deletion_requests_id_fk') THEN
		ALTER TABLE "tree_deletion_approvals" ADD CONSTRAINT "tree_deletion_approvals_request_id_tree_deletion_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."tree_deletion_requests"("id") ON DELETE cascade ON UPDATE no action;
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tree_deletion_approvals_user_id_users_id_fk') THEN
		ALTER TABLE "tree_deletion_approvals" ADD CONSTRAINT "tree_deletion_approvals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tree_deletion_requests_tree_id_trees_id_fk') THEN
		ALTER TABLE "tree_deletion_requests" ADD CONSTRAINT "tree_deletion_requests_tree_id_trees_id_fk" FOREIGN KEY ("tree_id") REFERENCES "public"."trees"("id") ON DELETE cascade ON UPDATE no action;
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tree_deletion_requests_requested_by_users_id_fk') THEN
		ALTER TABLE "tree_deletion_requests" ADD CONSTRAINT "tree_deletion_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trees_deleted_by_users_id_fk') THEN
		ALTER TABLE "trees" ADD CONSTRAINT "trees_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
	END IF;
END
$$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trees_purge_after_idx" ON "trees" USING btree ("purge_after") WHERE "trees"."deleted_at" is not null;
