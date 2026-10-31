"use client";

import { useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  companies,
  companyName,
  feed,
  feedTags,
  upcoming,
  type FeedMail,
  type FeedTag,
} from "./data";
import { agendaDay, byDay, clock, Pane, SourceChip, StatusPill, TagFilter, when } from "./shared";
import { TagDot, TagPill, tagClass, tagMeta } from "./tags";

/* ---------- 1. Tag colours ---------- */

export function TagPalette({ scheme }: { scheme: "hue" | "stage" }) {
  const stages = [...new Set(feedTags.map((tag) => tagMeta[tag].stage))];
  return (
    <div data-tags={scheme}>
      <Pane className="space-y-5">
        {scheme === "hue" ? (
          <div className="flex flex-wrap gap-2">
            {feedTags.map((tag) => (
              <TagPill key={tag} tag={tag} />
            ))}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {stages.map((stage) => (
              <div key={stage} className="space-y-1.5">
                <p className="m-0 text-xs text-muted-foreground">{stage}</p>
                <div className="flex flex-wrap gap-2">
                  {feedTags
                    .filter((tag) => tagMeta[tag].stage === stage)
                    .map((tag) => (
                      <TagPill key={tag} tag={tag} />
                    ))}
                </div>
              </div>
            ))}
          </div>
        )}
        <ul className="m-0 list-none divide-y divide-border/60 p-0">
          {feed.slice(0, 7).map((mail) => (
            <li key={mail.id} className="flex items-center gap-3 py-2 text-sm">
              <TagPill tag={mail.tag} short />
              <span className="w-20 shrink-0 truncate font-medium">
                {companyName(mail.company)}
              </span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{mail.subject}</span>
            </li>
          ))}
        </ul>
      </Pane>
    </div>
  );
}

/* ---------- 2. Feed rows ---------- */

function useFeedFilter() {
  const [tag, setTag] = useState<FeedTag | "all">("all");
  const [open, setOpen] = useState<string | null>(null);
  const shown = feed.filter((mail) => tag === "all" || mail.tag === tag);
  return { tag, setTag, open, toggle: (id: string) => setOpen(open === id ? null : id), shown };
}

function Opened({ mail }: { mail: FeedMail }) {
  return (
    <div className="tl-pop space-y-2 pb-3 pl-1 text-sm">
      <p className="m-0 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{mail.senderName}</span>
        <span>{mail.sender}</span>
        <span>
          Found in {mail.inbox}, {mail.folder}
        </span>
      </p>
      <p className="m-0 max-w-prose">{mail.text}</p>
      {mail.suggestedApp && (
        <p className="m-0 text-xs text-muted-foreground">
          Looks like your Senior Backend Engineer application.{" "}
          <button type="button" className="font-medium text-link hover:underline">
            Link it
          </button>
        </p>
      )}
    </div>
  );
}

function NeedsDot({ open }: { open: boolean }) {
  return (
    <span
      aria-label={open ? "Needs you" : undefined}
      className={cn("size-2 shrink-0 rounded-full", open ? "bg-link" : "bg-transparent")}
    />
  );
}

