CREATE TABLE "mail_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text DEFAULT 'GMAIL' NOT NULL,
	"email" text NOT NULL,
	"encrypted_access_token" text NOT NULL,
	"encrypted_refresh_token" text,
	"token_expires_at" timestamp with time zone,
	"last_synced_at" timestamp with time zone,
	"last_refreshed_at" timestamp with time zone,
	"last_refreshed_count" integer,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mail_connections_provider" CHECK ("mail_connections"."provider" IN ('GMAIL', 'OUTLOOK'))
);
--> statement-breakpoint
ALTER TABLE "mail_messages" ADD COLUMN "account_email" text;--> statement-breakpoint
CREATE UNIQUE INDEX "mail_connections_provider_email_idx" ON "mail_connections" USING btree ("provider","email");