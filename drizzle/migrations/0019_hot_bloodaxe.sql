ALTER TABLE "people" ADD COLUMN "links" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "contact_email" text;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "contact_phone" text;