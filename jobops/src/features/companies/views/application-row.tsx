"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { initialOutcome, type OutcomeId } from "@/features/applications/phase";
import type { NamedStep } from "@/features/applications/named-steps";
import { NamedSteps } from "@/features/applications/views/named-steps";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui";
import { linkMailOnly } from "@/features/mail/triage-actions";
import { MailDialogButton } from "@/features/mail/mail-dialog";
import { OutcomeChips } from "@/features/applications/views/outcome-chips";
import { cn } from "@/lib/utils";
import { StepProgress } from "./step-progress";

const tones = {
  applied: "bg-selected text-selected-foreground",
  interviewing: "bg-review text-review-foreground",
  offer: "bg-success-soft text-success",
  bad: "bg-danger-soft text-destructive",
  muted: "bg-muted text-muted-foreground",
} satisfies Record<NamedStep["tone"], string>;
const rails = {
  applied: "bg-primary",
  interviewing: "bg-review",
  offer: "bg-success",
  bad: "bg-destructive",
  muted: "bg-border",
} satisfies Record<NamedStep["tone"], string>;

/**
 * One application as an accordion card: the role first, a meta line, segmented progress, the state
 * pill with what is due under it, and a count of new mail. A link to `#application-<id>` opens it,
 * scrolls to it and rings it for a moment. Several rows may be open; a closed row renders none of
 * its body.
 */
export function ApplicationRow({
  id,
  role,
  meta,
  steps,
  pill,
  detail,
  due,
  tone,
  newCount,
  defaultOpen,
  children,
}: {
  id: string;
  role: string;
  /** "Applied 4 Nov 2026 · No requisition · Hyderabad". */
  meta: string;
  steps: NamedStep[];
  pill: string;
  /** What is due or when, under the pill. */
  detail: string;
  /** Whether the detail is overdue and so shown in the warning colour. */
  due?: boolean;
  tone: NamedStep["tone"];
  /** Open mail on this application. */
  newCount: number;
  defaultOpen: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [lit, setLit] = useState(false);
  const row = useRef<HTMLLIElement>(null);
  const panel = useId();
  const anchor = `application-${id}`;
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const sync = () => {
      if (window.location.hash !== `#${anchor}`) return;
      setOpen(true);
      row.current?.scrollIntoView({ block: "start" });
      setLit(true);
      clearTimeout(timer);
      timer = setTimeout(() => setLit(false), 1500);
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => {
      window.removeEventListener("hashchange", sync);
      clearTimeout(timer);
    };
  }, [anchor]);
  return (
    <li
      ref={row}
      id={anchor}
      className={cn(
        "scroll-mt-24 overflow-hidden rounded-3xl bg-card ring-1 transition-shadow duration-500",
        lit ? "ring-2 ring-primary" : "ring-border",
      )}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panel}
        onClick={() => setOpen(!open)}
        className="relative flex w-full min-w-0 flex-wrap items-center gap-x-4 gap-y-2 py-3.5 pr-4 pl-5 text-left hover:bg-muted/40 sm:pr-5 sm:pl-6"
      >
        <span
          aria-hidden
          data-rail={tone}
          className={cn("absolute inset-y-3 left-0 w-1 rounded-r-full", rails[tone])}
        />
        <span className="min-w-0 basis-48 flex-1">
          <span className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 truncate text-sm font-semibold" title={role}>
              {role}
            </span>
          </span>
          <span className="block truncate text-xs text-muted-foreground" title={meta}>
            {meta}
          </span>
        </span>
        <StepProgress steps={steps} />
        <span className="flex min-w-0 max-w-full flex-col items-start gap-0.5 sm:items-end">
          <span className="flex max-w-full min-w-0 items-center gap-2">
            {newCount > 0 && (
              <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                {newCount} new
              </span>
            )}
            <span
              data-testid="phase-label"
              className={cn("min-w-0 truncate rounded-full px-2.5 py-0.5 text-xs", tones[tone])}
              title={pill}
            >
              {pill}
            </span>
          </span>
          {detail && (
            <small className={cn("text-xs", due ? "text-warning" : "text-muted-foreground")}>
              {detail}
            </small>
          )}
        </span>
        <ChevronRight
          aria-hidden
          size={16}
          className={cn("shrink-0 text-muted-foreground transition-transform", open && "rotate-90")}
        />
      </button>
      {open && (
        <div
          id={panel}
          className="@container min-w-0 space-y-5 border-t border-border px-4 py-5 sm:px-5"
        >
          {children}
        </div>
      )}
    </li>
  );
}

