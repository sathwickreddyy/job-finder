"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { polishFeed } from "./data";
import { DateRail, DayCards, MonthCards } from "./layouts";
import { PolishRow } from "./rows";

type Option = { letter: string; name: string; note: string; render: () => ReactNode };
type Section = { id: string; title: string; description: string; options: Option[] };

const sample = polishFeed.slice(0, 6);

function RowList({ style }: { style: "lines" | "subject" | "columns" }) {
  return (
    <ul className="m-0 list-none divide-y divide-border overflow-hidden rounded-3xl bg-card p-0 ring-1 ring-border">
      {sample.map((mail) => (
        <PolishRow key={mail.id} mail={mail} style={style} />
      ))}
    </ul>
  );
}

const sections: Section[] = [
  {
    id: "layout",
    title: "Feed layout",
    description:
      "How days, months and years are separated. Every option uses the same row (two lines and a preview) so only the structure changes. Press any email to open it.",
    options: [
      {
        letter: "A",
        name: "A card per day",
        note: "Each day is an outlined card with its date on top; the year appears outside 2026. Rows inside are split by hairlines.",
        render: () => <DayCards mails={polishFeed} />,
      },
      {
        letter: "B",
        name: "Ledger with a date column",
        note: "One outlined ledger. A stamp column shows weekday, day and month beside each day and stays in view while you scroll; a band marks where 2025 and 2024 start.",
        render: () => <DateRail mails={polishFeed} />,
      },
      {
        letter: "C",
        name: "Month headings, a card per email",
        note: "A heading per month and year that sticks while you scroll, and each email in its own outlined card with its day on the left. Mail that needs you is outlined in blue.",
        render: () => <MonthCards mails={polishFeed} />,
      },
    ],
  },
  {
    id: "row",
    title: "Email row",
    description:
      "What each email shows. Shown in a plain outlined list; it drops into whichever layout you choose.",
    options: [
      {
        letter: "A",
        name: "Company first, two lines and a preview",
        note: "Company, sender, inbox and time; then tag and subject; then the first line that says something.",
        render: () => <RowList style="lines" />,
      },
      {
        letter: "B",
        name: "Subject first",
        note: "The subject is the headline with the time beside it; tag, company, sender and inbox sit under it. The preview shows when you open it.",
        render: () => <RowList style="subject" />,
      },
      {
        letter: "C",
        name: "Aligned columns",
        note: "Tag, company and sender, subject and preview, then time and inbox, lined up down the page. Stacks on a phone.",
        render: () => <RowList style="columns" />,
      },
    ],
  },
];

type Picks = Record<string, string | undefined>;
const PICKS_KEY = "jobops-mail-feed-picks";
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

export function MailFeedGallery() {
  const { picks, choose } = usePicks();
  const [copied, setCopied] = useState(false);
  async function copy() {
    const summary = sections
      .map((section) => `${section.title}: ${picks[section.id] ?? "not chosen"}`)
      .join(", ");
    await navigator.clipboard.writeText(`Mail feed picks: ${summary}`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }
  return (
    <div className="space-y-16 pb-32">
      <header className="max-w-2xl space-y-4">
        <h1 className="m-0 text-3xl font-semibold tracking-tight sm:text-4xl">
          All job mail, polished
        </h1>
        <p className="m-0 text-muted-foreground">
          Sample mail pinned to Sat 31 Oct 2026, 10:30 am, with fictional companies from 2024 to
          2026. Choose one layout and one row, then copy your picks.
        </p>
        <div className="rounded-2xl bg-muted/40 p-4 text-sm">
          <p className="m-0 font-medium">Fixed in every option</p>
          <ul className="m-0 mt-2 grid gap-1 pl-5 text-muted-foreground">
            <li>Dates outside this year carry the year: Thu 21 Aug 2025.</li>
            <li>
              Previews skip greetings such as &quot;Hi Sathwick,&quot; and the invisible padding
              that left a stray &quot;…&quot;.
            </li>
            <li>
              Each inbox is named by what tells it apart: gmail.com, outlook.in, outlook.com. Junk
              is flagged.
            </li>
          </ul>
        </div>
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
                <div className="max-w-5xl">{option.render()}</div>
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
