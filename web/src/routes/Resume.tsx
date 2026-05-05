import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Download, FileText, Save } from "lucide-react";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { PageHeader } from "../components/layout/PageHeader";
import { LoadingState } from "../components/shared/LoadingState";
import { ErrorState } from "../components/shared/ErrorState";
import { api, apiErrorMessage } from "../lib/api-client";

export default function Resume() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["resume"],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/resume");
      if (error) throw new Error(apiErrorMessage(error, "load failed"));
      return data!;
    },
  });

  const [draft, setDraft] = useState("");
  useEffect(() => {
    if (q.data) setDraft(q.data.markdown);
  }, [q.data]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await api.PUT("/api/resume", {
        body: { markdown: draft },
      });
      if (error) throw new Error(apiErrorMessage(error, "save failed"));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["resume"] }),
  });

  if (q.isLoading) return <LoadingState />;
  if (q.isError) return <ErrorState message={(q.error as Error).message} />;
  const d = q.data!;

  const sourceTone: "cyan" | "amber" | "red" =
    d.md_source === "portfolio"
      ? "cyan"
      : d.md_source === "local"
        ? "amber"
        : "red";
  const readOnly = d.md_source === "portfolio";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Candidate asset"
        title="Resume"
        description="Preview the active markdown resume, make local edits when enabled, and download portfolio-backed PDF or DOCX versions."
        meta={
          <div className="inline-flex items-center gap-2">
            <Badge tone={sourceTone}>{d.md_source}</Badge>
            <span className="text-xs text-text-muted">
              {readOnly ? "Portfolio source is read-only here" : "Local edits can be saved"}
            </span>
          </div>
        }
        actions={
          <>
            {d.has_pdf && (
              <Button
                variant="secondary"
                onClick={() => window.open("/api/resume/pdf", "_blank")}
              >
                <Download className="h-4 w-4" /> PDF
              </Button>
            )}
            {d.has_docx && (
              <Button
                variant="secondary"
                onClick={() => window.open("/api/resume/docx", "_blank")}
              >
                <Download className="h-4 w-4" /> DOCX
              </Button>
            )}
            <Button
              variant="primary"
              onClick={() => save.mutate()}
              disabled={save.isPending || draft === d.markdown || readOnly}
              title={
                readOnly
                  ? "Resume source is portfolio (read-only) — edit the portfolio repo to make changes."
                  : undefined
              }
            >
              <Save className="h-4 w-4" /> {save.isPending ? "Saving…" : "Save"}
            </Button>
          </>
        }
      />

      {readOnly && (
        <div className="rounded-3xl border border-accent/30 bg-accent/10 p-4 text-sm text-accent">
          Read-only: the active resume is served from the portfolio repo.
          Edit the markdown there (or unset <code>RESUME_MD_PATH</code>) to
          enable in-app saves.
        </div>
      )}
      {save.isError && (
        <div className="rounded-3xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
          {(save.error as Error).message}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="min-h-[70vh] p-0">
          <div className="flex items-center gap-3 border-b border-border px-5 py-4">
            <FileText className="h-5 w-5 text-accent" />
            <div>
              <div className="text-sm font-semibold">Preview</div>
              <div className="text-xs text-text-muted">Rendered markdown exactly as the app sees it.</div>
            </div>
          </div>
          <article className="prose prose-invert prose-sm max-w-none p-5">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {draft || "_(empty)_"}
            </ReactMarkdown>
          </article>
        </Card>
        <Card className="p-0">
          <div className="border-b border-border px-5 py-4">
            <div className="text-sm font-semibold">Edit markdown</div>
            <div className="text-xs text-text-muted">
              Saves are disabled when the portfolio repo is the active source.
            </div>
          </div>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="min-h-[70vh] w-full resize-none border-0 bg-transparent p-5 font-mono text-xs leading-5 text-text focus:outline-none"
          />
        </Card>
      </div>
    </div>
  );
}
