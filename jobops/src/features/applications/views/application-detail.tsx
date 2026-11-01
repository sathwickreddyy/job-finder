import Link from "next/link";
import type { ReactNode } from "react";
import { Building2, FileText, PencilLine, Undo2 } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui";
import { linkMailOnly } from "@/features/mail/triage-actions";
import { undoAutoOutcomeAction } from "@/features/mail/workspace-actions";
import type { TimelineDay } from "@/features/timeline/entries";
import type { Handling } from "@/features/timeline/suggest";
import { CompanyTimeline } from "@/features/timeline/timeline";
import { cn } from "@/lib/utils";
import { formatDay, indiaDate, istDaysBetween } from "../dates";
import { autoOutcomeOf, type Journey } from "../journey";
import type { Lane } from "../lanes";
import { laneHref } from "../navigation";
import {
  availableOutcomes,
  canEditPlannedRecord,
  initialOutcome,
  methodLabel,
  outcomeMeta,
  recordStateFrom,
  type OutcomeId,
} from "../phase";
import type { ApplicationRecord } from "../read";
import { notApplying, reopenRecord } from "../record-actions";
import { NextAction } from "./application-list";
import { FollowUp } from "./follow-up";
import { JourneyTrack } from "./journey-track";
import { OutcomeChips, PreparingControl } from "./outcome-chips";

const postedKind: Record<string, string> = {
  ORIGINAL: "original posting",
  LATEST_PUBLICATION: "latest publication",
};
const plural = (days: number) => `${days} ${days === 1 ? "day" : "days"}`;

