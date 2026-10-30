CREATE TABLE "company_mail_matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_key" text NOT NULL,
	"tracking_id" uuid NOT NULL,
	"rule_revision" text NOT NULL,
	"kept" boolean NOT NULL,
	"reason" text NOT NULL,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "company_mail_matches" ADD CONSTRAINT "company_mail_matches_tracking_id_mail_tracking_id_fk" FOREIGN KEY ("tracking_id") REFERENCES "public"."mail_tracking"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "company_mail_match_identity_idx" ON "company_mail_matches" USING btree ("company_key","tracking_id");