CREATE TABLE "job_term_lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"terms" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"fingerprint" text NOT NULL,
	"reviewed_by" text NOT NULL,
	"reviewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_term_lists_snapshot_id_unique" UNIQUE("snapshot_id")
);
--> statement-breakpoint
ALTER TABLE "job_term_lists" ADD CONSTRAINT "job_term_lists_snapshot_id_job_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."job_snapshots"("id") ON DELETE cascade ON UPDATE no action;