CREATE TYPE "public"."birthday_email_kind" AS ENUM('week_before', 'day_before', 'day_of');--> statement-breakpoint
CREATE TABLE "birthday_email_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "birthday_email_kind" NOT NULL,
	"sent_on" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "notify_birthday_week_before" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "notify_birthday_day_before" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "notify_birthday_day_of" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "birthday_email_log" ADD CONSTRAINT "birthday_email_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "birthday_email_log_unique" ON "birthday_email_log" USING btree ("user_id","kind","sent_on");