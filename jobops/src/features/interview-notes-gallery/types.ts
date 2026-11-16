export type Variant = "A" | "B" | "C";

/** How a question went, in the user's words: finished in code, finished aloud, or neither. */
export type HowItWent = "code" | "aloud" | "partial" | "stuck";

export type Question = {
  id: string;
  title: string;
  patterns: string[];
  /** The problem as asked, with constraints and examples (Markdown). */
  prompt: string;
  /** The user's own working, unedited apart from formatting (Markdown). */
  answer: string;
  howItWent: HowItWent;
  time: string;
  space: string;
  /** What the interviewer said or how they reacted. */
  interviewer: string;
  /** Optional review written later by Claude Code or Codex (Markdown). */
  review?: string;
};

export type Round = {
  id: string;
  position: number;
  name: string;
  /** ISO date-time, or null when the round is not booked yet. */
  at: string | null;
  result: "due" | "cleared" | "not-cleared" | "upcoming";
  questions: Question[];
};

export type GalleryApplication = {
  id: string;
  company: string;
  role: string;
  /** Requisition or job id that tells same-title openings apart. */
  req: string;
  location: string;
  appliedOn: string;
  phase: "Sent" | "Acknowledged" | "Interviewing" | "Offer" | "Closed";
  postingUrl: string;
  resume: { filename: string; label: string };
  mail: { subject: string; date: string }[];
  history: { date: string; text: string }[];
  rounds: Round[];
  /** Rounds still to come, from company research. Shown as expected, never as booked. */
  expectedLoop: { name: string; source: string }[];
};

export type LibraryEntry = Question & {
  company: string;
  role: string;
  roundName: string;
  date: string;
  /** Sample rows fill the library so scrolling and filters can be tried. */
  sample?: boolean;
};

export type InterviewGalleryData = {
  applications: GalleryApplication[];
  library: LibraryEntry[];
  real: boolean;
};
