import Link from "next/link";
import { ExternalLink, FileText, Link2, NotebookPen } from "lucide-react";
import { linkMailOnly, unlinkMail } from "@/features/mail/triage-actions";
import { ActionForm } from "@/components/action-form";
import { Button, Field } from "@/components/ui";
import { displayDate, type DisplayPreferences } from "@/features/candidate/preferences";
import { familyFill } from "@/features/companies/format";
import { roundFamily, roundKindLabel } from "@/features/companies/metrics";
import { cn } from "@/lib/utils";
import { addApplicationNote } from "../actions";
import { formatDay, formatDayTime, indiaDate, istClock, istDaysBetween } from "../dates";
import {
  availableOutcomes,
  canEditPlannedRecord,
  initialOutcome,
  isOutreach,
  methodLabel,
  phaseText,
  recordStateFrom,
} from "../phase";
import { clip, eventTone, type DotTone } from "../lanes";
import type { ApplicationRecord } from "../read";
import { updateApplicationDetails, updateRound } from "../record-actions";
import { FollowUp } from "./follow-up";
import { CompanyMark, PhaseBar, RoundLadder } from "./marks";
import { NotesText } from "./notes-text";
import { OutcomeChips, PreparingControl } from "./outcome-chips";
import { Timeline } from "./timeline";

type Choice = { id: string; label: string };

