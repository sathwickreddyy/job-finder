"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { ExpandInPlace, OwnPage, SidePanel } from "./detail";
import { Journeys, Ledger, NeedsFirst } from "./layouts";
import { ApplyWithUndo, AskOnce, ClearOnesApply } from "./sync";

type Option = { letter: string; name: string; note: string; render: () => ReactNode };
type Section = { id: string; title: string; description: string; options: Option[] };

const sections: Section[] = [
  {
    id: "sync",
    title: "When an email changes an application",
    description:
      "A rejection from Tessaract Cloud arrived at 1:30 am. Today it was filed as handled and the application still says Applied. Press the buttons to see what happens in each option.",
    options: [
      {
        letter: "A",
        name: "Ask once, on the application",
        note: "The email sits on its application with one suggested button. Nothing changes until you press it.",
        render: () => <AskOnce />,
      },
      {
        letter: "B",
        name: "Update straight away, undo if wrong",
        note: "The status changes as soon as the email is fetched. Undo is beside it.",
        render: () => <ApplyWithUndo />,
      },
      {
        letter: "C",
        name: "Clear outcomes update, the rest ask",
        note: "Rejections, offers and acknowledgements update on their own. Assessment and interview emails ask, because they need a date.",
        render: () => <ClearOnesApply />,
      },
    ],
  },
  {
    id: "page",
    title: "The Applications page",
    description:
      "What you see when you open Applications. All three use the same eight applications, with the rejection waiting as in option A above.",
    options: [
      {
        letter: "A",
        name: "Needs you first",
        note: "Three groups: Needs you, Waiting on them, Closed. Each row shows the company and status, the last email, and the next step with its button.",
        render: () => <NeedsFirst />,
      },
      {
        letter: "B",
        name: "Ledger with aligned columns",
        note: "One outlined table like the Mail feed, with a band per group. Shows the applied date and how many days after posting you applied.",
        render: () => <Ledger />,
      },
      {
        letter: "C",
        name: "How far each one got",
        note: "Every application shows its steps from Sent to Offer, with the day it reached each one. A rejection takes the place of the step it stopped at.",
        render: () => <Journeys />,
      },
    ],
  },
  {
    id: "detail",
    title: "Opening an application",
    description:
      "What appears when you open an application: its emails and steps as one dated story, the next step, and the record's facts. Press the rows to try it.",
    options: [
      {
        letter: "A",
        name: "Panel beside the list",
        note: "The list stays in view, and the application opens on the right. Pressing another row switches the panel.",
        render: () => <SidePanel />,
      },
      {
        letter: "B",
        name: "Opens in place",
        note: "The row expands to show its journey, story, next step and facts. Other rows stay where they are.",
        render: () => <ExpandInPlace />,
      },
      {
        letter: "C",
        name: "Its own page",
        note: "A full page with the story on the left, and the next step and facts on the right.",
        render: () => <OwnPage />,
      },
    ],
  },
];

type Picks = Record<string, string | undefined>;
const PICKS_KEY = "jobops-applications-sync-picks";
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

export function ApplicationsSyncGallery() {
  const { picks, choose } = usePicks();
  const [copied, setCopied] = useState(false);
  async function copy() {
    const summary = sections
      .map((section) => `${section.title}: ${picks[section.id] ?? "not chosen"}`)
      .join(", ");
    await navigator.clipboard.writeText(`Applications picks: ${summary}`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }
  return (
    <div className="space-y-16 pb-32">
      <header className="max-w-2xl space-y-4">
        <h1 className="m-0 text-3xl font-semibold tracking-tight sm:text-4xl">
          Applications that keep up with your mail
        </h1>
        <p className="m-0 text-muted-foreground">
          The sample is pinned to Sat 31 Oct 2026, 10:30 am. The companies are made up, but each one
          is in the same situation as one of your real applications. Choose one option in each
          section, then copy your picks.
        </p>
        <div className="rounded-2xl bg-muted/40 p-4 text-sm">
          <p className="m-0 font-medium">The same in every option</p>
          <ul className="m-0 mt-2 grid gap-1 pl-5 text-muted-foreground">
            <li>
              Every email filed under a company appears on that company&apos;s applications, on
              Applications and on Mail alike.
            </li>
            <li>
              Old mail found by company search can still change its application. Northwind&apos;s 7
              Oct rejection is handled like a new one.
            </li>
            <li>
              When a company has more than one application, its emails always ask which one they
              belong to.
            </li>
            <li>
              Status comes from what happened. It never says Quiet after a rejection, and each row
              shows one next step instead of &quot;21 days late&quot; everywhere.
            </li>
            <li>Previous jobs stay off the list.</li>
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
