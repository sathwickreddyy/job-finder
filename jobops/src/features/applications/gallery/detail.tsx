"use client";

import { useState } from "react";
import {
  CalendarClock,
  ExternalLink,
  FileText,
  Link2,
  Mail,
  NotebookPen,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui";
import { familyFill } from "@/features/companies/format";
import { roundFamily, roundKindLabel } from "@/features/companies/metrics";
import { cn } from "@/lib/utils";
import {
  byId,
  methodLabel,
  shortDate,
  timeOf,
  type SampleRecord,
  type TimelineEntry,
} from "./data";
import { CompanyMark, PhaseBar, RoundLadder } from "./marks";

const record = byId.razorpay;
const referral = byId["razorpay-ref"];
const story: (TimelineEntry & { from?: string })[] = [
  ...record.timeline,
  ...referral.timeline.map((entry) => ({ ...entry, from: "Referral ask" })),
].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

function Hint({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <p role="status" className="ag-fade m-0 mt-2 text-sm text-muted-foreground">
      Opens the What happened? option you choose above.
    </p>
  );
}

function RoundsList({ rows }: { rows: SampleRecord["rounds"] }) {
  return (
    <ol className="m-0 list-none space-y-2 p-0">
      {rows.map((round, index) => (
        <li
          key={round.name}
          className={cn(
            "flex items-center gap-3 rounded-2xl px-4 py-3 ring-1",
            round.outcome === "SCHEDULED"
              ? "bg-warning-soft/60 ring-review/50"
              : "bg-background/60 ring-border",
          )}
        >
          <span className="w-6 text-sm text-muted-foreground tabular-nums">{index + 1}</span>
          <span
            className={cn("size-2.5 shrink-0 rounded-full", familyFill[roundFamily(round.kind)])}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <p className="m-0 font-medium">
              {roundKindLabel[round.kind]} · {round.name}
            </p>
            <p className="m-0 text-sm text-muted-foreground">
              {shortDate(round.at)}, {timeOf(round.at)}
            </p>
          </div>
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-xs",
              round.outcome === "PASSED"
                ? "bg-success-soft text-success"
                : round.outcome === "FAILED"
                  ? "bg-danger-soft text-destructive"
                  : "bg-review text-review-foreground",
            )}
          >
            {round.outcome === "PASSED"
              ? "Cleared"
              : round.outcome === "FAILED"
                ? "Not cleared"
                : "Today"}
          </span>
        </li>
      ))}
      {Array.from({ length: (record.expectedRounds ?? 0) - rows.length }, (_, index) => (
        <li
          key={index}
          className="flex items-center gap-3 rounded-2xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground"
        >
          <span className="w-6 tabular-nums">{rows.length + index + 1}</span>
          Not scheduled yet
        </li>
      ))}
    </ol>
  );
}

