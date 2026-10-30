CREATE TABLE "mail_tracking" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"account_email" text NOT NULL,
	"provider_message_id" text NOT NULL,
	"internet_message_id" text,
	"message_id" uuid,
	"thread_id" text,
	"sender" text NOT NULL,
	"sender_name" text DEFAULT '' NOT NULL,
	"subject" text NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"folders" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"company_keys" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"application_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"disposition" text DEFAULT 'history' NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mail_tracking_disposition_check" CHECK ("mail_tracking"."disposition" IN ('latest','history','excluded'))
);
--> statement-breakpoint
ALTER TABLE "mail_tracking" ADD CONSTRAINT "mail_tracking_message_id_mail_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."mail_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mail_tracking_identity_idx" ON "mail_tracking" USING btree ("provider","account_email","provider_message_id");--> statement-breakpoint
CREATE INDEX "mail_tracking_message_idx" ON "mail_tracking" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "mail_tracking_received_idx" ON "mail_tracking" USING btree ("received_at");
--> statement-breakpoint
INSERT INTO "settings" ("key", "value") VALUES ('mailMonitorStartedAt', jsonb_build_object('at', now())) ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint
INSERT INTO "mail_tracking" ("provider", "account_email", "provider_message_id", "internet_message_id", "message_id", "thread_id", "sender", "sender_name", "subject", "received_at", "disposition", "reason", "created_at")
SELECT "provider", coalesce("account_email", ''), 'legacy:' || "external_id", CASE WHEN "provider" = 'OUTLOOK' THEN "external_id" ELSE NULL END, "id", "thread_id", "sender", "sender_name", "subject", "received_at", 'history', 'Imported before the mail workspace; kept as history', "created_at" FROM "mail_messages";
