import type { ReactNode } from "react";
import Link from "next/link";
import { NotebookPen } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { MarkdownView } from "@/components/markdown/markdown-view";
import { Button } from "@/components/ui";
import { familyFill } from "@/features/companies/format";
import { roundFamily, roundKindLabel } from "@/features/companies/metrics";
import { cn } from "@/lib/utils";
import { formatDay, formatDayTime, indiaDate, istClock, istDaysBetween } from "../dates";
import { RoundQuestions } from "@/features/interviews/views/round-questions";
import type { RoundWithQuestions } from "@/features/interviews/types";
import { namedStepsOf } from "../named-steps";
import {
  availableOutcomes,
  canEditPlannedRecord,
  isOutreach,
  methodLabel,
  recordStateFrom,
} from "../phase";
import { clip, eventTone, type DotTone } from "../lanes";
import type { ApplicationRecord } from "../read";
import { saveApplicationNotes, updateRound } from "../record-actions";
import { roundLabels } from "../round-label";
import { FollowUp } from "./follow-up";
import { NamedSteps } from "./named-steps";
import { OutcomeChips, PreparingControl } from "./outcome-chips";
import { ApplicationHeader, type Sibling } from "./page/header";
import { NotesEditor } from "./page/notes-editor";
import { ApplicationRail, type HistoryEntry } from "./page/rail";

type Choice = { id: string; label: string };

