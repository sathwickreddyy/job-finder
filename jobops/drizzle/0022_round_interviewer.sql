ALTER TABLE "application_rounds" ADD COLUMN "interviewer" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "application_rounds" ADD CONSTRAINT "application_rounds_interviewer_length" CHECK (char_length("interviewer") <= 200);
