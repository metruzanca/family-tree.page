CREATE TYPE "public"."person_event_kind" AS ENUM('residence', 'occupation', 'education', 'military', 'immigration', 'emigration', 'burial', 'other');--> statement-breakpoint
CREATE TABLE "person_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tree_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"kind" "person_event_kind" DEFAULT 'other' NOT NULL,
	"title" text,
	"place" text,
	"date" jsonb,
	"description" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "files" ALTER COLUMN "taken_at" SET DATA TYPE jsonb USING (
	CASE WHEN "taken_at" IS NULL THEN NULL ELSE jsonb_build_object(
		'start', jsonb_build_object(
			'year', EXTRACT(YEAR FROM "taken_at")::int,
			'month', EXTRACT(MONTH FROM "taken_at")::int,
			'day', EXTRACT(DAY FROM "taken_at")::int
		),
		'qualifier', 'exact'
	) END
);--> statement-breakpoint
ALTER TABLE "partnerships" ALTER COLUMN "start_date" SET DATA TYPE jsonb USING (
	CASE WHEN "start_date" IS NULL THEN NULL ELSE jsonb_build_object(
		'start', jsonb_build_object(
			'year', EXTRACT(YEAR FROM "start_date")::int,
			'month', EXTRACT(MONTH FROM "start_date")::int,
			'day', EXTRACT(DAY FROM "start_date")::int
		),
		'qualifier', 'exact'
	) END
);--> statement-breakpoint
ALTER TABLE "partnerships" ALTER COLUMN "end_date" SET DATA TYPE jsonb USING (
	CASE WHEN "end_date" IS NULL THEN NULL ELSE jsonb_build_object(
		'start', jsonb_build_object(
			'year', EXTRACT(YEAR FROM "end_date")::int,
			'month', EXTRACT(MONTH FROM "end_date")::int,
			'day', EXTRACT(DAY FROM "end_date")::int
		),
		'qualifier', 'exact'
	) END
);--> statement-breakpoint
ALTER TABLE "people" ALTER COLUMN "birth_date" SET DATA TYPE jsonb USING (
	CASE WHEN "birth_date" IS NULL THEN NULL ELSE jsonb_build_object(
		'start', jsonb_build_object(
			'year', EXTRACT(YEAR FROM "birth_date")::int,
			'month', EXTRACT(MONTH FROM "birth_date")::int,
			'day', EXTRACT(DAY FROM "birth_date")::int
		),
		'qualifier', 'exact'
	) END
);--> statement-breakpoint
ALTER TABLE "people" ALTER COLUMN "death_date" SET DATA TYPE jsonb USING (
	CASE WHEN "death_date" IS NULL THEN NULL ELSE jsonb_build_object(
		'start', jsonb_build_object(
			'year', EXTRACT(YEAR FROM "death_date")::int,
			'month', EXTRACT(MONTH FROM "death_date")::int,
			'day', EXTRACT(DAY FROM "death_date")::int
		),
		'qualifier', 'exact'
	) END
);--> statement-breakpoint
ALTER TABLE "person_events" ADD CONSTRAINT "person_events_tree_id_trees_id_fk" FOREIGN KEY ("tree_id") REFERENCES "public"."trees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_events" ADD CONSTRAINT "person_events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_events" ADD CONSTRAINT "person_events_person_fk" FOREIGN KEY ("person_id","tree_id") REFERENCES "public"."people"("id","tree_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "person_events_tree_idx" ON "person_events" USING btree ("tree_id");--> statement-breakpoint
CREATE INDEX "person_events_person_idx" ON "person_events" USING btree ("person_id");
