import { Undo2 } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { formatDay, indiaDate } from "@/features/applications/dates";
import { autoOutcomeOf } from "@/features/applications/journey";
import {
  canEditPlannedRecord,
  initialOutcome,
  outcomeMeta,
  recordStateFrom,
  type OutcomeId,
} from "@/features/applications/phase";
import { companyPageHref } from "@/features/applications/navigation";
import { OutcomeChips } from "@/features/applications/views/outcome-chips";
import { undoAutoOutcomeAction } from "@/features/mail/workspace-actions";
import { CompanyTimeline } from "@/features/timeline/timeline";
import type { CompanyApplicationRow, CompanyApplications } from "../applications";
import { Tracker } from "./application-row";
import { CurrentStep } from "./current-step";
import { DetailsAside } from "./details-aside";
import { NoteComposer } from "./note-composer";

export const withYear = (date: Date) => `${formatDay(date)} ${indiaDate(date).slice(0, 4)}`;
/** What the Add step panel leaves to the follow-up chip and to the current step's round result. */
const notAdded: OutcomeId[] = ["followup", "passed", "failed", "rescheduled"];

export const addableOf = (row: CompanyApplicationRow) =>
  row.outcomes.filter((id) => !notAdded.includes(id));
export function RowBody({
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
    <div className="@container">
      <div className="grid gap-6 @3xl:grid-cols-[minmax(0,1fr)_290px] @3xl:items-start">
        <div className="min-w-0 space-y-4 @3xl:col-start-1 @3xl:row-start-1">
          {/* Focus lands here when a saved step removes the control that held it. */}
          <section aria-label="Progress" tabIndex={-1} className="min-w-0 space-y-5 outline-none">
            <CurrentStep
              record={record}
              booked={booked}
              outcomes={row.outcomes}
              today={today}
              returnTo={returnTo}
              editable={editable}
              notApplyingClosed={notApplyingClosed}
              now={now}
            />
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
          </section>
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
        </div>
        <div className="min-w-0 @3xl:col-start-2 @3xl:row-span-2 @3xl:row-start-1">
          <DetailsAside row={row} versions={data.versions} editable={editable} />
        </div>
        <div className="min-w-0 @3xl:col-start-1 @3xl:row-start-2">
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
            toolbarEnd={
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
            }
          >
            <NoteComposer recordId={record.id} />
          </CompanyTimeline>
        </div>
      </div>
    </div>
  );
}
