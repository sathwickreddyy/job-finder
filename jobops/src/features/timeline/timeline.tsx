"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PenLine } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui";
import { formatTime } from "@/features/applications/dates";
import { MailDialog } from "@/features/mail/mail-dialog";
import type { MailItem } from "@/features/mail/mail-item";
import { inboxLabels, previewLine } from "@/features/mail/row-text";
import { unlinkMail } from "@/features/mail/triage-actions";
import { TagPill } from "@/features/mail/tag-pill";
import { tagLabel } from "@/features/mail/tags";
import { SourceChip } from "./source-chip";
import { cn } from "@/lib/utils";
import { EditTag } from "./edit-tag";
import type { TimelineDay, TimelineMail, TimelineStep } from "./entries";
import { isShown, jumpTarget, type TimelineFilter } from "./jump";
import { RoundCard, type RoundCardData } from "./round-card";
import { HandledLine, HandlingBar, type PlaceOptions } from "./handling";
import type { Handling } from "./suggest";

const clock = (at: string) => formatTime(new Date(at));

/** "Outlook Junk" when the email was found outside the inbox. */
function folderNote(item: MailItem) {
  if (!item.folders.length || item.folders.some((folder) => /^inbox$/i.test(folder))) return null;
  return `${item.provider === "OUTLOOK" ? "Outlook" : "Gmail"} ${item.folders.join(", ")}`;
}

/** Longer than this, a step's stored summary (often notes) shows two lines until opened. */
const LONG_STEP = 140;

