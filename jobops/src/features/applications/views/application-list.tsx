"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { StatusPill } from "@/features/companies/status-pill";
import { cn } from "@/lib/utils";
import type { Journey } from "../journey";
import type { Lane, LaneGroup, LaneNext } from "../lanes";
import { laneHref } from "../navigation";
import { notApplying } from "../record-actions";
import { JourneyTrack } from "./journey-track";

const groups: { id: LaneGroup; label: string }[] = [
  { id: "needs", label: "Needs you" },
  { id: "active", label: "Waiting on them" },
  { id: "closed", label: "Closed" },
];
/** Closed starts folded once it is longer than this. */
const CLOSED_FOLD = 5;

export function Monogram({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-xl bg-secondary text-sm font-semibold text-secondary-foreground",
        className,
      )}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

/** The one primary action; "Open" needs none because the row itself opens. */
export function NextAction({ next, returnTo }: { next: LaneNext; returnTo: string }) {
  if (next.action === "Open") return null;
  const pill =
    "pressable relative z-10 inline-flex h-8 shrink-0 items-center rounded-full px-3.5 text-xs font-medium hover:no-underline";
  if (next.action === "Not applying")
    return (
      <ActionForm
        action={notApplying}
        feedback="inverse"
        className="relative z-10 shrink-0"
        pendingLabel="Closing"
      >
        <input type="hidden" name="id" value={next.recordId} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <button
          type="submit"
          className={cn(pill, "text-foreground ring-1 ring-border hover:bg-muted")}
        >
          Not applying
        </button>
      </ActionForm>
    );
  return (
    <Link
      href={next.href}
      scroll={false}
      className={cn(pill, "bg-primary text-primary-foreground hover:bg-primary/90")}
    >
      {next.action}
    </Link>
  );
}

export function NextStep({ next, returnTo }: { next: LaneNext | null; returnTo: string }) {
  if (!next) return <p className="m-0 text-sm text-muted-foreground">Nothing to do</p>;
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="m-0 line-clamp-2 text-sm font-medium [overflow-wrap:anywhere]">{next.text}</p>
        <p
          className={cn(
            "m-0 text-xs tabular-nums",
            next.due === "overdue" ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {next.when}
        </p>
      </div>
      <NextAction next={next} returnTo={returnTo} />
    </div>
  );
}

function Row({
  lane,
  journey,
  open,
  detail,
}: {
  lane: Lane;
  journey: Journey | undefined;
  open: boolean;
  detail: ReactNode;
}) {
  const role = lane.roles[0];
  return (
    <li
      className={cn(
        "overflow-hidden rounded-3xl ring-1 ring-border",
        lane.group === "closed" && !open ? "bg-transparent" : "bg-card",
      )}
    >
      <div
        role="group"
        aria-label={lane.company}
        className={cn(
          "relative grid gap-4 px-4 py-4 transition-colors hover:bg-muted/40 md:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)_minmax(0,1fr)] md:items-center",
          open && "bg-muted/30",
        )}
      >
        <Link
          href={open ? "/applications" : laneHref(lane.leadId)}
          scroll={false}
          aria-expanded={open}
          className="flex min-w-0 items-center gap-3 text-foreground after:absolute after:inset-0 after:rounded-3xl hover:no-underline focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-[-2px] focus-visible:after:outline-primary"
        >
          <Monogram name={lane.company} />
          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate font-semibold">{lane.company}</span>
              <span data-testid="lane-status" className="contents">
                <StatusPill
                  status={{ ...lane.status, detail: lane.status.label, previous: null }}
                  className="max-w-[11rem] truncate"
                />
              </span>
            </span>
            <span className="block truncate text-sm text-muted-foreground">{role?.role}</span>
          </span>
          <ChevronDown
            aria-hidden
            size={18}
            className={cn(
              "shrink-0 text-muted-foreground transition-transform md:hidden",
              open && "rotate-180",
            )}
          />
        </Link>
        {journey && <JourneyTrack journey={journey} />}
        <NextStep next={lane.next} returnTo="/applications" />
      </div>
      {open && detail}
    </li>
  );
}

type Pin = { id: string; group: LaneGroup };

/**
 * The open row stays in the group it opened in, so recording from it never moves it out from
 * under the reader (or remounts its forms mid-save); it takes its new group once it closes.
 */
export function pinOpenRow(lanes: Lane[], pin: Pin | null): Lane[] {
  if (!pin) return lanes;
  return lanes.map((lane) => (lane.leadId === pin.id ? { ...lane, group: pin.group } : lane));
}

/**
 * Applications as journeys (spec §4), one row per application in Needs you, Waiting on them
 * and Closed. The open row (`?open=<id>`) expands in place beneath itself (spec §5).
 */
export function ApplicationList({
  lanes,
  journeys,
  openId,
  detail,
}: {
  lanes: Lane[];
  journeys: Record<string, Journey>;
  openId: string | null;
  detail: ReactNode;
}) {
  const pinFor = (id: string | null): Pin | null => {
    const group = id ? lanes.find((lane) => lane.leadId === id)?.group : undefined;
    return id && group ? { id, group } : null;
  };
  const [pin, setPin] = useState(() => pinFor(openId));
  if ((pin?.id ?? null) !== openId) setPin(pinFor(openId));
  const placed = pinOpenRow(lanes, pin?.id === openId ? pin : null);
  return (
    <div className="flex flex-col gap-8">
      {groups.map((group) => {
        const rows = placed.filter((lane) => lane.group === group.id);
        if (!rows.length) return null;
        const heading = (
          <span className="flex items-baseline gap-2 text-sm font-semibold">
            <span>{group.label}</span>
            <span className="font-normal text-muted-foreground tabular-nums">{rows.length}</span>
          </span>
        );
        const list = (
          <ul className="m-0 grid list-none gap-2.5 p-0">
            {rows.map((lane) => (
              <Row
                key={lane.key}
                lane={lane}
                journey={journeys[lane.leadId]}
                open={lane.leadId === openId}
                detail={detail}
              />
            ))}
          </ul>
        );
        const folded = group.id === "closed" && rows.length > CLOSED_FOLD;
        return (
          <section key={group.id} aria-label={group.label} className="flex flex-col gap-3">
            {folded ? (
              <details
                open={rows.some((lane) => lane.leadId === openId) || undefined}
                className="group flex flex-col gap-3"
              >
                <summary className="flex cursor-pointer list-none items-center gap-1.5 px-1 [&::-webkit-details-marker]:hidden">
                  <h2 className="m-0">{heading}</h2>
                  <ChevronDown
                    aria-hidden
                    size={16}
                    className="text-muted-foreground transition-transform group-open:rotate-180"
                  />
                </summary>
                <div className="mt-3">{list}</div>
              </details>
            ) : (
              <>
                <h2 className="m-0 px-1">{heading}</h2>
                {list}
              </>
            )}
          </section>
        );
      })}
    </div>
  );
}
