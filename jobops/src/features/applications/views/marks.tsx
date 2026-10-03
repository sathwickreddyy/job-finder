"use client";

import { useEffect, useId, useState } from "react";
import {
  Check,
  FileText,
  Hourglass,
  Mail,
  MessageSquare,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { familyFill } from "@/features/companies/format";
import { roundFamily, roundKindLabel } from "@/features/companies/metrics";
import { cn } from "@/lib/utils";
import { formatDayTime } from "../dates";
import { phases, type Phase } from "../phase";
import type { QueueRound } from "../queue";

const icons: Record<string, LucideIcon> = {
  DIRECT: FileText,
  REFERRAL: Users,
  COLD_EMAIL: Mail,
  LINKEDIN_MESSAGE: MessageSquare,
};
const outcomeWord = {
  SCHEDULED: "booked",
  PASSED: "cleared",
  FAILED: "not cleared",
  CANCELLED: "cancelled",
};

export function MethodIcon({ source, size = 12 }: { source: string; size?: number }) {
  const Icon = icons[source] ?? FileText;
  return <Icon size={size} aria-hidden className="shrink-0" />;
}

export function CompanyMark({ company, size = "md" }: { company: string; size?: "sm" | "md" }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-xl bg-secondary font-semibold text-secondary-foreground",
        size === "sm" ? "size-8 text-xs" : "size-10 text-sm",
      )}
    >
      {company.slice(0, 2)}
    </span>
  );
}

function Rail({ wide, done }: { wide: boolean; done: boolean }) {
  return (
    <span
      aria-hidden
      className={cn("h-0.5", wide ? "w-8" : "w-4", done ? "bg-muted-foreground/60" : "bg-border")}
    />
  );
}

