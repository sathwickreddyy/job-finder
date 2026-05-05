import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2, Plus, ChevronDown, ChevronRight } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { Button } from "../../components/ui/Button";
import { PageHeader } from "../../components/layout/PageHeader";
import { LoadingState } from "../../components/shared/LoadingState";
import { ErrorState } from "../../components/shared/ErrorState";
import { api, apiErrorMessage } from "../../lib/api-client";
import type { components } from "../../lib/api-types";

type CompanyIn = components["schemas"]["CompanyIn"];
type CompanyPatch = components["schemas"]["CompanyPatch"];

// Backend returns rows with id + other fields via dict; keep a permissive
// row shape for rendering. CompanyIn covers editable fields.
type CompanyRow = CompanyIn & {
  id: number;
  enabled?: boolean;
};

const ATS = [
  "greenhouse",
  "ashby",
  "lever",
  "workday",
  "manual",
  "unknown",
] as const;
const PRIORITIES = ["P0", "P1", "P2"] as const;

type TokenField = "board_token" | "org_slug" | "company_slug";

function tokenFieldFor(atsType: string | undefined): TokenField | null {
  switch (atsType) {
    case "greenhouse":
      return "board_token";
    case "ashby":
      return "org_slug";
    case "lever":
      return "company_slug";
    default:
      return null;
  }
}

function tokenLabelFor(atsType: string | undefined): string {
  switch (atsType) {
    case "greenhouse":
      return "Greenhouse board_token";
    case "ashby":
      return "Ashby org_slug";
    case "lever":
      return "Lever company_slug";
    default:
      return "Identifier (n/a for this ATS)";
  }
}

