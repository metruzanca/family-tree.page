CREATE TYPE "public"."person_sex" AS ENUM('female', 'male', 'other', 'unknown');--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "sex" "person_sex" DEFAULT 'unknown' NOT NULL;