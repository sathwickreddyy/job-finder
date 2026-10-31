"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { AccordionGroups, CardGroups, LaneGroups } from "./applications";
import {
  AgendaAbove,
  ComingUpStrip,
  CompanyGroupedFeed,
  InPlaceHighlight,
  LineFeed,
  TagPalette,
  TwoLineFeed,
} from "./feed";
import { InlineFetch, SplitFetch } from "./fetch";
import { LanesRun, LogRun, RowsRun } from "./run";
import { CountsPanel, GroupedPanel, SentencePanel } from "./search";
import { PillStatus, SentenceStatus, TrackStatus } from "./status";
import { tagStyles } from "./tags";

const styles = `
@keyframes tl-pop { from { opacity: 0; transform: translateY(3px); } }
.tl-pop { animation: tl-pop 200ms cubic-bezier(0.05, 0.7, 0.1, 1) both; }
@media (prefers-reduced-motion: reduce) { .tl-pop { animation: none; } }
${tagStyles}
`;

type Option = { letter: string; name: string; note: string; render: () => ReactNode };
type Section = {
  id: string;
  title: string;
  description: string;
  width?: string;
  options: Option[];
  fixedTags?: boolean;
};

const sections: Section[] = [
  {
    id: "tags",
    title: "Tag colours",
    description:
      "Ten tags: your eight plus Opportunity (recruiters reaching out) and Other. Whatever you choose here recolours every section below.",
    width: "max-w-xl",
    fixedTags: true,
    options: [
      {
        letter: "A",
        name: "One colour per tag",
        note: "Every tag has its own colour, so you can tell a background check from a joining email without reading.",
        render: () => <TagPalette scheme="hue" />,
      },
      {
        letter: "B",
        name: "Colour by stage",
        note: "Five colours for where you are: before applying, applied, interviewing, offer and joining, rejected. The icon and words name the exact kind.",
        render: () => <TagPalette scheme="stage" />,
      },
    ],
  },
  {
    id: "feed",
    title: "The job-mail feed",
    description:
      "Every job email from all three inboxes, newest first, with no spam or promotions. A blue dot means it needs you. Filter by tag, open a row, and look for the Lumen email that came from Outlook Junk.",
    width: "max-w-3xl",
    options: [
      {
        letter: "A",
        name: "One line per email",
        note: "Tag, company, subject, inbox and time on one line. The densest, like an inbox.",
        render: () => <LineFeed />,
      },
      {
        letter: "B",
        name: "Two lines with a preview",
        note: "Company and sender on top, tag and subject below, then the first line of the email.",
        render: () => <TwoLineFeed />,
      },
      {
        letter: "C",
        name: "Grouped by company each day",
        note: "Within each day, a company's emails sit together under its name and status, with a coloured edge per tag.",
        render: () => <CompanyGroupedFeed />,
      },
    ],
  },
  {
    id: "needs",
    title: "What needs you soon",
    description:
      "Open emails and anything due in the next seven days: an OA due Sunday, a slot to book by Monday, a booked round on Tuesday, an offer to answer by Wednesday.",
    width: "max-w-3xl",
    options: [
      {
        letter: "A",
        name: "Coming up strip",
        note: "Cards sorted by due date above the feed, with the deadline as the headline. Scrolls sideways on a phone.",
        render: () => <ComingUpStrip />,
      },
      {
        letter: "B",
        name: "Agenda above the feed",
        note: "A short list by day, like a calendar's agenda, then all job mail below.",
        render: () => <AgendaAbove />,
      },
      {
        letter: "C",
        name: "Highlighted in place",
        note: "The feed stays in date order and open emails are tinted. A bar at the top counts them and jumps to each.",
        render: () => <InPlaceHighlight />,
      },
    ],
  },
  {
    id: "status",
    title: "Company status",
    description:
      "One status per company, worked out from your applications, the same on Mail, Companies and the company page. Kestrel shows a previous job.",
    width: "max-w-3xl",
    options: [
      {
        letter: "A",
        name: "Status pill",
        note: "A coloured pill and one line of detail. Previous employers get their own badge.",
        render: () => <PillStatus />,
      },
      {
        letter: "B",
        name: "Stage track",
        note: "A four-step bar from Applied to Joined shows how far each company has got.",
        render: () => <TrackStatus />,
      },
      {
        letter: "C",
        name: "Status as a sentence",
        note: "A coloured dot and a plain sentence; previous employers are listed separately. Press a company to see its header.",
        render: () => <SentenceStatus />,
      },
    ],
  },
  {
    id: "panel",
    title: "How we find a company's mail",
    description:
      "On each company page. Everything is editable: add a missing address, edit or remove a keyword (try adding “interview”), untick an inbox, set the last N days, and open the exact search each inbox receives.",
    options: [
      {
        letter: "A",
        name: "Grouped chips",
        note: "One labelled group per kind of rule, stacked in the company page's side column.",
        render: () => <GroupedPanel />,
      },
      {
        letter: "B",
        name: "Read as a sentence",
        note: "The rule reads like a sentence with editable pieces, so what gets kept is spelled out.",
        render: () => <SentencePanel />,
      },
      {
        letter: "C",
        name: "Rules with last-search counts",
        note: "Each rule shows how many emails it found last time, so you can see which ones are pulling their weight.",
        render: () => <CountsPanel />,
      },
    ],
  },
  {
    id: "run",
    title: "Watching a search run",
    description:
      "Press Start search. Pages land one by one, every dropped email says why, and one inbox fails so you can see how that looks. Try Include this on the Meera and Northstar Engineering emails.",
    width: "max-w-4xl",
    options: [
      {
        letter: "A",
        name: "Inbox rows, then results",
        note: "One row per inbox with its progress, counts and exact search; results below, split into Kept and Dropped.",
        render: () => <RowsRun />,
      },
      {
        letter: "B",
        name: "One lane per inbox",
        note: "Three columns side by side, each filling with its own results as pages land.",
        render: () => <LanesRun />,
      },
      {
        letter: "C",
        name: "Activity log",
        note: "A running log of every page next to one combined results list, newest first.",
        render: () => <LogRun />,
      },
    ],
  },
  {
    id: "fetch",
    title: "Fetch new mail",
    description:
      "Replaces Check mail. It says what it covers, can reach back N days (up to 180; try 400), and shows each inbox's progress. Press it to watch.",
    width: "max-w-md",
    options: [
      {
        letter: "A",
        name: "Button with the time frame beside it",
        note: "Since last fetch or Last N days sit next to the button, always visible.",
        render: () => <InlineFetch />,
      },
      {
        letter: "B",
        name: "Split button",
        note: "One press fetches since last time; the arrow opens Last N days.",
        render: () => <SplitFetch />,
      },
    ],
  },
  {
    id: "applications",
    title: "Applications, one group per application",
    description:
      "Same emails, grouped by application. Northstar has two. Fernwood's confirmation was matched but not linked yet: press Link. Previous jobs are collapsed at the end.",
    width: "max-w-4xl",
    options: [
      {
        letter: "A",
        name: "Cards with latest mail",
        note: "One card per application with its status, next step and latest three emails. Cards with something due are outlined.",
        render: () => <CardGroups />,
      },
      {
        letter: "B",
        name: "Rows that open",
        note: "A compact table: status, next step, due and a dot per email. Open a row to see its emails.",
        render: () => <AccordionGroups />,
      },
      {
        letter: "C",
        name: "Lanes on a calendar",
        note: "Each application is a lane across four weeks with its emails placed by date and what's due ahead of Today.",
        render: () => <LaneGroups />,
      },
    ],
  },
];