export default function Companies() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["settings", "companies"],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/settings/companies");
      if (error) throw new Error(apiErrorMessage(error, "load failed"));
      return data! as unknown as CompanyRow[];
    },
  });

  const [newRow, setNewRow] = useState<CompanyIn>({
    name: "",
    ats_type: "unknown",
    priority: "P2",
    enabled: true,
  });

  const add = useMutation({
    mutationFn: async () => {
      const { error } = await api.POST("/api/settings/companies", {
        body: newRow,
      });
      if (error) throw new Error(apiErrorMessage(error, "add failed"));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings", "companies"] });
      setNewRow({
        name: "",
        ats_type: "unknown",
        priority: "P2",
        enabled: true,
      });
    },
  });

  const patch = useMutation({
    mutationFn: async ({ id, body }: { id: number; body: CompanyPatch }) => {
      const { error } = await api.PATCH("/api/settings/companies/{cid}", {
        params: { path: { cid: id } },
        body,
      });
      if (error) throw new Error(apiErrorMessage(error, "update failed"));
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["settings", "companies"] }),
  });

  const remove = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await api.DELETE("/api/settings/companies/{cid}", {
        params: { path: { cid: id } },
      });
      if (error) throw new Error(apiErrorMessage(error, "delete failed"));
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["settings", "companies"] }),
  });

  if (q.isLoading) return <LoadingState />;
  if (q.isError) return <ErrorState message={(q.error as Error).message} />;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Target companies"
        title="Companies"
        description="Manage ATS slugs, priorities, and company-specific notes. Enabled rows are used by source fetches and scoring."
      />

      <Card>
        <div className="mb-4">
          <h3 className="text-sm font-semibold">Add target company</h3>
          <p className="mt-1 text-xs text-text-muted">
            Start with the company name, then expand the row to add ATS tokens and notes.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_auto_auto_auto]">
          <Input
            placeholder="Name"
            value={newRow.name}
            onChange={(e) => setNewRow({ ...newRow, name: e.target.value })}
          />
          <Select
            value={newRow.ats_type ?? "unknown"}
            onChange={(e) => setNewRow({ ...newRow, ats_type: e.target.value })}
          >
            {ATS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </Select>
          <Select
            value={newRow.priority ?? "P2"}
            onChange={(e) => setNewRow({ ...newRow, priority: e.target.value })}
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
          <Button
            variant="primary"
            disabled={!newRow.name || add.isPending}
            onClick={() => add.mutate()}
          >
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-border px-5 py-4">
          <h3 className="text-sm font-semibold">Configured companies</h3>
          <p className="mt-1 text-xs text-text-muted">
            Expand a row to edit ATS identifiers, location preferences, and notes.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="bg-black/10 text-[10px] uppercase tracking-[0.22em] text-text-muted">
                <th className="w-8 px-4 py-3 text-left font-semibold"></th>
                <th className="px-4 py-3 text-left font-semibold">Name</th>
                <th className="px-4 py-3 text-left font-semibold">ATS</th>
                <th className="px-4 py-3 text-left font-semibold">
                  Token / slug
                </th>
                <th className="px-4 py-3 text-left font-semibold">Priority</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {q.data!.map((c) => (
                <CompanyRowView
                  key={c.id}
                  row={c}
                  onPatch={(body) => patch.mutate({ id: c.id, body })}
                  onRemove={() => remove.mutate(c.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function CompanyRowView({
  row,
  onPatch,
  onRemove,
}: {
  row: CompanyRow;
  onPatch: (body: CompanyPatch) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const tokenField = tokenFieldFor(row.ats_type);
  const rawToken = tokenField ? row[tokenField] : null;
  const currentToken = typeof rawToken === "string" ? rawToken : "";
  const locationsValue = (row.preferred_locations ?? []).join(", ");

  // Local draft for the expanded editors — flush to server on blur so the
  // user can type a multi-word comma-separated list without mid-keystroke
  // re-renders triggering PATCH per character.
  const [tokenDraft, setTokenDraft] = useState(currentToken);
  const [locationsDraft, setLocationsDraft] = useState(locationsValue);
  const [notesDraft, setNotesDraft] = useState(row.notes ?? "");

  useEffect(() => {
    setTokenDraft(currentToken);
    setLocationsDraft(locationsValue);
    setNotesDraft(row.notes ?? "");
  }, [currentToken, locationsValue, row.id, row.notes]);

  const Chev = expanded ? ChevronDown : ChevronRight;

  return (
    <>
      <tr className="border-t border-border transition-colors hover:bg-surface-hover">
        <td className="w-8 px-4 py-3">
          <button
            type="button"
            aria-label={expanded ? "Collapse" : "Expand"}
            onClick={() => setExpanded((v) => !v)}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-black/15 text-text-faint hover:text-text"
          >
            <Chev className="h-3.5 w-3.5" />
          </button>
        </td>
        <td className="px-4 py-3 font-medium">{row.name}</td>
        <td className="px-4 py-3 text-text-muted">
          <Select
            value={row.ats_type ?? "unknown"}
            onChange={(e) => onPatch({ ats_type: e.target.value })}
          >
            {ATS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </Select>
        </td>
        <td className="px-4 py-3 font-mono text-xs text-text-muted">
          {currentToken || "—"}
        </td>
        <td className="px-4 py-3">
          <Select
            value={row.priority ?? "P2"}
            onChange={(e) => onPatch({ priority: e.target.value })}
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
        </td>
        <td className="px-4 py-3 text-right">
          <Button size="sm" variant="danger" onClick={onRemove}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </td>
      </tr>
      {expanded && (
        <tr className="border-t border-border/60 bg-black/15">
          <td colSpan={6} className="px-5 py-5">
            <div className="grid gap-4 lg:grid-cols-2">
              {tokenField ? (
                <label className="space-y-1 rounded-2xl border border-border bg-surface p-3 text-xs text-text-muted">
                  <div className="font-semibold uppercase tracking-widest text-text-faint">
                    {tokenLabelFor(row.ats_type)}
                  </div>
                  <Input
                    value={tokenDraft}
                    placeholder={tokenField}
                    onChange={(e) => setTokenDraft(e.target.value)}
                    onBlur={() => {
                      if (tokenDraft !== currentToken) {
                        onPatch({ [tokenField]: tokenDraft } as CompanyPatch);
                      }
                    }}
                  />
                </label>
              ) : (
                <div className="rounded-2xl border border-dashed border-border p-3 text-xs text-text-faint">
                  {tokenLabelFor(row.ats_type)} — switch ATS to enable fetching.
                </div>
              )}

              <label className="space-y-1 rounded-2xl border border-border bg-surface p-3 text-xs text-text-muted">
                <div className="font-semibold uppercase tracking-widest text-text-faint">
                  Preferred locations
                </div>
                <Input
                  value={locationsDraft}
                  onChange={(e) => setLocationsDraft(e.target.value)}
                  onBlur={() => {
                    const parsed = locationsDraft
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean);
                    const orig = row.preferred_locations ?? [];
                    if (JSON.stringify(parsed) !== JSON.stringify(orig)) {
                      onPatch({ preferred_locations: parsed });
                    }
                  }}
                />
              </label>

              <label className="space-y-1 rounded-2xl border border-border bg-surface p-3 text-xs text-text-muted lg:col-span-2">
                <div className="font-semibold uppercase tracking-widest text-text-faint">Notes</div>
                <Input
                  value={notesDraft}
                  onChange={(e) => setNotesDraft(e.target.value)}
                  onBlur={() => {
                    if (notesDraft !== (row.notes ?? "")) {
                      onPatch({ notes: notesDraft });
                    }
                  }}
                />
              </label>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
