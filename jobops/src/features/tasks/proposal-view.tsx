import Link from "next/link";
import { proposalSchema } from "./domain";
export function ProposalView({ payload }: { payload: Record<string, unknown> }) {
  const parsed = proposalSchema.shape.payload.safeParse(payload);
  if (!parsed.success)
    return (
      <p className="text-destructive">
        This proposal format is unavailable. Ask the assistant to submit it again.
      </p>
    );
  const p = parsed.data;
  if (p.kind === "OPENINGS")
    return (
      <div className="divide-y divide-border">
        {p.jobs.map((j, i) => (
          <article key={i} className="py-4 first:pt-0">
            <a href={j.url} target="_blank" rel="noreferrer" className="font-medium text-link">
              {j.title} · {j.company} ↗
            </a>
            <p className="mt-1 text-xs text-muted-foreground">
              {j.location} · {j.source}
            </p>
            <details className="mt-2">
              <summary className="text-sm">Job description</summary>
              <p className="mt-2 whitespace-pre-wrap text-sm">
                {j.description || "Ask your assistant to capture the job description."}
              </p>
            </details>
          </article>
        ))}
      </div>
    );
  if (p.kind === "RESUME")
    return (
      <div className="space-y-4">
        <p className="whitespace-pre-wrap text-sm">{p.changes}</p>
        <Link
          href={`/api/resumes/${p.versionId}/file`}
          target="_blank"
          className="button-secondary"
        >
          Review proposed PDF ↗
        </Link>
        <p className="text-xs text-muted-foreground">
          Approval selects this version as current. The original stays in version history. Keyword
          coverage is a writing aid, not an ATS guarantee.
        </p>
      </div>
    );
  if (p.kind === "PROFILE")
    return (
      <div>
        <a
          href={p.targetUrl}
          target="_blank"
          rel="noreferrer"
          className="break-all text-sm text-link"
        >
          {p.targetUrl} ↗
        </a>
        <div className="mt-4 space-y-4">
          {p.changes.map((c, i) => (
            <article key={i}>
              <h3>{c.field}</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-muted p-3">
                  <p className="mb-2 text-xs text-muted-foreground">Current</p>
                  <p className="whitespace-pre-wrap text-sm">{c.before || "Not recorded"}</p>
                </div>
                <div className="rounded-xl bg-selected p-3">
                  <p className="mb-2 text-xs text-link">Proposed</p>
                  <p className="whitespace-pre-wrap text-sm">{c.after}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    );
  if (p.kind === "APPLICATION")
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap gap-3">
          <Link href={`/jobs/${p.jobId}`} className="text-link">
            Review opportunity
          </Link>
          <Link
            href={`/api/resumes/${p.resumeVersionId}/file`}
            target="_blank"
            className="text-link"
          >
            Review resume ↗
          </Link>
          <a href={p.targetUrl} target="_blank" rel="noreferrer" className="text-link">
            Application page ↗
          </a>
        </div>
        {Object.entries(p.answers).map(([q, a]) => (
          <div key={q}>
            <p className="text-xs text-muted-foreground">{q}</p>
            <p className="mt-1 whitespace-pre-wrap text-sm">{a}</p>
          </div>
        ))}
        {p.questions.length > 0 && (
          <div className="rounded-xl bg-warning-soft p-4 text-warning">
            <h3>Answers still needed</h3>
            {p.questions.map((q) => (
              <p key={q}>{q}</p>
            ))}
          </div>
        )}
      </div>
    );
  if (p.kind === "OUTREACH")
    return (
      <div className="space-y-3">
        <p className="text-sm">
          <strong>{p.recipient}</strong> · {p.channel.replaceAll("_", " ")}
        </p>
        <p className="break-words text-xs text-muted-foreground">To: {p.destination}</p>
        <p className="whitespace-pre-wrap rounded-xl bg-muted p-4 text-sm leading-relaxed">
          {p.draft}
        </p>
      </div>
    );
  if (p.kind === "SHOWCASE")
    return (
      <div>
        <a
          href={p.targetUrl}
          target="_blank"
          rel="noreferrer"
          className="break-all text-sm text-link"
        >
          {p.targetUrl} ↗
        </a>
        <h3 className="mt-4">{p.title}</h3>
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{p.content}</p>
      </div>
    );
  return (
    <p className="whitespace-pre-wrap text-sm leading-relaxed">
      {p.kind === "PREFERENCES" ? p.context : p.content}
    </p>
  );
}
