CREATE TABLE "resume_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"source" text NOT NULL,
	"method" text NOT NULL,
	"score" real,
	"findings" text DEFAULT '' NOT NULL,
	"assessed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "resume_assessments_score" CHECK ("resume_assessments"."score" IS NULL OR ("resume_assessments"."score" >= 0 AND "resume_assessments"."score" <= 100))
);
--> statement-breakpoint
ALTER TABLE "resume_versions" ADD COLUMN "change_notes" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "resume_assessments" ADD CONSTRAINT "resume_assessments_version_id_resume_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."resume_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_assessments" ADD CONSTRAINT "resume_assessments_snapshot_id_job_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."job_snapshots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "resume_assessments_version_idx" ON "resume_assessments" USING btree ("version_id");