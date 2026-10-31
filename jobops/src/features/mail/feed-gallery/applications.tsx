"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  NOW,
  applications,
  companyName,
  feed,
  type FeedMail,
  type SampleApplication,
} from "./data";
import { Pane, StatusPill, when } from "./shared";
import { TagDot, TagPill } from "./tags";

const mailFor = (id: string) =>
  feed
    .filter((mail) => mail.appId === id || mail.suggestedApp === id)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
const live = applications.filter((app) => !app.previous);
const previous = applications.filter((app) => app.previous);
const dueTone = { now: "text-link", late: "text-warning", calm: "text-muted-foreground" } as const;

function useLinks() {
  const [linked, setLinked] = useState<string[]>([]);
  return { linked, link: (id: string) => setLinked([...linked, id]) };
}

function MailRow({
  mail,
  linked,
  onLink,
}: {
  mail: FeedMail;
  linked: boolean;
  onLink: () => void;
}) {
  const suggested = Boolean(mail.suggestedApp) && !linked;
  return (
    <li className="flex min-h-9 items-center gap-2 text-sm">
      <TagPill tag={mail.tag} short />
      <span className={cn("min-w-0 flex-1 truncate", mail.open && "font-semibold")}>
        {mail.subject}
      </span>
      {suggested ? (
        <button
          type="button"
          onClick={onLink}
          className="pressable inline-flex h-7 shrink-0 items-center gap-1 rounded-full bg-selected px-2.5 text-xs font-medium text-selected-foreground"
        >
          <Link2 aria-hidden size={13} />
          Link
        </button>
      ) : (
        <span className="shrink-0 text-xs text-muted-foreground">{when(mail.at)}</span>
      )}
    </li>
  );
}

function Heading({ app }: { app: SampleApplication }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="m-0 truncate font-semibold">
          {companyName(app.company)}{" "}
          <span className="font-normal text-muted-foreground">{app.role}</span>
        </p>
        <p className="m-0 text-xs text-muted-foreground">{app.method}</p>
      </div>
      <StatusPill status={app.status} />
    </div>
  );
}

function NextLine({ app }: { app: SampleApplication }) {
  return (
    <p className="m-0 flex items-baseline justify-between gap-2 text-sm">
      <span className="min-w-0 truncate">{app.next}</span>
      {app.due && (
        <span className={cn("shrink-0 text-xs font-medium", dueTone[app.due.tone])}>
          {app.due.label}
        </span>
      )}
    </p>
  );
}

function Previous({ render }: { render: (app: SampleApplication) => React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        {open ? <ChevronDown aria-hidden size={15} /> : <ChevronRight aria-hidden size={15} />}
        Previous jobs ({previous.length})
      </button>
      {open && <div className="tl-pop mt-2 space-y-2">{previous.map(render)}</div>}
    </div>
  );
}

export function CardGroups() {
  const { linked, link } = useLinks();
  const [more, setMore] = useState<string[]>([]);
  const card = (app: SampleApplication) => {
    const mails = mailFor(app.id);
    const shown = more.includes(app.id) ? mails : mails.slice(0, 3);
    const needs = mails.some((mail) => mail.open);
    return (
      <article
        key={app.id}
        className={cn(
          "space-y-3 rounded-3xl bg-card p-4 ring-1 ring-border/70",
          needs && "ring-2 ring-link/50",
        )}
      >
        <Heading app={app} />
        <NextLine app={app} />
        {mails.length > 0 && (
          <ul className="m-0 list-none border-t border-border/60 p-0 pt-1">
            {shown.map((mail) => (
              <MailRow
                key={mail.id}
                mail={mail}
                linked={linked.includes(mail.id)}
                onLink={() => link(mail.id)}
              />
            ))}
          </ul>
        )}
        {mails.length > 3 && !more.includes(app.id) && (
          <button
            type="button"
            onClick={() => setMore([...more, app.id])}
            className="text-xs font-medium text-link hover:underline"
          >
            {mails.length - 3} more emails
          </button>
        )}
      </article>
    );
  };
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">{live.map(card)}</div>
      <Previous render={card} />
    </div>
  );
}

