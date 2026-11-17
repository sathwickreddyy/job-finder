"use client";

import { useEffect, useState } from "react";
import { Diamond } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { MarkdownView } from "@/components/markdown/markdown-view";
import { Button } from "@/components/ui";
import { indiaDate, istClock, formatTime } from "@/features/applications/dates";
import { updateRound } from "@/features/applications/record-actions";
import type { OutcomeId } from "@/features/applications/phase";
import { OutcomeChips } from "@/features/applications/views/outcome-chips";
import type { InterviewQuestion } from "@/features/interviews/types";
import { RoundQuestions } from "@/features/interviews/views/round-questions";
import { cn } from "@/lib/utils";
import type { TimelineRound } from "./entries";

export type RoundCardData = {
  recordId: string;
  questions: InterviewQuestion[];
  outcomes: OutcomeId[];
  today: string;
};

/** Only these outcomes belong on a round card; the rest are recorded from the tracker. */
const roundOutcomes: OutcomeId[] = ["passed", "failed", "rescheduled"];

function resultOf(round: TimelineRound["round"], now: Date) {
  if (round.outcome === "PASSED") return { text: "Cleared", tone: "bg-success-soft text-success" };
  if (round.outcome === "FAILED")
    return { text: "Didn't clear", tone: "bg-danger-soft text-destructive" };
  if (round.scheduledAt && round.scheduledAt <= now)
    return { text: "Result due", tone: "bg-review text-review-foreground" };
  return { text: "Booked", tone: "bg-selected text-selected-foreground" };
}

