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

/** One 0–100 track: the filled bar is this file, the ring marks the master. */
export function ScaleBar({
  base,
  mine,
  target,
}: {
  base: number | null;
  mine: number | null;
  target?: number;
}) {
  return (
    <div className="relative h-2 rounded-full bg-muted" aria-hidden>
      <div
        className="absolute inset-y-0 left-0 rounded-full bg-primary"
        style={{ width: `${mine ?? 0}%` }}
      />
      {base != null && (
        <div
          className="absolute -top-1 h-4 w-1 -translate-x-1/2 rounded-full border-2 border-foreground/60 bg-card"
          style={{ left: `${base}%` }}
        />
      )}
      {target != null && (
        <div
          className="absolute -top-0.5 h-3 w-px bg-muted-foreground/70"
          style={{ left: `${target}%` }}
        />
      )}
    </div>
  );
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export function Highlight({ text, terms }: { text: string; terms: string[] }) {
  const words = terms.filter(Boolean);
  if (!words.length) return <>{text}</>;
  const parts = text.split(new RegExp(`(${words.map(escape).join("|")})`, "ig"));
  return (
    <>
      {parts.map((part, i) =>
        words.some((w) => w.toLowerCase() === part.toLowerCase()) ? (
          <mark key={i} className="rounded bg-selected px-0.5 text-selected-foreground">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
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
