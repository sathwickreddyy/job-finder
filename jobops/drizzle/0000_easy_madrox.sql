CREATE TYPE "public"."application_stage" AS ENUM('DRAFT', 'PREPARING', 'READY_FOR_REVIEW', 'APPLIED', 'ACKNOWLEDGED', 'ASSESSMENT', 'RECRUITER_SCREEN', 'TECHNICAL_INTERVIEW', 'MANAGER_INTERVIEW', 'FINAL_INTERVIEW', 'OFFER', 'REJECTED', 'WITHDRAWN', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."contact_verification" AS ENUM('UNKNOWN', 'VALID', 'INVALID', 'ACCEPT_ALL', 'UNVERIFIED', 'MANUAL_VERIFIED');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('NEW', 'REVIEWING', 'SHORTLISTED', 'IGNORED', 'PREPARING', 'APPLIED', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."mail_classification" AS ENUM('APPLICATION_ACKNOWLEDGEMENT', 'ASSESSMENT', 'INTERVIEW', 'REJECTION', 'OFFER', 'RECRUITER_OUTREACH', 'FOLLOW_UP', 'UNKNOWN');--> statement-breakpoint
CREATE TYPE "public"."mission_status" AS ENUM('DRAFT', 'READY', 'IN_PROGRESS', 'WAITING_FOR_USER', 'READY_FOR_REVIEW', 'COMPLETED', 'FAILED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."mission_type" AS ENUM('DISCOVER_JOBS', 'INSPECT_JOB', 'COMPARE_RESUME', 'PREPARE_APPLICATION', 'APPLY_JOB', 'INSPECT_PROFILE', 'UPDATE_PROFILE', 'FIND_CONTACT', 'VERIFY_CONTACT', 'REVIEW_MAIL', 'FOLLOW_UP_REVIEW', 'CUSTOM');--> statement-breakpoint
CREATE TYPE "public"."operator" AS ENUM('HUMAN', 'CHATGPT', 'CLAUDE', 'CODEX', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."profile_provider" AS ENUM('NAUKRI', 'LINKEDIN', 'INSTAHYRE', 'WELLFOUND', 'CUTSHORT', 'OTHER');--> statement-breakpoint
CREATE TABLE "activity_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"summary" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "application_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"source" text DEFAULT 'MANUAL' NOT NULL,
	"summary" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"confidence" real,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"resume_version_id" uuid,
	"status" "application_stage" DEFAULT 'DRAFT' NOT NULL,
	"applied_at" timestamp with time zone,
	"application_url" text,
	"source" text DEFAULT 'MANUAL' NOT NULL,
	"next_action_at" timestamp with time zone,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candidate_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text,
	"preferred_name" text,
	"primary_email" text,
	"phone" text,
	"current_city" text,
	"country" text,
	"years_of_experience" real,
	"current_company" text,
	"current_role" text,
	"current_compensation" text,
	"expected_compensation" text,
	"notice_period" text,
	"last_working_day" timestamp with time zone,
	"preferred_locations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"remote_preference" text,
	"desired_roles" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"linkedin_url" text,
	"github_url" text,
	"portfolio_url" text,
	"career_summary" text,
	"work_authorization" text,
	"sponsorship" text,
	"relocation_preference" text,
	"standard_answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company" text NOT NULL,
	"name" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"email" text,
	"linkedin_url" text,
	"source" text DEFAULT 'MANUAL' NOT NULL,
	"verification_status" "contact_verification" DEFAULT 'UNKNOWN' NOT NULL,
	"verification_source" text,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gmail_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"encrypted_access_token" text NOT NULL,
	"encrypted_refresh_token" text,
	"token_expires_at" timestamp with time zone,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_resume_matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"resume_version_id" uuid NOT NULL,
	"score" real NOT NULL,
	"matched_keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"missing_keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"manual_notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"requirements" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"skills" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"raw_text" text DEFAULT '' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company" text NOT NULL,
	"title" text NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"work_mode" text DEFAULT 'UNKNOWN' NOT NULL,
	"employment_type" text DEFAULT 'FULL_TIME' NOT NULL,
	"canonical_url" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"source" text NOT NULL,
	"external_id" text,
	"experience_min" real,
	"experience_max" real,
	"salary_min" real,
	"salary_max" real,
	"currency" text,
	"posted_at" timestamp with time zone,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "job_status" DEFAULT 'NEW' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mail_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mail_message_id" uuid NOT NULL,
	"type" "mail_classification" NOT NULL,
	"confidence" real NOT NULL,
	"linked_application_id" uuid,
	"status" text DEFAULT 'NEEDS_REVIEW' NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mail_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"external_id" text NOT NULL,
	"thread_id" text,
	"provider" text DEFAULT 'IMPORT' NOT NULL,
	"sender" text NOT NULL,
	"sender_name" text DEFAULT '' NOT NULL,
	"recipient" text DEFAULT '' NOT NULL,
	"subject" text NOT NULL,
	"snippet" text DEFAULT '' NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"body_text" text,
	"body_html" text,
	"classification" "mail_classification" DEFAULT 'UNKNOWN' NOT NULL,
	"linked_application_id" uuid,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mission_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mission_id" uuid NOT NULL,
	"execution_id" uuid,
	"type" text NOT NULL,
	"value" text NOT NULL,
	"storage_path" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mission_executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mission_id" uuid NOT NULL,
	"operator" "operator" DEFAULT 'HUMAN' NOT NULL,
	"status" "mission_status" DEFAULT 'IN_PROGRESS' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mission_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mission_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"title" text NOT NULL,
	"instruction" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"requires_approval" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "missions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "mission_type" NOT NULL,
	"title" text NOT NULL,
	"entity_type" text DEFAULT 'NONE' NOT NULL,
	"entity_id" uuid,
	"goal" text NOT NULL,
	"status" "mission_status" DEFAULT 'DRAFT' NOT NULL,
	"priority" integer DEFAULT 2 NOT NULL,
	"constraints" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"input" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"expected_result" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" text DEFAULT 'HUMAN' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" "profile_provider" NOT NULL,
	"display_name" text NOT NULL,
	"profile_url" text NOT NULL,
	"username_or_email" text,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"last_inspected_at" timestamp with time zone,
	"last_updated_at" timestamp with time zone,
	"target_state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"known_state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resume_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resume_id" uuid NOT NULL,
	"version_label" text NOT NULL,
	"original_filename" text NOT NULL,
	"storage_path" text NOT NULL,
	"mime_type" text DEFAULT 'application/pdf' NOT NULL,
	"file_size" integer NOT NULL,
	"sha256" text NOT NULL,
	"extracted_text" text DEFAULT '' NOT NULL,
	"summary" text,
	"skills" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"experience_tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"parsing_status" text DEFAULT 'PENDING' NOT NULL,
	"parsing_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_current" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resumes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"category" text DEFAULT 'General' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "application_events" ADD CONSTRAINT "application_events_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_resume_version_id_resume_versions_id_fk" FOREIGN KEY ("resume_version_id") REFERENCES "public"."resume_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_resume_matches" ADD CONSTRAINT "job_resume_matches_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_resume_matches" ADD CONSTRAINT "job_resume_matches_resume_version_id_resume_versions_id_fk" FOREIGN KEY ("resume_version_id") REFERENCES "public"."resume_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_snapshots" ADD CONSTRAINT "job_snapshots_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_events" ADD CONSTRAINT "mail_events_mail_message_id_mail_messages_id_fk" FOREIGN KEY ("mail_message_id") REFERENCES "public"."mail_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_events" ADD CONSTRAINT "mail_events_linked_application_id_applications_id_fk" FOREIGN KEY ("linked_application_id") REFERENCES "public"."applications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_messages" ADD CONSTRAINT "mail_messages_linked_application_id_applications_id_fk" FOREIGN KEY ("linked_application_id") REFERENCES "public"."applications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_evidence" ADD CONSTRAINT "mission_evidence_mission_id_missions_id_fk" FOREIGN KEY ("mission_id") REFERENCES "public"."missions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_evidence" ADD CONSTRAINT "mission_evidence_execution_id_mission_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."mission_executions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_executions" ADD CONSTRAINT "mission_executions_mission_id_missions_id_fk" FOREIGN KEY ("mission_id") REFERENCES "public"."missions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_steps" ADD CONSTRAINT "mission_steps_mission_id_missions_id_fk" FOREIGN KEY ("mission_id") REFERENCES "public"."missions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_versions" ADD CONSTRAINT "resume_versions_resume_id_resumes_id_fk" FOREIGN KEY ("resume_id") REFERENCES "public"."resumes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_logs_created_idx" ON "activity_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "application_events_app_idx" ON "application_events" USING btree ("application_id","occurred_at");--> statement-breakpoint
CREATE INDEX "applications_job_idx" ON "applications" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "applications_resume_idx" ON "applications" USING btree ("resume_version_id");--> statement-breakpoint
CREATE INDEX "applications_status_idx" ON "applications" USING btree ("status");--> statement-breakpoint
CREATE INDEX "applications_next_action_idx" ON "applications" USING btree ("next_action_at");--> statement-breakpoint
CREATE INDEX "contacts_company_idx" ON "contacts" USING btree ("company");--> statement-breakpoint
CREATE UNIQUE INDEX "gmail_connections_email_idx" ON "gmail_connections" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "job_resume_matches_pair_idx" ON "job_resume_matches" USING btree ("job_id","resume_version_id");--> statement-breakpoint
CREATE INDEX "job_snapshots_job_idx" ON "job_snapshots" USING btree ("job_id","captured_at");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_url_idx" ON "jobs" USING btree ("canonical_url");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_dedupe_idx" ON "jobs" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "jobs_company_title_idx" ON "jobs" USING btree ("company","title");--> statement-breakpoint
CREATE INDEX "jobs_status_idx" ON "jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "jobs_posted_idx" ON "jobs" USING btree ("posted_at");--> statement-breakpoint
CREATE INDEX "mail_events_status_idx" ON "mail_events" USING btree ("status");--> statement-breakpoint
CREATE INDEX "mail_events_message_idx" ON "mail_events" USING btree ("mail_message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mail_messages_external_idx" ON "mail_messages" USING btree ("provider","external_id");--> statement-breakpoint
CREATE INDEX "mail_messages_received_idx" ON "mail_messages" USING btree ("received_at");--> statement-breakpoint
CREATE INDEX "mission_evidence_mission_idx" ON "mission_evidence" USING btree ("mission_id");--> statement-breakpoint
CREATE INDEX "mission_executions_mission_idx" ON "mission_executions" USING btree ("mission_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mission_steps_sequence_idx" ON "mission_steps" USING btree ("mission_id","sequence");--> statement-breakpoint
CREATE INDEX "missions_status_type_idx" ON "missions" USING btree ("status","type");--> statement-breakpoint
CREATE INDEX "missions_entity_idx" ON "missions" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "resume_versions_family_idx" ON "resume_versions" USING btree ("resume_id");--> statement-breakpoint
CREATE INDEX "resume_versions_sha_idx" ON "resume_versions" USING btree ("sha256");--> statement-breakpoint
CREATE UNIQUE INDEX "resume_versions_current_idx" ON "resume_versions" USING btree ("resume_id") WHERE "resume_versions"."is_current" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "resumes_slug_idx" ON "resumes" USING btree ("slug");