/** The first line of the notes as plain text, for the card's one-line summary. */
export function notesSummary(notes: string) {
  const line = notes.split("\n").find((text) => text.trim()) ?? "";
  return line
    .replace(/^\s*(#{1,6}|[-*+]|\d+\.|>|- \[[ xX]\])\s+/, "")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`~]/g, "")
    .trim();
}

/** The round's edit form: name, date, time, interviewer and notes. */
function EditRound({ round, onSaved }: { round: TimelineRound["round"]; onSaved: () => void }) {
  return (
    <ActionForm action={updateRound} feedback="inverse" className="space-y-3" onSuccess={onSaved}>
      <input type="hidden" name="id" value={round.id} />
      <div className="flex flex-wrap gap-3">
        <label className="max-w-full w-48 text-sm">
          Round name
          <input className="mt-1" name="name" maxLength={200} defaultValue={round.name} />
        </label>
        <label className="max-w-full w-40 text-sm">
          Round date
          <input
            className="mt-1"
            type="date"
            name="day"
            defaultValue={round.scheduledAt ? indiaDate(round.scheduledAt) : ""}
          />
        </label>
        <label className="max-w-full w-32 text-sm">
          Round time
          <input
            className="mt-1"
            type="time"
            name="time"
            defaultValue={round.scheduledAt ? istClock(round.scheduledAt) : ""}
          />
        </label>
        <label className="max-w-full w-56 text-sm">
          Interviewer (optional)
          <input
            className="mt-1"
            name="interviewer"
            maxLength={200}
            defaultValue={round.interviewer}
          />
        </label>
      </div>
      <label className="block text-sm">
        Round notes
        <textarea
          name="notes"
          rows={2}
          maxLength={5000}
          defaultValue={round.notes}
          className="mt-1 !min-h-16"
        />
      </label>
      <Button variant="outline">Save round</Button>
    </ActionForm>
  );
}

/**
 * A round in the timeline: who interviewed, how many questions, and the result. Opening it
 * shows the questions, the round notes and the outcomes that can still be recorded.
 */
export function RoundCard({
  entry,
  data,
  requisition,
  defaultOpen = false,
}: {
  entry: TimelineRound;
  data: RoundCardData;
  /** The application's requisition; null is shown as "No requisition". */
  requisition?: string | null;
  defaultOpen?: boolean;
}) {
  const { round, label } = entry;
  const domId = `round-${round.id}`;
  const [open, setOpen] = useState(defaultOpen);
  const [tab, setTab] = useState<"questions" | "notes">("questions");
  const [editing, setEditing] = useState(false);
  // A link to #round-<id> opens this card.
  useEffect(() => {
    const sync = () => {
      if (window.location.hash === `#${domId}`) setOpen(true);
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [domId]);
  const result = resultOf(round, new Date());
  const count = data.questions.length;
  const summary = notesSummary(round.notes);
  const counted = `${count} ${count === 1 ? "question" : "questions"}`;
  const outcomes = data.outcomes.filter((id) => roundOutcomes.includes(id));
  const tabs = [
    { id: "questions", label: `Questions · ${count}` },
    { id: "notes", label: "Round notes" },
  ] as const;
  return (
    <li
      id={domId}
      className="scroll-mt-24 transition-shadow duration-500 data-[lit]:ring-2 data-[lit]:ring-inset data-[lit]:ring-primary"
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`${domId}-body`}
        onClick={() => setOpen(!open)}
        className="grid w-full grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-3 text-left transition-colors hover:bg-muted/50 @xl:grid-cols-[9rem_minmax(0,1fr)_auto] @xl:gap-x-4 @4xl:grid-cols-[9.5rem_minmax(0,1fr)_auto]"
      >
        <span className="grid min-w-0 justify-items-start gap-0.5">
          <span className="inline-flex h-6 items-center gap-1 rounded-full bg-muted px-2 text-xs font-medium text-muted-foreground">
            <Diamond aria-hidden size={12} strokeWidth={2} />
            Round
          </span>
          <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
            {formatTime(new Date(entry.at))}
          </span>
        </span>
        <span className="grid min-w-0">
          <span
            className="truncate text-sm text-muted-foreground"
            title={round.interviewer || undefined}
          >
            {round.interviewer || "Interviewer not recorded"}
          </span>
          <span
            className="truncate text-sm font-medium"
            title={summary ? `${label} · ${counted} · ${summary}` : `${label} · ${counted}`}
          >
            {label}
            <span className="font-normal text-muted-foreground"> · {counted}</span>
            {summary && (
              <span className="font-normal text-muted-foreground" title={summary}>
                {" "}
                · {summary}
              </span>
            )}
          </span>
        </span>
        <span className="flex min-w-0 flex-col items-end gap-1">
          <span className={cn("rounded-full px-2.5 py-0.5 text-xs", result.tone)}>
            {result.text}
          </span>
          {requisition !== undefined && (
            <span
              className="max-w-28 truncate text-xs text-muted-foreground"
              title={requisition ?? "No requisition"}
            >
              {requisition ?? "No requisition"}
            </span>
          )}
        </span>
      </button>
      {open && (
        <div id={`${domId}-body`} className="space-y-3 px-4 pb-4">
          <div role="tablist" aria-label={`${label} sections`} className="flex flex-wrap gap-2">
            {tabs.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                onClick={() => setTab(item.id)}
                className={cn(
                  "pressable inline-flex h-8 items-center rounded-full px-3 text-sm",
                  tab === item.id
                    ? "bg-foreground text-background"
                    : "text-muted-foreground ring-1 ring-border hover:text-foreground",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
          {editing ? (
            <div className="space-y-3">
              <EditRound round={round} onSaved={() => setEditing(false)} />
              <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <>
              <div role="tabpanel" hidden={tab !== "questions"}>
                <RoundQuestions
                  applicationId={data.recordId}
                  round={{
                    id: round.id,
                    position: round.position,
                    kind: round.kind,
                    name: round.name,
                    label,
                    scheduledAt: round.scheduledAt?.toISOString() ?? null,
                    outcome: round.outcome,
                    questions: data.questions,
                  }}
                />
              </div>
              <div role="tabpanel" hidden={tab !== "notes"} className="text-sm">
                {round.notes ? (
                  <MarkdownView source={round.notes} />
                ) : (
                  <p className="m-0 text-muted-foreground">No round notes yet.</p>
                )}
              </div>
            </>
          )}
          {!editing && (
            <Button type="button" variant="outline" onClick={() => setEditing(true)}>
              Edit round
            </Button>
          )}
          <OutcomeChips
            recordId={data.recordId}
            outcomes={outcomes}
            initial={null}
            today={data.today}
            booked={{ name: round.name, scheduledAt: round.scheduledAt }}
          />
        </div>
      )}
    </li>
  );
}
