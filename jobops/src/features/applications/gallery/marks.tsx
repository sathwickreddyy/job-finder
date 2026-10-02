"use client";

import { useState } from "react";
import {
  CalendarClock,
  Check,
  FileText,
  Hourglass,
  Mail,
  MessageSquare,
  Timer,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { familyFill } from "@/features/companies/format";
import { roundFamily, roundKindLabel } from "@/features/companies/metrics";
import { cn } from "@/lib/utils";
import {
  SILENCE_DAYS,
  daysSince,
  phases,
  shortDate,
  timeOf,
  type Account,
  type Due,
  type Method,
  type Reason,
  type SampleRecord,
} from "./data";

export const methodIcon: Record<Method, LucideIcon> = {
  DIRECT: FileText,
  REFERRAL: Users,
  COLD_EMAIL: Mail,
  LINKEDIN_MESSAGE: MessageSquare,
};
export const reasonIcon: Record<Reason, LucideIcon> = {
  followup: CalendarClock,
  silence: Hourglass,
  round: Users,
  mail: Mail,
  deadline: Timer,
};
export const reasonLabel: Record<Reason, string> = {
  followup: "Your date",
  silence: "Quiet",
  round: "Round",
  mail: "New mail",
  deadline: "Deadline",
};
/* One meaning per colour: red overdue, yellow today, blue upcoming. */
export const dueTone: Record<Due, { dot: string; text: string; soft: string; label: string }> = {
  overdue: {
    dot: "bg-destructive",
    text: "text-destructive",
    soft: "bg-danger-soft",
    label: "Overdue",
  },
  today: { dot: "bg-review", text: "text-foreground", soft: "bg-warning-soft", label: "Today" },
  week: { dot: "bg-primary", text: "text-link", soft: "bg-selected", label: "This week" },
};

export function initials(company: string) {
  return company.slice(0, 2);
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
      {initials(company)}
    </span>
  );
}

const accountTone: Record<Account, string> = {
  "gmail.com": "bg-chart-coding",
  "outlook.in": "bg-chart-design",
  "outlook.com": "bg-chart-people",
};
export function AccountTag({ account }: { account: Account }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className={cn("size-2 rounded-full", accountTone[account])} aria-hidden />
      {account}
    </span>
  );
}

/** Rounds as a ladder: filled done, ringed scheduled, hollow still to come. */
export function RoundLadder({ record, wide = false }: { record: SampleRecord; wide?: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  const total = Math.max(record.expectedRounds ?? 0, record.rounds.length);
  if (!total) return <span className="text-xs text-muted-foreground">No rounds yet</span>;
  const slots = Array.from({ length: total }, (_, index) => record.rounds[index] ?? null);
  const active = hover === null ? null : record.rounds[hover];
  return (
    <div className="relative">
      <div className="flex items-center" onMouseLeave={() => setHover(null)}>
        {slots.map((round, index) => (
          <div key={index} className="flex items-center">
            {index > 0 && (
              <span
                aria-hidden
                className={cn(
                  "h-0.5",
                  wide ? "w-8" : "w-4",
                  round && round.outcome !== "SCHEDULED" ? "bg-muted-foreground/60" : "bg-border",
                )}
              />
            )}
            {round ? (
              <button
                type="button"
                onMouseEnter={() => setHover(index)}
                onFocus={() => setHover(index)}
                onBlur={() => setHover(null)}
                aria-label={`${roundKindLabel[round.kind]}: ${round.name}, ${round.outcome.toLowerCase()}`}
                className={cn(
                  "grid shrink-0 place-items-center rounded-full border-0 p-0 text-[10px] font-semibold",
                  wide ? "size-7" : "size-5",
                  round.outcome === "SCHEDULED"
                    ? "bg-transparent ring-2 ring-review ring-offset-2 ring-offset-card"
                    : round.outcome === "FAILED"
                      ? "bg-danger-soft text-destructive"
                      : cn(familyFill[roundFamily(round.kind)], "text-white"),
                )}
              >
                {round.outcome === "FAILED" ? (
                  <X size={wide ? 13 : 10} aria-hidden />
                ) : round.outcome === "PASSED" ? (
                  <Check size={wide ? 13 : 10} aria-hidden />
                ) : (
                  <span
                    className={cn(
                      "rounded-full",
                      wide ? "size-3.5" : "size-2.5",
                      familyFill[roundFamily(round.kind)],
                    )}
                  />
                )}
              </button>
            ) : (
              <span
                aria-hidden
                className={cn(
                  "shrink-0 rounded-full border-2 border-dashed border-border",
                  wide ? "size-7" : "size-5",
                )}
              />
            )}
          </div>
        ))}
      </div>
      {active && (
        <div className="ag-fade absolute top-full left-0 z-10 mt-2 w-max rounded-xl bg-popover px-3 py-2 text-xs shadow-surface ring-1 ring-border">
          <p className="m-0 font-semibold">
            {roundKindLabel[active.kind]} · {active.name}
          </p>
          <p className="m-0 text-muted-foreground">
            {shortDate(active.at)}, {timeOf(active.at)} ·{" "}
            {active.outcome === "SCHEDULED"
              ? "scheduled"
              : active.outcome === "PASSED"
                ? "passed"
                : "not cleared"}
          </p>
        </div>
      )}
    </div>
  );
}

/** Five phases as a segmented bar, the current one labelled. */
export function PhaseBar({ record }: { record: SampleRecord }) {
  const current = phases.indexOf(record.phase);
  const closed = record.phase === "Closed";
  const won = record.closed === "Accepted";
  return (
    <div className="min-w-0">
      <div className="flex gap-1" aria-hidden>
        {phases.slice(0, 4).map((phase, index) => (
          <span
            key={phase}
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
        className={cn(
          "m-0 mt-1.5 text-xs",
          won ? "text-success" : closed ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {closed ? record.closed : record.phase}
        {record.phase === "Interviewing" &&
          ` · round ${record.rounds.length} of ${record.expectedRounds ?? "?"}`}
      </p>
    </div>
  );
}

/** Days since you last heard, measured against your nudge point. */
export function Waiting({ record }: { record: SampleRecord }) {
  if (!record.sentAt || record.phase === "Closed" || record.phase === "Decision") return null;
  // Outreach stops its clock at the first reply; an application stops it while a round is booked.
  if (record.method !== "DIRECT" && record.lastHeardAt) return null;
  if (record.rounds.some((round) => round.outcome === "SCHEDULED")) return null;
  const quietSince = daysSince(record.lastHeardAt ?? record.sentAt);
  const limit = record.method === "DIRECT" ? SILENCE_DAYS.DIRECT : SILENCE_DAYS.OUTREACH;
  const late = quietSince >= limit;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs tabular-nums",
        late ? "bg-warning-soft text-warning" : "bg-muted text-muted-foreground",
      )}
      title={`Nudge point is ${limit} days`}
    >
      <Hourglass size={12} aria-hidden />
      {quietSince}d{late ? " quiet" : ` of ${limit}`}
    </span>
  );
}
