ALTER TABLE "resume_assessments" ADD COLUMN "details" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "resume_versions" ADD COLUMN "base_version_id" uuid;--> statement-breakpoint
ALTER TABLE "resume_versions" ADD COLUMN "target_job_id" uuid;--> statement-breakpoint
ALTER TABLE "resume_versions" ADD COLUMN "target_snapshot_id" uuid;--> statement-breakpoint
ALTER TABLE "resume_versions" ADD CONSTRAINT "resume_versions_base_version_id_resume_versions_id_fk" FOREIGN KEY ("base_version_id") REFERENCES "public"."resume_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_versions" ADD CONSTRAINT "resume_versions_target_job_id_jobs_id_fk" FOREIGN KEY ("target_job_id") REFERENCES "public"."jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_versions" ADD CONSTRAINT "resume_versions_target_snapshot_id_job_snapshots_id_fk" FOREIGN KEY ("target_snapshot_id") REFERENCES "public"."job_snapshots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "resume_assessments_fit_idx" ON "resume_assessments" USING btree ("version_id","snapshot_id","source");