"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CalendarClock, Circle, CircleCheck, CircleSlash, FileText, Send } from "lucide-react";
import { formatTime, formatWeekday } from "@/features/applications/dates";
import type { MailItem } from "@/features/mail/mail-item";
import { inboxLabels, previewLine } from "@/features/mail/row-text";
import { TagPill } from "@/features/mail/tag-pill";
import { SourceChip } from "./source-chip";
import { cn } from "@/lib/utils";
import type { TimelineDay, TimelineMail, TimelineStep } from "./entries";
import { HandledLine, HandlingBar, type PlaceOptions } from "./handling";
import type { Handling } from "./suggest";

function StepIcon({ eventType }: { eventType: string }) {
  const props = { "aria-hidden": true, size: 14, strokeWidth: 2 };
  if (/^ROUND_BOOKED$|SCHEDULED/.test(eventType)) return <CalendarClock {...props} />;
  if (/SUBMITTED|APPLIED/.test(eventType)) return <FileText {...props} />;
  if (/OUTREACH|FOLLOW_UP|REFERRAL/.test(eventType)) return <Send {...props} />;
  if (/REJECT|WITHDRAWN|CLOSED|FAILED/.test(eventType)) return <CircleSlash {...props} />;
  if (/PASSED|OFFER|ACCEPT/.test(eventType)) return <CircleCheck {...props} />;
  return <Circle {...props} />;
}
const clock = (at: string) => formatTime(new Date(at));

/** "Outlook Junk" when the email was found outside the inbox. */
function folderNote(item: MailItem) {
  if (!item.folders.length || item.folders.some((folder) => /^inbox$/i.test(folder))) return null;
  return `${item.provider === "OUTLOOK" ? "Outlook" : "Gmail"} ${item.folders.join(", ")}`;
}

/** Longer than this, a step's stored summary (often notes) shows two lines until opened. */
const LONG_STEP = 140;

function StepRow({ step, role }: { step: TimelineStep; role?: string }) {
  const [open, setOpen] = useState(false);
  const long = step.text.length > LONG_STEP;
  const cells = (
    <>
      {/* An icon on a narrow feed; on a wider one a quiet pill in the tag column. */}
      <span
        className={cn(
          "grid size-8 place-items-center rounded-full @xl:inline-flex @xl:h-6 @xl:w-auto @xl:gap-1 @xl:justify-self-start @xl:px-2",
          step.upcoming ? "bg-selected text-selected-foreground" : "bg-muted text-muted-foreground",
        )}
      >
        <StepIcon eventType={step.eventType} />
        <span className="hidden text-xs font-medium @xl:inline">
          {step.upcoming ? "Booked" : "Recorded"}
        </span>
      </span>
      <span className={cn("min-w-0 break-words", long && !open && "line-clamp-2")}>
        {step.text}
        {role && <span className="ml-2 text-sm text-muted-foreground">{role}</span>}
      </span>
      <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
        {step.upcoming ? `${formatWeekday(new Date(step.at))}, ${clock(step.at)}` : clock(step.at)}
      </span>
    </>
  );
  // The icon sits in the tag column and the text where the sender starts, like a mail row.
  const grid =
    "grid w-full grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 @xl:grid-cols-[9rem_minmax(0,1fr)_auto] @xl:gap-x-4 @4xl:grid-cols-[9.5rem_minmax(0,1fr)_auto]";
  return (
    <li>
      {long ? (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className={cn(grid, "text-left transition-colors hover:bg-muted/50")}
        >
          {cells}
        </button>
      ) : (
        <div className={grid}>{cells}</div>
      )}
    </li>
  );
}

/**
 * Mail feed row C, aligned columns: the tag; the company (or, on a company's own timeline,
 * the sender) over who sent it; the subject over the first line that says something; then
 * the time over the inbox. It stacks on a phone. Mail and company pages share this row.
 */
