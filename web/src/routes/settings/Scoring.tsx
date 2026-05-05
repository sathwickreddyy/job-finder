import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";
import { LoadingState } from "../../components/shared/LoadingState";
import { ErrorState } from "../../components/shared/ErrorState";
import { api } from "../../lib/api-client";

export default function Scoring() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["settings", "scoring"],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/settings/scoring");
      if (error)
        throw new Error(
          (error as { detail?: { msg?: string }[] }).detail?.[0]?.msg ||
            "load failed",
        );
      return data!;
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [draft, setDraft] = useState<any>({});
  useEffect(() => {
    if (q.data) setDraft(q.data);
  }, [q.data]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await api.PUT("/api/settings/scoring", {
        body: draft,
      });
      if (error)
        throw new Error(
          (error as { detail?: { msg?: string }[] }).detail?.[0]?.msg ||
            "save failed",
        );
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["settings", "scoring"] }),
  });

  if (q.isLoading) return <LoadingState />;
  if (q.isError) return <ErrorState message={(q.error as Error).message} />;

  function setThreshold(key: "P0" | "P1" | "P2", v: number) {
    setDraft({ ...draft, thresholds: { ...draft.thresholds, [key]: v } });
  }
  function setList(key: string, csv: string) {
    setDraft({
      ...draft,
      [key]: csv
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    });
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <h2 className="text-xl font-semibold tracking-tight">Scoring</h2>

      <Card className="space-y-3">
        <h3 className="text-sm font-semibold">Thresholds</h3>
        {(["P0", "P1", "P2"] as const).map((p) => (
          <div key={p} className="flex items-center gap-3">
            <label className="w-10 text-xs text-text-muted">{p}</label>
            <Input
              type="number"
              value={draft.thresholds?.[p] ?? 0}
              onChange={(e) => setThreshold(p, Number(e.target.value))}
            />
          </div>
        ))}
      </Card>

      <Card className="space-y-3">
        <h3 className="text-sm font-semibold">Keyword lists</h3>
        <label className="block text-xs text-text-muted">
          Positive keywords
        </label>
        <Input
          value={(draft.positive_keywords ?? []).join(", ")}
          onChange={(e) => setList("positive_keywords", e.target.value)}
        />
        <label className="block text-xs text-text-muted">
          Negative keywords (forces Ignore)
        </label>
        <Input
          value={(draft.negative_keywords ?? []).join(", ")}
          onChange={(e) => setList("negative_keywords", e.target.value)}
        />
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
