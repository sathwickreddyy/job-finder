import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ExternalLink, Sparkles } from "lucide-react";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { AiPendingBadge } from "./AiPendingBadge";
import { api, apiErrorMessage } from "../../lib/api-client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { components } from "../../lib/api-types";

type Scored = components["schemas"]["ScoredJobOut"];

export function JobTableExpandedRow({ scored }: { scored: Scored }) {
  const [tailor, setTailor] = useState<{ markdown: string; ai_pending: boolean } | null>(null);
  const matchedSkills = scored.matched_skills ?? [];
  const missingSkills = scored.missing_skills ?? [];
  const reasons = scored.reasons ?? [];

  const run = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST("/api/jobs/{job_id}/tailor", {
        params: { path: { job_id: scored.job.id } },
      });
      if (error) throw new Error(apiErrorMessage(error, "tailor failed"));
      return data!;
    },
    onSuccess: (d) => setTailor({ markdown: d.markdown, ai_pending: d.ai_pending }),
  });

  return (
    <div className="space-y-4 border-l-4 border-accent/50 bg-black/15 px-5 py-5 text-sm">
      <div className="grid gap-3 lg:grid-cols-3">
        <div className="rounded-2xl border border-success/20 bg-success/10 p-3">
          <span className="text-xs font-semibold uppercase tracking-widest text-success">Fits</span>
          <div className="mt-1 text-text-muted">{matchedSkills.join(", ") || "—"}</div>
        </div>
        <div className="rounded-2xl border border-danger/20 bg-danger/10 p-3">
          <span className="text-xs font-semibold uppercase tracking-widest text-danger">Gaps</span>
          <div className="mt-1 text-text-muted">{missingSkills.join(", ") || "—"}</div>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-3">
          <span className="text-xs font-semibold uppercase tracking-widest text-text-muted">
            Resume variant
          </span>
          <div className="mt-1 font-mono text-accent">
            {scored.recommended_resume_variant || "default"}
          </div>
        </div>
      </div>
      {reasons.length > 0 && (
        <p className="rounded-2xl border border-border bg-surface p-3 text-xs leading-5 text-text-muted">
          {reasons.join(" · ")}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="primary" onClick={() => run.mutate()} disabled={run.isPending}>
          <Sparkles className="h-3.5 w-3.5" />
          {run.isPending ? "Tailoring…" : "Tailor Resume"}
        </Button>
        <Button size="sm" variant="secondary" onClick={() => window.open(scored.job.url, "_blank")}>
          <ExternalLink className="h-3.5 w-3.5" />
          Open JD
        </Button>
      </div>
      {tailor && (
        <Dialog open onClose={() => setTailor(null)}>
          <div className="flex items-center gap-3 mb-3">
            <h3 className="text-lg font-semibold">Tailor sheet</h3>
            <AiPendingBadge pending={tailor.ai_pending} />
          </div>
          {tailor.ai_pending && (
          <div className="mb-3 rounded-2xl border border-accent-amber/40 bg-accent-amber/10 p-3 text-xs text-accent-amber">
            AI integration pending — add <code>OPENAI_API_KEY</code> or <code>ANTHROPIC_API_KEY</code> to <code>.env</code> for AI-drafted rewrites. Deterministic template shown below.
          </div>
          )}
          <article className="prose prose-invert prose-sm max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{tailor.markdown}</ReactMarkdown>
          </article>
        </Dialog>
      )}
    </div>
  );
}