/** Recorded rounds in family colours; dashed slots only from company research. */
export function RoundLadder({
  rounds,
  typical,
  wide = false,
}: {
  rounds: QueueRound[];
  typical: number | null;
  wide?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [focused, setFocused] = useState<number | null>(null);
  const tooltipId = useId();
  const extra = Math.max(0, (typical ?? 0) - rounds.length);
  const activeIndex = hover ?? focused;
  useEffect(() => {
    if (activeIndex === null) return;
    function dismiss(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setHover(null);
        setFocused(null);
      }
    }
    document.addEventListener("keydown", dismiss);
    return () => document.removeEventListener("keydown", dismiss);
  }, [activeIndex]);
  if (!rounds.length && !extra)
    return <span className="text-xs text-muted-foreground">No rounds recorded</span>;
  const size = wide ? "size-7" : "size-5";
  const active = activeIndex === null ? null : rounds[activeIndex];
  const researchLabel = `Typical loop: ${typical} rounds (company research)`;
  return (
    <div className="relative min-w-0 max-w-full flex-1" onMouseLeave={() => setHover(null)}>
      <div className="flex flex-wrap items-center gap-y-3">
        {rounds.map((round, index) => (
          <div key={round.id} className="flex shrink-0 items-center">
            {index > 0 && <Rail wide={wide} done={round.outcome !== "SCHEDULED"} />}
            <button
              type="button"
              onMouseEnter={() => setHover(index)}
              onFocus={() => {
                setHover(null);
                setFocused(index);
              }}
              onBlur={() => setFocused(null)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setHover(null);
                  setFocused(null);
                }
              }}
              aria-describedby={activeIndex === index ? tooltipId : undefined}
              aria-label={`${roundKindLabel[round.kind]}: ${round.name || roundKindLabel[round.kind]}, ${outcomeWord[round.outcome]}`}
              className={cn(
                "grid shrink-0 place-items-center rounded-full border-0 p-0",
                size,
                round.outcome === "SCHEDULED"
                  ? "bg-transparent ring-2 ring-review ring-offset-2 ring-offset-card"
                  : round.outcome === "FAILED"
                    ? "bg-danger-soft text-destructive"
                    : round.outcome === "CANCELLED"
                      ? "bg-muted text-muted-foreground"
                      : cn(familyFill[roundFamily(round.kind)], "text-card"),
              )}
            >
              {round.outcome === "PASSED" ? (
                <Check size={wide ? 13 : 10} aria-hidden />
              ) : round.outcome === "FAILED" ? (
                <X size={wide ? 13 : 10} aria-hidden />
              ) : round.outcome === "SCHEDULED" ? (
                <span
                  className={cn(
                    "rounded-full",
                    wide ? "size-3.5" : "size-2.5",
                    familyFill[roundFamily(round.kind)],
                  )}
                />
              ) : null}
            </button>
          </div>
        ))}
        {Array.from({ length: extra }, (_, index) => (
          <span key={`research-${index}`} className="flex shrink-0 items-center">
            {(rounds.length > 0 || index > 0) && <Rail wide={wide} done={false} />}
            <span
              role={index === 0 ? "img" : undefined}
              tabIndex={index === 0 ? 0 : undefined}
              aria-label={index === 0 ? researchLabel : undefined}
              aria-hidden={index > 0 ? true : undefined}
              onMouseEnter={() => setHover(rounds.length)}
              onFocus={() => {
                setHover(null);
                setFocused(rounds.length);
              }}
              onBlur={() => setFocused(null)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setHover(null);
                  setFocused(null);
                }
              }}
              aria-describedby={activeIndex === rounds.length ? tooltipId : undefined}
              className={cn("shrink-0 rounded-full border-2 border-dashed border-border", size)}
            />
          </span>
        ))}
      </div>
      {(active || (extra > 0 && activeIndex === rounds.length)) && (
        <div
          id={tooltipId}
          role="tooltip"
          className="absolute top-full left-0 z-10 w-max max-w-full rounded-xl bg-popover px-3 py-2 text-xs text-popover-foreground shadow-surface ring-1 ring-border [overflow-wrap:anywhere]"
        >
          {active ? (
            <>
              <p className="m-0 font-semibold">
                {roundKindLabel[active.kind]}
                {active.name ? ` · ${active.name}` : ""}
              </p>
              <p className="m-0 text-muted-foreground">
                {active.scheduledAt ? formatDayTime(active.scheduledAt) : "No date recorded"} ·{" "}
                {outcomeWord[active.outcome]}
              </p>
            </>
          ) : (
            <p className="m-0">{researchLabel}</p>
          )}
        </div>
      )}
    </div>
  );
}

export function PhaseBar({ phase, label, won }: { phase: Phase; label: string; won: boolean }) {
  const current = phases.indexOf(phase);
  const closed = phase === "Closed";
  return (
    <div className="min-w-0">
      <div className="flex gap-1" aria-hidden>
        {phases.slice(0, 4).map((name, index) => (
          <span
            key={name}
            className={cn(
              "h-1.5 flex-1 rounded-full",
              won
                ? "bg-success"
                : closed
                  ? index < 3
                    ? "bg-muted-foreground/40"
                    : "bg-destructive"
                  : index < current
                    ? "bg-primary/60"
                    : index === current
                      ? "bg-primary"
                      : "bg-muted",
            )}
          />
        ))}
      </div>
      <p
        data-testid="phase-label"
        className={cn(
          "m-0 mt-1.5 text-xs",
          won ? "text-success" : closed ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {label}
      </p>
    </div>
  );
}

export function QuietChip({ clock }: { clock: { days: number; threshold: number } | null }) {
  if (!clock) return null;
  const late = clock.days >= clock.threshold;
  return (
    <span
      title={`Follow up after ${clock.threshold} quiet days`}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs whitespace-nowrap tabular-nums",
        late ? "bg-warning-soft text-warning" : "bg-muted text-muted-foreground",
      )}
    >
      <Hourglass size={12} aria-hidden />
      {clock.days}d{late ? " quiet" : ` of ${clock.threshold}`}
    </span>
  );
}
