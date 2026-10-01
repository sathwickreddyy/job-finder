"use client";

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { familyFill } from "./format";
import {
  roundFamilies,
  roundFamily,
  roundKindLabel,
  type InterviewReport,
  type RoundFamily,
} from "./metrics";

export function DetailTabs({
  tabs,
  initial,
}: {
  tabs: { id: string; label: string; content: ReactNode }[];
  initial: string;
}) {
  const [active, setActive] = useState(
    tabs.some((tab) => tab.id === initial) ? initial : tabs[0]?.id,
  );
  const list = useRef<HTMLDivElement>(null);
  function select(id: string) {
    setActive(id);
    // Keep the tab in the URL so it can be bookmarked and survives a reload, without a server round trip.
    const url = new URL(window.location.href);
    url.searchParams.set("tab", id);
    url.hash = "";
    window.history.replaceState(window.history.state, "", url);
  }
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = tabs.findIndex((tab) => tab.id === active);
    const next =
      event.key === "ArrowRight"
        ? (index + 1) % tabs.length
        : event.key === "ArrowLeft"
          ? (index - 1 + tabs.length) % tabs.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? tabs.length - 1
              : -1;
    if (next < 0) return;
    event.preventDefault();
    select(tabs[next].id);
    list.current?.querySelector<HTMLButtonElement>(`#tab-${tabs[next].id}`)?.focus();
  }
  return (
    <div>
      <div
        ref={list}
        role="tablist"
        aria-label="Company sections"
        onKeyDown={onKeyDown}
        className="flex gap-6 overflow-x-auto border-b border-border"
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            type="button"
            id={`tab-${tab.id}`}
            aria-selected={active === tab.id}
            aria-controls={`panel-${tab.id}`}
            tabIndex={active === tab.id ? 0 : -1}
            onClick={() => select(tab.id)}
            className={cn(
              "relative shrink-0 pb-3 text-sm font-medium",
              active === tab.id ? "text-link" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
            {active === tab.id && (
              <span className="absolute inset-x-0 -bottom-px h-[3px] rounded-t-full bg-primary" />
            )}
          </button>
        ))}
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`panel-${tab.id}`}
          aria-labelledby={`tab-${tab.id}`}
          hidden={active !== tab.id}
          className="pt-8"
        >
          {tab.content}
        </div>
      ))}
    </div>
  );
}

export function QuestionBank({ reports }: { reports: InterviewReport[] }) {
  const seen = new Set<string>();
  const questions = reports.flatMap((report) =>
    report.rounds.flatMap((round) =>
      round.questions.flatMap((question) => {
        const key = question.text.trim().toLowerCase();
        if (seen.has(key)) return [];
        seen.add(key);
        return [{ ...question, kind: round.kind, round: round.name, year: report.year }];
      }),
    ),
  );
  const [family, setFamily] = useState<RoundFamily | "All">("All");
  const shown =
    family === "All" ? questions : questions.filter((row) => roundFamily(row.kind) === family);
  if (!questions.length)
    return (
      <p className="text-sm text-muted-foreground">No questions recorded in these reports yet.</p>
    );
  return (
    <div className="space-y-4">
      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label="Filter questions by round type"
      >
        {(["All", ...roundFamilies] as const).map((option) => {
          const count =
            option === "All"
              ? questions.length
              : questions.filter((row) => roundFamily(row.kind) === option).length;
          if (!count) return null;
          return (
            <button
              key={option}
              type="button"
              aria-pressed={family === option}
              onClick={() => setFamily(option)}
              className={cn(
                "flex min-h-9 items-center gap-2 rounded-full px-3.5 text-sm font-medium",
                family === option
                  ? "bg-selected text-selected-foreground"
                  : "border border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {option !== "All" && (
                <span className={cn("size-2 rounded-full", familyFill[option])} aria-hidden />
              )}
              {option}
              <span className="tabular-nums opacity-70">{count}</span>
            </button>
          );
        })}
      </div>
      <ul className="divide-y divide-border rounded-card border border-border bg-card">
        {shown.map((row) => (
          <li key={row.text} className="flex flex-wrap items-start gap-x-4 gap-y-1 px-5 py-3.5">
            <span className="flex w-full items-center gap-1.5 text-xs font-medium sm:mt-0.5 sm:w-24 sm:shrink-0">
              <span
                className={cn("size-2 rounded-full", familyFill[roundFamily(row.kind)])}
                aria-hidden
              />
              {roundKindLabel[row.kind]}
            </span>
            <span className="min-w-0 flex-1 text-sm">{row.text}</span>
            <a
              href={row.referenceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex shrink-0 items-center gap-1 text-xs text-link"
              aria-label={`Source for: ${row.text}`}
            >
              {row.year}
              <ArrowUpRight size={13} aria-hidden />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