function MailRow({
  entry,
  handling,
  role,
  startOpen,
  placeOptions,
  showCompany,
  inbox,
}: {
  entry: TimelineMail;
  handling?: Handling;
  role?: string;
  startOpen: boolean;
  placeOptions?: PlaceOptions;
  /** All job mail names the company first; a company's own timeline leaves it out. */
  showCompany?: boolean;
  /** What tells this email's inbox apart from the others, such as "outlook.in". */
  inbox: string;
}) {
  const { item } = entry;
  const needs = item.attention === "open";
  const [open, setOpen] = useState(startOpen);
  // Handling an email in place keeps it open, so what was recorded stays in view.
  const [wasOpen, setWasOpen] = useState(needs);
  if (wasOpen !== needs) {
    setWasOpen(needs);
    if (!needs) setOpen(true);
  }
  const row = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (startOpen) row.current?.scrollIntoView({ block: "center" });
  }, [startOpen]);
  const name = item.senderName || item.sender;
  const note = folderNote(item);
  const preview = previewLine(item.text);
  const when = clock(item.receivedAt);
  const chip = (className: string) => (
    <SourceChip account={item.account} label={inbox} folders={item.folders} className={className} />
  );
  const bar = needs && handling && (
    <HandlingBar item={item} handling={handling} placeOptions={placeOptions} />
  );
  return (
    <li ref={row} id={`mail-${item.id}`} className="relative scroll-mt-24">
      {needs && (
        <span aria-hidden className="absolute inset-y-3 left-0 w-[3px] rounded-r-full bg-primary" />
      )}
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="grid w-full min-w-0 gap-x-4 gap-y-1 px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 @xl:grid-cols-[9rem_9rem_minmax(0,1fr)] @xl:items-start @4xl:grid-cols-[9.5rem_10rem_minmax(0,1fr)_auto]"
      >
        <span className="flex min-w-0 items-center justify-between gap-2 @xl:grid @xl:justify-items-start @xl:gap-1">
          <TagPill tag={item.tag} />
          {/* Beside the tag on a narrow feed, under it on a medium one; a wide feed gives it a column. */}
          <span className="flex min-w-0 flex-wrap items-center justify-end gap-x-1 text-xs text-muted-foreground tabular-nums @xl:justify-start @4xl:hidden">
            {chip("hidden @md:inline-flex @xl:order-2 @xl:-ml-1.5")}
            <span className="whitespace-nowrap @xl:order-1">{when}</span>
          </span>
        </span>
        <span className="flex min-w-0 items-baseline gap-2 @xl:grid @xl:gap-0">
          <span className={cn("truncate text-sm", needs ? "font-semibold" : "font-medium")}>
            {showCompany ? (item.company?.name ?? "Needs a home") : name}
          </span>
          <span className="truncate text-xs text-muted-foreground">
            {showCompany ? name : item.sender}
          </span>
        </span>
        <span className="grid min-w-0">
          <span className={cn("truncate text-sm", needs && "font-medium")}>
            {item.subject || "(no subject)"}
            {role && <span className="text-muted-foreground"> ({role})</span>}
          </span>
          {preview && <span className="truncate text-xs text-muted-foreground">{preview}</span>}
        </span>
        <span className="hidden justify-items-end gap-0.5 text-xs text-muted-foreground tabular-nums @4xl:grid">
          <span className="whitespace-nowrap">{when}</span>
          {chip("-mr-1.5")}
        </span>
        <span className="sr-only">{needs ? ", needs you" : ""}</span>
      </button>
      {open ? (
        <div className="reveal mx-3 mb-3 min-w-0 rounded-2xl bg-muted/45 p-4 sm:mx-4">
          <p className="m-0 flex min-w-0 flex-wrap items-baseline gap-x-2 text-sm">
            <span className="min-w-0 truncate font-semibold">{name}</span>
            <span className="min-w-0 truncate text-xs text-muted-foreground">{item.sender}</span>
            {note && (
              <span className="rounded-md bg-muted px-1.5 text-xs text-muted-foreground">
                {note}
              </span>
            )}
          </p>
          <p className="m-0 mt-2 max-w-prose text-[15px] leading-relaxed break-words whitespace-pre-wrap">
            {item.text}
          </p>
          <div className="mt-3">
            {needs ? bar : <HandledLine item={item} recorded={entry.recorded} />}
          </div>
        </div>
      ) : (
        bar && <div className="px-4 pb-3">{bar}</div>
      )}
    </li>
  );
}

/** The date column: weekday, day and month, kept in view while the day scrolls past. */
function DateStamp({ day }: { day: TimelineDay }) {
  if (!day.stamp)
    return (
      <div aria-hidden="true" className="sticky top-4 grid justify-items-center text-link">
        <CalendarClock size={18} strokeWidth={2} />
      </div>
    );
  const { stamp } = day;
  return (
    <div aria-hidden="true" className="sticky top-4 grid">
      <span
        className={cn(
          "text-[11px] font-medium",
          stamp.today ? "text-link" : "text-muted-foreground",
        )}
      >
        {stamp.today ? "Today" : stamp.weekday}
      </span>
      <span
        className={cn(
          "text-2xl leading-tight font-semibold tabular-nums",
          stamp.today && "text-link",
        )}
      >
        {stamp.day}
      </span>
      <span className="text-[11px] text-muted-foreground">{stamp.month}</span>
    </div>
  );
}

