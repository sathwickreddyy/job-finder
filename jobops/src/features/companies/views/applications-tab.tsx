import Link from "next/link";
import { ArrowUpRight, Undo2 } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui";
import { formatDay, indiaDate } from "@/features/applications/dates";
import { autoOutcomeOf } from "@/features/applications/journey";
import { currentNamedStep } from "@/features/applications/named-steps";
import {
  canEditPlannedRecord,
  initialOutcome,
  isOutreach,
  methodLabel,
  outcomeMeta,
  recordStateFrom,
  type OutcomeId,
} from "@/features/applications/phase";
import { companyPageHref } from "@/features/applications/navigation";
import { addApplicationNote } from "@/features/applications/actions";
import { notApplying, reopenRecord } from "@/features/applications/record-actions";
import { FollowUp } from "@/features/applications/views/follow-up";
import { NotesFold } from "@/features/applications/views/notes/notes-fold";
import { OutcomeChips, PreparingControl } from "@/features/applications/views/outcome-chips";
import { RulePanel } from "@/features/mail/search/rule-panel";
import { undoAutoOutcomeAction } from "@/features/mail/workspace-actions";
import { resumeFileHref } from "@/features/resumes/links";
import { CompanyTimeline } from "@/features/timeline/timeline";
import type { CompanyApplicationRow, CompanyApplications } from "../applications";
import { ApplicationRow, Tracker } from "./application-row";
import { EditDetails, ResumePreview } from "./row-dialogs";

const withYear = (date: Date) => `${formatDay(date)} ${indiaDate(date).slice(0, 4)}`;
/** What the Add step panel leaves to the follow-up chip and to each round's own card. */
const notAdded: OutcomeId[] = ["followup", "passed", "failed", "rescheduled"];

function Fact({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{term}</dt>
      <dd className="m-0 mt-0.5 grid min-w-0 text-sm [&>*]:min-w-0">{children}</dd>
    </div>
  );
}

function Facts({ row }: { row: CompanyApplicationRow }) {
  const { record } = row;
  const step = currentNamedStep(row.steps);
  return (
    <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-4 @3xl:grid-cols-4">
      <Fact term="Opening">
        <a
          href={record.jobUrl}
          target="_blank"
          rel="noopener noreferrer"
          title={record.requisition ?? "No requisition"}
          className="inline-flex min-w-0 items-center gap-1 text-link"
        >
          <span className="truncate">{record.requisition ?? "No requisition"}</span>
          <ArrowUpRight aria-hidden size={13} className="shrink-0" />
        </a>
        <span className="truncate text-xs text-muted-foreground" title={record.city}>
          {record.city || "Location not recorded"}
        </span>
      </Fact>
      <Fact term="Applied on">
        <span className="truncate">{record.sentAt ? withYear(record.sentAt) : "Not sent"}</span>
        <span className="truncate text-xs text-muted-foreground">
          {methodLabel[record.source] ?? "Applied directly"}
        </span>
      </Fact>
      <Fact term="Résumé used">
        {record.resume ? (
          <ResumePreview
            versionId={record.resume.id}
            label={record.resume.label}
            filename={record.resume.filename}
          />
        ) : (
          <span className="text-muted-foreground">None recorded</span>
        )}
      </Fact>
      <Fact term="Where it stands">
        <span data-testid="phase-label" className="truncate font-medium" title={step.label}>
          {step.label}
        </span>
        {step.detail && (
          <span className="truncate text-xs text-muted-foreground" title={step.detail}>
            {step.detail}
          </span>
        )}
      </Fact>
    </dl>
  );
}

const addableOf = (row: CompanyApplicationRow) =>
  row.outcomes.filter((id) => !notAdded.includes(id));
/** Whether a requested outcome opens + Add step (so the email popup stays shut) for this row. */
const panelOpensFor = (
  row: CompanyApplicationRow,
  requested: string | undefined,
  source: CompanyApplications["source"] | undefined,
) =>
  requested !== undefined &&
  (initialOutcome(addableOf(row), requested) !== null || !!source?.error);

