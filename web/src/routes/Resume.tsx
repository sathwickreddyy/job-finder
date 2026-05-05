import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Download, Save } from "lucide-react";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { LoadingState } from "../components/shared/LoadingState";
import { ErrorState } from "../components/shared/ErrorState";
import { api } from "../lib/api-client";

export default function Resume() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["resume"],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/resume");
      if (error)
        throw new Error(
          (error as { detail?: { msg?: string }[] }).detail?.[0]?.msg ||
            "load failed",
        );
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
      if (error)
        throw new Error(
          (error as { detail?: { msg?: string }[] }).detail?.[0]?.msg ||
            "save failed",
        );
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

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-semibold tracking-tight">Resume</h2>
          <Badge tone={sourceTone}>{d.md_source}</Badge>
        </div>
        <div className="flex gap-2">
          {d.has_pdf && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => window.open("/api/resume/pdf", "_blank")}
            >
              <Download className="w-3 h-3" /> PDF
            </Button>
          )}
          {d.has_docx && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => window.open("/api/resume/docx", "_blank")}
            >
              <Download className="w-3 h-3" /> DOCX
            </Button>
          )}
          <Button
            size="sm"
            variant="primary"
            onClick={() => save.mutate()}
            disabled={save.isPending || draft === d.markdown}
          >
            <Save className="w-3 h-3" /> {save.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card className="p-4">
          <div className="text-[10px] uppercase tracking-widest text-text-muted font-semibold mb-3">
            Preview
          </div>
          <article className="prose prose-invert prose-sm max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {draft || "_(empty)_"}
            </ReactMarkdown>
          </article>
        </Card>
        <Card className="p-0">
          <div className="text-[10px] uppercase tracking-widest text-text-muted font-semibold px-4 pt-4 mb-2">
            Edit
          </div>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="w-full min-h-[70vh] font-mono text-xs p-4 bg-transparent border-0 resize-none focus:outline-none text-text"
          />
        </Card>
      </div>
    </div>
  );
}