function Facts({ record }: { record: ApplicationRecord }) {
  const kind = record.postedAtKind ? postedKind[record.postedAtKind] : undefined;
  const delay =
    record.postedAt && record.sentAt ? istDaysBetween(record.postedAt, record.sentAt) : null;
  const rows: [string, ReactNode][] = [
    [
      "Posted",
      record.postedAt ? `${formatDay(record.postedAt)}${kind ? `, ${kind}` : ""}` : "Unknown",
    ],
    [
      "Applied",
      record.sentAt
        ? `${formatDay(record.sentAt)}${delay === null ? "" : `, ${plural(delay)} after posting`}`
        : "Not sent",
    ],
    [
      "Resume",
      record.resume ? (
        <Link
          href={`/resumes?file=${record.resume.id}`}
          className="inline-flex max-w-full min-w-0 items-center gap-1.5 text-link"
        >
          <FileText aria-hidden size={14} className="shrink-0" />
          <span className="truncate">{record.resume.filename}</span>
        </Link>
      ) : (
        "None recorded"
      ),
    ],
    ["Source", methodLabel[record.source] ?? "Applied directly"],
    ["City", record.city || "Not recorded"],
  ];
  return (
    <dl className="m-0 grid gap-3 text-sm">
      {rows.map(([term, value]) => (
        <div key={term} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-3">
          <dt className="text-muted-foreground">{term}</dt>
          <dd className="m-0 min-w-0 [overflow-wrap:anywhere]">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * The open row (spec §5): the journey and story on the left; the next step, outcome chips,
 * follow-up and facts on the right. Editing the record itself stays on `/applications/<id>`.
 */
export function ApplicationExpanded({
  record,
  lane,
  journey,
  story,
  now,
  requested,
  mail,
  mailIntent,
  mailError,
}: {
  record: ApplicationRecord;
  lane: Lane;
  journey: Journey;
  story: { days: TimelineDay[]; handling: Record<string, Handling> };
  now: Date;
  requested?: string;
  mail: { id: string; subject: string; classification: string } | null;
  mailIntent?: string;
  mailError?: string;
}) {
  const here = laneHref(record.id);
  const state = recordStateFrom(
    record,
    record.rounds,
    record.events.map((event) => event.eventType),
  );
  const available = availableOutcomes(state);
  const ack = mail?.classification === "APPLICATION_ACKNOWLEDGEMENT";
  const next = lane.next;
  const recorded = autoOutcomeOf(record);
  const notApplyingClosed =
    record.phase === "Closed" && record.closedReason === "WITHDREW" && !record.sentAt;
  return (
    <div className="reveal grid gap-6 border-t border-border bg-muted/20 px-4 py-5 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] md:px-6">
      <section aria-label="Story" className="flex min-w-0 flex-col gap-5">
        <div className="flex flex-col gap-2">
          {record.companyHref && (
            <Button variant="outline" size="sm" className="self-start rounded-full" asChild>
              <Link href={record.companyHref}>
                <Building2 aria-hidden size={14} />
                Company page
              </Link>
            </Button>
          )}
          <JourneyTrack journey={journey} size="large" className="hidden max-w-md md:grid" />
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
        <CompanyTimeline
          days={story.days}
          handling={story.handling}
          roles={[]}
          allRolesHref=""
          role={null}
          openMail={mailIntent ?? null}
          olderHref={null}
        />
      </section>
      <section
        aria-label="Progress"
        tabIndex={-1}
        className="flex min-w-0 flex-col gap-4 outline-offset-2"
      >
        <div className="rounded-2xl bg-card p-4 ring-1 ring-border">
          {next ? (
            <div className="flex flex-col gap-3">
              <div>
                <p
                  className={cn(
                    "m-0 text-xs font-semibold tabular-nums",
                    next.due === "overdue" ? "text-destructive" : "text-muted-foreground",
                  )}
                >
                  {next.when}
                </p>
                <p className="m-0 mt-1 text-sm font-medium [overflow-wrap:anywhere]">{next.text}</p>
              </div>
              <div className="flex flex-wrap gap-2 empty:hidden">
                <NextAction next={next} returnTo={here} />
              </div>
            </div>
          ) : (
            <p className="m-0 text-sm text-muted-foreground">Nothing to do</p>
          )}
        </div>
        {mail && (
          <div className="flex flex-col gap-2 rounded-2xl bg-selected px-4 py-3 text-sm text-selected-foreground [overflow-wrap:anywhere]">
            <p className="m-0">From this email: {mail.subject}</p>
            <ActionForm action={linkMailOnly} feedback="inverse" pendingLabel="Linking">
              <input type="hidden" name="mailId" value={mail.id} />
              <input type="hidden" name="recordId" value={record.id} />
              <input type="hidden" name="returnTo" value={here} />
              <Button variant="ghost" size="sm">
                {ack ? "Add to timeline" : "Link without recording an outcome"}
              </Button>
            </ActionForm>
          </div>
        )}
        <PreparingControl
          key={`sent-${record.id}`}
          recordId={record.id}
          active={canEditPlannedRecord(state)}
          today={indiaDate(now)}
          returnTo={here}
        />
        {record.phase === "Preparing" && next?.action !== "Not applying" && (
          <ActionForm action={notApplying} feedback="inverse" pendingLabel="Closing">
            <input type="hidden" name="id" value={record.id} />
            <input type="hidden" name="returnTo" value={here} />
            <Button variant="outline" size="sm" className="rounded-full">
              Not applying
            </Button>
          </ActionForm>
        )}
        {notApplyingClosed && (
          <ActionForm action={reopenRecord} feedback="inverse" pendingLabel="Reopening">
            <input type="hidden" name="id" value={record.id} />
            <input type="hidden" name="returnTo" value={here} />
            <Button variant="outline" size="sm" className="rounded-full">
              Reopen
            </Button>
          </ActionForm>
        )}
        <OutcomeChips
          key={`outcomes-${record.id}`}
          recordId={record.id}
          outcomes={ack ? [] : available}
          initial={mailError || ack ? null : initialOutcome(available, requested)}
          mailId={mailIntent}
          mailError={mailError}
          selectionKey={mailIntent}
          requested={requested}
          today={indiaDate(now)}
          booked={record.rounds.find((round) => round.outcome === "SCHEDULED")}
          returnTo={here}
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
        <div className="rounded-2xl bg-card p-4 ring-1 ring-border">
          <Facts record={record} />
          <Link
            href={`/applications/${record.id}`}
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-link"
          >
            <PencilLine aria-hidden size={14} />
            Edit details
          </Link>
        </div>
      </section>
    </div>
  );
}
