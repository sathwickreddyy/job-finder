import { useSearchParams } from "react-router-dom";
import { Input } from "../ui/Input";
import { Select } from "../ui/Select";
import { ALL_PRIORITIES, ALL_STATUSES } from "../../lib/constants";

export function FilterBar() {
  const [params, setParams] = useSearchParams();

  function set(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  }

  return (
    <div className="grid gap-3 rounded-3xl border border-border bg-surface p-4 shadow-xl shadow-black/5 backdrop-blur-xl md:grid-cols-[minmax(220px,1fr)_auto_auto_minmax(180px,0.7fr)]">
      <label className="space-y-1">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-text-faint">
          Search
        </span>
        <Input
          placeholder="Search role / company / JD…"
          defaultValue={params.get("q") ?? ""}
          onBlur={(e) => set("q", e.currentTarget.value)}
        />
      </label>
      <label className="space-y-1">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-text-faint">
          Status
        </span>
        <Select value={params.get("status") ?? ""} onChange={(e) => set("status", e.target.value)}>
          <option value="">All statuses</option>
          {ALL_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
      </label>
      <label className="space-y-1">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-text-faint">
          Priority
        </span>
        <Select value={params.get("priority") ?? ""} onChange={(e) => set("priority", e.target.value)}>
          <option value="">All priorities</option>
          {ALL_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </Select>
      </label>
      <label className="space-y-1">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-text-faint">
          Location
        </span>
        <Input
          placeholder="Location contains"
          defaultValue={params.get("location_contains") ?? ""}
          onBlur={(e) => set("location_contains", e.currentTarget.value)}
        />
      </label>
    </div>
  );
}
