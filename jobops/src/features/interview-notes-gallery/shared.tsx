"use client";

import type { ReactNode } from "react";
import { FileText } from "lucide-react";
import { Expand, ExpandButton } from "@/components/ui/expand";
import { MiddleTruncate } from "@/components/ui/middle-truncate";
import { useEdgeFade } from "@/lib/use-edge-fade";
import { cn } from "@/lib/utils";
import type { GalleryApplication, HowItWent } from "./types";

export { Expand, ExpandButton, MiddleTruncate, useEdgeFade };

const dayFormat = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  timeZone: "Asia/Kolkata",
});
const timeFormat = new Intl.DateTimeFormat("en-IN", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Asia/Kolkata",
});
const asDate = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00+05:30` : iso);
export const day = (iso: string) => dayFormat.format(asDate(iso));
export const dayTime = (iso: string) => `${day(iso)}, ${timeFormat.format(asDate(iso))}`;

export const howItWent: Record<HowItWent, { label: string; short: string; tone: string; dot: string }> = {
  code: { label: "Solved in code", short: "Solved", tone: "bg-success-soft text-success", dot: "bg-success" },
  aloud: {
    label: "Solved, finished aloud",
    short: "Solved aloud",
    tone: "bg-selected text-selected-foreground",
    dot: "bg-primary",
  },
  partial: { label: "Partly solved", short: "Partly", tone: "bg-warning-soft text-warning", dot: "bg-warning" },
  stuck: { label: "Got stuck", short: "Stuck", tone: "bg-danger-soft text-destructive", dot: "bg-destructive" },
};

export function HowItWentBadge({ value, short = false }: { value: HowItWent; short?: boolean }) {
  const meta = howItWent[value];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        meta.tone,
      )}
    >
      <span aria-hidden className={cn("size-1.5 rounded-full", meta.dot)} />
      {short ? meta.short : meta.label}
    </span>
  );
}

export function PatternChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full border border-border px-2 py-px text-[11px] font-medium whitespace-nowrap text-muted-foreground">
      {children}
    </span>
  );
}

export function Complexity({ time, space }: { time: string; space: string }) {
  const blank = (v: string) => !v.trim() || v.trim() === "—";
  if (blank(time) && blank(space)) return null;
  return (
    <span className="inline-flex shrink-0 items-baseline gap-2 text-xs whitespace-nowrap text-muted-foreground tabular-nums">
      <span>
        <span className="sr-only">Time </span>
        <span aria-hidden>T </span>
        <span className="font-medium text-foreground">{time}</span>
      </span>
      <span>
        <span className="sr-only">Space </span>
        <span aria-hidden>S </span>
        <span className="font-medium text-foreground">{space}</span>
      </span>
    </span>
  );
}

export function CompanyMark({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-2xl bg-secondary font-semibold text-secondary-foreground",
        size === "sm" && "size-8 rounded-xl text-xs",
        size === "md" && "size-10 text-sm",
        size === "lg" && "size-12 text-base",
      )}
    >
      {name.slice(0, 2)}
    </span>
  );
}

export function ResumeChip({ app, className }: { app: GalleryApplication; className?: string }) {
  return (
    <a
      href="#resume"
      onClick={(event) => event.preventDefault()}
      className={cn(
        "pressable inline-flex h-9 max-w-full min-w-0 items-center gap-2 rounded-full border border-border px-3.5 text-sm font-medium hover:bg-muted hover:no-underline",
        className,
      )}
    >
      <FileText aria-hidden size={15} className="shrink-0 text-link" />
      <MiddleTruncate text={app.resume.filename} />
    </a>
  );
}

/* ------------------------------------------------------------------ */
/* Where an application stands: Sent, acknowledged, each named round,  */
/* expected rounds from research, then offer.                          */
/* ------------------------------------------------------------------ */

export type StepState = "done" | "current" | "expected" | "future";
export type Step = { key: string; label: string; detail: string; state: StepState; due?: boolean };

const named = /manager|managerial|hr\b|human|behaviou?ral|culture/i;
function roundLabel(name: string, technicalIndex: number) {
  if (/manager/i.test(name)) return "Managerial round";
  if (/^hr$|human/i.test(name)) return "HR round";
  if (named.test(name)) return name;
  return `Round ${technicalIndex} · ${name}`;
}

export function stepsFor(app: GalleryApplication): Step[] {
  const steps: Step[] = [
    { key: "sent", label: "Applied", detail: day(app.appliedOn), state: "done" },
  ];
  const acknowledged = app.phase !== "Sent";
  const ack = app.history.find((h) => /acknowledged/i.test(h.text));
  steps.push({
    key: "ack",
    label: "Acknowledged",
    detail: acknowledged ? (ack ? day(ack.date) : "Yes") : "Waiting",
    state: acknowledged ? (app.rounds.length ? "done" : "current") : "future",
  });
  let technical = 0;
  for (const round of app.rounds) {
    if (!named.test(round.name)) technical += 1;
    const done = round.result === "cleared";
    steps.push({
      key: round.id,
      label: roundLabel(round.name, technical),
      detail:
        round.result === "due"
          ? `Result due · ${round.at ? day(round.at) : ""}`
          : round.result === "cleared"
            ? `Cleared · ${round.at ? day(round.at) : ""}`
            : round.result === "not-cleared"
              ? "Not cleared"
              : round.at
                ? `Booked ${dayTime(round.at)}`
                : "Not booked",
      state: done ? "done" : "current",
      due: round.result === "due",
    });
  }
  for (const [index, expected] of app.expectedLoop.entries()) {
    if (!named.test(expected.name)) technical += 1;
    steps.push({
      key: `exp-${index}`,
      label: roundLabel(expected.name, technical),
      detail: "Expected",
      state: "expected",
    });
  }
  steps.push({ key: "offer", label: "Offer", detail: "", state: "future" });
  return steps;
}

export function currentStep(app: GalleryApplication) {
  const steps = stepsFor(app);
  const current = steps.find((s) => s.state === "current") ?? steps.at(-1)!;
  const rounds = steps.filter((s) => /round/i.test(s.label));
  const roundIndex = rounds.findIndex((s) => s.key === current.key);
  return { steps, current, rounds, roundIndex };
}

export function nextStep(app: GalleryApplication) {
  const { current } = currentStep(app);
  if (current.due) return "Waiting for the round result";
  if (current.key === "ack") return "Waiting on them · follow up after 7 quiet days";
  return "Prepare for the next round";
}
