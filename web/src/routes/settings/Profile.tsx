import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";
import { CsvInput } from "../../components/ui/CsvInput";
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

  const [draft, setDraft] = useState<ProfileDraft>({});
  useEffect(() => {
    if (q.data) setDraft(q.data as ProfileDraft);
  }, [q.data]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await api.PUT("/api/settings/profile", {
        body: draft,
      });
      if (error) throw new Error(apiErrorMessage(error, "save failed"));
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["settings", "profile"] }),
  });

  if (q.isLoading) return <LoadingState />;
  if (q.isError) return <ErrorState message={(q.error as Error).message} />;

  function setField<K extends keyof ProfileDraft>(
    key: K,
    value: ProfileDraft[K],
  ) {
    setDraft({ ...draft, [key]: value });
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <h2 className="text-xl font-semibold tracking-tight">Profile</h2>
      <Card className="space-y-3">
        <label className="block text-xs text-text-muted">Name</label>
        <Input
          value={draft.name ?? ""}
          onChange={(e) => setField("name", e.target.value)}
        />

        <label className="block text-xs text-text-muted">
          Years of experience
        </label>
        <Input
          type="number"
          value={draft.years_of_experience ?? 0}
          onChange={(e) =>
            setField("years_of_experience", Number(e.target.value))
          }
        />

        <label className="block text-xs text-text-muted">
          Target roles (comma-separated)
        </label>
        <CsvInput
          value={draft.target_roles ?? []}
          onCommit={(v) => setField("target_roles", v)}
        />

        <label className="block text-xs text-text-muted">
          Preferred locations
        </label>
        <CsvInput
          value={draft.preferred_locations ?? []}
          onCommit={(v) => setField("preferred_locations", v)}
        />

        <label className="block text-xs text-text-muted">Strong skills</label>
        <CsvInput
          value={draft.strong_skills ?? []}
          onCommit={(v) => setField("strong_skills", v)}
        />

        <label className="block text-xs text-text-muted">Avoid skills</label>
        <CsvInput
          value={draft.avoid_skills ?? []}
          onCommit={(v) => setField("avoid_skills", v)}
        />

        <label className="block text-xs text-text-muted">
          Exclude locations (forces Ignore)
        </label>
        <CsvInput
          value={draft.exclude_locations ?? []}
          onCommit={(v) => setField("exclude_locations", v)}
        />

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