/**
 * Mail feed layout B, a ledger with a date column: one company's emails and steps (or all
 * job mail), newest first and grouped by India day, with booked rounds in "Coming up" and
 * a band where an older year starts. Rows open in place; open emails show their handling
 * bar without being opened.
 */
export function CompanyTimeline({
  days,
  handling,
  roles,
  allRolesHref,
  role,
  openMail,
  olderHref,
  placeOptions,
  showCompany,
  inboxes = [],
}: {
  days: TimelineDay[];
  handling: Record<string, Handling>;
  /** Role chips link back to this page filtered to that application. */
  roles: { id: string; role: string; href: string }[];
  allRolesHref: string;
  role: string | null;
  openMail: string | null;
  olderHref: string | null;
  placeOptions?: PlaceOptions;
  showCompany?: boolean;
  /** Connected inboxes, so each email's inbox is named by what tells it apart. */
  inboxes?: string[];
}) {
  const several = roles.length > 1;
  const labels = inboxLabels([
    ...inboxes,
    ...days.flatMap((day) =>
      day.entries.flatMap((entry) => (entry.type === "mail" ? [entry.item.account] : [])),
    ),
  ]);
  const inboxOf = (item: MailItem) =>
    labels[item.account] ?? (item.provider === "OUTLOOK" ? "Outlook" : "Gmail");
  const roleOf = (id: string | undefined) =>
    several && id ? roles.find((item) => item.id === id)?.role : undefined;
  return (
    <div className="min-w-0">
      {several && (
        <nav role="group" aria-label="Filter by role" className="mb-5 flex flex-wrap gap-2">
          {[{ id: null, role: "All roles", href: allRolesHref }, ...roles].map((link) => (
            <Link
              key={link.id ?? "all"}
              href={link.href}
              scroll={false}
              aria-current={role === link.id ? "page" : undefined}
              className={cn(
                "pressable inline-flex h-8 max-w-full items-center truncate rounded-full px-3 text-sm hover:no-underline",
                role === link.id
                  ? "bg-foreground text-background"
                  : "text-muted-foreground ring-1 ring-border hover:text-foreground",
              )}
            >
              {link.role}
            </Link>
          ))}
        </nav>
      )}
      {days.length ? (
        <div className="min-w-0 overflow-hidden rounded-3xl bg-card ring-1 ring-border">
          {days.map((day, index) => {
            // A band opens Coming up, and each older year the first time it appears.
            const band = !day.stamp
              ? "Coming up"
              : !day.stamp.thisYear && day.stamp.year !== days[index - 1]?.stamp?.year
                ? String(day.stamp.year)
                : null;
            return (
              <Fragment key={day.key}>
                {band && (
                  <div
                    aria-hidden="true"
                    className={cn(
                      "bg-muted/40 px-4 py-2 text-sm font-semibold tabular-nums",
                      index > 0 && "border-t border-border",
                      !day.stamp && "text-link",
                    )}
                  >
                    {band}
                  </div>
                )}
                <section
                  aria-label={day.label}
                  className={cn(
                    "grid grid-cols-[3.75rem_minmax(0,1fr)] sm:grid-cols-[4.75rem_minmax(0,1fr)]",
                    (index > 0 || band) && "border-t border-border",
                  )}
                >
                  <div className="border-r border-border px-1 py-3 text-center">
                    <h3 className="sr-only">{day.label}</h3>
                    <DateStamp day={day} />
                  </div>
                  <ul className="@container m-0 min-w-0 list-none divide-y divide-border p-0">
                    {day.entries.map((entry) =>
                      entry.type === "mail" ? (
                        <MailRow
                          key={entry.item.id}
                          entry={entry}
                          handling={handling[entry.item.id]}
                          role={roleOf(entry.item.application?.id)}
                          startOpen={openMail === entry.item.id}
                          placeOptions={placeOptions}
                          showCompany={showCompany}
                          inbox={inboxOf(entry.item)}
                        />
                      ) : (
                        <StepRow key={entry.id} step={entry} role={roleOf(entry.applicationId)} />
                      ),
                    )}
                  </ul>
                </section>
              </Fragment>
            );
          })}
        </div>
      ) : (
        <p className="m-0 text-sm text-muted-foreground">Nothing matches here yet.</p>
      )}
      {olderHref && (
        <Link
          href={olderHref}
          scroll={false}
          className="mt-4 inline-flex h-9 items-center rounded-full px-3 text-sm font-medium text-link hover:bg-muted hover:no-underline"
        >
          Show older
        </Link>
      )}
    </div>
  );
}