/**
 * The tracker with its "+ Add step" control. The control sits in the tracker before the final
 * step and toggles an inline panel of the outcomes that add a step.
 */
export function Tracker({
  steps,
  recordId,
  addable,
  requested,
  mailId,
  today,
  booked,
  returnTo,
  rowHref,
  source,
}: {
  steps: NamedStep[];
  recordId: string;
  /** The outcomes this panel offers; empty hides the control. */
  addable: OutcomeId[];
  /** An outcome named in the URL; its panel opens at once. */
  requested?: string;
  /** The email an outcome from the URL came from. */
  mailId?: string;
  today: string;
  booked?: { name: string; scheduledAt: Date | null };
  /** Where a saved outcome returns to, so an email or outcome query leaves the URL. */
  returnTo?: string;
  /** This application's open row; where linking an email without an outcome returns to. */
  rowHref?: string;
  /** The email the outcome link came from, or why it cannot be used. */
  source?: { id?: string; subject?: string; error?: string };
}) {
  const initial = initialOutcome(addable, requested);
  const [adding, setAdding] = useState(
    requested !== undefined && (initial !== null || !!source?.error),
  );
  const [seenRequest, setSeenRequest] = useState(requested);
  // A link to this page that names an outcome opens the panel even when the row is already mounted.
  if (requested !== seenRequest) {
    setSeenRequest(requested);
    if (initial !== null) setAdding(true);
  }
  const panel = useId();
  // The email is named on the row whenever a link brings one; the outcome may no longer apply.
  const notApplicable = requested !== undefined && initial === null && !source?.error;
  const toggle = addable.length > 0 && (
    <button
      type="button"
      aria-expanded={adding}
      aria-controls={panel}
      onClick={() => setAdding(!adding)}
      className="pressable inline-flex h-8 items-center rounded-full border border-dashed border-border bg-card px-2.5 text-xs font-medium whitespace-nowrap text-link"
    >
      + Add step
    </button>
  );
  const inline = steps.some((step) => step.key === "final");
  return (
    <div className="min-w-0 space-y-4">
      <NamedSteps steps={steps} size="page" add={inline ? toggle : undefined} />
      {!inline && toggle}
      {source?.id && (
        <div className="space-y-2 text-sm">
          <p className="m-0 [overflow-wrap:anywhere]">
            From this email:{" "}
            <MailDialogButton
              mailId={source.id}
              className="text-left font-medium underline decoration-current/40 underline-offset-2 hover:decoration-current"
            >
              {source.subject || "(no subject)"}
            </MailDialogButton>
          </p>
          {notApplicable && (
            <p role="status" className="m-0 text-muted-foreground">
              That outcome no longer applies to this application. You can still link the email.
            </p>
          )}
          <ActionForm action={linkMailOnly} feedback="inverse" pendingLabel="Linking">
            <input type="hidden" name="mailId" value={source.id} />
            <input type="hidden" name="recordId" value={recordId} />
            {rowHref && <input type="hidden" name="returnTo" value={rowHref} />}
            <Button variant="outline" size="sm" className="rounded-full">
              Link without recording an outcome
            </Button>
          </ActionForm>
        </div>
      )}
      {/* Stays mounted after a save so the chips can restore focus; the box hides itself. */}
      {adding && (
        <div
          id={panel}
          className="rounded-2xl p-4 ring-1 ring-border has-[>[hidden]:only-child]:hidden"
        >
          <OutcomeChips
            key={`add-${recordId}`}
            recordId={recordId}
            outcomes={addable}
            mailError={source?.error}
            initial={source?.error ? null : initial}
            requested={requested}
            mailId={mailId}
            selectionKey={mailId}
            today={today}
            booked={booked}
            returnTo={returnTo}
          />
        </div>
      )}
    </div>
  );
}
