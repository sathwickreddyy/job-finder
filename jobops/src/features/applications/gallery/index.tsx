"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { DetailColumns, DetailStory } from "./detail";
import { EmailsBuckets, EmailsGrouped, EmailsPane } from "./emails";
import { HappenedChips, HappenedMenu, HappenedQuestion } from "./happened";
import { LedgerByPhase, LedgerLadder, LedgerPhaseRows } from "./ledger";
import { QueueAgenda, QueueFocus, QueueGrouped } from "./queue";

const styles = `
@keyframes ag-fade { from { opacity: 0; transform: translateY(4px); } }
@keyframes ag-pop { from { opacity: 0; transform: scale(0.96); } }
@keyframes ag-rise { from { opacity: 0; transform: translateY(8px); } }
.ag-fade { animation: ag-fade 220ms cubic-bezier(0.05, 0.7, 0.1, 1) both; }
.ag-pop { animation: ag-pop 300ms cubic-bezier(0.05, 0.7, 0.1, 1) both; }
.ag-rise { animation: ag-rise 260ms cubic-bezier(0.05, 0.7, 0.1, 1) both; }
@media (prefers-reduced-motion: reduce) { .ag-fade, .ag-pop, .ag-rise { animation: none; } }
`;

type Choice = { letter: string; name: string; note: string; render: () => ReactNode };
const sections: { id: string; title: string; description: string; options: Choice[] }[] = [
  {
    id: "queue",
    title: "Next queue",
    description:
      "The top of Applications. Fed by your follow-up dates, quiet records, booked rounds and unlinked recruiting mail. Try Done, Snooze and Undo.",
    options: [
      {
        letter: "A",
        name: "Date-grouped list",
        note: "Overdue, Today, This week. Every row carries its own action.",
        render: () => <QueueGrouped />,
      },
      {
        letter: "B",
        name: "Agenda spine",
        note: "Slipped items collected up top, then today and the week on a time line.",
        render: () => <QueueAgenda />,
      },
      {
        letter: "C",
        name: "Focus card",
        note: "One item at a time, biggest type, step through with arrows.",
        render: () => <QueueFocus />,
      },
    ],
  },
  {
    id: "records",
    title: "All records",
    description:
      "Every application and outreach as its own row. Linked records for the same opening point at each other. Filter, search, and hover the round dots.",
    options: [
      {
        letter: "A",
        name: "Phase bar rows",
        note: "Five-step progress bar, latest event, quiet-days chip. Hover a linked chip.",
        render: () => <LedgerPhaseRows />,
      },
      {
        letter: "B",
        name: "Round ladder",
        note: "Your actual rounds as dots in their family colours, outreach nested under its application.",
        render: () => <LedgerLadder />,
      },
      {
        letter: "C",
        name: "Grouped by phase",
        note: "Compact cards under Preparing, Applied, Interviewing, Decision, Closed.",
        render: () => <LedgerByPhase />,
      },
    ],
  },
  {
    id: "happened",
    title: "What happened?",
    description:
      "How you record progress instead of picking a stage. The sample starts at Zscaler, applied with no rounds. Walk it to an offer or a rejection.",
    options: [
      {
        letter: "A",
        name: "Outcome chips",
        note: "Every sensible outcome visible at once, details open inline.",
        render: () => <HappenedChips />,
      },
      {
        letter: "B",
        name: "One button, grouped menu",
        note: "Quiet until needed. Outcomes grouped as forward, setback, other.",
        render: () => <HappenedMenu />,
      },
      {
        letter: "C",
        name: "Asks the likely question",
        note: "Asks the most likely question first, like “Did you clear the DSA round?”, with everything else one tap away.",
        render: () => <HappenedQuestion />,
      },
    ],
  },
  {
    id: "emails",
    title: "Emails tab",
    description:
      "Recruiting mail from gmail.com, outlook.in and outlook.com in one place. Refresh is simulated here. Each message gets one obvious action.",
    options: [
      {
        letter: "A",
        name: "Date-grouped inbox",
        note: "Per-inbox refresh progress, rows grouped by day, action on the right.",
        render: () => <EmailsGrouped />,
      },
      {
        letter: "B",
        name: "List and reading pane",
        note: "Filter by inbox, read the message, act from the suggestion box.",
        render: () => <EmailsPane />,
      },
      {
        letter: "C",
        name: "Triage buckets",
        note: "Updates, new roles, noise. Clear noise in one tap.",
        render: () => <EmailsBuckets />,
      },
    ],
  },
  {
    id: "detail",
    title: "Application page",
    description: "One record opened: Razorpay, mid-loop with a referral attached.",
    options: [
      {
        letter: "A",
        name: "Two columns",
        note: "Progress, actions and rounds on the left; linked referral and history on the right.",
        render: () => <DetailColumns />,
      },
      {
        letter: "B",
        name: "Story with action bar",
        note: "Up-next banner, key facts, one timeline, actions pinned to the bottom.",
        render: () => <DetailStory />,
      },
    ],
  },
];

