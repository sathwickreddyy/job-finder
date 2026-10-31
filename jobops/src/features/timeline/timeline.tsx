"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CalendarClock, Circle, CircleCheck, CircleSlash, FileText, Send } from "lucide-react";
import { formatTime, formatWeekday } from "@/features/applications/dates";
import type { MailItem } from "@/features/mail/mail-item";
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
      <span
        className={cn(
          "grid size-8 place-items-center rounded-full",
          step.upcoming ? "bg-selected text-selected-foreground" : "bg-muted text-muted-foreground",
        )}
      >
        <StepIcon eventType={step.eventType} />
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
  const grid = "grid w-full grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 py-2";
  return (
    <li>
      {long ? (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className={cn(grid, "rounded-xl text-left hover:bg-muted/60")}
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
 * Gallery feed B, two lines and a preview: who it is from with the inbox and time, then the
 * tag and subject, then the email's first line. Mail and company pages share this row.
 */
function MailRow({
  entry,
  handling,
  role,
  startOpen,
  placeOptions,
  showCompany,
}: {
  entry: TimelineMail;
  handling?: Handling;
  role?: string;
  startOpen: boolean;
  placeOptions?: PlaceOptions;
  /** All job mail names the company first; a company's own timeline leaves it out. */
  showCompany?: boolean;
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
  const preview =
    item.text
      .split("\n")
      .find((line) => line.trim())
      ?.trim() ?? "";
  const bar = needs && handling && (
    <HandlingBar item={item} handling={handling} placeOptions={placeOptions} />
  );
  return (
    <li
      ref={row}
      id={`mail-${item.id}`}
      className={cn(
        "relative scroll-mt-24",
        needs &&
          "before:absolute before:inset-y-1 before:-left-3 before:w-[3px] before:rounded-full before:bg-primary",
      )}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={cn(
          "grid w-full min-w-0 gap-1 rounded-2xl px-2 py-2.5 text-left hover:bg-muted/60",
          needs && "bg-selected/40",
        )}
      >
        <span className="flex min-w-0 items-center gap-2 text-sm">
          {showCompany && (
            <span className={cn("truncate", needs ? "font-semibold" : "font-medium")}>
              {item.company?.name ?? "Needs a home"}
            </span>
          )}
          <span
            className={cn(
              "truncate",
              showCompany
                ? "text-xs text-muted-foreground"
                : needs
                  ? "font-semibold"
                  : "font-medium",
            )}
          >
            {name}
          </span>
          <span className="ml-auto flex shrink-0 items-center gap-2">
            <SourceChip
              account={item.account}
              folders={item.folders}
              className="hidden sm:inline-flex"
            />
            <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
              {clock(item.receivedAt)}
            </span>
          </span>
        </span>
        <span className="flex min-w-0 items-center gap-2">
          <TagPill tag={item.tag} />
          <span className="truncate text-sm">
            {item.subject || "(no subject)"}
            {role && <span className="text-muted-foreground"> ({role})</span>}
          </span>
          <span className="sr-only">{needs ? ", needs you" : ""}</span>
        </span>
        {preview && <span className="line-clamp-1 text-xs text-muted-foreground">{preview}</span>}
      </button>
      {open ? (
        <div className="reveal mb-2 ml-2 min-w-0 rounded-2xl bg-card p-4 ring-1 ring-border">
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
        bar && <div className="ml-2 pb-2">{bar}</div>
      )}
    </li>
  );
}

/**
 * Gallery timeline B, the day ledger: one company's emails and steps, newest first and
 * grouped by India day, with booked rounds in "Coming up". Rows open in place; open
 * emails show their handling bar without being opened.
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
}) {
  const several = roles.length > 1;
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
        <div className="space-y-4 pl-3">
          {days.map((day) => (
            <section key={day.key} aria-label={day.label}>
              <h3 className="m-0 mb-1 text-sm font-semibold">{day.label}</h3>
              <ul className="m-0 list-none p-0">
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
                    />
                  ) : (
                    <StepRow key={entry.id} step={entry} role={roleOf(entry.applicationId)} />
                  ),
                )}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <p className="m-0 text-sm text-muted-foreground">Nothing matches here yet.</p>
      )}
      {olderHref && (
        <Link
          href={olderHref}
          scroll={false}
          className="mt-4 ml-3 inline-flex h-9 items-center rounded-full px-3 text-sm font-medium text-link hover:bg-muted hover:no-underline"
        >
          Show older
        </Link>
      )}
    </div>
  );
}
