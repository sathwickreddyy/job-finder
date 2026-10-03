import Link from "next/link";
import { X } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui";
import { dismissMail, linkMailOnly } from "@/features/mail/triage-actions";
import { cn } from "@/lib/utils";
import { formatDay, indiaDate } from "../dates";
import type { Lane, LaneNext } from "../lanes";
import { laneHref } from "../navigation";
import {
  availableOutcomes,
  canEditPlannedRecord,
  initialOutcome,
  isOutreach,
  methodLabel,
  recordStateFrom,
} from "../phase";
import type { ApplicationRecord } from "../read";
import { FollowUp } from "./follow-up";
import { dueStyle } from "./lane-marks";
import { OutcomeChips, PreparingControl } from "./outcome-chips";
import { RecordPicker } from "./record-picker";
import { Timeline } from "./timeline";

export function LaneDetail({
  lane,
  record,
  now,
  requested,
  mail,
  mailIntent,
  mailError,
  records,
}: {
  lane: Lane;
  record: ApplicationRecord;
  now: Date;
  requested?: string;
  mail: { id: string; subject: string; classification: string } | null;
  mailIntent?: string;
  mailError?: string;
  records: { id: string; label: string }[];
}) {
  const here = laneHref(record.id);
  const role = lane.roles.find((item) => item.recordId === record.id);
  const state = recordStateFrom(
    record,
    record.rounds,
    record.events.map((event) => event.eventType),
  );
  const available = availableOutcomes(state);
  const ack = mail?.classification === "APPLICATION_ACKNOWLEDGEMENT";
  return (
    <section
      aria-label={`${lane.company} timeline`}
      className="grid gap-5 p-4 md:grid-cols-[minmax(0,1fr)_20rem]"
    >
      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p className="m-0 min-w-0 text-sm text-muted-foreground [overflow-wrap:anywhere]">
            {[
              record.role,
              record.city,
              methodLabel[record.source] ?? "Applied directly",
              record.contact,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <span className="flex items-center gap-1">
            <Link href={`/applications/${record.id}`} className="text-sm font-medium text-link">
              Open record
            </Link>
            <Link
              href="/applications"
              scroll={false}
              aria-label={`Close ${lane.company}`}
              className="grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-muted"
            >
              <X size={16} aria-hidden />
            </Link>
          </span>
        </div>
        {lane.roles.length > 1 && (
          <nav aria-label="Roles" className="flex flex-wrap gap-2">
            {lane.roles.map((item) => (
              <Link
                key={item.recordId}
                href={laneHref(item.recordId)}
                scroll={false}
                aria-current={item.recordId === record.id ? "true" : undefined}
                className={cn(
                  "pressable inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-full border px-3 text-sm hover:no-underline",
                  item.recordId === record.id
                    ? "border-transparent bg-selected text-selected-foreground"
                    : "border-border text-foreground hover:bg-muted",
                )}
              >
                <span className="truncate">
                  {item.role}
                  {isOutreach(item.source) ? ` (${methodLabel[item.source]})` : ""}
                </span>
                <span className="shrink-0 text-xs opacity-80"> · {item.status.label}</span>
              </Link>
            ))}
          </nav>
        )}
        <section aria-label="History">
          <Timeline
            now={now}
            entries={lane.dots.map((dot) => ({
              key: dot.key,
              at: dot.at,
              tone: dot.tone,
              label: dot.label,
              detail: dot.detail,
              tags: [dot.role, dot.via].filter((tag): tag is string => Boolean(tag)),
              href: dot.mailId && dot.tone !== "pending" ? `/mail/${dot.mailId}` : undefined,
              extra:
                dot.tone === "pending" && dot.mailId ? (
                  <div className="mt-1.5 flex flex-col gap-1.5">
                    <div className="flex flex-wrap items-center gap-3">
                      <Link
                        href={laneHref(dot.recordId, { mail: dot.mailId, outcome: dot.outcome })}
                        scroll={false}
                        className="text-xs font-medium text-link"
                      >
                        {dot.outcome ? "Link it" : "Add to timeline"}
                      </Link>
                      <ActionForm
                        action={dismissMail}
                        feedback="inverse"
                        className="contents"
                        pendingLabel="Dismissing"
                      >
                        <input type="hidden" name="mailId" value={dot.mailId} />
                        <input type="hidden" name="returnTo" value={here} />
                        <button className="border-0 bg-transparent p-0 text-xs font-medium text-muted-foreground hover:underline">
                          Dismiss
                        </button>
                      </ActionForm>
                    </div>
                    <details className="text-xs">
                      <summary className="cursor-pointer text-muted-foreground">
                        Link elsewhere
                      </summary>
                      <div className="mt-1.5">
                        <RecordPicker
                          mailId={dot.mailId}
                          outcome={dot.outcome}
                          records={records.filter((option) => option.id !== dot.recordId)}
                        />
                      </div>
                    </details>
                  </div>
                ) : undefined,
            }))}
          />
        </section>
      </div>
      <section
        aria-label="Progress"
        tabIndex={-1}
        className="flex min-w-0 flex-col gap-4 outline-offset-2"
      >
        {role?.next && <NextBox next={role.next} />}
        {mail && (
          <div className="flex flex-col gap-2 rounded-2xl bg-selected px-4 py-3 text-sm text-selected-foreground [overflow-wrap:anywhere]">
            <p className="m-0">Linking mail: {mail.subject}</p>
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
      </section>
    </section>
  );
}

function NextBox({ next }: { next: LaneNext }) {
  const style = dueStyle[next.due ?? "none"];
  return (
    <div className="rounded-2xl bg-muted p-4">
      <p className={cn("m-0 flex items-center gap-2 text-xs font-semibold", style.text)}>
        <span aria-hidden className={cn("size-2 shrink-0 rounded-full", style.dot)} />
        {next.when}
      </p>
      <p className="m-0 mt-1 text-sm [overflow-wrap:anywhere]">{next.text}</p>
    </div>
  );
}
