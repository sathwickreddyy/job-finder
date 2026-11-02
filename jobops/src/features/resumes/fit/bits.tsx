import { ArrowDown, ArrowUp, Check, CircleAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";

export const fmt = (n: number | null) =>
  n == null ? "—" : Number.isInteger(n) ? `${n}` : n.toFixed(1);

export function Delta({ value }: { value: number | null }) {
  if (value == null) return null;
  if (value === 0) return <span className="text-xs text-muted-foreground">no change</span>;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-medium tabular-nums",
        value > 0 ? "text-success" : "text-danger-action",
      )}
    >
      {value > 0 ? <ArrowUp size={12} aria-hidden /> : <ArrowDown size={12} aria-hidden />}
      <span className="sr-only">{value > 0 ? "up" : "down"}</span>
      {fmt(Math.abs(value))}
    </span>
  );
}

export function Severity({ level }: { level: string }) {
  return (
    <span
      className={cn(
        "mt-1 size-2 shrink-0 rounded-full",
        level === "urgent"
          ? "bg-danger-action"
          : level === "important"
            ? "bg-warning"
            : "bg-muted-foreground/50",
      )}
      role="img"
      aria-label={level}
    />
  );
}

export function FormatIcon({ ok, warn }: { ok: boolean; warn?: boolean }) {
  if (warn)
    return <CircleAlert size={14} className="mt-px shrink-0 text-warning" aria-label="Warning" />;
  if (ok) return <Check size={14} className="mt-px shrink-0 text-success" aria-label="Passes" />;
  return <X size={14} className="mt-px shrink-0 text-danger-action" aria-label="Fails" />;
}
