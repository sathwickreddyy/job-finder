"use client";

import { useEffect, useRef, useState } from "react";
import {
  CalendarPlus,
  Check,
  ChevronDown,
  CircleSlash,
  Hourglass,
  MailCheck,
  PartyPopper,
  RotateCcw,
  Undo2,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui";
import { roundKindLabel, roundKinds, type RoundKind } from "@/features/companies/metrics";
import { cn } from "@/lib/utils";
import { byId, shortDate, type Phase, type SampleRecord, type TimelineEntry } from "./data";
import { CompanyMark, PhaseBar, RoundLadder } from "./marks";

type OutcomeId =
  | "heard"
  | "oa"
  | "scheduled"
  | "passed"
  | "failed"
  | "rescheduled"
  | "offer"
  | "rejected"
  | "ghosted"
  | "withdrew"
  | "accepted"
  | "declined";
type Outcome = {
  id: OutcomeId;
  label: string;
  icon: LucideIcon;
  tone: "good" | "bad" | "neutral";
  group: "Moving forward" | "Setback" | "Other";
  /** Extra detail the outcome needs before it can be saved. */
  needs?: "round" | "deadline";
};

const outcomes: Record<OutcomeId, Outcome> = {
  heard: { id: "heard", label: "Heard back", icon: MailCheck, tone: "neutral", group: "Other" },
  oa: {
    id: "oa",
    label: "Got an OA",
    icon: CalendarPlus,
    tone: "good",
    group: "Moving forward",
    needs: "deadline",
  },
  scheduled: {
    id: "scheduled",
    label: "Round scheduled",
    icon: CalendarPlus,
    tone: "good",
    group: "Moving forward",
    needs: "round",
  },
  passed: {
    id: "passed",
    label: "Cleared the round",
    icon: Check,
    tone: "good",
    group: "Moving forward",
  },
  failed: { id: "failed", label: "Didn't clear it", icon: X, tone: "bad", group: "Setback" },
  rescheduled: {
    id: "rescheduled",
    label: "Rescheduled",
    icon: Undo2,
    tone: "neutral",
    group: "Other",
    needs: "round",
  },
  offer: {
    id: "offer",
    label: "Got an offer",
    icon: PartyPopper,
    tone: "good",
    group: "Moving forward",
  },
  rejected: { id: "rejected", label: "Rejected", icon: X, tone: "bad", group: "Setback" },
  ghosted: {
    id: "ghosted",
    label: "No reply, close it",
    icon: Hourglass,
    tone: "bad",
    group: "Setback",
  },
  withdrew: {
    id: "withdrew",
    label: "I withdrew",
    icon: CircleSlash,
    tone: "neutral",
    group: "Other",
  },
  accepted: {
    id: "accepted",
    label: "Accepted the offer",
    icon: PartyPopper,
    tone: "good",
    group: "Moving forward",
  },
  declined: {
    id: "declined",
    label: "Declined the offer",
    icon: CircleSlash,
    tone: "neutral",
    group: "Other",
  },
};

/** Only the outcomes that make sense from where the record stands. */
function available(record: SampleRecord): OutcomeId[] {
  if (record.phase === "Closed") return [];
  if (record.phase === "Decision") return ["accepted", "declined"];
  const booked = record.rounds.some((round) => round.outcome === "SCHEDULED");
  if (booked) return ["passed", "failed", "rescheduled", "rejected", "withdrew"];
  if (record.rounds.length) return ["scheduled", "offer", "rejected", "ghosted", "withdrew"];
  return ["heard", "oa", "scheduled", "rejected", "ghosted", "withdrew"];
}

/** The single most likely next outcome, asked as a question. */
function question(record: SampleRecord) {
  const booked = record.rounds.find((round) => round.outcome === "SCHEDULED");
  if (booked)
    return {
      text: `Did you clear the ${roundKindLabel[booked.kind]} round?`,
      yes: "passed" as const,
      no: "failed" as const,
    };
  if (record.phase === "Decision")
    return { text: "Are you taking the offer?", yes: "accepted" as const, no: "declined" as const };
  if (record.rounds.length)
    return { text: "Is another round on the calendar?", yes: "scheduled" as const, no: null };
  return { text: "Have you heard back?", yes: "oa" as const, no: null };
}

type Detail = { kind: RoundKind; date: string };

function apply(record: SampleRecord, id: OutcomeId, detail: Detail): SampleRecord {
  const at = `${detail.date}T10:00:00+05:30`;
  const log = (text: string, tone: TimelineEntry["tone"]) => [
    { at: new Date().toISOString(), text, tone },
    ...record.timeline,
  ];
  const booked = record.rounds.findIndex((round) => round.outcome === "SCHEDULED");
  const settle = (outcome: "PASSED" | "FAILED") =>
    record.rounds.map((round, index) => (index === booked ? { ...round, outcome } : round));
  const next = (
    phase: Phase,
    patch: Partial<SampleRecord>,
    text: string,
    tone: TimelineEntry["tone"],
  ) => ({
    ...record,
    ...patch,
    phase,
    latest: text,
    lastHeardAt: new Date().toISOString(),
    timeline: log(text, tone),
  });
  switch (id) {
    case "heard":
      return next(record.phase, {}, "Recruiter replied", "neutral");
    case "oa":
      return next(
        "Interviewing",
        {
          rounds: [
            ...record.rounds,
            { kind: "ONLINE_ASSESSMENT", name: "Online assessment", at, outcome: "SCHEDULED" },
          ],
          expectedRounds: Math.max(record.expectedRounds ?? 0, record.rounds.length + 3),
        },
        `OA received · due ${shortDate(at)}`,
        "good",
      );
    case "scheduled":
      return next(
        "Interviewing",
        {
          rounds: [
            ...record.rounds,
            { kind: detail.kind, name: roundKindLabel[detail.kind], at, outcome: "SCHEDULED" },
          ],
          expectedRounds: Math.max(record.expectedRounds ?? 0, record.rounds.length + 1),
        },
        `${roundKindLabel[detail.kind]} round on ${shortDate(at)}`,
        "good",
      );
    case "rescheduled":
      return next(
        record.phase,
        {
          rounds: record.rounds.map((round, index) =>
            index === booked ? { ...round, at } : round,
          ),
        },
        `Round moved to ${shortDate(at)}`,
        "neutral",
      );
    case "passed":
      return next("Interviewing", { rounds: settle("PASSED") }, "Cleared the round", "good");
    case "failed":
      return next(
        "Closed",
        { rounds: settle("FAILED"), closed: "Rejected" },
        "Didn't clear the round",
        "bad",
      );
    case "offer":
      return next("Decision", {}, "Offer received", "good");
    case "rejected":
      return next("Closed", { closed: "Rejected" }, "Rejected", "bad");
    case "ghosted":
      return next("Closed", { closed: "No reply" }, "Closed after no reply", "bad");
    case "withdrew":
      return next("Closed", { closed: "Withdrew" }, "You withdrew", "neutral");
    case "accepted":
      return next("Closed", { closed: "Accepted" }, "Accepted the offer", "good");
    case "declined":
      return next("Closed", { closed: "Withdrew" }, "Declined the offer", "neutral");
  }
}

const start = byId.zscaler;
function useDemo() {
  const [record, setRecord] = useState<SampleRecord>(start);
  return {
    record,
    save: (id: OutcomeId, detail: Detail) => setRecord((row) => apply(row, id, detail)),
    reset: () => setRecord(start),
  };
}

function Preview({ record, reset }: { record: SampleRecord; reset: () => void }) {
  return (
    <div className="space-y-4 rounded-3xl bg-background/60 p-5 ring-1 ring-border">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <CompanyMark company={record.company} />
          <div className="min-w-0">
            <p className="m-0 font-semibold">{record.company}</p>
            <p className="m-0 truncate text-sm text-muted-foreground">{record.role}</p>
          </div>
        </div>
        <Button size="sm" variant="ghost" className="h-8 rounded-full px-3" onClick={reset}>
          <RotateCcw size={13} aria-hidden />
          Reset
        </Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <PhaseBar record={record} />
        <RoundLadder record={record} wide />
      </div>
      <ol className="m-0 list-none space-y-1.5 p-0 text-sm">
        {record.timeline.slice(0, 3).map((entry, index) => (
          <li key={`${entry.at}-${index}`} className={cn("flex gap-2", index === 0 && "ag-fade")}>
            <span
              aria-hidden
              className={cn(
                "mt-1.5 size-2 shrink-0 rounded-full",
                entry.tone === "good"
                  ? "bg-success"
                  : entry.tone === "bad"
                    ? "bg-destructive"
                    : "bg-muted-foreground/60",
              )}
            />
            <span className={index ? "text-muted-foreground" : ""}>{entry.text}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function DetailFields({
  needs,
  detail,
  setDetail,
}: {
  needs: Outcome["needs"];
  detail: Detail;
  setDetail: (detail: Detail) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      {needs === "round" && (
        <label className="w-40 text-sm">
          Round
          <select
            className="mt-1"
            value={detail.kind}
            onChange={(event) => setDetail({ ...detail, kind: event.target.value as RoundKind })}
          >
            {roundKinds.map((kind) => (
              <option key={kind} value={kind}>
                {roundKindLabel[kind]}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="w-44 text-sm">
        {needs === "deadline" ? "Complete by" : "Date (IST)"}
        <input
          className="mt-1"
          type="date"
          value={detail.date}
          onChange={(event) => setDetail({ ...detail, date: event.target.value })}
        />
      </label>
    </div>
  );
}

const freshDetail = (): Detail => ({ kind: "DSA", date: "2026-10-07" });

/* ───────── A · Outcome chips with inline details ───────── */

export function HappenedChips() {
  const demo = useDemo();
  const [open, setOpen] = useState<OutcomeId | null>(null);
  const [detail, setDetail] = useState(freshDetail);
  const ids = available(demo.record);
  function pick(id: OutcomeId) {
    if (outcomes[id].needs) {
      setOpen(open === id ? null : id);
      setDetail(freshDetail());
    } else demo.save(id, detail);
  }
  return (
    <div className="space-y-4 rounded-panel border border-border bg-card p-5 sm:p-6">
      <Preview record={demo.record} reset={() => (demo.reset(), setOpen(null))} />
      <div>
        <p className="m-0 mb-2.5 font-semibold">What happened?</p>
        {ids.length ? (
          <div className="flex flex-wrap gap-2">
            {ids.map((id) => {
              const outcome = outcomes[id];
              const Icon = outcome.icon;
              return (
                <button
                  key={id}
                  type="button"
                  aria-expanded={outcome.needs ? open === id : undefined}
                  onClick={() => pick(id)}
                  className={cn(
                    "pressable inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm",
                    open === id
                      ? "border-transparent bg-primary text-primary-foreground"
                      : outcome.tone === "good"
                        ? "border-transparent bg-selected text-selected-foreground hover:brightness-110"
                        : outcome.tone === "bad"
                          ? "border-destructive/50 bg-transparent text-destructive hover:bg-danger-soft"
                          : "border-border bg-transparent text-foreground hover:bg-muted",
                  )}
                >
                  <Icon size={14} aria-hidden />
                  {outcome.label}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="m-0 text-sm text-muted-foreground">
            This record is closed. Reset to try again.
          </p>
        )}
        {open && (
          <div className="ag-fade mt-3 flex flex-wrap items-end gap-3 rounded-2xl bg-muted/50 p-4">
            <DetailFields needs={outcomes[open].needs} detail={detail} setDetail={setDetail} />
            <Button className="h-10" onClick={() => (demo.save(open, detail), setOpen(null))}>
              Save
            </Button>
            <Button variant="ghost" className="h-10" onClick={() => setOpen(null)}>
              Cancel
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ───────── B · One button, grouped menu ───────── */

export function HappenedMenu() {
  const demo = useDemo();
  const [menu, setMenu] = useState(false);
  const [open, setOpen] = useState<OutcomeId | null>(null);
  const [detail, setDetail] = useState(freshDetail);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (
        event instanceof KeyboardEvent
          ? event.key === "Escape"
          : !box.current?.contains(event.target as Node)
      )
        setMenu(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [menu]);
  const ids = available(demo.record);
  const grouped = (["Moving forward", "Setback", "Other"] as const)
    .map((group) => ({ group, ids: ids.filter((id) => outcomes[id].group === group) }))
    .filter((entry) => entry.ids.length);
  function pick(id: OutcomeId) {
    setMenu(false);
    if (outcomes[id].needs) {
      setOpen(id);
      setDetail(freshDetail());
    } else demo.save(id, detail);
  }
  return (
    <div className="space-y-4 rounded-panel border border-border bg-card p-5 sm:p-6">
      <Preview record={demo.record} reset={() => (demo.reset(), setOpen(null))} />
      <div ref={box} className="relative">
        <Button
          aria-haspopup="menu"
          aria-expanded={menu}
          disabled={!ids.length}
          onClick={() => setMenu(!menu)}
        >
          What happened?
          <ChevronDown
            size={16}
            aria-hidden
            className={cn("transition-transform", menu && "rotate-180")}
          />
        </Button>
        {menu && (
          <div
            role="menu"
            className="ag-pop absolute top-full left-0 z-20 mt-2 w-72 origin-top-left rounded-3xl bg-popover p-2 shadow-surface ring-1 ring-border"
          >
            {grouped.map(({ group, ids: rows }) => (
              <div key={group} className="py-1">
                <p className="m-0 px-3 py-1 text-xs text-muted-foreground">{group}</p>
                {rows.map((id) => {
                  const Icon = outcomes[id].icon;
                  return (
                    <button
                      key={id}
                      role="menuitem"
                      type="button"
                      onClick={() => pick(id)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-2xl border-0 bg-transparent px-3 py-2.5 text-left text-sm hover:bg-muted",
                        outcomes[id].tone === "bad" ? "text-destructive" : "text-foreground",
                      )}
                    >
                      <Icon size={16} aria-hidden />
                      {outcomes[id].label}
                      {outcomes[id].needs && (
                        <span className="ml-auto text-xs text-muted-foreground">add date</span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}
        {open && (
          <div className="ag-fade mt-3 space-y-3 rounded-2xl bg-muted/50 p-4">
            <p className="m-0 font-medium">{outcomes[open].label}</p>
            <div className="flex flex-wrap items-end gap-3">
              <DetailFields needs={outcomes[open].needs} detail={detail} setDetail={setDetail} />
              <Button className="h-10" onClick={() => (demo.save(open, detail), setOpen(null))}>
                Save
              </Button>
              <Button variant="ghost" className="h-10" onClick={() => setOpen(null)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ───────── C · Asks the likely question first ───────── */

export function HappenedQuestion() {
  const demo = useDemo();
  const [more, setMore] = useState(false);
  const [open, setOpen] = useState<OutcomeId | null>(null);
  const [detail, setDetail] = useState(freshDetail);
  const ids = available(demo.record);
  const ask = question(demo.record);
  function pick(id: OutcomeId) {
    setMore(false);
    if (outcomes[id].needs) {
      setOpen(id);
      setDetail(freshDetail());
    } else demo.save(id, detail);
  }
  return (
    <div className="space-y-4 rounded-panel border border-border bg-card p-5 sm:p-6">
      <Preview record={demo.record} reset={() => (demo.reset(), setOpen(null), setMore(false))} />
      {ids.length ? (
        <div className="rounded-3xl bg-selected/60 p-5">
          <p
            key={ask.text}
            className="ag-fade m-0 text-lg font-semibold tracking-tight text-selected-foreground"
          >
            {ask.text}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => pick(ask.yes)}>{ask.yes === "oa" ? "Yes, an OA" : "Yes"}</Button>
            {ask.no && (
              <Button variant="outline" onClick={() => pick(ask.no!)}>
                No
              </Button>
            )}
            <Button variant="ghost" onClick={() => setMore(!more)} aria-expanded={more}>
              Something else
            </Button>
          </div>
          {more && (
            <div className="ag-fade mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
              {ids
                .filter((id) => id !== ask.yes && id !== ask.no)
                .map((id) => (
                  <Button
                    key={id}
                    size="sm"
                    variant="outline"
                    className="h-8 rounded-full px-3"
                    onClick={() => pick(id)}
                  >
                    {outcomes[id].label}
                  </Button>
                ))}
            </div>
          )}
          {open && (
            <div className="ag-fade mt-4 flex flex-wrap items-end gap-3 border-t border-border pt-4">
              <DetailFields needs={outcomes[open].needs} detail={detail} setDetail={setDetail} />
              <Button className="h-10" onClick={() => (demo.save(open, detail), setOpen(null))}>
                Save {outcomes[open].label.toLowerCase()}
              </Button>
            </div>
          )}
        </div>
      ) : (
        <p className="m-0 text-sm text-muted-foreground">
          This record is closed. Reset to try again.
        </p>
      )}
    </div>
  );
}