function StepRow({
  step,
  role,
  requisition,
}: {
  step: TimelineStep;
  role?: string;
  requisition?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const long = step.text.length > LONG_STEP;
  const cells = (
    <>
      {/* One icon and "Recorded", with the time under it; a narrow feed shows the icon alone. */}
      <span className="grid min-w-0 justify-items-start gap-0.5">
        <span className="inline-flex h-6 items-center gap-1 rounded-full bg-muted px-2 text-muted-foreground">
          <PenLine aria-hidden size={14} strokeWidth={2} />
          <span className="sr-only text-xs font-medium @xl:not-sr-only @xl:inline">Recorded</span>
        </span>
        <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
          {clock(step.at)}
        </span>
      </span>
      <span className={cn("min-w-0 break-words", long && !open && "line-clamp-2")}>
        {step.text}
        {role && <span className="ml-2 text-sm text-muted-foreground">{role}</span>}
      </span>
      <span
        className="max-w-28 truncate text-xs text-muted-foreground"
        title={requisition === undefined ? undefined : (requisition ?? "No requisition")}
      >
        {requisition === undefined ? "" : (requisition ?? "No requisition")}
      </span>
    </>
  );
  // The icon sits in the tag column and the text where the sender starts, like a mail row.
  const grid =
    "grid w-full grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 @xl:grid-cols-[9rem_minmax(0,1fr)_auto] @xl:gap-x-4 @4xl:grid-cols-[9.5rem_minmax(0,1fr)_auto]";
  return (
    <li
      id={`entry-${step.id}`}
      className="scroll-mt-24 transition-shadow duration-500 data-[lit]:ring-2 data-[lit]:ring-inset data-[lit]:ring-primary"
    >
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
  placeOptions,
  showCompany,
  inbox,
  onOpen,
  requisition,
}: {
  entry: TimelineMail;
  handling?: Handling;
  role?: string;
  placeOptions?: PlaceOptions;
  /** All job mail names the company first; a company's own timeline leaves it out. */
  showCompany?: boolean;
  /** What tells this email's inbox apart from the others, such as "outlook.in". */
  inbox: string;
  onOpen: () => void;
  /** Set on one application's timeline; null reads "No requisition". */
  requisition?: string | null;
}) {
  const { item } = entry;
  const needs = item.attention === "open";
  // Handling an email from its row keeps what was recorded (and its Undo) in view under it.
  const [justHandled, setJustHandled] = useState(false);
  const [wasOpen, setWasOpen] = useState(needs);
  if (wasOpen !== needs) {
    setWasOpen(needs);
    setJustHandled(!needs);
  }
  const name = item.senderName || item.sender;
  const preview = previewLine(item.text);
  const when = clock(item.receivedAt);
  const chip = (className: string) => (
    <SourceChip account={item.account} label={inbox} folders={item.folders} className={className} />
  );
  const bar = needs && handling && (
    <HandlingBar item={item} handling={handling} placeOptions={placeOptions} />
  );
  return (
    <li
      id={`mail-${item.id}`}
      className="relative scroll-mt-24 transition-shadow duration-500 data-[lit]:ring-2 data-[lit]:ring-inset data-[lit]:ring-primary"
    >
      {needs && (
        <span aria-hidden className="absolute inset-y-3 left-0 w-[3px] rounded-r-full bg-primary" />
      )}
      {/* The button stretches over the whole row and opens the email; the pencil sits above it. */}
      <div className="group relative grid w-full min-w-0 gap-x-4 gap-y-1 px-4 py-3 transition-colors hover:bg-muted/50 has-[:focus-visible]:bg-muted/50 @xl:grid-cols-[9rem_9rem_minmax(0,1fr)] @xl:items-start @4xl:grid-cols-[9.5rem_10rem_minmax(0,1fr)_auto]">
        <button
          type="button"
          aria-haspopup="dialog"
          data-mail-row={item.id}
          onClick={onOpen}
          className="grid min-w-0 gap-x-4 gap-y-1 text-left after:absolute after:inset-0 after:rounded-[inherit] after:content-[''] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-primary @xl:col-span-2 @xl:grid-cols-subgrid @4xl:col-span-3"
        >
          <span className="sr-only">{`${tagLabel[item.tag]}, `}</span>
          {/* On one line the name wins the space; the address gives way first. */}
          <span className="flex min-w-0 items-baseline gap-2 @xl:grid @xl:gap-0">
            <span
              className={cn(
                "max-w-full shrink-0 truncate text-sm @xl:shrink",
                needs ? "font-semibold" : "font-medium",
              )}
            >
              {showCompany ? (item.company?.name ?? "Needs a home") : name}
            </span>
            <span className="min-w-0 truncate text-xs text-muted-foreground">
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
        <div className="order-first flex min-w-0 items-center justify-between gap-2 @xl:grid @xl:justify-items-start @xl:gap-1">
          <span className="flex min-w-0 items-center gap-1">
            {/* The row button names the tag; reading it here again would say it twice. */}
            <span aria-hidden className="flex">
              <TagPill tag={item.tag} />
            </span>
            {needs && (
              <span
                role="img"
                aria-label="New"
                className="size-2 shrink-0 rounded-full bg-primary"
              />
            )}
            <EditTag
              item={item}
              className="relative z-10 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
            />
          </span>
          {/* Beside the tag on a narrow feed, under it on a medium one; a wide feed gives it a column. */}
          <span className="flex min-w-0 flex-wrap items-center justify-end gap-x-1 text-xs text-muted-foreground tabular-nums @xl:justify-start @4xl:hidden">
            {chip("hidden @md:inline-flex @xl:order-2 @xl:-ml-1.5")}
            <span className="whitespace-nowrap @xl:order-1">{when}</span>
          </span>
        </div>
        {requisition !== undefined && (
          <span
            className="pointer-events-none max-w-full justify-self-end truncate text-xs text-muted-foreground @xl:col-span-full"
            title={requisition ?? "No requisition"}
          >
            {requisition ?? "No requisition"}
          </span>
        )}
      </div>
      {bar && <div className="px-4 pb-3">{bar}</div>}
      {justHandled && !needs && (
        <div className="reveal px-4 pb-3">
          <HandledLine item={item} recorded={entry.recorded} />
        </div>
      )}
    </li>
  );
}

/** The open email's footer: the handling bar while it needs you, else what was recorded. */
function MailFooter({
  entry,
  handling,
  placeOptions,
  unlinkFrom,
}: {
  entry: TimelineMail;
  handling?: Handling;
  placeOptions?: PlaceOptions;
  unlinkFrom?: string;
}) {
  const { item } = entry;
  const note = folderNote(item);
  return (
    <div className="flex flex-col gap-2">
      {note && <p className="m-0 text-xs text-muted-foreground">Found in {note}</p>}
      {item.attention === "open" ? (
        handling ? (
          <HandlingBar item={item} handling={handling} placeOptions={placeOptions} />
        ) : null
      ) : (
        <HandledLine item={item} recorded={entry.recorded} />
      )}
      {unlinkFrom && item.application && (
        <ActionForm action={unlinkMail} feedback="inverse" pendingLabel="Unlinking">
          <input type="hidden" name="mailId" value={item.id} />
          <input type="hidden" name="recordId" value={item.application.id} />
          <input
            type="hidden"
            name="returnTo"
            value={`${unlinkFrom}?${new URLSearchParams({ open: item.application.id })}`}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="ghost" size="sm">
              Unlink from this application
            </Button>
            <span className="text-xs text-muted-foreground">
              Returns it to Mail. Recorded outcomes stay.
            </span>
          </div>
        </ActionForm>
      )}
    </div>
  );
}

/** The date column: weekday, day and month, kept in view while the day scrolls past. */
function DateStamp({ day }: { day: TimelineDay }) {
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

export { isShown, type TimelineFilter };

/**
 * Mail feed layout B, a ledger with a date column: one company's emails and steps (or all
 * job mail), newest first and grouped by India day, with a band where an older year starts.
 * Given a requisition it is one application's timeline, with round cards and All, Stages, Mail
 * filters in place of the role chips. Each email opens in a reading popup; open emails show
 * their handling bar without being opened.
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
  requisition,
  roundCards = {},
  unlinkFrom,
  toolbarEnd,
  children,
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
  /** Set on one application's timeline (null reads "No requisition"). */
  requisition?: string | null;
  /** What each round card needs, by round id; a round without it is not shown. */
  roundCards?: Record<string, RoundCardData>;
  /** A company page path; set where an email's popup may unlink it and return to that page. */
  unlinkFrom?: string;
  /** One application's timeline: shown at the right of the filter. */
  toolbarEnd?: React.ReactNode;
  /** One application's timeline: shown between the filter and the feed (the note composer). */
  children?: React.ReactNode;
}) {
  const [filter, setFilter] = useState<TimelineFilter>("all");
  const perApplication = requisition !== undefined;
  // A link to one of this application's cards (a tracker step) shows it, scrolls to it and rings it.
  const [jump, setJump] = useState<{ id: string; n: number } | null>(null);
  const latest = useRef({ days, filter, roundCards });
  useEffect(() => {
    latest.current = { days, filter, roundCards };
  });
  useEffect(() => {
    if (!perApplication) return;
    const sync = () => {
      const now = latest.current;
      const target = jumpTarget(window.location.hash, now.days, now.filter, now.roundCards);
      if (!target) return;
      if (target.resetFilter) setFilter("all");
      setJump({ id: target.id, n: Date.now() });
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [perApplication]);
  useEffect(() => {
    if (!jump) return;
    const card = document.getElementById(jump.id);
    if (!card) return;
    card.scrollIntoView({ block: "start" });
    card.setAttribute("data-lit", "");
    const timer = setTimeout(() => card.removeAttribute("data-lit"), 1500);
    return () => {
      clearTimeout(timer);
      card.removeAttribute("data-lit");
    };
  }, [jump]);
  const shown = (entry: TimelineDay["entries"][number]) =>
    isShown(
      entry,
      perApplication ? filter : "all",
      !!roundCards[entry.type === "round" ? entry.round.id : ""],
    );
  const visible = days
    .map((day) => ({ ...day, entries: day.entries.filter(shown) }))
    .filter((day) => day.entries.length > 0);
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
  // Every email opens in the reading popup; previous and next walk the emails as listed.
  const mails = visible.flatMap((day) =>
    day.entries.filter((entry): entry is TimelineMail => entry.type === "mail"),
  );
  const [openId, setOpenId] = useState<string | null>(openMail);
  const [linked, setLinked] = useState(openMail);
  if (linked !== openMail) {
    setLinked(openMail);
    setOpenId(openMail);
  }
  const openIndex = openId ? mails.findIndex((entry) => entry.item.id === openId) : -1;
  const opened = openIndex >= 0 ? mails[openIndex] : null;
  const rowButton = (id: string) =>
    document.querySelector<HTMLElement>(`[data-mail-row="${CSS.escape(id)}"]`);
  return (
    <div className="min-w-0">
      {perApplication && (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <nav
              role="group"
              aria-label="Filter timeline"
              className="inline-flex rounded-full bg-muted/60 p-[3px] ring-1 ring-border"
            >
              {(
                [
                  ["all", "All"],
                  ["stages", "Stages"],
                  ["mail", "Mail"],
                ] as const
              ).map(([id, text]) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={filter === id}
                  onClick={() => setFilter(id)}
                  className={cn(
                    "pressable inline-flex h-7 items-center rounded-full px-3 text-[12.5px]",
                    filter === id
                      ? "bg-card font-medium text-foreground shadow-sm ring-1 ring-border"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {text}
                </button>
              ))}
            </nav>
            {toolbarEnd}
          </div>
          {children && <div className="mb-4">{children}</div>}
        </>
      )}
      {several && !perApplication && (
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
      {visible.length ? (
        <div className="min-w-0 overflow-hidden rounded-3xl bg-card ring-1 ring-border">
          {visible.map((day, index) => {
            // A band opens each older year the first time it appears.
            const band =
              !day.stamp.thisYear && day.stamp.year !== visible[index - 1]?.stamp.year
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
                          placeOptions={placeOptions}
                          showCompany={showCompany}
                          inbox={inboxOf(entry.item)}
                          onOpen={() => setOpenId(entry.item.id)}
                          requisition={requisition}
                        />
                      ) : entry.type === "round" ? (
                        <RoundCard
                          key={entry.round.id}
                          entry={entry}
                          data={roundCards[entry.round.id]}
                          requisition={requisition}
                        />
                      ) : (
                        <StepRow
                          key={entry.id}
                          step={entry}
                          role={roleOf(entry.applicationId)}
                          requisition={requisition}
                        />
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
      {opened && (
        <MailDialog
          item={opened.item}
          inbox={inboxOf(opened.item)}
          position={mails.length > 1 ? `${openIndex + 1} of ${mails.length}` : undefined}
          onPrev={openIndex > 0 ? () => setOpenId(mails[openIndex - 1].item.id) : undefined}
          onNext={
            openIndex < mails.length - 1 ? () => setOpenId(mails[openIndex + 1].item.id) : undefined
          }
          onClose={() => setOpenId(null)}
          returnFocus={() => rowButton(opened.item.id)}
          footer={
            <MailFooter
              entry={opened}
              handling={handling[opened.item.id]}
              placeOptions={placeOptions}
              unlinkFrom={unlinkFrom}
            />
          }
        />
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
