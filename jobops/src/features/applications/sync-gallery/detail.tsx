"use client";

import { useState } from "react";
import { ArrowLeft, ChevronDown, ExternalLink, FileText, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { sampleApps, type SampleApp } from "./data";
import {
  Journey,
  Monogram,
  NextStep,
  StatusPill,
  Story,
  daysBetween,
  dueText,
  longDay,
} from "./parts";

const shown = sampleApps.filter((app) => app.group !== "closed").slice(0, 5);
const press =
  "w-full min-w-0 text-left transition-colors hover:bg-muted/45 focus-visible:bg-muted/45 focus-visible:outline-none";

/** Posted, applied and how long between them, resume and source: the record's facts. */
function Facts({ app, className }: { app: SampleApp; className?: string }) {
  const delay = app.postedAt && app.appliedAt ? daysBetween(app.postedAt, app.appliedAt) : null;
  const rows: [string, string][] = [
    ["Posted", app.postedAt ? longDay(app.postedAt) : "Unknown"],
    [
      "Applied",
      app.appliedAt
        ? `${longDay(app.appliedAt)}${delay === null ? "" : `, ${delay} ${delay === 1 ? "day" : "days"} after posting`}`
        : "Not sent yet",
    ],
    ["Source", app.source],
    ["City", app.city],
  ];
  return (
    <dl className={cn("m-0 grid gap-3 text-sm", className)}>
      {rows.map(([term, value]) => (
        <div key={term} className="grid grid-cols-[5rem_minmax(0,1fr)] gap-3">
          <dt className="text-muted-foreground">{term}</dt>
          <dd className="m-0">{value}</dd>
        </div>
      ))}
      <div className="grid grid-cols-[5rem_minmax(0,1fr)] gap-3">
        <dt className="text-muted-foreground">Resume</dt>
        <dd className="m-0">
          {app.resume ? (
            <span className="inline-flex items-center gap-1.5 text-link">
              <FileText aria-hidden size={14} />
              {app.resume}
            </span>
          ) : (
            "None yet"
          )}
        </dd>
      </div>
    </dl>
  );
}

function NextCard({ app }: { app: SampleApp }) {
  return (
    <div className="rounded-2xl bg-muted/40 p-4">
      <p className="m-0 mb-2 text-xs text-muted-foreground">Next step</p>
      <NextStep app={app} />
    </div>
  );
}

/** A: the list stays; the application opens in a panel on the right. */
export function SidePanel() {
  const [openId, setOpenId] = useState<string | null>("arcadia");
  const open = shown.find((app) => app.id === openId) ?? null;
  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
      <ul className="m-0 list-none divide-y divide-border self-start overflow-hidden rounded-3xl bg-card p-0 ring-1 ring-border">
        {shown.map((app) => (
          <li key={app.id}>
            <button
              type="button"
              aria-pressed={app.id === openId}
              onClick={() => setOpenId(app.id === openId ? null : app.id)}
              className={cn(
                press,
                "flex items-center gap-3 px-4 py-3",
                app.id === openId && "bg-selected/50 hover:bg-selected/50",
              )}
            >
              <Monogram name={app.company} className="size-8 rounded-lg" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{app.company}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {dueText(app.next) ?? app.next.label}
                </span>
              </span>
              <StatusPill {...app.status} />
            </button>
          </li>
        ))}
      </ul>
      {open ? (
        <aside
          key={open.id}
          className="reveal overflow-hidden rounded-3xl bg-card shadow-surface ring-1 ring-border"
        >
          <header className="flex items-start gap-3 border-b border-border px-5 py-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="m-0 text-lg font-semibold">{open.company}</h4>
                <StatusPill {...open.status} />
              </div>
              <p className="m-0 text-sm text-muted-foreground">{open.role}</p>
            </div>
            <button
              type="button"
              aria-label="Close"
              onClick={() => setOpenId(null)}
              className="grid size-9 shrink-0 place-items-center rounded-full hover:bg-muted"
            >
              <X aria-hidden size={16} />
            </button>
          </header>
          <div className="space-y-4 px-5 py-4">
            <NextCard app={open} />
            <Story items={open.story} />
          </div>
        </aside>
      ) : (
        <p className="m-0 grid place-items-center rounded-3xl border-2 border-dashed border-border p-10 text-sm text-muted-foreground">
          Choose an application to see its story.
        </p>
      )}
    </div>
  );
}

/** B: the row grows in place to show its story and facts; others stay where they are. */
export function ExpandInPlace() {
  const [openId, setOpenId] = useState<string | null>("tessaract");
  return (
    <ul className="m-0 list-none divide-y divide-border overflow-hidden rounded-3xl bg-card p-0 ring-1 ring-border">
      {shown.map((app) => {
        const open = app.id === openId;
        return (
          <li key={app.id}>
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpenId(open ? null : app.id)}
              className={cn(press, "flex items-center gap-3 px-4 py-3.5")}
            >
              <Monogram name={app.company} />
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-semibold">{app.company}</span>
                  <StatusPill {...app.status} />
                </span>
                <span className="block truncate text-sm text-muted-foreground">{app.role}</span>
              </span>
              <span className="hidden w-56 md:block">
                <NextStep app={app} compact />
              </span>
              <ChevronDown
                aria-hidden
                size={18}
                className={cn(
                  "shrink-0 text-muted-foreground transition-transform",
                  open && "rotate-180",
                )}
              />
            </button>
            {open && (
              <div className="reveal grid gap-5 border-t border-border bg-muted/20 px-4 py-4 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] md:px-6">
                <div className="space-y-3">
                  <Journey app={app} className="max-w-md" />
                  <Story items={app.story} />
                </div>
                <div className="space-y-4">
                  <NextCard app={app} />
                  <Facts app={app} />
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** C: its own page, story on the left and facts on the right. */
export function OwnPage() {
  const app = sampleApps.find((item) => item.id === "arcadia")!;
  return (
    <div className="space-y-5 rounded-3xl bg-background p-4 ring-1 ring-border sm:p-6">
      <span className="inline-flex items-center gap-1.5 text-sm text-link">
        <ArrowLeft aria-hidden size={14} />
        Applications
      </span>
      <header className="flex flex-wrap items-start gap-4">
        <Monogram name={app.company} className="size-12 rounded-2xl text-lg" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="m-0 text-2xl font-semibold tracking-tight">{app.company}</h4>
            <StatusPill {...app.status} />
          </div>
          <p className="m-0 text-muted-foreground">{app.role}</p>
        </div>
        <span className="inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm ring-1 ring-border">
          <ExternalLink aria-hidden size={14} />
          Posting
        </span>
      </header>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section className="space-y-4 rounded-3xl bg-card p-4 ring-1 ring-border sm:p-5">
          <Journey app={app} className="max-w-lg" />
          <Story items={app.story} />
        </section>
        <aside className="space-y-4">
          <NextCard app={app} />
          <div className="rounded-3xl bg-card p-4 ring-1 ring-border sm:p-5">
            <Facts app={app} />
          </div>
        </aside>
      </div>
    </div>
  );
}
