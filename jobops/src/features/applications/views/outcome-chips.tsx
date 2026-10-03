"use client";

import { useLayoutEffect, useRef, useState } from "react";
import {
  CalendarPlus,
  Check,
  CircleSlash,
  Hourglass,
  MailCheck,
  PartyPopper,
  Send,
  Undo2,
  X,
  type LucideIcon,
} from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui";
import { roundKindLabel } from "@/features/companies/metrics";
import { roundKinds } from "@/lib/round-kinds";
import { cn } from "@/lib/utils";
import { recordOutcome } from "../outcomes";
import { indiaDate, istClock } from "../dates";
import { recordAsSent } from "../record-actions";
import { outcomeMeta, type OutcomeId } from "../phase";

const icons: Record<OutcomeId, LucideIcon> = {
  heard: MailCheck,
  replied: MailCheck,
  oa: CalendarPlus,
  scheduled: CalendarPlus,
  followup: Send,
  passed: Check,
  failed: X,
  rescheduled: Undo2,
  offer: PartyPopper,
  rejected: X,
  ghosted: Hourglass,
  withdrew: CircleSlash,
  accepted: PartyPopper,
  declined: CircleSlash,
  referred: Check,
  declinedReferral: X,
};

export function OutcomeChips({
  recordId,
  outcomes,
  initial,
  requested,
  today,
  booked,
}: {
  recordId: string;
  outcomes: OutcomeId[];
  initial: OutcomeId | null;
  requested?: string;
  today: string;
  booked?: { name: string; scheduledAt: Date | null };
}) {
  const [open, setOpen] = useState<OutcomeId | null>(initial);
  const container = useRef<HTMLDivElement>(null);
  const chips = useRef(new Map<OutcomeId, HTMLButtonElement>());
  const restoreChip = useRef<OutcomeId | null>(null);
  useLayoutEffect(() => {
    if (open || !restoreChip.current) return;
    const chip = chips.current.get(restoreChip.current);
    restoreChip.current = null;
    return focusAfterClose(
      chip ?? container.current?.closest<HTMLElement>("section[aria-label='Progress']") ?? null,
    );
  }, [open]);
  const [confirmation, setConfirmation] = useState("");
  const [previousRequested, setPreviousRequested] = useState(requested);
  if (requested !== previousRequested) {
    setPreviousRequested(requested);
    setOpen(initial);
  }
  if (!outcomes.length && !confirmation && !open) return null;
  const needs = open ? outcomeMeta[open].needs : undefined;
  return (
    <div ref={container} id="what-happened" className="scroll-mt-24">
      {confirmation && <Confirmation message={confirmation} />}
      {outcomes.length > 0 && (
        <h3 className="m-0 mb-2.5 text-base font-semibold">What happened?</h3>
      )}
      <div className="flex flex-wrap gap-2">
        {outcomes.map((id) => {
          const meta = outcomeMeta[id];
          const Icon = icons[id];
          return (
            <button
              key={id}
              ref={(element) => {
                if (element) chips.current.set(id, element);
                else chips.current.delete(id);
              }}
              type="button"
              aria-expanded={open === id}
              onClick={() => {
                setConfirmation("");
                setOpen(open === id ? null : id);
              }}
              className={cn(
                "pressable inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm",
                open === id
                  ? "border-transparent bg-primary text-primary-foreground"
                  : meta.tone === "good"
                    ? "border-transparent bg-selected text-selected-foreground hover:brightness-110"
                    : meta.tone === "bad"
                      ? "border-destructive/50 bg-transparent text-destructive hover:bg-danger-soft"
                      : "border-border bg-transparent text-foreground hover:bg-muted",
              )}
            >
              <Icon size={14} aria-hidden />
              {meta.label}
            </button>
          );
        })}
      </div>
      {open && (
        <ActionForm
          key={open}
          action={recordOutcome}
          className="mt-3 space-y-3 rounded-2xl bg-muted/50 p-4"
          pendingLabel="Saving"
          onSuccess={(message) => {
            restoreChip.current = open;
            setConfirmation(message);
            setOpen(null);
          }}
        >
          <input type="hidden" name="id" value={recordId} />
          <input type="hidden" name="outcome" value={open} />
          <p className="m-0 font-medium">{outcomeMeta[open].label}</p>
          {open === "rescheduled" && booked?.name && (
            <p className="m-0 text-sm text-muted-foreground">{booked.name}</p>
          )}
          {needs === "deadline" && (
            <p className="m-0 text-sm text-muted-foreground">
              Leave time blank for 11:59 pm India time.
            </p>
          )}
          <div className="flex flex-wrap items-end gap-3">
            {needs === "round" && (
              <label className="max-w-full w-40 text-sm">
                Round
                <select aria-label="Round" name="kind" className="mt-1" defaultValue="DSA">
                  {roundKinds.map((kind) => (
                    <option key={kind} value={kind}>
                      {roundKindLabel[kind]}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {needs && (
              <>
                <label className="max-w-full w-48 text-sm">
                  {needs === "deadline" ? "Complete by (India time)" : "Date (India time)"}
                  <input
                    className="mt-1"
                    type="date"
                    name="day"
                    required
                    defaultValue={
                      open === "rescheduled" && booked?.scheduledAt
                        ? indiaDate(booked.scheduledAt)
                        : ""
                    }
                  />
                </label>
                <label className="max-w-full w-32 text-sm">
                  Time
                  <input
                    className="mt-1"
                    type="time"
                    name="time"
                    required={needs !== "deadline"}
                    defaultValue={
                      open === "rescheduled" && booked?.scheduledAt
                        ? istClock(booked.scheduledAt)
                        : ""
                    }
                  />
                </label>
              </>
            )}
            {(needs === "round" || needs === "deadline") && (
              <label className="max-w-full w-56 text-sm">
                Name (optional)
                <input
                  className="mt-1"
                  name="name"
                  maxLength={200}
                  placeholder={needs === "deadline" ? "HackerRank" : "Machine coding"}
                />
              </label>
            )}
            <label className="max-w-full w-44 text-sm">
              When it happened
              <input
                className="mt-1"
                type="date"
                name="happenedOn"
                max={today}
                defaultValue={today}
              />
            </label>
          </div>
          <label className="block text-sm">
            Note (optional)
            <textarea name="note" rows={2} maxLength={2000} className="mt-1 !min-h-16" />
          </label>
          <div className="flex gap-2">
            <Button>Save</Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                restoreChip.current = open;
                setOpen(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </ActionForm>
      )}
    </div>
  );
}

/** Keep local focus restoration compatible with the app's temporarily inert saving overlay. */
export function focusAfterClose(target: HTMLElement | null) {
  if (!target) return;
  const inertParent = target.closest("[inert]");
  if (!inertParent) {
    target.focus();
    return;
  }
  const observer = new MutationObserver(() => {
    if (!target.closest("[inert]")) {
      observer.disconnect();
      target.focus();
    }
  });
  observer.observe(inertParent, { attributes: true, attributeFilter: ["inert"] });
  return () => observer.disconnect();
}

export function Confirmation({ message }: { message: string }) {
  return (
    <p
      role="status"
      className="m-0 mb-3 rounded-2xl bg-foreground p-3 text-sm text-background shadow-surface"
    >
      {message}
    </p>
  );
}

export function PreparingControl({
  recordId,
  active,
  today,
}: {
  recordId: string;
  active: boolean;
  today: string;
}) {
  const [confirmation, setConfirmation] = useState("");
  const [startedPreparing] = useState(active);
  const container = useRef<HTMLDivElement>(null);
  const showForm = active || (startedPreparing && !confirmation);
  useLayoutEffect(() => {
    if (!confirmation || showForm) return;
    return focusAfterClose(
      container.current?.closest<HTMLElement>("section[aria-label='Progress']") ?? null,
    );
  }, [confirmation, showForm]);
  if (!showForm && !confirmation) return null;
  return (
    <div ref={container}>
      {confirmation && <Confirmation message={confirmation} />}
      {showForm && (
        <ActionForm action={recordAsSent} onSuccess={setConfirmation}>
          <input type="hidden" name="id" value={recordId} />
          <h2 className="m-0 text-base font-semibold">Record it as sent</h2>
          <label className="block max-w-56 text-sm">
            Date sent (India time)
            <input type="date" name="sentDate" max={today} defaultValue={today} className="mt-1" />
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="humanConfirmed" required className="mt-1 shrink-0" />I
            confirm I already submitted or sent this myself.
          </label>
          <Button>Record as sent</Button>
        </ActionForm>
      )}
    </div>
  );
}