type Picks = Record<string, string | undefined>;
const PICKS_KEY = "jobops-applications-gallery-picks";
function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(PICKS_KEY, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(PICKS_KEY, callback);
  };
}
function read() {
  try {
    return localStorage.getItem(PICKS_KEY) ?? "{}";
  } catch {
    return "{}";
  }
}
function usePicks() {
  const picks = JSON.parse(useSyncExternalStore(subscribe, read, () => "{}")) as Picks;
  function choose(section: string, letter: string) {
    const next = { ...picks, [section]: picks[section] === letter ? undefined : letter };
    try {
      localStorage.setItem(PICKS_KEY, JSON.stringify(next));
    } catch {
      /* Picks stay until the next render only. */
    }
    window.dispatchEvent(new Event(PICKS_KEY));
  }
  return { picks, choose };
}

export function ApplicationsGallery() {
  const { picks, choose } = usePicks();
  const [copied, setCopied] = useState(false);
  const summary = sections
    .map((section) => `${section.title}: ${picks[section.id] ?? "not chosen"}`)
    .join(", ");
  async function copy() {
    await navigator.clipboard.writeText(`Applications gallery picks: ${summary}`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }
  return (
    <div className="space-y-16 pb-32">
      <style>{styles}</style>
      <header className="space-y-5">
        <div className="max-w-2xl">
          <h1 className="m-0 text-3xl font-semibold tracking-tight sm:text-4xl">
            Applications options
          </h1>
          <p className="m-0 mt-3 text-muted-foreground">
            Sample records pinned to Sat 3 Oct 2026, using companies from your shortlist. Every
            option is live. Choose one per section, then copy your picks.
          </p>
        </div>
        <nav aria-label="Gallery sections" className="flex flex-wrap gap-2">
          {sections.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className="pressable inline-flex min-h-9 items-center gap-2 rounded-full border border-border px-4 text-sm text-foreground hover:bg-muted hover:no-underline"
            >
              {section.title}
              {picks[section.id] && (
                <span className="grid size-5 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                  {picks[section.id]}
                </span>
              )}
            </a>
          ))}
        </nav>
      </header>
      {sections.map((section) => (
        <section key={section.id} id={section.id} className="scroll-mt-6 space-y-6">
          <div className="max-w-2xl">
            <h2 className="m-0 text-2xl font-semibold tracking-tight">{section.title}</h2>
            <p className="m-0 mt-2 text-muted-foreground">{section.description}</p>
          </div>
          {section.options.map((option) => {
            const chosen = picks[section.id] === option.letter;
            return (
              <div
                key={option.letter}
                className={cn(
                  "rounded-[2rem] border-2 p-3 transition-[border-color] sm:p-5",
                  chosen ? "border-primary" : "border-dashed border-border",
                )}
              >
                <div className="mb-4 flex flex-wrap items-center gap-3 px-1">
                  <span className="grid size-8 place-items-center rounded-full bg-secondary text-sm font-semibold">
                    {option.letter}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="m-0 font-semibold">{option.name}</p>
                    <p className="m-0 text-sm text-muted-foreground">{option.note}</p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant={chosen ? "default" : "outline"}
                    aria-pressed={chosen}
                    onClick={() => choose(section.id, option.letter)}
                    className="h-9 px-4"
                  >
                    {chosen && <Check size={15} aria-hidden />}
                    {chosen ? "Chosen" : "Choose this"}
                  </Button>
                </div>
                {option.render()}
              </div>
            );
          })}
        </section>
      ))}
      <div className="fixed inset-x-0 bottom-5 z-30 flex justify-center px-4">
        <div className="flex max-w-full items-center gap-3 rounded-full bg-popover py-2 pr-2 pl-5 shadow-surface ring-1 ring-border">
          <span className="truncate text-sm text-muted-foreground">
            {sections.filter((section) => picks[section.id]).length} of {sections.length} chosen
          </span>
          <Button type="button" size="sm" className="h-9 rounded-full px-4" onClick={copy}>
            {copied ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />}
            {copied ? "Copied" : "Copy picks"}
          </Button>
        </div>
      </div>
    </div>
  );
}
