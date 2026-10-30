"use client";

import { useState } from "react";
import { ArrowLeft, BookOpen, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Company } from "./data";
import { SpineTimeline } from "./timelines";

function Roles({ company }: { company: Company }) {
  return (
    <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
      {company.roles.map((role) => (
        <li
          key={role.id}
          className="inline-flex items-center gap-2 rounded-full bg-muted py-1 pr-3 pl-1 text-sm"
        >
          <span className="rounded-full bg-card px-2.5 py-0.5 text-xs font-medium">
            {role.status}
          </span>
          {role.title}
        </li>
      ))}
    </ul>
  );
}

function NextStep({ company }: { company: Company }) {
  if (!company.next) return null;
  return (
    <p className="m-0 flex flex-wrap items-center gap-x-2 rounded-2xl bg-selected px-4 py-3 text-selected-foreground">
      <span className="font-semibold">Next</span>
      <span>{company.next}</span>
    </p>
  );
}

function Pay({ company }: { company: Company }) {
  return (
    <div>
      <p className="m-0 text-2xl font-semibold tracking-tight tabular-nums">{company.facts.pay}</p>
      <p className="m-0 text-sm text-muted-foreground">{company.facts.payNote}</p>
    </div>
  );
}

function Loop({ company }: { company: Company }) {
  return (
    <ol className="m-0 flex list-none flex-wrap items-center gap-1.5 p-0">
      {company.facts.rounds.map((round, index) => (
        <li key={`${round}-${index}`} className="flex items-center gap-1.5">
          {index > 0 && <span aria-hidden className="h-px w-3 bg-border" />}
          <span className="rounded-full px-2.5 py-1 text-sm ring-1 ring-border">{round}</span>
        </li>
      ))}
    </ol>
  );
}

/** A: header, then tabs with the timeline first; research keeps its own tabs. */
export function TabsCompany({ company }: { company: Company }) {
  const tabs = ["Timeline", "Compensation", "Interviews", "About"] as const;
  const [tab, setTab] = useState<(typeof tabs)[number]>("Timeline");
  return (
    <div className="rounded-3xl bg-card p-5 ring-1 ring-border sm:p-8">
      <header className="space-y-4">
        <div>
          <h3 className="m-0 text-3xl font-semibold tracking-tight">{company.name}</h3>
          <p className="m-0 mt-1 text-muted-foreground">{company.city}</p>
        </div>
        <Roles company={company} />
        <NextStep company={company} />
      </header>
      <div
        role="tablist"
        aria-label="Company sections"
        className="mt-6 flex gap-1 overflow-x-auto border-b border-border"
      >
        {tabs.map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={tab === item}
            onClick={() => setTab(item)}
            className={cn(
              "-mb-px h-11 shrink-0 border-b-2 px-4 text-sm font-medium",
              tab === item
                ? "border-primary text-link"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {item}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="tl-pop pt-6" key={tab}>
        {tab === "Timeline" && <SpineTimeline company={company} />}
        {tab === "Compensation" && <Pay company={company} />}
        {tab === "Interviews" && (
          <div className="space-y-2">
            <Loop company={company} />
            <p className="m-0 text-sm text-muted-foreground">
              From {company.facts.reports} interview reports
            </p>
          </div>
        )}
        {tab === "About" && (
          <p className="m-0 max-w-prose text-muted-foreground">
            Research notes, links and sources stay here, as they do today.
          </p>
        )}
      </div>
    </div>
  );
}

/** B: the timeline on the left; roles, pay and the interview loop stay in view beside it. */
export function AsideCompany({ company }: { company: Company }) {
  return (
    <div className="rounded-3xl bg-card p-5 ring-1 ring-border sm:p-8">
      <header className="space-y-4">
        <div className="flex flex-wrap items-end gap-x-4 gap-y-1">
          <h3 className="m-0 text-3xl font-semibold tracking-tight">{company.name}</h3>
          <p className="m-0 pb-1 text-muted-foreground">{company.city}</p>
        </div>
        <NextStep company={company} />
      </header>
      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <section aria-label="Timeline" className="order-2 lg:order-1">
          <SpineTimeline company={company} />
        </section>
        <aside className="order-1 grid gap-6 self-start sm:grid-cols-2 lg:sticky lg:top-6 lg:order-2 lg:grid-cols-1">
          <div className="space-y-2">
            <h4 className="m-0 text-sm font-semibold text-muted-foreground">Your roles</h4>
            <ul className="m-0 list-none space-y-2 p-0">
              {company.roles.map((role) => (
                <li key={role.id}>
                  <span className="block font-medium">{role.title}</span>
                  <span className="block text-sm text-muted-foreground">
                    {role.method}, {role.status.toLowerCase()}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="space-y-2">
            <h4 className="m-0 text-sm font-semibold text-muted-foreground">Pay</h4>
            <Pay company={company} />
          </div>
          <div className="space-y-2">
            <h4 className="m-0 text-sm font-semibold text-muted-foreground">Interview loop</h4>
            <Loop company={company} />
            <p className="m-0 text-xs text-muted-foreground">
              From {company.facts.reports} reports
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

/** C: the company page is Mail's timeline pane on its own; research opens in a side sheet. */
export function FocusedCompany({ company }: { company: Company }) {
  const [facts, setFacts] = useState(false);
  return (
    <div className="relative overflow-hidden rounded-3xl bg-card ring-1 ring-border">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <button
          type="button"
          className="pressable inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm text-muted-foreground hover:bg-muted"
        >
          <ArrowLeft aria-hidden size={16} />
          All companies
        </button>
        <button
          type="button"
          aria-expanded={facts}
          onClick={() => setFacts(true)}
          className="pressable ml-auto inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium ring-1 ring-border hover:bg-muted"
        >
          <BookOpen aria-hidden size={15} />
          Company facts
        </button>
      </div>
      <div className="p-5 sm:p-8">
        <h3 className="m-0 text-3xl font-semibold tracking-tight">{company.name}</h3>
        <div className="mt-3">
          <Roles company={company} />
        </div>
        <div className="mt-6">
          <SpineTimeline company={company} />
        </div>
      </div>
      {facts && (
        <div
          className="absolute inset-0 z-10 flex justify-end bg-scrim/40"
          onClick={() => setFacts(false)}
        >
          <aside
            aria-label="Company facts"
            onClick={(event) => event.stopPropagation()}
            className="tl-sheet h-full w-full max-w-sm space-y-6 overflow-y-auto bg-popover p-6 shadow-surface"
          >
            <div className="flex items-center">
              <h4 className="m-0 text-lg font-semibold">{company.name} facts</h4>
              <button
                type="button"
                aria-label="Close company facts"
                onClick={() => setFacts(false)}
                className="pressable ml-auto grid size-9 place-items-center rounded-full hover:bg-muted"
              >
                <X aria-hidden size={18} />
              </button>
            </div>
            <Pay company={company} />
            <div className="space-y-2">
              <h5 className="m-0 text-sm font-semibold text-muted-foreground">Interview loop</h5>
              <Loop company={company} />
            </div>
            <p className="m-0 text-sm text-muted-foreground">
              Compensation and interview reports open from here.
            </p>
          </aside>
        </div>
      )}
    </div>
  );
}
