import type { RoundKind } from "@/lib/round-kinds";

/** API and UI spelling of `question_outcome`; the database stores the upper-case form. */
export type QuestionOutcome = "solved_code" | "solved_aloud" | "partial" | "stuck";
export const questionOutcomeValues = ["solved_code", "solved_aloud", "partial", "stuck"] as const;

export type InterviewQuestion = {
  id: string;
  roundId: string;
  position: number;
  title: string;
  patterns: string[];
  prompt: string;
  answer: string;
  outcome: QuestionOutcome | null;
  time: string;
  space: string;
  interviewer: string;
  review: string;
  reviewSource: string | null;
  reviewedAt: string | null;
  updatedAt: string;
};

export type RoundWithQuestions = {
  id: string;
  position: number;
  kind: RoundKind;
  name: string;
  label: string;
  scheduledAt: string | null;
  outcome: string;
  questions: InterviewQuestion[];
};

export type LibraryRow = InterviewQuestion & {
  applicationId: string;
  company: string;
  role: string;
  roundLabel: string;
  date: string | null;
};
