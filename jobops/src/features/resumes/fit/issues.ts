import type { ResumeNextDetails } from "./tools";

type Issue = ResumeNextDetails["issues"][number];

export const WRAPPED_LINE_REASON = "ResumeNext read a wrapped bullet line as a separate job";

// ResumeNext reads wrapped bullet lines as extra jobs and reports each as "Experience — …".
const wrappedLine = (label: string) => label.startsWith("Experience —");

/** Real issues to fix, and the ones already checked (or misread) with the reason to leave them. */
export function splitIssues(issues: Issue[]) {
  const fix: Issue[] = [];
  const keep: (Issue & { reason: string })[] = [];
  for (const issue of issues) {
    if (issue.decision) keep.push({ ...issue, reason: issue.decision });
    else if (wrappedLine(issue.label)) keep.push({ ...issue, reason: WRAPPED_LINE_REASON });
    else fix.push(issue);
  }
  return { fix, keep };
}