type Picks = Record<string, string | undefined>;
const PICKS_KEY = "jobops-mail-search-picks";
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

export function MailSearchGallery() {
  const { picks, choose } = usePicks();
  const [copied, setCopied] = useState(false);
  const scheme = picks.tags === "B" ? "stage" : "hue";
  async function copy() {
    const summary = sections
      .map((section) => `${section.title}: ${picks[section.id] ?? "not chosen"}`)
      .join(", ");
    await navigator.clipboard.writeText(`Job mail and search picks: ${summary}`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }
  return (
    <div data-tags={scheme} className="space-y-16 pb-32">
      <style>{styles}</style>
      <header className="max-w-2xl space-y-4">
        <h1 className="m-0 text-3xl font-semibold tracking-tight sm:text-4xl">
          Job mail, search and applications
        </h1>
        <p className="m-0 text-muted-foreground">
          Sample mail pinned to Sat 31 Oct 2026, 10:30 am, with fictional companies. Nothing here
          touches your inboxes. Everything is live: filter, edit rules, run a search and link
          emails. Choose one option per section, then copy your picks.
        </p>
        <nav aria-label="Sections" className="flex flex-wrap gap-2">
          {sections.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className="inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-sm text-foreground ring-1 ring-border hover:bg-muted hover:no-underline"
            >
              {picks[section.id] && <Check aria-hidden size={14} className="text-link" />}
              {section.title}
            </a>
          ))}
        </nav>
      </header>
      {sections.map((section) => (
        <section key={section.id} id={section.id} className="scroll-mt-6 space-y-6">
          <div className="flex max-w-2xl flex-col gap-2">
            <h2 className="m-0 text-2xl font-semibold tracking-tight">{section.title}</h2>
            <p className="m-0 text-muted-foreground">{section.description}</p>
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
                <div className={section.width}>{option.render()}</div>
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
