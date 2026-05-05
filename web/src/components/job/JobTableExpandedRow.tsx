import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ExternalLink, Sparkles } from "lucide-react";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { AiPendingBadge } from "./AiPendingBadge";
import { api } from "../../lib/api-client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Scored = {
  job: { id: string; url: string; description: string | null };
  matched_skills: string[];
  missing_skills: string[];
  reasons: string[];
  recommended_resume_variant: string | null;
};

export function JobTableExpandedRow({ scored }: { scored: Scored }) {
  const [tailor, setTailor] = useState<{ markdown: string; ai_pending: boolean } | null>(null);

  const run = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST("/api/jobs/{job_id}/tailor", {
        params: { path: { job_id: scored.job.id } },
      });
      if (error) throw new Error(error.detail?.[0]?.msg || "tailor failed");
      return data!;
    },
    onSuccess: (d) => setTailor({ markdown: d.markdown, ai_pending: d.ai_pending }),
  });

  return (
    <div className="bg-surface border-l-2 border-accent/40 px-5 py-4 text-sm space-y-3">
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <div>
          <span className="text-success font-medium">Fits:</span>{" "}
          <span className="text-text-muted">{scored.matched_skills.join(", ") || "—"}</span>
        </div>
        <div>
          <span className="text-danger font-medium">Gaps:</span>{" "}
          <span className="text-text-muted">{scored.missing_skills.join(", ") || "—"}</span>
        </div>
        {scored.recommended_resume_variant && (
          <div>
            <span className="font-medium">Resume variant:</span>{" "}
            <code className="text-accent">{scored.recommended_resume_variant}</code>
          </div>
        )}
      </div>
      {scored.reasons.length > 0 && (
        <p className="text-text-muted text-xs">{scored.reasons.join(" · ")}</p>
      )}
      <div className="flex gap-2">
        <Button size="sm" variant="primary" onClick={() => run.mutate()} disabled={run.isPending}>
          <Sparkles className="w-3 h-3" />
          {run.isPending ? "Tailoring…" : "Tailor Resume"}
        </Button>
        <Button size="sm" variant="secondary" onClick={() => window.open(scored.job.url, "_blank")}>
          <ExternalLink className="w-3 h-3" />
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
            <div className="bg-accent-amber/10 border border-accent-amber/40 rounded-md p-3 text-xs text-accent-amber mb-3">
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
