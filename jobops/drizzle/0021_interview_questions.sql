ALTER TYPE "round_kind" ADD VALUE IF NOT EXISTS 'HR';
--> statement-breakpoint
CREATE TYPE "question_outcome" AS ENUM ('SOLVED_CODE', 'SOLVED_ALOUD', 'PARTIAL', 'STUCK');
--> statement-breakpoint
CREATE TABLE "interview_questions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "round_id" uuid NOT NULL REFERENCES "application_rounds"("id") ON DELETE cascade,
  "position" integer NOT NULL,
  "title" text NOT NULL,
  "patterns" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "prompt" text DEFAULT '' NOT NULL,
  "answer" text DEFAULT '' NOT NULL,
  "outcome" "question_outcome",
  "time_complexity" text DEFAULT '' NOT NULL,
  "space_complexity" text DEFAULT '' NOT NULL,
  "interviewer" text DEFAULT '' NOT NULL,
  "review" text DEFAULT '' NOT NULL,
  "review_source" text,
  "reviewed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "interview_questions_position" CHECK ("position" >= 1),
  CONSTRAINT "interview_questions_title" CHECK (char_length("title") between 1 and 200),
  CONSTRAINT "interview_questions_text_size" CHECK (char_length("prompt") <= 100000 and char_length("answer") <= 100000 and char_length("interviewer") <= 100000 and char_length("review") <= 100000 and char_length("time_complexity") <= 100000 and char_length("space_complexity") <= 100000),
  CONSTRAINT "interview_questions_review_source" CHECK ("review" = '' OR "review_source" IS NOT NULL)
);
--> statement-breakpoint
CREATE INDEX "interview_questions_round_idx" ON "interview_questions" ("round_id", "position");
--> statement-breakpoint
CREATE INDEX "interview_questions_updated_idx" ON "interview_questions" ("updated_at");
