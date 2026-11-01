ALTER TABLE "mail_tracking" DROP CONSTRAINT "mail_tracking_disposition_check";--> statement-breakpoint
ALTER TABLE "mail_tracking" ALTER COLUMN "disposition" SET DEFAULT 'kept';--> statement-breakpoint
ALTER TABLE "mail_messages" ADD COLUMN "company_key" text;--> statement-breakpoint
ALTER TABLE "mail_messages" ADD COLUMN "folders" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "posted_at_kind" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "posted_at_source_url" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_posted_at_kind_check" CHECK ("jobs"."posted_at_kind" IS NULL OR "jobs"."posted_at_kind" IN ('ORIGINAL','LATEST_PUBLICATION'));--> statement-breakpoint
CREATE INDEX "mail_messages_attention_idx" ON "mail_messages" USING btree ("attention_state","received_at");--> statement-breakpoint
CREATE INDEX "mail_messages_company_idx" ON "mail_messages" USING btree ("company_key");--> statement-breakpoint
-- cutover:start
UPDATE "mail_messages" m SET "folders" = t."folders" FROM "mail_tracking" t WHERE t."message_id" = m."id" AND m."folders" = '[]'::jsonb AND t."folders" <> '[]'::jsonb;--> statement-breakpoint
UPDATE "mail_messages" m SET "company_key" = t."company_keys"->>0 FROM "mail_tracking" t WHERE t."message_id" = m."id" AND m."company_key" IS NULL AND jsonb_array_length(t."company_keys") = 1;--> statement-breakpoint
UPDATE "mail_tracking" SET "disposition" = 'kept' WHERE "disposition" IN ('latest','history');--> statement-breakpoint
UPDATE "mail_messages" SET "attention_state" = 'DONE', "processed_at" = coalesce("processed_at", now()) WHERE "attention_state" <> 'DONE';--> statement-breakpoint
UPDATE "mail_connections" c SET "last_synced_at" = (s."value"->>'until')::timestamptz FROM "settings" s WHERE s."key" = 'mailScan:v2:' || c."id" || ':latest:d82b2b55630461181d24bf437edb43ac844dc4ae880a661a2e74a8a1d7564312' AND s."value"->>'complete' = 'true';--> statement-breakpoint
DELETE FROM "settings" WHERE ("key" LIKE 'mailScan:v2:%' AND "key" NOT LIKE 'mailScan:v2:%:latest:d82b2b55630461181d24bf437edb43ac844dc4ae880a661a2e74a8a1d7564312') OR "key" LIKE 'companyMailScan:%' OR "key" LIKE 'mailCursor:%' OR "key" LIKE 'mailPolicy:%';--> statement-breakpoint
INSERT INTO "settings" ("key", "value") VALUES ('mailCheckReleasedAt', jsonb_build_object('at', now())) ON CONFLICT ("key") DO NOTHING;--> statement-breakpoint
-- cutover:end
ALTER TABLE "mail_tracking" ADD CONSTRAINT "mail_tracking_disposition_check" CHECK ("mail_tracking"."disposition" IN ('kept','excluded'));--> statement-breakpoint
DROP TABLE "company_mail_matches" CASCADE;
