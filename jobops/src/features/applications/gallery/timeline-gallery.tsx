"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { datasets, type Dataset } from "./timeline-data";
import { Legend, MailDrawer, MailStrip, MailTray, useFlash } from "./timeline-marks";
import { CalendarLanes, JourneyRows, StoryCards, type TimelineData } from "./timelines";

const styles = `
@keyframes ag-fade { from { opacity: 0; transform: translateY(4px); } }
@keyframes ag-pop { from { opacity: 0; transform: scale(0.96); } }
.ag-fade { animation: ag-fade 220ms cubic-bezier(0.05, 0.7, 0.1, 1) both; }
.ag-pop { animation: ag-pop 300ms cubic-bezier(0.05, 0.7, 0.1, 1) both; }
@media (prefers-reduced-motion: reduce) { .ag-fade, .ag-pop { animation: none; } }
`;

function MailOption({ data, as: Option }: { data: TimelineData; as: typeof MailStrip }) {
  const { flash, node } = useFlash();
  return (
    <>
      <Option mail={data.mail} inboxes={data.inboxes} onAct={flash} />
      {node}
    </>
  );
}

type Choice = {
  letter: string;
  name: string;
  note: string;
  render: (data: TimelineData) => ReactNode;
};
const sections: {
  id: string;
  title: string;
  description: string;
  legend?: boolean;
  options: Choice[];
}[] = [
  {
    id: "landing",
    title: "Landing view",
    description:
      "One timeline per company: its status, what happened in order, and the one thing to do next. Companies that need you come first. Replies from companies you applied to appear inside their own timeline, so there is no separate Emails tab to check.",
    legend: true,
    options: [
      {
        letter: "A",
        name: "Journey rows",
        note: "A row per company: status on the left, its steps from left to right, and the next step on the right. Hover a step to read it, or press +N for older steps.",
        render: (data) => <JourneyRows data={data} />,
      },
      {
        letter: "B",
        name: "Calendar lanes",
        note: "Every company on one shared calendar with a Today line, so gaps and pace show at a glance. Select a company to open its full timeline. Scrolls sideways on a phone.",
        render: (data) => <CalendarLanes data={data} />,
      },
      {
        letter: "C",
        name: "Story cards",
        note: "A card per company: status, next step, then what happened with the newest first. Press Show all for the full history.",
        render: (data) => <StoryCards data={data} />,
      },
    ],
  },
  {
    id: "mail",
    title: "Emails that don't belong to a company yet",
    description:
      "After replies go onto timelines, two kinds of email remain: recruiters pitching new roles and job-alert noise. This replaces the Emails tab. Choose where those leftovers live.",
    options: [
      {
        letter: "A",
        name: "Slim strip above the timelines",
        note: "One line with a chip per new role and a single Dismiss for alerts. Refresh sits at its right end.",
        render: (data) => <MailOption data={data} as={MailStrip} />,
      },
      {
        letter: "B",
        name: "Side tray",
        note: "A tray beside the timelines, split into new roles and alerts, always visible on a wide screen.",
        render: (data) => <MailOption data={data} as={MailTray} />,
      },
      {
        letter: "C",
        name: "Button with a drawer",
        note: "Nothing on the page except a counted button in the header. The drawer opens over the page.",
        render: (data) => <MailOption data={data} as={MailDrawer} />,
      },
    ],
  },
];

type Picks = Record<string, string | undefined>;
const PICKS_KEY = "jobops-applications-timeline-picks";
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

const datasetLabel: Record<Dataset, string> = {
  full: "A busy month · 10 companies",
  starting: "Where you are now · 2 just applied",
};

export function TimelineGallery() {
  const { picks, choose } = usePicks();
  const [dataset, setDataset] = useState<Dataset>("full");
  const [copied, setCopied] = useState(false);
  const data = datasets[dataset];
  const summary = sections
    .map((section) => `${section.title}: ${picks[section.id] ?? "not chosen"}`)
    .join(", ");
  async function copy() {
    await navigator.clipboard.writeText(`Applications timeline picks: ${summary}`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }
  return (
    <div className="space-y-16 pb-32">
      <style>{styles}</style>
      <header className="space-y-5">
        <div className="max-w-2xl">
          <h1 className="m-0 text-3xl font-semibold tracking-tight sm:text-4xl">
            Applications as company timelines
          </h1>
          <p className="m-0 mt-3 text-muted-foreground">
            Sample companies pinned to Sat 3 Oct 2026, 10:30 am. Every option is live. Switch the
            data to see how each one looks with a busy month or with where you are today. Choose one
            per section, then copy your picks.
          </p>
        </div>
        <div
          role="radiogroup"
          aria-label="Sample data"
          className="inline-flex flex-wrap gap-1 rounded-full bg-muted p-1"
        >
          {(Object.keys(datasetLabel) as Dataset[]).map((key) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={dataset === key}
              onClick={() => setDataset(key)}
              className={cn(
                "pressable min-h-9 rounded-full px-4 text-sm font-medium",
                dataset === key
                  ? "bg-card text-foreground shadow-surface"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {datasetLabel[key]}
            </button>
          ))}
        </div>
      </header>
      {sections.map((section) => (
        <section key={section.id} id={section.id} className="scroll-mt-6 space-y-6">
          <div className="flex max-w-2xl flex-col gap-3">
            <h2 className="m-0 text-2xl font-semibold tracking-tight">{section.title}</h2>
            <p className="m-0 text-muted-foreground">{section.description}</p>
            {section.legend && <Legend />}
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
                <div key={dataset}>{option.render(data)}</div>
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