export function ApplicationDetail({
  record,
  linked,
  siblings,
  questionRounds = [],
  versions,
  now,
  notice,
}: {
  record: ApplicationRecord;
  linked: ApplicationRecord[];
  /** Applications at the same company, for the header's switcher. */
  siblings: Sibling[];
  /** Each round with its recorded interview questions. */
  questionRounds?: RoundWithQuestions[];
  versions: Choice[];
  now: Date;
  notice?: string;
}) {
  const outreach = isOutreach(record.source);
  const state = recordStateFrom(
    record,
    record.rounds,
    record.events.map((event) => event.eventType),
  );
  const editable = canEditPlannedRecord(state);
  const available = availableOutcomes(state);
  const steps = namedStepsOf(record, now);
  const rounds = [...record.rounds].sort((a, b) => a.position - b.position);
  const labels = roundLabels(rounds);
  const expected = steps.filter((step) => step.state === "expected");
  const history: HistoryEntry[] = [
    ...record.events.map((event) => ({
      key: event.id,
      at: event.occurredAt,
      tone: eventTone(event.eventType, typeof event.payload.mailMessageId === "string"),
      label: event.summary,
      detail: "",
      tags: [] as string[],
    })),
    ...record.linkedMail.map((mail) => ({
      key: mail.id,
      at: mail.receivedAt,
      tone: "mail" as DotTone,
      label: clip(mail.subject, 200),
      detail: "",
      tags: [] as string[],
      href: `/mail/${mail.id}`,
    })),
    ...linked
      .filter((other) => isOutreach(other.source))
      .flatMap((other) =>
        other.events.map((event) => ({
          key: event.id,
          at: event.occurredAt,
          tone: eventTone(event.eventType, false),
          label: event.summary,
          detail: "",
          tags: [methodLabel[other.source] ?? "Linked record"],
        })),
      ),
  ];
  return (
    <div className="@container flex min-w-0 flex-col gap-5">
      <ApplicationHeader record={record} siblings={siblings} steps={steps} />
      {notice && (
        <p
          role="status"
          className="m-0 rounded-2xl bg-foreground p-3 text-sm text-background shadow-surface"
        >
          {notice}
        </p>
      )}
      <div className="grid min-w-0 grid-cols-1 gap-5 @[52rem]:grid-cols-[minmax(0,1fr)_300px] @[52rem]:items-start">
        <div className="flex min-w-0 flex-col gap-5">
          <section
            aria-label="Progress"
            tabIndex={-1}
            className="min-w-0 rounded-3xl bg-card p-5 ring-1 ring-border"
          >
            <NamedSteps steps={steps} size="page" />
            <div className="mt-5 space-y-4">
              {editable && outreach && (
                <p className="m-0 text-sm text-muted-foreground">
                  <Link href={`/outreach?record=${record.id}`} className="text-link">
                    Open outreach prompt
                  </Link>
                  {" · "}
                  <Link href={`/applications/new?jobId=${record.jobId}`} className="text-link">
                    Record a direct application
                  </Link>
                </p>
              )}
              <PreparingControl
                key={`sent-${record.id}`}
                recordId={record.id}
                active={editable}
                today={indiaDate(now)}
              />
              <OutcomeChips
                key={`outcomes-${record.id}`}
                recordId={record.id}
                outcomes={available}
                initial={null}
                today={indiaDate(now)}
                booked={record.rounds.find((round) => round.outcome === "SCHEDULED")}
              />
              {record.phase !== "Closed" && (
                <FollowUp
                  key={`follow-up-${record.id}`}
                  recordId={record.id}
                  day={record.nextActionAt ? indiaDate(record.nextActionAt) : null}
                  label={record.nextActionAt ? formatDay(record.nextActionAt) : null}
                  note={record.nextActionNote}
                />
              )}
            </div>
          </section>
          {!outreach && (rounds.length > 0 || expected.length > 0) && (
            <section aria-labelledby="rounds-heading" className="flex min-w-0 flex-col gap-3">
              <h2 id="rounds-heading" className="m-0 text-base font-semibold">
                Rounds
              </h2>
              <ol className="m-0 flex list-none flex-col gap-3 p-0">
                {rounds.map((round, index) => {
                  const withQuestions = questionRounds.find((item) => item.id === round.id);
                  return (
                    <RoundRow key={round.id} round={round} label={labels[index]} now={now}>
                      {withQuestions && (
                        <RoundQuestions applicationId={record.id} round={withQuestions} />
                      )}
                    </RoundRow>
                  );
                })}
                {expected.map((step) => (
                  <li
                    key={step.key}
                    className="flex min-w-0 items-center justify-between gap-3 rounded-2xl border border-dashed border-border px-4 py-3 text-sm"
                  >
                    <span className="truncate font-medium text-muted-foreground">{step.label}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{step.detail}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}
          <section
            aria-labelledby="notes-heading"
            className="min-w-0 rounded-3xl bg-card p-5 ring-1 ring-border"
          >
            <h2
              id="notes-heading"
              className="m-0 mb-3 flex items-center gap-2 text-base font-semibold"
            >
              <NotebookPen size={15} aria-hidden />
              Notes
            </h2>
            <NotesEditor recordId={record.id} notes={record.notes} save={saveApplicationNotes} />
          </section>
        </div>
        <aside
          aria-label="Application details"
          className="flex min-w-0 flex-col gap-4 @[52rem]:sticky @[52rem]:top-4 @[52rem]:max-h-[calc(100vh-2rem)] @[52rem]:overflow-y-auto @[52rem]:pb-1"
        >
          <ApplicationRail
            record={record}
            linked={linked}
            versions={versions}
            history={history}
            editable={editable}
            now={now}
          />
        </aside>
      </div>
    </div>
  );
}

export function RoundRow({
  round,
  label,
  now,
  children,
}: {
  round: ApplicationRecord["rounds"][number];
  /** "Round 1 · DSA", "Managerial round" and so on. */
  label: string;
  now: Date;
  /** The round's questions, under its heading. */
  children?: ReactNode;
}) {
  const status =
    round.outcome === "PASSED"
      ? { text: "Cleared", tone: "bg-success-soft text-success" }
      : round.outcome === "FAILED"
        ? { text: "Not cleared", tone: "bg-danger-soft text-destructive" }
        : round.outcome === "CANCELLED"
          ? { text: "Cancelled", tone: "bg-muted text-muted-foreground" }
          : !round.scheduledAt
            ? { text: "Date not set", tone: "bg-muted text-muted-foreground" }
            : round.scheduledAt <= now
              ? { text: "Result due", tone: "bg-review text-review-foreground" }
              : istDaysBetween(now, round.scheduledAt) === 0
                ? { text: "Today", tone: "bg-review text-review-foreground" }
                : { text: "Upcoming", tone: "bg-selected text-selected-foreground" };
  const kind = roundKindLabel[round.kind];
  return (
    <li
      id={`round-${round.id}`}
      className={cn(
        "scroll-mt-4 rounded-2xl px-4 py-3 ring-1",
        round.outcome === "SCHEDULED" ? "bg-warning-soft/60 ring-review/50" : "bg-card ring-border",
      )}
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className={cn("size-2.5 shrink-0 rounded-full", familyFill[roundFamily(round.kind)])}
        />
        <div className="min-w-0 flex-1">
          <h3 className="m-0 text-base font-semibold [overflow-wrap:anywhere]">
            {label}
            {round.name && round.name !== kind && !label.endsWith(round.name) ? (
              <span className="font-normal text-muted-foreground"> · {round.name}</span>
            ) : null}
          </h3>
          <p className="m-0 text-sm text-muted-foreground">
            {round.scheduledAt ? formatDayTime(round.scheduledAt) : "No date recorded"}
          </p>
        </div>
        <span className={cn("max-w-full shrink-0 rounded-full px-2.5 py-0.5 text-xs", status.tone)}>
          {status.text}
        </span>
      </div>
      {round.notes && (
        <div className="mt-2 pl-5.5 text-sm">
          <MarkdownView source={round.notes} />
        </div>
      )}
      {children}
      <details className="mt-2 pl-5.5">
        <summary className="py-1 text-sm">Edit round</summary>
        <ActionForm action={updateRound} feedback="inverse" className="mt-2 space-y-3">
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
      </details>
    </li>
  );
}
