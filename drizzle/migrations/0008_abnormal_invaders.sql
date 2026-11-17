CREATE TYPE "public"."usage_event_kind" AS ENUM('file_uploaded', 'file_deleted', 'tree_created', 'tree_deleted', 'person_created', 'person_deleted', 'upload_rejected_quota', 'upload_rejected_type', 'upload_rejected_size', 'rate_limited');--> statement-breakpoint
CREATE TABLE "usage_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "usage_event_kind" NOT NULL,
	"bytes" bigint DEFAULT 0 NOT NULL,
	"item_count" integer DEFAULT 0 NOT NULL,
	"tree_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "thumb_size_bytes" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "storage_quota_bytes" bigint DEFAULT 1073741824 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "people_quota" integer DEFAULT 500 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "people_created_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_tree_id_trees_id_fk" FOREIGN KEY ("tree_id") REFERENCES "public"."trees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "usage_events_user_created_idx" ON "usage_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "usage_events_kind_created_idx" ON "usage_events" USING btree ("kind","created_at");--> statement-breakpoint
UPDATE "users" u
SET "people_created_count" = counts.total
FROM (
	SELECT "created_by", count(*)::int AS total
	FROM "people"
	WHERE "created_by" IS NOT NULL
	GROUP BY "created_by"
) counts
WHERE u."id" = counts."created_by";--> statement-breakpoint
UPDATE "users"
SET "people_quota" = GREATEST("people_quota", "people_created_count");--> statement-breakpoint
UPDATE "users" u
SET "storage_quota_bytes" = GREATEST(u."storage_quota_bytes", usage.total)
FROM (
	SELECT "uploaded_by", COALESCE(SUM("size_bytes" + COALESCE("thumb_size_bytes", 0)), 0)::bigint AS total
	FROM "files"
	WHERE "uploaded_by" IS NOT NULL AND "status" <> 'failed'
	GROUP BY "uploaded_by"
) usage
WHERE u."id" = usage."uploaded_by";
