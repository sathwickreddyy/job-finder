"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { tagOrder } from "./data";
import { EditTagDemo } from "./demo";
import { Pill } from "./popups";

type Option = { letter: string; name: string; note: string; render: () => ReactNode };
type Section = { id: string; title: string; description: string; options: Option[] };

const sections: Section[] = [
  {
    id: "popup",
    title: "The Edit tag popup",
    description:
      "Press Edit tag on the sample email: a rejection that arrived tagged Application. Nothing changes until you press the confirm button; Cancel, Escape or a click outside leaves the tag alone.",
    options: [
      {
        letter: "A",
        name: "Dialog with tags grouped by stage",
        note: "A centred dialog. The change is spelled out on top (Now Application → your pick), the tags sit under their stage, and the pick's meaning shows before you press Change tag.",
        render: () => <EditTagDemo popup="A" />,
      },
      {
        letter: "B",
        name: "Popover with a list and meanings",
        note: "Opens right under the button without dimming the page. One row per tag with what it means; the confirm button names the new tag.",
        render: () => <EditTagDemo popup="B" />,
      },
      {
        letter: "C",
        name: "Two steps: pick, then confirm",
        note: "Pick a tag from cards with their meanings, then a second screen asks “Change this email's tag?” with what will and won't change.",
        render: () => <EditTagDemo popup="C" />,
      },
    ],
  },
  {
    id: "feedback",
    title: "After you confirm",
    description:
      "What tells you it worked, and how to take it back. Every option uses popup A so only the behaviour changes.",
    options: [
      {
        letter: "A",
        name: "Snackbar with Undo",
        note: "The popup closes and a dark bar at the bottom says “Tagged as …” with Undo for six seconds.",
        render: () => <EditTagDemo feedback="A" />,
      },
      {
        letter: "B",
        name: "Saved in the popup, then a note on the email",
        note: "The confirm button turns into Saving… then Saved before the popup closes. The email keeps a line, “Tag changed from Application just now”, with Undo.",
        render: () => <EditTagDemo feedback="B" />,
      },
      {
        letter: "C",
        name: "The email lights up",
        note: "The popup closes, the email glows blue and fades back, and the new tag carries a check for a moment. No Undo: edit the tag again to change it.",
        render: () => <EditTagDemo feedback="C" />,
      },
    ],
  },
  {
    id: "placement",
    title: "Where Edit tag lives",
    description:
      "Where you press to start. Every option uses popup A and the snackbar, so only the button changes.",
    options: [
      {
        letter: "A",
        name: "A pencil beside the tag",
        note: "Hover an email (or tap on a phone) and a pencil appears next to its tag, so you can fix it without opening the email.",
        render: () => <EditTagDemo placement="A" feedback="A" />,
      },
      {
        letter: "B",
        name: "Edit tag in the opened email",
        note: "An outlined Edit tag button sits with the email's other actions, after Record and Just info.",
        render: () => <EditTagDemo placement="B" feedback="A" />,
      },
      {
        letter: "C",
        name: "The tag is the button",
        note: "The tag itself carries a small arrow; press it to edit. Nothing extra on the row.",
        render: () => <EditTagDemo placement="C" feedback="A" />,
      },
    ],
  },
];

type Picks = Record<string, string | undefined>;
const PICKS_KEY = "jobops-edit-tag-picks";
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

export function EditTagGallery() {
  const { picks, choose } = usePicks();
  const [copied, setCopied] = useState(false);
  async function copy() {
    const summary = sections
      .map((section) => `${section.title}: ${picks[section.id] ?? "not chosen"}`)
      .join(", ");
    await navigator.clipboard.writeText(`Edit tag picks: ${summary}`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }
  return (
    <div className="space-y-16 pb-32">
      <header className="max-w-2xl space-y-4">
        <h1 className="m-0 text-3xl font-semibold tracking-tight sm:text-4xl">Edit tag</h1>
        <p className="m-0 text-muted-foreground">
          Fixing an email that arrived with the wrong tag. Every sample is live: open the popup,
          pick a tag, confirm, undo and reset. Choose one option per section, then copy your picks.
        </p>
        <div className="rounded-2xl bg-muted/40 p-4 text-sm">
          <p className="m-0 font-medium">Fixed in every option</p>
          <ul className="m-0 mt-2 grid gap-2 pl-5 text-muted-foreground">
            <li>
              Rejection becomes two tags, both red:{" "}
              <Pill tag="applicationRejected" className="align-middle" /> for turned down before any
              interview, and <Pill tag="interviewRejected" className="align-middle" /> after one or
              more rounds.
            </li>
            <li>
              New rejection mail is sorted by your records: if a round was recorded at that company
              before the email, it is Rejected after interview; otherwise Application rejected.
              Rejection mail you already have is sorted once the same way.
            </li>
            <li>Nothing changes until you press the confirm button.</li>
            <li>
              Changing a tag never handles the email: its company, application and Needs you stay as
              they are.
            </li>
          </ul>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {tagOrder.map((tag) => (
              <Pill key={tag} tag={tag} />
            ))}
          </div>
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
                <div className="mb-2 flex flex-wrap items-center gap-3 px-1">
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
                <div className="max-w-4xl">{option.render()}</div>
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