export function LineFeed() {
  const { tag, setTag, open, toggle, shown } = useFeedFilter();
  return (
    <Pane className="space-y-4">
      <TagFilter mails={feed} value={tag} onChange={setTag} />
      {byDay(shown).map((group) => (
        <section key={group.day}>
          <h3 className="m-0 mb-1 text-xs font-medium text-muted-foreground">{group.day}</h3>
          <ul className="m-0 list-none p-0">
            {group.items.map((mail) => (
              <li key={mail.id} className="border-b border-border/50 last:border-0">
                <button
                  type="button"
                  aria-expanded={open === mail.id}
                  onClick={() => toggle(mail.id)}
                  className="flex min-h-11 w-full items-center gap-2.5 rounded-lg px-1 text-left text-sm hover:bg-muted/50"
                >
                  <NeedsDot open={mail.open} />
                  <TagPill tag={mail.tag} short className="sm:hidden" />
                  <TagPill tag={mail.tag} className="hidden w-46 sm:inline-flex" />
                  <span className={cn("w-22 shrink-0 truncate", mail.open && "font-semibold")}>
                    {companyName(mail.company)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">
                    {mail.subject}
                  </span>
                  <SourceChip mail={mail} className="hidden md:inline-flex" />
                  <span className="w-16 shrink-0 text-right text-xs text-muted-foreground">
                    {when(mail.at)}
                  </span>
                </button>
                {open === mail.id && <Opened mail={mail} />}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </Pane>
  );
}

export function TwoLineFeed() {
  const { tag, setTag, open, toggle, shown } = useFeedFilter();
  return (
    <Pane className="space-y-4">
      <TagFilter mails={feed} value={tag} onChange={setTag} />
      {byDay(shown).map((group) => (
        <section key={group.day}>
          <h3 className="m-0 mb-1 text-xs font-medium text-muted-foreground">{group.day}</h3>
          <ul className="m-0 list-none space-y-1 p-0">
            {group.items.map((mail) => (
              <li key={mail.id}>
                <button
                  type="button"
                  aria-expanded={open === mail.id}
                  onClick={() => toggle(mail.id)}
                  className={cn(
                    "grid w-full gap-1 rounded-2xl px-3 py-2.5 text-left hover:bg-muted/50",
                    mail.open && "bg-selected/40",
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2 text-sm">
                    <span className={cn("truncate", mail.open ? "font-semibold" : "font-medium")}>
                      {companyName(mail.company)}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {mail.senderName}
                    </span>
                    <span className="ml-auto flex shrink-0 items-center gap-2">
                      <SourceChip mail={mail} className="hidden sm:inline-flex" />
                      <span className="text-xs text-muted-foreground">{when(mail.at)}</span>
                    </span>
                  </span>
                  <span className="flex min-w-0 items-center gap-2">
                    <TagPill tag={mail.tag} />
                    <span className="truncate text-sm">{mail.subject}</span>
                  </span>
                  <span className="line-clamp-1 text-xs text-muted-foreground">{mail.text}</span>
                </button>
                {open === mail.id && (
                  <div className="px-3">
                    <Opened mail={mail} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </Pane>
  );
}

export function CompanyGroupedFeed() {
  const { tag, setTag, open, toggle, shown } = useFeedFilter();
  return (
    <Pane className="space-y-4">
      <TagFilter mails={feed} value={tag} onChange={setTag} />
      {byDay(shown).map((group) => {
        const keys = [...new Set(group.items.map((mail) => mail.company))];
        return (
          <section key={group.day} className="space-y-2">
            <h3 className="m-0 text-xs font-medium text-muted-foreground">{group.day}</h3>
            {keys.map((key) => {
              const company = companies.find((item) => item.key === key)!;
              return (
                <div key={key} className="rounded-2xl bg-muted/35 p-2">
                  <p className="m-0 flex items-center gap-2 px-1.5 pb-1 text-sm font-semibold">
                    {company.name}
                    <StatusPill status={company.status} className="h-5 px-2" />
                  </p>
                  <ul className="m-0 list-none space-y-1 p-0">
                    {group.items
                      .filter((mail) => mail.company === key)
                      .map((mail) => (
                        <li key={mail.id}>
                          <button
                            type="button"
                            aria-expanded={open === mail.id}
                            onClick={() => toggle(mail.id)}
                            className={cn(
                              "flex min-h-10 w-full items-center gap-2 rounded-xl border-l-4 bg-card px-2.5 text-left text-sm",
                              tagClass[mail.tag].edge,
                            )}
                          >
                            <span
                              className={cn(
                                "w-34 shrink-0 truncate text-xs font-medium",
                                tagClass[mail.tag].text,
                              )}
                            >
                              {tagMeta[mail.tag].label}
                            </span>
                            <span
                              className={cn(
                                "min-w-0 flex-1 truncate",
                                mail.open && "font-semibold",
                              )}
                            >
                              {mail.subject}
                            </span>
                            <SourceChip mail={mail} className="hidden sm:inline-flex" />
                            <span className="text-xs text-muted-foreground">{clock(mail.at)}</span>
                          </button>
                          {open === mail.id && (
                            <div className="px-2.5">
                              <Opened mail={mail} />
                            </div>
                          )}
                        </li>
                      ))}
                  </ul>
                </div>
              );
            })}
          </section>
        );
      })}
    </Pane>
  );
}

/* ---------- 3. Needs you ---------- */

type Attention = {
  id: string;
  at: string;
  label: string;
  title: string;
  company: string;
  tag?: FeedTag;
  round?: boolean;
};
const attention: Attention[] = [
  ...feed
    .filter((mail) => mail.open && mail.due)
    .map((mail) => ({
      id: mail.id,
      at: mail.due!.at,
      label: mail.due!.label,
      title: mail.subject,
      company: mail.company,
      tag: mail.tag,
    })),
  ...upcoming.map((item) => ({
    id: item.id,
    at: item.at,
    label: item.label,
    title: item.title,
    company: item.company,
    round: true,
  })),
].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
const undated = feed.filter((mail) => mail.open && !mail.due);
const rest = feed.filter((mail) => !mail.open).slice(0, 4);

function QuietRows({ mails }: { mails: FeedMail[] }) {
  return (
    <ul className="m-0 list-none p-0">
      {mails.map((mail) => (
        <li
          key={mail.id}
          className="flex min-h-10 items-center gap-2.5 border-b border-border/50 text-sm last:border-0"
        >
          <TagPill tag={mail.tag} short />
          <span className="w-22 shrink-0 truncate">{companyName(mail.company)}</span>
          <span className="min-w-0 flex-1 truncate text-muted-foreground">{mail.subject}</span>
          <span className="text-xs text-muted-foreground">{when(mail.at)}</span>
        </li>
      ))}
    </ul>
  );
}

export function ComingUpStrip() {
  return (
    <Pane className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h3 className="m-0 text-base font-semibold">Coming up</h3>
        <span className="text-xs text-muted-foreground">Next 7 days</span>
      </div>
      <ol className="m-0 -mx-1 flex list-none snap-x gap-2.5 overflow-x-auto px-1 pb-1">
        {attention.map((item) => (
          <li
            key={item.id}
            className="w-52 shrink-0 snap-start space-y-2 rounded-2xl bg-selected/60 p-3.5 ring-1 ring-link/25"
          >
            <p className="m-0 text-lg font-semibold tracking-tight text-selected-foreground">
              {item.label}
            </p>
            <p className="m-0 line-clamp-2 text-sm">{item.title}</p>
            <p className="m-0 flex items-center gap-1.5 text-xs text-muted-foreground">
              {item.tag ? (
                <TagDot tag={item.tag} />
              ) : (
                <span className="size-2 rounded-full ring-2 ring-link" />
              )}
              {companyName(item.company)}
            </p>
          </li>
        ))}
        {undated.map((mail) => (
          <li
            key={mail.id}
            className="w-52 shrink-0 snap-start space-y-2 rounded-2xl p-3.5 ring-1 ring-border"
          >
            <p className="m-0 text-lg font-semibold tracking-tight text-muted-foreground">
              No date
            </p>
            <p className="m-0 line-clamp-2 text-sm">{mail.subject}</p>
            <p className="m-0 flex items-center gap-1.5 text-xs text-muted-foreground">
              <TagDot tag={mail.tag} />
              {companyName(mail.company)}
            </p>
          </li>
        ))}
      </ol>
      <h3 className="m-0 pt-2 text-base font-semibold">All job mail</h3>
      <QuietRows mails={rest} />
    </Pane>
  );
}

export function AgendaAbove() {
  const days = new Map<string, Attention[]>();
  for (const item of attention)
    days.set(agendaDay(item.at), [...(days.get(agendaDay(item.at)) ?? []), item]);
  return (
    <Pane className="space-y-4">
      <div className="rounded-2xl bg-muted/40 p-3">
        <p className="m-0 mb-2 px-1 text-sm font-semibold">
          {attention.length + undated.length} things need you this week
        </p>
        <ol className="m-0 list-none space-y-0.5 p-0">
          {[...days].map(([day, items]) => (
            <li key={day} className="grid grid-cols-[4.5rem_1fr] gap-2">
              <span className="pt-2 text-xs font-medium text-muted-foreground">{day}</span>
              <ul className="m-0 list-none p-0">
                {items.map((item) => (
                  <li key={item.id} className="flex min-h-9 items-center gap-2 text-sm">
                    {item.tag ? (
                      <TagPill tag={item.tag} short />
                    ) : (
                      <span className="grid size-6 place-items-center">
                        <span className="size-2 rounded-full ring-2 ring-link" />
                      </span>
                    )}
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-medium">{item.title}</span>
                      <span className="text-muted-foreground"> at {companyName(item.company)}</span>
                    </span>
                    <span className="shrink-0 text-xs text-link">{item.label}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
          <li className="grid grid-cols-[4.5rem_1fr] gap-2">
            <span className="pt-2 text-xs font-medium text-muted-foreground">No date</span>
            <ul className="m-0 list-none p-0">
              {undated.map((mail) => (
                <li key={mail.id} className="flex min-h-9 items-center gap-2 text-sm">
                  <TagPill tag={mail.tag} short />
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium">{mail.subject}</span>
                    <span className="text-muted-foreground"> from {companyName(mail.company)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </li>
        </ol>
      </div>
      <h3 className="m-0 text-sm font-semibold">All job mail</h3>
      <QuietRows mails={rest} />
    </Pane>
  );
}

export function InPlaceHighlight() {
  const list = useRef<HTMLUListElement>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const needs = feed.filter((mail) => mail.open);
  function jump(id: string) {
    list.current
      ?.querySelector(`[data-id="${id}"]`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    setFlash(id);
    window.setTimeout(() => setFlash(null), 1200);
  }
  return (
    <Pane className="space-y-3">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-2xl bg-selected p-2 pl-3 text-sm text-selected-foreground">
        <span className="font-semibold">{needs.length} need you</span>
        {needs.map((mail) => (
          <button
            key={mail.id}
            type="button"
            onClick={() => jump(mail.id)}
            className="pressable inline-flex h-7 items-center gap-1.5 rounded-full bg-card px-2.5 text-xs text-foreground"
          >
            <TagDot tag={mail.tag} />
            {mail.due?.label ?? companyName(mail.company)}
            <ChevronDown aria-hidden size={12} />
          </button>
        ))}
      </div>
      <ul ref={list} className="m-0 max-h-80 list-none overflow-y-auto p-0">
        {feed.slice(0, 10).map((mail) => (
          <li
            key={mail.id}
            data-id={mail.id}
            className={cn(
              "flex min-h-11 items-center gap-2.5 rounded-xl px-2 text-sm transition-colors",
              mail.open && "bg-selected/45",
              flash === mail.id && "bg-selected",
            )}
          >
            <TagPill tag={mail.tag} short />
            <span className={cn("w-22 shrink-0 truncate", mail.open && "font-semibold")}>
              {companyName(mail.company)}
            </span>
            <span className="min-w-0 flex-1 truncate text-muted-foreground">{mail.subject}</span>
            {mail.due ? (
              <span className="shrink-0 rounded-full bg-card px-2 py-0.5 text-xs font-medium text-link">
                {mail.due.label}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">{when(mail.at)}</span>
            )}
          </li>
        ))}
      </ul>
    </Pane>
  );
}
