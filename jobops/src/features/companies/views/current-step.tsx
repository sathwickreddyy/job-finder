import Link from "next/link";
import { CalendarClock, CircleSlash, Send } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui";
import { formatDay } from "@/features/applications/dates";
import { isOutreach, type OutcomeId } from "@/features/applications/phase";
import type { ApplicationRecord } from "@/features/applications/read";
import { notApplying, reopenRecord } from "@/features/applications/record-actions";
import { roundLabels } from "@/features/applications/round-label";
import { OutcomeChips, PreparingControl } from "@/features/applications/views/outcome-chips";

/** The results a booked round can take; they are recorded here, not on the round's card. */
const roundResults: OutcomeId[] = ["passed", "failed", "rescheduled"];

function Heading({
  icon: Icon,
  title,
  detail,
}: {
  icon: typeof Send;
  title: string;
  detail?: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3.5">
      <span
        aria-hidden
        className="grid size-10 shrink-0 place-items-center rounded-full bg-review/20 text-foreground"
      >
        <Icon size={18} />
      </span>
      <div className="min-w-0">
        <p className="m-0 text-base font-semibold">{title}</p>
        {detail && <p className="m-0 text-sm text-muted-foreground">{detail}</p>}
      </div>
    </div>
  );
}

/**
 * What the application needs next: the booked round's result, the unsent record's send and
 * skip controls, or Reopen once it was closed as not applying. Hidden when nothing is due.
 * The result chips stay mounted so their confirmation outlives the round they settled.
 */
export function CurrentStep({
  record,
  booked,
  outcomes,
  today,
  returnTo,
  editable,
  notApplyingClosed,
  now,
}: {
  record: ApplicationRecord;
  booked?: ApplicationRecord["rounds"][number];
  outcomes: OutcomeId[];
  today: string;
  returnTo?: string;
  editable: boolean;
  notApplyingClosed: boolean;
  now: Date;
}) {
  const results = outcomes.filter((id) => roundResults.includes(id));
  const ordered = [...record.rounds].sort((a, b) => a.position - b.position);
  const label = booked ? roundLabels(ordered)[ordered.findIndex((r) => r.id === booked.id)] : "";
  const when = booked?.scheduledAt;
  const preparing = editable && record.phase === "Preparing";
  return (
    <div
      data-testid="current-step"
      className="min-w-0 space-y-3 rounded-2xl bg-review/10 p-4 ring-1 ring-review/30 has-[>[hidden]:only-child]:hidden"
    >
      {booked && results.length > 0 && (
        <Heading
          icon={CalendarClock}
          title={
            when
              ? `${label} ${when <= now ? "was" : "is"} on ${formatDay(when)}`
              : `${label} · Date not set`
          }
          detail={
            when
              ? when <= now
                ? "How did it go? Recording it moves the tracker on."
                : "Record the result after the round."
              : undefined
          }
        />
      )}
      {preparing && <Heading icon={Send} title="Not sent yet" />}
      {notApplyingClosed && <Heading icon={CircleSlash} title="Closed as not applying" />}
      <OutcomeChips
        key={`round-result-${record.id}`}
        recordId={record.id}
        outcomes={booked ? results : []}
        initial={null}
        today={today}
        booked={booked}
        returnTo={returnTo}
        compact
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
      {preparing && (
        <ActionForm action={notApplying} feedback="inverse" pendingLabel="Closing">
          <input type="hidden" name="id" value={record.id} />
          <Button variant="outline" size="sm" className="rounded-full">
            Not applying
          </Button>
        </ActionForm>
      )}
      {notApplyingClosed && (
        <ActionForm action={reopenRecord} feedback="inverse" pendingLabel="Reopening">
          <input type="hidden" name="id" value={record.id} />
          <Button variant="outline" size="sm" className="rounded-full">
            Reopen
          </Button>
        </ActionForm>
      )}
    </div>
  );
}
