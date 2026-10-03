CREATE TYPE "public"."application_close_reason" AS ENUM('REJECTED', 'NO_REPLY', 'WITHDREW', 'ACCEPTED', 'DECLINED');--> statement-breakpoint
CREATE TYPE "public"."round_kind" AS ENUM('ONLINE_ASSESSMENT', 'DSA', 'LLD', 'HLD', 'BEHAVIORAL', 'HIRING_MANAGER', 'DOMAIN', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."round_outcome" AS ENUM('SCHEDULED', 'PASSED', 'FAILED', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "application_rounds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"kind" "round_kind" NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"scheduled_at" timestamp with time zone,
	"outcome" "round_outcome" DEFAULT 'SCHEDULED' NOT NULL,
	"position" integer NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "application_rounds_position" CHECK ("application_rounds"."position" >= 1)
);
--> statement-breakpoint
CREATE TABLE "queue_snoozes" (
	"item_key" text PRIMARY KEY NOT NULL,
	"until" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "next_action_note" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "closed_reason" "application_close_reason";--> statement-breakpoint
ALTER TABLE "application_rounds" ADD CONSTRAINT "application_rounds_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "application_rounds_app_idx" ON "application_rounds" USING btree ("application_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "application_rounds_one_booked_idx" ON "application_rounds" USING btree ("application_id") WHERE "application_rounds"."outcome" = 'SCHEDULED';