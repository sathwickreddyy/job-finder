CREATE TABLE "task_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mission_id" uuid NOT NULL,
	"digest" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"proposal_id" uuid NOT NULL,
	"decision" text NOT NULL,
	"feedback" text DEFAULT '' NOT NULL,
	"effects" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mission_id" uuid NOT NULL,
	"request_id" text NOT NULL,
	"digest" text NOT NULL,
	"kind" text NOT NULL,
	"summary" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_updates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mission_id" uuid NOT NULL,
	"request_id" text NOT NULL,
	"digest" text NOT NULL,
	"status" text NOT NULL,
	"summary" text NOT NULL,
	"proposal_id" uuid,
	"evidence_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mail_messages" ADD COLUMN "attention_state" text DEFAULT 'OPEN' NOT NULL;--> statement-breakpoint
ALTER TABLE "task_credentials" ADD CONSTRAINT "task_credentials_mission_id_missions_id_fk" FOREIGN KEY ("mission_id") REFERENCES "public"."missions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_decisions" ADD CONSTRAINT "task_decisions_proposal_id_task_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."task_proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_proposals" ADD CONSTRAINT "task_proposals_mission_id_missions_id_fk" FOREIGN KEY ("mission_id") REFERENCES "public"."missions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_updates" ADD CONSTRAINT "task_updates_mission_id_missions_id_fk" FOREIGN KEY ("mission_id") REFERENCES "public"."missions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_updates" ADD CONSTRAINT "task_updates_proposal_id_task_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."task_proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "task_credentials_digest_idx" ON "task_credentials" USING btree ("digest");--> statement-breakpoint
CREATE INDEX "task_credentials_mission_idx" ON "task_credentials" USING btree ("mission_id");--> statement-breakpoint
CREATE UNIQUE INDEX "task_decisions_proposal_idx" ON "task_decisions" USING btree ("proposal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "task_proposals_request_idx" ON "task_proposals" USING btree ("mission_id","request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "task_updates_request_idx" ON "task_updates" USING btree ("mission_id","request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "task_updates_execution_idx" ON "task_updates" USING btree ("proposal_id");