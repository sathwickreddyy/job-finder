import type { InterviewQuestion, QuestionOutcome } from "../types";

export type QuestionDraft = {
  title: string;
  patterns: string[];
  prompt: string;
  answer: string;
  interviewer: string;
  outcome: QuestionOutcome | null;
  time: string;
  space: string;
};

/** The editable fields of a saved question, or an empty draft for a new one. */
export function draftOf(question?: InterviewQuestion): QuestionDraft {
  return {
    title: question?.title ?? "",
    patterns: question?.patterns ?? [],
    prompt: question?.prompt ?? "",
    answer: question?.answer ?? "",
    interviewer: question?.interviewer ?? "",
    outcome: question?.outcome ?? null,
    time: question?.time ?? "",
    space: question?.space ?? "",
  };
}

export function isDirty(initial: QuestionDraft, draft: QuestionDraft): boolean {
  return (Object.keys(initial) as (keyof QuestionDraft)[]).some((key) =>
    key === "patterns"
      ? initial.patterns.join("\u0000") !== draft.patterns.join("\u0000")
      : initial[key] !== draft[key],
  );
}

/** True when it is fine to throw the draft away; asks first only when there are unsaved edits. */
export function confirmCancel(dirty: boolean, ask: (message: string) => boolean): boolean {
  return !dirty || ask("Discard your unsaved changes to this question?");
}
