import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2, Plus, ChevronDown, ChevronRight } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { Button } from "../../components/ui/Button";
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

const ATS = ["greenhouse", "ashby", "lever", "workday", "manual", "unknown"] as const;
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
      setNewRow({ name: "", ats_type: "unknown", priority: "P2", enabled: true });
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings", "companies"] }),
  });

  const remove = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await api.DELETE("/api/settings/companies/{cid}", {
        params: { path: { cid: id } },
      });
      if (error) throw new Error(apiErrorMessage(error, "delete failed"));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings", "companies"] }),
  });

  if (q.isLoading) return <LoadingState />;
  if (q.isError) return <ErrorState message={(q.error as Error).message} />;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold tracking-tight">Companies</h2>

      <Card className="flex flex-wrap gap-2 items-end">
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
          <Plus className="w-3 h-3" /> Add
        </Button>
      </Card>

      <Card className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-widest text-text-muted">
              <th className="text-left px-4 py-3 font-medium w-8"></th>
              <th className="text-left px-4 py-3 font-medium">Name</th>
              <th className="text-left px-4 py-3 font-medium">ATS</th>
              <th className="text-left px-4 py-3 font-medium">Token / slug</th>
              <th className="text-left px-4 py-3 font-medium">Priority</th>
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

  // Local draft for the expanded editors — flush to server on blur so the
  // user can type a multi-word comma-separated list without mid-keystroke
  // re-renders triggering PATCH per character.
  const [tokenDraft, setTokenDraft] = useState(currentToken);
  const [locationsDraft, setLocationsDraft] = useState(
    (row.preferred_locations ?? []).join(", "),
  );
  const [notesDraft, setNotesDraft] = useState(row.notes ?? "");

  const Chev = expanded ? ChevronDown : ChevronRight;

  return (
    <>
      <tr className="border-t border-border">
        <td className="px-2 py-2 w-8">
          <button
            type="button"
            aria-label={expanded ? "Collapse" : "Expand"}
            onClick={() => setExpanded((v) => !v)}
            className="text-text-faint hover:text-text"
          >
            <Chev className="w-3 h-3" />
          </button>
        </td>
        <td className="px-4 py-2 font-medium">{row.name}</td>
        <td className="px-4 py-2 text-text-muted">
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
        <td className="px-4 py-2 text-text-muted text-xs font-mono">
          {currentToken || "—"}
        </td>
        <td className="px-4 py-2">
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
        <td className="px-4 py-2 text-right">
          <Button size="sm" variant="danger" onClick={onRemove}>
            <Trash2 className="w-3 h-3" />
          </Button>
        </td>
      </tr>
      {expanded && (
        <tr className="border-t border-border/60 bg-surface/50">
          <td colSpan={6} className="px-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              {tokenField ? (
                <label className="space-y-1 text-xs text-text-muted">
                  <div>{tokenLabelFor(row.ats_type)}</div>
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
                <div className="text-xs text-text-faint">
                  {tokenLabelFor(row.ats_type)} — switch ATS to enable fetching.
                </div>
              )}

              <label className="space-y-1 text-xs text-text-muted">
                <div>Preferred locations (comma-separated)</div>
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

              <label className="col-span-2 space-y-1 text-xs text-text-muted">
                <div>Notes</div>
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
