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

type ProfileDraft = {
  name?: string;
  years_of_experience?: number;
  target_roles?: string[];
  preferred_locations?: string[];
  strong_skills?: string[];
  avoid_skills?: string[];
  exclude_locations?: string[];
  [k: string]: unknown;
};

export default function Profile() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["settings", "profile"],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/settings/profile");
      if (error) throw new Error(apiErrorMessage(error, "load failed"));
      return data!;
    },
  });

  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  useEffect(() => {
    if (q.data) setDraft(q.data as ProfileDraft);
  }, [q.data]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await api.PUT("/api/settings/profile", {
        body: draft ?? (q.data as ProfileDraft),
      });
      if (error) throw new Error(apiErrorMessage(error, "save failed"));
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["settings", "profile"] }),
  });

  if (q.isLoading) return <LoadingState />;
  if (q.isError) return <ErrorState message={(q.error as Error).message} />;
  const activeDraft = draft ?? (q.data as ProfileDraft);

  function setField<K extends keyof ProfileDraft>(
    key: K,
    value: ProfileDraft[K],
  ) {
    setDraft({ ...activeDraft, [key]: value });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Candidate profile"
        title="Profile"
        description="These defaults seed search filters and scoring. Keep them specific enough to remove noisy jobs."
      />
      <Card className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-xs text-text-muted">
            <span className="font-semibold uppercase tracking-widest text-text-faint">Name</span>
            <Input
              value={activeDraft.name ?? ""}
              onChange={(e) => setField("name", e.target.value)}
            />
          </label>

          <label className="space-y-1 text-xs text-text-muted">
            <span className="font-semibold uppercase tracking-widest text-text-faint">
              Years of experience
            </span>
            <Input
              type="number"
              value={activeDraft.years_of_experience ?? 0}
              onChange={(e) =>
                setField("years_of_experience", Number(e.target.value))
              }
            />
          </label>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <label className="space-y-1 text-xs text-text-muted">
            <span className="font-semibold uppercase tracking-widest text-text-faint">
              Target roles
            </span>
            <CsvInput
              value={activeDraft.target_roles ?? []}
              onCommit={(v) => setField("target_roles", v)}
              placeholder="Backend Engineer, Platform Engineer"
            />
          </label>

          <label className="space-y-1 text-xs text-text-muted">
            <span className="font-semibold uppercase tracking-widest text-text-faint">
              Preferred locations
            </span>
            <CsvInput
              value={activeDraft.preferred_locations ?? []}
              onCommit={(v) => setField("preferred_locations", v)}
              placeholder="Bengaluru, Remote"
            />
          </label>

          <label className="space-y-1 text-xs text-text-muted">
            <span className="font-semibold uppercase tracking-widest text-text-faint">
              Strong skills
            </span>
            <CsvInput
              value={activeDraft.strong_skills ?? []}
              onCommit={(v) => setField("strong_skills", v)}
              placeholder="Python, FastAPI, Kafka"
            />
          </label>

          <label className="space-y-1 text-xs text-text-muted">
            <span className="font-semibold uppercase tracking-widest text-text-faint">
              Avoid skills
            </span>
            <CsvInput
              value={activeDraft.avoid_skills ?? []}
              onCommit={(v) => setField("avoid_skills", v)}
              placeholder="frontend only, PHP"
            />
          </label>
        </div>

        <label className="block space-y-1 text-xs text-text-muted">
          <span className="font-semibold uppercase tracking-widest text-text-faint">
            Exclude locations
          </span>
          <CsvInput
            value={activeDraft.exclude_locations ?? []}
            onCommit={(v) => setField("exclude_locations", v)}
            placeholder="US only, onsite only"
          />
          <span className="block text-text-faint">Matches here are forced to Ignore.</span>
        </label>

        <div className="flex justify-end">
          <Button
            variant="primary"
            onClick={() => save.mutate()}
            disabled={save.isPending}
          >
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