function RowBody({
  row,
  data,
  requested,
  mailIntent,
  inboxes,
  now,
}: {
  row: CompanyApplicationRow;
  data: CompanyApplications;
  /** The outcome named in the URL for this application, with the email it came from. */
  requested?: string;
  mailIntent?: string;
  inboxes?: string[];
  now: Date;
}) {
  const { record } = row;
  const today = indiaDate(now);
  const state = recordStateFrom(
    record,
    record.rounds,
    record.events.map((event) => event.eventType),
  );
  const editable = canEditPlannedRecord(state);
  const booked = [...record.rounds]
    .sort((a, b) => a.position - b.position)
    .find((round) => round.outcome === "SCHEDULED");
  // A selection carried in the URL (an email, an outcome link) is dropped once it is saved.
  const addable = addableOf(row);
  const rowHref = `${companyPageHref(record)}?${new URLSearchParams({ open: record.id })}`;
  const returnTo = requested ? rowHref : undefined;
  const source = data.source?.recordId === record.id ? data.source : undefined;
  // The email popup stands in for the panel only when the requested outcome cannot be recorded.
  const panelOpen =
    requested !== undefined && (initialOutcome(addable, requested) !== null || !!source?.error);
  const followUpChip: OutcomeId[] = row.outcomes.includes("followup") ? ["followup"] : [];
  const recorded = autoOutcomeOf(record);
  // Only an outcome asked for in the URL carries the email it came from.
  const sourceMail = requested ? mailIntent : undefined;
  const notApplyingClosed =
    record.phase === "Closed" && record.closedReason === "WITHDREW" && !record.sentAt;
  return (
    <>
      <Facts row={row} />
      <div className="flex flex-wrap items-start gap-3 empty:hidden">
        {record.phase !== "Closed" && (
          <FollowUp
            key={`follow-up-${record.id}`}
            recordId={record.id}
            day={record.nextActionAt ? indiaDate(record.nextActionAt) : null}
            label={record.nextActionAt ? formatDay(record.nextActionAt) : null}
            note={record.nextActionNote}
          />
        )}
        <OutcomeChips
          key={`follow-chip-${record.id}`}
          recordId={record.id}
          outcomes={followUpChip}
          initial={initialOutcome(followUpChip, requested)}
          requested={requested}
          mailId={sourceMail}
          selectionKey={sourceMail}
          today={today}
          returnTo={returnTo}
        />
      </div>
      <NotesFold
        recordId={record.id}
        notes={record.notes}
        scores={row.scores}
        resumesHref={record.resume ? resumeFileHref(record.resume.id) : undefined}
      />
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="shrink-0 text-muted-foreground">Application page</span>
          {record.applicationUrl ? (
            <a
              href={record.applicationUrl}
              target="_blank"
              rel="noopener noreferrer"
              title={record.applicationUrl}
              className="min-w-0 truncate text-link"
            >
              {record.applicationUrl}
            </a>
          ) : (
            <span className="text-muted-foreground">not saved</span>
          )}
        </span>
        <EditDetails
          recordId={record.id}
          applicationUrl={record.applicationUrl}
          resumeVersionId={record.resumeVersionId}
          resumeLabel={record.resume?.filename ?? null}
          editable={editable}
          versions={data.versions}
        />
      </div>
      {/* Focus lands here when a saved step removes the control that held it. */}
      <section aria-label="Progress" tabIndex={-1} className="min-w-0 space-y-5 outline-none">
        <Tracker
          key={`tracker-${record.id}`}
          steps={row.steps}
          recordId={record.id}
          addable={addable}
          requested={requested}
          mailId={sourceMail}
          today={today}
          booked={booked}
          returnTo={returnTo}
          rowHref={rowHref}
          source={source}
        />
        {editable && isOutreach(record.source) && (
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
          today={today}
        />
        {editable && record.phase === "Preparing" && (
          <ActionForm action={notApplying} feedback="inverse" pendingLabel="Closing">
            <input type="hidden" name="id" value={record.id} />
            <Button variant="outline" size="sm" className="rounded-full">
              Not applying
            </Button>
          </ActionForm>
        )}
      </section>
      {notApplyingClosed && (
        <ActionForm action={reopenRecord} feedback="inverse" pendingLabel="Reopening">
          <input type="hidden" name="id" value={record.id} />
          <Button variant="outline" size="sm" className="rounded-full">
            Reopen
          </Button>
        </ActionForm>
      )}
      {recorded && (
        <ActionForm
          action={undoAutoOutcomeAction}
          feedback="inverse"
          pendingLabel="Undoing"
          className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground"
        >
          <span>
            Recorded from an email:{" "}
            {outcomeMeta[recorded.outcome as OutcomeId]?.label ?? recorded.outcome}
          </span>
          <input type="hidden" name="id" value={recorded.mailMessageId} />
          <button
            type="submit"
            className="pressable inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-link hover:bg-selected"
          >
            <Undo2 aria-hidden size={13} />
            Undo
          </button>
        </ActionForm>
      )}
      <ActionForm action={addApplicationNote} feedback="inverse" className="space-y-2">
        <input type="hidden" name="id" value={record.id} />
        <label className="block text-sm">
          Add to history
          <textarea name="summary" rows={2} required maxLength={20000} className="mt-1 !min-h-16" />
        </label>
        <Button variant="outline" size="sm" className="h-9 px-4">
          Add note
        </Button>
      </ActionForm>
      <CompanyTimeline
        unlinkFrom={companyPageHref(record)}
        days={row.days}
        handling={row.handling}
        roles={[]}
        allRolesHref=""
        role={null}
        openMail={panelOpen ? null : (mailIntent ?? null)}
        olderHref={row.olderHref}
        inboxes={inboxes}
        requisition={record.requisition}
        roundCards={row.roundCards}
      />
    </>
  );
}

/**
 * The company page's first tab: one accordion row per application, newest applied first, each
 * with its facts, notes, tracker and timeline, then company mail that belongs to no application.
 * The newest active application opens by default; a deep link or an email opens its own.
 */
export function ApplicationsTab({
  data,
  companyKey,
  companyName,
  openId,
  requested,
  mailIntent,
  notice,
  now,
}: {
  data: CompanyApplications;
  companyKey: string;
  companyName: string;
  openId?: string | null;
  requested?: string;
  mailIntent?: string;
  /** The result of an action that navigated here, such as unlinking an email. */
  notice?: string;
  now: Date;
}) {
  const inboxes = data.search?.inboxes.map((row) => row.account);
  const target = data.rows.find((row) => row.record.id === openId)?.record.id ?? null;
  const holdsMail = (row: CompanyApplicationRow) =>
    !!mailIntent &&
    row.days.some((day) =>
      day.entries.some((entry) => entry.type === "mail" && entry.item.id === mailIntent),
    );
  const mailRow = data.rows.find(holdsMail)?.record.id ?? null;
  // The unplaced popup stays shut only while the targeted row's own panel takes the request.
  const targetRow = data.rows.find((row) => row.record.id === target);
  const unplacedOpen =
    targetRow && panelOpensFor(targetRow, requested, data.source ?? undefined)
      ? null
      : (mailIntent ?? null);
  const first =
    target ?? mailRow ?? data.rows.find((row) => row.record.phase !== "Closed")?.record.id;
  return (
    <div className="min-w-0 space-y-8">
      {notice && (
        <p
          role="status"
          className="m-0 rounded-2xl bg-foreground px-4 py-3 text-sm text-background shadow-surface"
        >
          {notice}
        </p>
      )}
      {data.rows.length ? (
        <ol aria-label="Applications" className="m-0 flex list-none flex-col gap-3 p-0">
          {data.rows.map((row) => {
            const { record } = row;
            const step = currentNamedStep(row.steps);
            return (
              <ApplicationRow
                key={record.id}
                id={record.id}
                date={record.sentAt ? withYear(record.sentAt) : "Not sent"}
                requisition={record.requisition}
                title={[record.role, record.city].filter(Boolean).join(" · ")}
                pill={step.detail ? `${step.label} · ${step.detail}` : step.label}
                tone={step.tone}
                defaultOpen={record.id === first || record.id === mailRow}
              >
                <RowBody
                  row={row}
                  data={data}
                  requested={record.id === target ? requested : undefined}
                  mailIntent={record.id === target || holdsMail(row) ? mailIntent : undefined}
                  inboxes={inboxes}
                  now={now}
                />
              </ApplicationRow>
            );
          })}
        </ol>
      ) : (
        <p className="m-0 text-sm text-muted-foreground">
          No applications recorded for {companyName} yet.{" "}
          <Link href="/applications/new" className="text-link">
            Record an application
          </Link>
        </p>
      )}
      {data.unplaced.length > 0 && (
        <section id="unplaced" aria-labelledby="unplaced-title" className="scroll-mt-24 space-y-3">
          <div>
            <h2 id="unplaced-title" className="m-0 text-base font-semibold">
              {companyName}, not on an application
            </h2>
            <p className="m-0 mt-0.5 text-sm text-muted-foreground">
              Company mail that is not linked to any application.
            </p>
          </div>
          <CompanyTimeline
            days={data.unplaced}
            handling={data.unplacedHandling}
            roles={[]}
            allRolesHref=""
            role={null}
            openMail={unplacedOpen}
            olderHref={data.unplacedOlderHref}
            inboxes={inboxes}
          />
        </section>
      )}
      {data.search && (
        <RulePanel data={data.search} companyKey={companyKey} companyName={companyName} />
      )}
    </div>
  );
}