export function AccordionGroups() {
  const { linked, link } = useLinks();
  const [open, setOpen] = useState<string | null>("a-ns1");
  const row = (app: SampleApplication) => {
    const mails = mailFor(app.id);
    const expanded = open === app.id;
    return (
      <li key={app.id} className="border-b border-border/60 last:border-0">
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setOpen(expanded ? null : app.id)}
          className="grid w-full grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 px-2 py-3 text-left hover:bg-muted/40 md:grid-cols-[minmax(0,1.3fr)_7rem_minmax(0,1.4fr)_5.5rem_4.5rem]"
        >
          <span className="min-w-0">
            <span className="block truncate font-medium">{companyName(app.company)}</span>
            <span className="block truncate text-xs text-muted-foreground">{app.role}</span>
          </span>
          <span className="justify-self-end md:justify-self-start">
            <StatusPill status={app.status} />
          </span>
          <span className="col-span-2 truncate text-sm md:col-span-1">{app.next}</span>
          <span
            className={cn(
              "hidden text-xs font-medium md:block",
              app.due ? dueTone[app.due.tone] : "",
            )}
          >
            {app.due?.label}
          </span>
          <span
            className="hidden items-center justify-end gap-1 md:flex"
            aria-label={`${mails.length} emails`}
          >
            {mails.slice(0, 4).map((mail) => (
              <TagDot key={mail.id} tag={mail.tag} />
            ))}
            <span className="ml-1 text-xs text-muted-foreground">{mails.length}</span>
          </span>
        </button>
        {expanded && (
          <ul className="tl-pop m-0 list-none px-2 pb-3">
            {mails.map((mail) => (
              <MailRow
                key={mail.id}
                mail={mail}
                linked={linked.includes(mail.id)}
                onLink={() => link(mail.id)}
              />
            ))}
            {!mails.length && (
              <li className="py-2 text-sm text-muted-foreground">No emails linked yet.</li>
            )}
          </ul>
        )}
      </li>
    );
  };
  return (
    <Pane className="space-y-3">
      <ul className="m-0 list-none p-0">{live.map(row)}</ul>
      <Previous
        render={(app) => (
          <ul key={app.id} className="m-0 list-none p-0">
            {row(app)}
          </ul>
        )}
      />
    </Pane>
  );
}

/* Lanes: three weeks either side of today, one lane per application. */
const DAY = 86_400_000;
const start = new Date("2026-10-11T00:00:00+05:30").getTime();
const span = 28;
const pos = (at: string) => ((Date.parse(at) - start) / DAY / span) * 100;
const todayPos = pos(NOW.toISOString());
const weeks = Array.from({ length: 4 }, (_, index) => {
  const at = new Date(start + index * 7 * DAY);
  return {
    left: (index * 7 * 100) / span,
    label: new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "short",
      timeZone: "Asia/Kolkata",
    }).format(at),
  };
});

export function LaneGroups() {
  const [picked, setPicked] = useState<FeedMail | null>(null);
  return (
    <Pane className="space-y-3">
      <div className="relative ml-[9.5rem] h-5 text-[11px] text-muted-foreground">
        {weeks
          .filter((week) => Math.abs(week.left - todayPos) > 6)
          .map((week) => (
            <span key={week.label} className="absolute" style={{ left: `${week.left}%` }}>
              {week.label}
            </span>
          ))}
        <span className="absolute font-medium text-link" style={{ left: `${todayPos}%` }}>
          Today
        </span>
      </div>
      <ul className="m-0 list-none space-y-1 p-0">
        {live.map((app) => (
          <li key={app.id} className="grid grid-cols-[9rem_1fr] items-center gap-2">
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{companyName(app.company)}</span>
              <span className="block truncate text-xs text-muted-foreground">{app.role}</span>
            </span>
            <span className="relative h-9 rounded-full bg-muted/40">
              <span className="absolute inset-y-0 w-px bg-link" style={{ left: `${todayPos}%` }} />
              <span
                title="Applied"
                className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground/50"
                style={{ left: `${Math.max(0, pos(app.appliedAt))}%` }}
              />
              {mailFor(app.id).map((mail) => (
                <button
                  key={mail.id}
                  type="button"
                  aria-label={mail.subject}
                  onClick={() => setPicked(mail)}
                  className={cn(
                    "absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full",
                    picked?.id === mail.id &&
                      "ring-2 ring-foreground ring-offset-2 ring-offset-card",
                  )}
                  style={{ left: `${pos(mail.at)}%` }}
                >
                  <TagPill tag={mail.tag} short />
                </button>
              ))}
              {app.due && app.due.tone === "now" && (
                <span
                  title={app.next}
                  className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-dashed border-link"
                  style={{
                    left: `${Math.min(99, todayPos + (app.due.label === "Wed" ? 14 : app.due.label === "Mon" ? 7 : 4))}%`,
                  }}
                />
              )}
            </span>
          </li>
        ))}
      </ul>
      <div className="min-h-14 rounded-2xl bg-muted/40 px-3 py-2 text-sm">
        {picked ? (
          <div className="tl-pop flex flex-wrap items-center gap-2">
            <TagPill tag={picked.tag} />
            <span className="font-medium">{picked.subject}</span>
            <span className="text-xs text-muted-foreground">
              {picked.senderName}, {when(picked.at)}
            </span>
          </div>
        ) : (
          <span className="text-muted-foreground">
            Press an email on a lane to see it here. Dashed rings are what&apos;s due.
          </span>
        )}
      </div>
      <p className="m-0 text-xs text-muted-foreground">
        Previous jobs sit in a collapsed list under the lanes.
      </p>
    </Pane>
  );
}
