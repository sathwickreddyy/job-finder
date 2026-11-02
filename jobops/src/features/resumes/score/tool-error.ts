export type ToolErrorCode =
  "unreachable" | "busy" | "unreadable" | "terms_stale" | "too_long" | "missing_pdf" | "failed";

/** A check that could not run; the message is the copy its run row shows. */
export class ToolError extends Error {
  constructor(
    readonly code: ToolErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ToolError";
  }
}

export const toolErrorCopy = {
  scoringUnreachable: "Couldn't reach the scoring service",
  resumeNextUnreachable: "Couldn't reach ResumeNext (bridge on port 8004)",
  busy: "The scoring service is busy; try again in a moment",
  unreadable: "This PDF's text couldn't be read; it may be scanned",
  termsStale: "The saved description changed; review the terms again",
  tooLong: "This job description is over 20,000 characters, ResumeNext's limit",
  missingPdf: "The PDF for this file is missing from storage",
  failed: (tool: string) => `${tool} returned a result JobOps couldn't read`,
};
