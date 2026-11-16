ALTER TYPE "public"."auth_token_kind" ADD VALUE 'email_change';--> statement-breakpoint
ALTER TABLE "auth_tokens" ADD COLUMN "pending_email" text;