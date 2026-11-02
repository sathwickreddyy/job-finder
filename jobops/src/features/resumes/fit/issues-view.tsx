import { Delta, Severity } from "./bits";
import type { ToolSummary } from "./derive";
import { splitIssues } from "./issues";
import type { ResumeNextDetails } from "./tools";

type Issue = ResumeNextDetails["issues"][number];

function IssueList({ issues }: { issues: (Issue & { reason?: string })[] }) {
  return (
    <ul className="m-0 list-none space-y-2.5 p-0">
      {issues.map((i, n) => (
        <li key={`${i.label}-${n}`} className="flex gap-2 text-xs">
          <Severity level={i.severity} />
          <div className="min-w-0">
            <p className="m-0 font-medium">{i.label}</p>
            <p className="m-0 mt-0.5 leading-relaxed text-muted-foreground">{i.reason ?? i.hint}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** ResumeNext judges the document; real issues first, set-aside flags folded with their reasons. */
export function ResumeNextIssues({
  summary,
  issues,
}: {
  summary: ToolSummary;
  issues: Issue[] | null;
}) {
  if ("notChecked" in summary || !issues)
    return (
      <section aria-label="ResumeNext issues">
        <h3 className="m-0 mb-2 text-sm font-semibold">ResumeNext: the document</h3>
        <p className="m-0 text-xs text-muted-foreground">Not checked yet</p>
      </section>
    );
  const { fix, keep } = splitIssues(issues);
  return (
    <section aria-label="ResumeNext issues">
      <h3 className="m-0 text-sm font-semibold">ResumeNext: the document</h3>
      <p className="m-0 mt-1 mb-3 text-xs text-muted-foreground tabular-nums">
        {summary.score ?? "—"} of 100 <Delta value={summary.delta} />
      </p>
      <p className="m-0 mb-2 text-xs font-medium">
        Worth fixing <span className="font-normal text-muted-foreground">{fix.length}</span>
      </p>
      {fix.length ? <IssueList issues={fix} /> : <p className="m-0 text-xs">Nothing left.</p>}
      {keep.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-xs font-medium">
            Checked and left as is{" "}
            <span className="font-normal text-muted-foreground">{keep.length}</span>
          </summary>
          <div className="mt-2">
            <IssueList issues={keep} />
          </div>
        </details>
      )}
      <p className="m-0 mt-3 text-xs leading-relaxed text-muted-foreground">
        ResumeNext reads the PDF like a parser, so some flags are misreads. Each one set aside keeps
        its reason, so the agent doesn&apos;t try to fix it again.
      </p>
    </section>
  );
}