export function ApplicationDetail({
  record,
  linked,
  versions,
  preferences,
  now,
  requested,
  mail,
  selectionKey,
  mailIntent,
  mailError,
  notice,
}: {
  record: ApplicationRecord;
  linked: ApplicationRecord[];
  versions: Choice[];
  preferences: DisplayPreferences;
  now: Date;
  requested?: string;
  mail?: { id: string; subject: string; classification: string } | null;
  selectionKey?: string;
  mailIntent?: string;
  mailError?: string;
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
  const history = [
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
    <div className="space-y-6">
      {notice && (
        <p
          role="status"
          className="rounded-2xl bg-foreground p-3 text-sm text-background shadow-surface"
        >
          {notice}
        </p>
      )}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <CompanyMark company={record.company} />
          <div className="min-w-0 [overflow-wrap:anywhere]">
            <h1 className="m-0 [overflow-wrap:anywhere] text-2xl font-semibold tracking-tight">
              {record.company}
            </h1>
            <p className="m-0 [overflow-wrap:anywhere] text-muted-foreground">
              {outreach
                ? `${methodLabel[record.source]}${record.contact ? ` · ${record.contact}` : ""} · ${record.role}`
                : `${record.role}${record.city ? ` · ${record.city}` : ""}`}
            </p>
            {record.sentAt && (
              <p className="m-0 mt-1 text-sm text-muted-foreground">
                {outreach ? "Sent" : "Applied"} {displayDate(record.sentAt, preferences)}
              </p>
            )}
          </div>
        </div>
        <div className="flex min-w-0 max-w-full flex-wrap gap-2">
          <Button variant="outline" size="sm" className="h-9 rounded-full px-4" asChild>
            <a href={record.jobUrl} target="_blank" rel="noreferrer">
              <ExternalLink size={14} aria-hidden />
              Job post
            </a>
          </Button>
          {record.applicationUrl && (
            <Button variant="outline" size="sm" className="h-9 rounded-full px-4" asChild>
              <a href={record.applicationUrl} target="_blank" rel="noreferrer">
                <ExternalLink size={14} aria-hidden />
                Application page
              </a>
            </Button>
          )}
          {record.resume && (
            <Button
              variant="outline"
              size="sm"
              className="h-9 max-w-full rounded-full px-4"
              asChild
            >
              <a href={`/api/resumes/${record.resume.id}/file?download=1`}>
                <FileText size={14} aria-hidden />
                <span className="truncate">{record.resume.filename}</span>
              </a>
            </Button>
          )}
        </div>
      </header>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-5">
          <section
            aria-label="Progress"
            tabIndex={-1}
            className="rounded-3xl bg-card p-5 ring-1 ring-border"
          >
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <PhaseBar
                phase={record.phase}
                won={record.closedReason === "ACCEPTED"}
                label={phaseText({
                  phase: record.phase,
                  source: record.source,
                  replied: state.replied,
                  closedReason: record.closedReason,
                  status: record.status,
                  rounds: record.rounds.length,
                  typical: record.typicalRounds,
                })}
              />
              {!outreach && (
                <RoundLadder rounds={record.rounds} typical={record.typicalRounds} wide />
              )}
            </div>
            <div className="mt-5 space-y-4">
              {mail && (
                <div className="space-y-2 rounded-2xl bg-selected px-4 py-3 text-sm text-selected-foreground [overflow-wrap:anywhere]">
                  <p className="m-0">Linking mail: {mail.subject}</p>
                  <ActionForm action={linkMailOnly} feedback="inverse" pendingLabel="Linking">
                    <input type="hidden" name="mailId" value={mail.id} />
                    <input type="hidden" name="recordId" value={record.id} />
                    <input type="hidden" name="returnTo" value="record" />
                    <Button variant="ghost" size="sm">
                      Link without recording an outcome
                    </Button>
                  </ActionForm>
                </div>
              )}
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
                outcomes={mail?.classification === "APPLICATION_ACKNOWLEDGEMENT" ? [] : available}
                initial={
                  mailError || mail?.classification === "APPLICATION_ACKNOWLEDGEMENT"
                    ? null
                    : initialOutcome(available, requested)
                }
                mailId={mailIntent}
                mailError={mailError}
                selectionKey={selectionKey}
                requested={requested}
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
          {!outreach && (record.rounds.length > 0 || record.typicalRounds) && (
            <section aria-labelledby="rounds-heading">
              <h2 id="rounds-heading" className="m-0 mb-3 text-base font-semibold">
                Rounds
              </h2>
              <ol className="m-0 list-none space-y-2 p-0">
                {record.rounds.map((round, index) => (
                  <RoundRow key={round.id} round={round} index={index} now={now} />
                ))}
                {Array.from(
                  { length: Math.max(0, (record.typicalRounds ?? 0) - record.rounds.length) },
                  (_, index) => (
                    <li
                      key={`slot-${index}`}
                      className="flex items-center gap-3 rounded-2xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground"
                    >
                      <span className="max-w-full w-6 tabular-nums">
                        {record.rounds.length + index + 1}
                      </span>
                      Not scheduled yet
                    </li>
                  ),
                )}
              </ol>
              {record.typicalRounds ? (
                <p className="m-0 mt-2 text-xs text-muted-foreground">
                  Typical loop: {record.typicalRounds} rounds (company research)
                </p>
              ) : null}
            </section>
          )}
          <section
            aria-labelledby="notes-heading"
            className="rounded-3xl bg-card p-4 ring-1 ring-border"
          >
            <h2
              id="notes-heading"
              className="m-0 mb-2 flex items-center gap-2 text-base font-semibold"
            >
              <NotebookPen size={15} aria-hidden />
              Notes
            </h2>
            <NotesText text={record.notes} />
            <details className="mt-3">
              <summary className="text-sm">Edit details</summary>
              <ActionForm
                action={updateApplicationDetails}
                feedback="inverse"
                className="mt-3 space-y-4"
              >
                <input type="hidden" name="id" value={record.id} />
                {editable ? (
                  <Field label="Resume file used" name="resumeVersionId">
                    <select
                      id="resumeVersionId"
                      name="resumeVersionId"
                      defaultValue={record.resumeVersionId ?? ""}
                    >
                      <option value="">No file used / not selected</option>
                      {versions.map((version) => (
                        <option key={version.id} value={version.id}>
                          {version.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                ) : (
                  <>
                    <input
                      type="hidden"
                      name="resumeVersionId"
                      value={record.resumeVersionId ?? ""}
                    />
                    <p className="m-0 text-sm">
                      Resume used: {record.resume?.filename ?? "No file recorded"}
                    </p>
                  </>
                )}
                <Field
                  label="Application URL"
                  name="applicationUrl"
                  type="url"
                  defaultValue={record.applicationUrl ?? ""}
                />
                <Field label="Notes" name="notes">
                  <textarea id="notes" name="notes" defaultValue={record.notes} />
                </Field>
                <Button variant="outline">Save details</Button>
              </ActionForm>
            </details>
          </section>
        </div>
        <aside className="min-w-0 space-y-5">
          {linked.length > 0 && (
            <section aria-label="Linked records" className="space-y-2">
              {linked.map((other) => (
                <Link
                  key={other.id}
                  href={`/applications/${other.id}`}
                  className="block rounded-3xl bg-selected/50 p-4 text-selected-foreground hover:no-underline"
                >
                  <span className="flex items-center gap-2 text-sm font-semibold [overflow-wrap:anywhere]">
                    <Link2 size={14} aria-hidden />
                    Linked: {methodLabel[other.source] ?? "Record"}
                    {other.contact ? ` · ${other.contact}` : ""}
                  </span>
                  <span className="mt-1 block text-sm [overflow-wrap:anywhere]">
                    {other.latest?.summary ?? "Nothing recorded yet"}
                  </span>
                </Link>
              ))}
            </section>
          )}
          {record.linkedMail.length > 0 && (
            <section
              aria-label="Linked mail"
              className="space-y-3 rounded-3xl bg-card p-4 ring-1 ring-border"
            >
              <h2 className="m-0 text-base font-semibold">Linked mail</h2>
              <p className="m-0 text-xs text-muted-foreground">
                Unlink returns a message to Emails. Recorded outcomes and history stay.
              </p>
              {record.linkedMail.map((message) => (
                <div key={message.id} className="space-y-1 [overflow-wrap:anywhere]">
                  <Link href={`/mail/${message.id}`} className="text-sm">
                    {message.subject}
                  </Link>
                  <ActionForm action={unlinkMail} feedback="inverse" pendingLabel="Unlinking">
                    <input type="hidden" name="mailId" value={message.id} />
                    <input type="hidden" name="recordId" value={record.id} />
                    <Button variant="ghost" size="sm">
                      Unlink mail
                    </Button>
                  </ActionForm>
                </div>
              ))}
            </section>
          )}
          <section aria-labelledby="history-heading">
            <h2 id="history-heading" className="m-0 mb-3 text-base font-semibold">
              History
            </h2>
            <Timeline entries={history} now={now} />
            <ActionForm action={addApplicationNote} feedback="inverse" className="mt-5 space-y-3">
              <input type="hidden" name="id" value={record.id} />
              <label className="block text-sm">
                Add to history
                <textarea
                  name="summary"
                  rows={2}
                  required
                  maxLength={20000}
                  className="mt-1 !min-h-16"
                />
              </label>
              <Button variant="outline" size="sm" className="h-9 px-4">
                Add note
              </Button>
            </ActionForm>
          </section>
        </aside>
      </div>
    </div>
  );
}

function RoundRow({
  round,
  index,
  now,
}: {
  round: ApplicationRecord["rounds"][number];
  index: number;
  now: Date;
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
  const label = roundKindLabel[round.kind];
  return (
    <li
      className={cn(
        "rounded-2xl px-4 py-3 ring-1",
        round.outcome === "SCHEDULED" ? "bg-warning-soft/60 ring-review/50" : "bg-card ring-border",
      )}
    >
      <div className="flex items-center gap-3">
        <span className="max-w-full w-6 text-sm text-muted-foreground tabular-nums">
          {index + 1}
        </span>
        <span
          aria-hidden
          className={cn("size-2.5 shrink-0 rounded-full", familyFill[roundFamily(round.kind)])}
        />
        <div className="min-w-0 flex-1">
          <p className="m-0 font-medium [overflow-wrap:anywhere]">
            {label}
            {round.name && round.name !== label ? ` · ${round.name}` : ""}
          </p>
          <p className="m-0 text-sm text-muted-foreground">
            {round.scheduledAt ? formatDayTime(round.scheduledAt) : "No date recorded"}
          </p>
        </div>
        <span className={cn("max-w-full shrink-0 rounded-full px-2.5 py-0.5 text-xs", status.tone)}>
          {status.text}
        </span>
      </div>
      {round.notes && (
        <p className="m-0 mt-2 pl-9 text-sm text-muted-foreground [overflow-wrap:anywhere]">
          {round.notes}
        </p>
      )}
      <details className="mt-2 pl-9">
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
