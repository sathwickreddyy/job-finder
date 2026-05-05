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
    <div className="flex flex-wrap gap-2 items-center">
      <Input
        placeholder="Search role / company / JD…"
        className="max-w-sm"
        defaultValue={params.get("q") ?? ""}
        onBlur={(e) => set("q", e.currentTarget.value)}
      />
      <Select value={params.get("status") ?? ""} onChange={(e) => set("status", e.target.value)}>
        <option value="">All statuses</option>
        {ALL_STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </Select>
      <Select value={params.get("priority") ?? ""} onChange={(e) => set("priority", e.target.value)}>
        <option value="">All priorities</option>
        {ALL_PRIORITIES.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </Select>
      <Input
        placeholder="Location contains"
        className="max-w-xs"
        defaultValue={params.get("location_contains") ?? ""}
        onBlur={(e) => set("location_contains", e.currentTarget.value)}
      />
    </div>
  );
}