function Story({ entries }: { entries: typeof story }) {
  return (
    <ol className="m-0 list-none space-y-4 p-0">
      {entries.map((entry, index) => (
        <li key={index} className="grid grid-cols-[1.25rem_minmax(0,1fr)] gap-3">
          <span
            aria-hidden
            className={cn(
              "mt-0.5 grid size-5 place-items-center rounded-full",
              entry.tone === "mail"
                ? "bg-selected text-selected-foreground"
                : entry.tone === "good"
                  ? "bg-success-soft text-success"
                  : "bg-muted text-muted-foreground",
            )}
          >
            {entry.tone === "mail" ? (
              <Mail size={11} />
            ) : (
              <span className="size-1.5 rounded-full bg-current" />
            )}
          </span>
          <div className="min-w-0">
            <p className="m-0 text-sm">{entry.text}</p>
            <p className="m-0 text-xs text-muted-foreground">
              {shortDate(entry.at)}, {timeOf(entry.at)}
              {entry.from && ` · ${entry.from}`}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/* ───────── A · Two columns: work on the left, history on the right ───────── */

export function DetailColumns() {
  const [hint, setHint] = useState(false);
  return (
    <div className="space-y-5 rounded-panel border border-border bg-card p-5 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <CompanyMark company={record.company} />
          <div className="min-w-0">
            <h3 className="m-0 text-2xl font-semibold tracking-tight">{record.company}</h3>
            <p className="m-0 text-muted-foreground">
              {record.role} · {record.city}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="h-9 rounded-full px-4">
            <ExternalLink size={14} aria-hidden />
            Job post
          </Button>
          <Button variant="outline" size="sm" className="h-9 rounded-full px-4">
            <FileText size={14} aria-hidden />
            {record.resume}
          </Button>
        </div>
      </header>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <div className="rounded-3xl bg-background/60 p-5 ring-1 ring-border">
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <PhaseBar record={record} />
              <RoundLadder record={record} wide />
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button onClick={() => setHint(true)}>What happened?</Button>
              <Button variant="outline" onClick={() => setHint(true)}>
                <CalendarClock size={15} aria-hidden />
                Follow up on 6 Oct
              </Button>
            </div>
            <Hint show={hint} />
          </div>
          <section>
            <h4 className="m-0 mb-3 font-semibold">Rounds</h4>
            <RoundsList rows={record.rounds} />
          </section>
          <section className="rounded-3xl bg-background/60 p-4 ring-1 ring-border">
            <h4 className="m-0 mb-2 flex items-center gap-2 font-semibold">
              <NotebookPen size={15} aria-hidden />
              Prep notes
            </h4>
            <p className="m-0 text-sm text-muted-foreground">
              Payments idempotency, retries with backoff. Ask about on-call load.
            </p>
          </section>
        </div>
        <aside className="space-y-5">
          <section className="rounded-3xl bg-selected/50 p-4">
            <p className="m-0 flex items-center gap-2 text-sm font-semibold text-selected-foreground">
              <Link2 size={14} aria-hidden />
              Linked: {methodLabel[referral.method]}
            </p>
            <p className="m-0 mt-1 text-sm text-selected-foreground">
              {referral.contact} · {referral.latest}
            </p>
          </section>
          <section>
            <h4 className="m-0 mb-3 font-semibold">History</h4>
            <Story entries={story} />
          </section>
        </aside>
      </div>
    </div>
  );
}

/* ───────── B · One column story with a pinned action bar ───────── */

export function DetailStory() {
  const [hint, setHint] = useState(false);
  const booked = record.rounds.find((round) => round.outcome === "SCHEDULED")!;
  return (
    <div className="relative overflow-hidden rounded-panel border border-border bg-card">
      <div className="max-h-[34rem] space-y-6 overflow-y-auto p-5 pb-28 sm:p-6 sm:pb-28">
        <header className="space-y-4">
          <div className="flex items-center gap-4">
            <CompanyMark company={record.company} />
            <div className="min-w-0">
              <h3 className="m-0 text-2xl font-semibold tracking-tight">{record.company}</h3>
              <p className="m-0 text-muted-foreground">{record.role}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-3xl bg-warning-soft/70 px-5 py-4">
            <div>
              <p className="m-0 text-sm text-muted-foreground">Up next</p>
              <p className="m-0 text-lg font-semibold">
                {roundKindLabel[booked.kind]} round · today, {timeOf(booked.at)}
              </p>
            </div>
            <RoundLadder record={record} wide />
          </div>
        </header>
        <section className="grid gap-3 text-sm sm:grid-cols-3">
          {[
            { icon: FileText, label: "Resume sent", value: record.resume },
            { icon: Users, label: "Referral", value: `${referral.contact}, submitted` },
            {
              icon: CalendarClock,
              label: "Applied",
              value: `${shortDate(record.sentAt!)} · 15 days ago`,
            },
          ].map(({ icon: Icon, label, value }) => (
            <div key={label} className="rounded-2xl bg-background/60 p-3.5 ring-1 ring-border">
              <p className="m-0 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Icon size={12} aria-hidden />
                {label}
              </p>
              <p className="m-0 mt-1 truncate font-medium">{value}</p>
            </div>
          ))}
        </section>
        <section>
          <h4 className="m-0 mb-3 font-semibold">How it has gone</h4>
          <Story entries={story} />
        </section>
      </div>
      <div className="absolute inset-x-0 bottom-0 border-t border-border bg-card/95 px-5 py-3 backdrop-blur">
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => setHint(true)}>What happened?</Button>
          <Button variant="outline" onClick={() => setHint(true)}>
            <CalendarClock size={15} aria-hidden />
            Set follow-up
          </Button>
          <Button variant="ghost" onClick={() => setHint(true)}>
            <NotebookPen size={15} aria-hidden />
            Add note
          </Button>
        </div>
        <Hint show={hint} />
      </div>
    </div>
  );
}
