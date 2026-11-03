ALTER TABLE "resume_versions" ADD COLUMN "is_master" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "resume_versions_master_idx" ON "resume_versions" ("resume_id") WHERE "is_master" = true;
--> statement-breakpoint
CREATE TABLE "resume_master_revisions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "version_id" uuid NOT NULL REFERENCES "resume_versions"("id") ON DELETE restrict,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "source_date" text,
  "reason" text NOT NULL,
  "removed_disposition" text DEFAULT 'retained' NOT NULL,
  "blocks" jsonb NOT NULL,
  "original_filename" text NOT NULL,
  "storage_path" text NOT NULL,
  "sha256" text NOT NULL,
  "file_size" integer NOT NULL,
  "pdf_storage_path" text,
  "pdf_filename" text,
  CONSTRAINT "resume_master_revision_disposition" CHECK ("removed_disposition" in ('retained','incorrect')),
  CONSTRAINT "resume_master_revision_size" CHECK ("file_size" > 0 and "file_size" <= 10485760)
);
--> statement-breakpoint
CREATE INDEX "resume_master_revisions_version_idx" ON "resume_master_revisions" ("version_id", "created_at");
