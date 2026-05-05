import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";
import { CsvInput } from "../../components/ui/CsvInput";
import { PageHeader } from "../../components/layout/PageHeader";
import { LoadingState } from "../../components/shared/LoadingState";
import { ErrorState } from "../../components/shared/ErrorState";
import { api, apiErrorMessage } from "../../lib/api-client";

type ScoringDraft = {
  thresholds?: { P0?: number; P1?: number; P2?: number };
  positive_keywords?: string[];
  negative_keywords?: string[];
  [k: string]: unknown;
};

export default function Scoring() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["settings", "scoring"],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/settings/scoring");
      if (error) throw new Error(apiErrorMessage(error, "load failed"));
      return data!;
    },
  });

  const [draft, setDraft] = useState<ScoringDraft>({});
  useEffect(() => {
    if (q.data) setDraft(q.data as ScoringDraft);
  }, [q.data]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await api.PUT("/api/settings/scoring", {
        body: draft,
      });
      if (error) throw new Error(apiErrorMessage(error, "save failed"));
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["settings", "scoring"] }),
  });

  if (q.isLoading) return <LoadingState />;
  if (q.isError) return <ErrorState message={(q.error as Error).message} />;

  function setThreshold(key: "P0" | "P1" | "P2", v: number) {
    setDraft({ ...draft, thresholds: { ...(draft.thresholds ?? {}), [key]: v } });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Ranking model"
        title="Scoring"
        description="Tune the deterministic scorer before the optional LLM refinement runs. Higher thresholds make the shortlist stricter."
      />

      <Card className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold">Priority thresholds</h3>
          <p className="mt-1 text-xs text-text-muted">
            Scores at or above each value receive that priority.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {(["P0", "P1", "P2"] as const).map((p) => (
            <label key={p} className="space-y-1 text-xs text-text-muted">
              <span className="font-semibold uppercase tracking-widest text-text-faint">{p}</span>
              <Input
                type="number"
                value={draft.thresholds?.[p] ?? 0}
                onChange={(e) => setThreshold(p, Number(e.target.value))}
              />
            </label>
          ))}
        </div>
      </Card>

      <Card className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold">Keyword lists</h3>
          <p className="mt-1 text-xs text-text-muted">
            Use keywords for strong deterministic nudges before semantic review.
          </p>
        </div>
        <label className="block space-y-1 text-xs text-text-muted">
          <span className="font-semibold uppercase tracking-widest text-text-faint">
            Positive keywords
          </span>
          <CsvInput
            value={draft.positive_keywords ?? []}
            onCommit={(v) => setDraft({ ...draft, positive_keywords: v })}
            placeholder="distributed systems, Python, platform"
          />
        </label>
        <label className="block space-y-1 text-xs text-text-muted">
          <span className="font-semibold uppercase tracking-widest text-text-faint">
            Negative keywords
          </span>
          <CsvInput
            value={draft.negative_keywords ?? []}
            onCommit={(v) => setDraft({ ...draft, negative_keywords: v })}
            placeholder="frontend only, unpaid, US only"
          />
          <span className="block text-text-faint">Matches here are forced to Ignore.</span>
        </label>
      </Card>

      <div className="flex justify-end">
        <Button
          variant="primary"
          onClick={() => save.mutate()}
          disabled={save.isPending}
        >
          {save.isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
