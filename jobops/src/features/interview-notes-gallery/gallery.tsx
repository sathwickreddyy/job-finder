"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { Check, Copy, Monitor, Smartphone, Tablet } from "lucide-react";
import { cn } from "@/lib/utils";
import { EditorDemo } from "./editor";
import { HeaderDemo } from "./header";
import { LibraryDemo } from "./library";
import { PageDemo } from "./page-layout";
import { QuestionsView } from "./questions";
import { StageDemo } from "./stage";
import type { InterviewGalleryData, Variant } from "./types";

type SectionId = "stage" | "header" | "questions" | "editor" | "library" | "page";
type Picks = Record<SectionId, Variant>;

const key = "jobops-interview-notes-gallery-picks-v1";
const defaults: Picks = { stage: "A", header: "B", questions: "A", editor: "A", library: "A", page: "A" };

const sections: { id: SectionId; title: string; note: string; options: { letter: Variant; name: string; detail: string }[] }[] = [
  {
    id: "stage",
    title: "Where it stands",
    note: "Interviewing becomes the actual rounds: Round 1 · DSA, Round 2, Managerial round, HR round. Rounds still to come come from company research and are marked expected.",
    options: [
      { letter: "A", name: "Named steps", detail: "Every step labelled in one line; it scrolls sideways and keeps the current step in view." },
      { letter: "B", name: "Headline and bar", detail: "One line says where you are; a segmented bar shows how far along it is." },
      { letter: "C", name: "Current step, full list on tap", detail: "Only what matters now; the whole journey opens in place." },
    ],
  },
  {
    id: "header",
    title: "Which application this is",
    note: "Same company, same title: the requisition and the résumé you sent tell them apart.",
    options: [
      { letter: "A", name: "Identity strip", detail: "Company and role, then requisition, applied date and résumé as pills." },
      { letter: "B", name: "Facts and a switcher", detail: "Flip between your ServiceNow applications; four facts side by side." },
      { letter: "C", name: "Header that compacts", detail: "Full at the top; shrinks to a one-line bar as you scroll." },
    ],
  },
  {
    id: "questions",
    title: "Questions in a round",
    note: "Each question keeps what they asked, how you answered, what the interviewer said and an optional review to revisit later.",
    options: [
      { letter: "A", name: "Rows that open in place", detail: "Scan all questions; open one or all to read." },
      { letter: "B", name: "List and reader", detail: "Pick on the left, read on the right. On a phone the list opens the reader." },
      { letter: "C", name: "Read straight through", detail: "Every question in one scroll; titles stay pinned, chips jump." },
    ],
  },
  {
    id: "editor",
    title: "Writing an answer",
    note: "The Markdown editor from sde-prep-platform: code blocks highlight, tables render. Try typing.",
    options: [
      { letter: "A", name: "Side by side", detail: "Markdown and preview together; stacks when narrow." },
      { letter: "B", name: "Write and preview tabs", detail: "One pane at full width; switch between sections." },
      { letter: "C", name: "Read first, edit a section", detail: "Looks finished; Edit turns one section into an editor." },
    ],
  },
  {
    id: "library",
    title: "Question library",
    note: "Every question from every interview, to revise before the next one. Rows marked sample only fill the list so search and scrolling can be tried.",
    options: [
      { letter: "A", name: "Grouped by pattern", detail: "Sliding window, Hash map… each group folds; questions open in place." },
      { letter: "B", name: "Sortable table", detail: "Sort by date, question or company; open one in a side sheet." },
    ],
  },
  {
    id: "page",
    title: "The whole application page",
    note: "Your picks above, put together. The frame scrolls like the real page.",
    options: [
      { letter: "A", name: "Two columns", detail: "Interview story on the left; résumé, mail and history pinned on the right." },
      { letter: "B", name: "Tabs", detail: "Interview notes, mail and history each get the full width." },
    ],
  },
];

const widths = [
  { id: "phone", label: "Phone", icon: Smartphone, max: "max-w-[390px]" },
  { id: "tablet", label: "Tablet", icon: Tablet, max: "max-w-[768px]" },
  { id: "full", label: "Full", icon: Monitor, max: "max-w-none" },
] as const;
type Width = (typeof widths)[number]["id"];

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(key, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(key, callback);
  };
}
function snapshot() {
  try {
    return localStorage.getItem(key) ?? "{}";
  } catch {
    return "{}";
  }
}
function parse(value: string): Picks {
  try {
    const p: unknown = JSON.parse(value);
    if (!p || typeof p !== "object") return defaults;
    const valid = Object.entries(p).filter(
      ([k, v]) => Object.hasOwn(defaults, k) && ["A", "B", "C"].includes(v as string),
    );
    return { ...defaults, ...Object.fromEntries(valid) };
  } catch {
    return defaults;
  }
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { id: T; label: ReactNode }[];
  onChange: (v: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex min-w-0 shrink-0 gap-1 rounded-full bg-muted p-1">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap",
            value === o.id ? "bg-card text-foreground shadow-surface" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function InterviewNotesGallery({ data }: { data: InterviewGalleryData }) {
  const picks = parse(useSyncExternalStore(subscribe, snapshot, () => "{}"));
  const [appId, setAppId] = useState(data.applications[0].id);
  const [width, setWidth] = useState<Width>("full");
  const [copied, setCopied] = useState(false);
  const app = data.applications.find((a) => a.id === appId) ?? data.applications[0];
  const interviewed = data.applications.find((a) => a.rounds.some((r) => r.questions.length)) ?? app;
  const round = (app.rounds.find((r) => r.questions.length) ?? interviewed.rounds[0])!;
  const question = round.questions[0];
  const frame = widths.find((w) => w.id === width)!.max;

  function pick(id: SectionId, v: Variant) {
    try {
      localStorage.setItem(key, JSON.stringify({ ...picks, [id]: v }));
      window.dispatchEvent(new Event(key));
    } catch {}
  }
  const summary = sections
    .map((s) => `${s.title}: ${picks[s.id]} (${s.options.find((o) => o.letter === picks[s.id])?.name})`)
    .join("; ");

  function render(id: SectionId, v: Variant) {
    switch (id) {
      case "stage":
        return <StageDemo v={v} apps={data.applications} />;
      case "header":
        return <HeaderDemo v={v} app={app} apps={data.applications} onSelect={setAppId} stage={picks.stage} />;
      case "questions":
        return <QuestionsView v={v} round={round} />;
      case "editor":
        return question ? <EditorDemo v={v} q={question} /> : null;
      case "library":
        return <LibraryDemo v={v} entries={data.library} />;
      case "page":
        return (
          <PageDemo
            v={v}
            app={app}
            apps={data.applications}
            onSelect={setAppId}
            picks={{ stage: picks.stage, header: picks.header, questions: picks.questions }}
          />
        );
    }
  }

  return (
    <div className="pb-20">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl min-w-0">
          <h1 className="m-0 text-2xl font-semibold tracking-tight">Interview notes and application progress</h1>
          <p className="m-0 mt-2 text-sm leading-relaxed text-muted-foreground">
            Pick one option per section. Every option is live: open, scroll, type and switch the width to check how it
            behaves.
            {data.real
              ? " Your ServiceNow round 1 is the real content."
              : " Sample content: your private interview notes were not found."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void navigator.clipboard?.writeText(summary).then(() => setCopied(true))}
          className="pressable inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-2 text-sm font-medium hover:bg-muted"
        >
          {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
          {copied ? "Picks copied" : "Copy my picks"}
        </button>
      </header>

      <div className="sticky top-0 z-40 -mx-2 mt-6 flex min-w-0 flex-wrap items-center gap-2 bg-background/95 px-2 py-3 backdrop-blur">
        <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto [scrollbar-width:none]">
          <Segmented
            label="Application to preview"
            value={appId}
            onChange={setAppId}
            options={data.applications.map((a) => ({ id: a.id, label: `${a.company} · ${a.req} · ${a.phase}` }))}
          />
        </div>
        <Segmented
          label="Preview width"
          value={width}
          onChange={setWidth}
          options={widths.map((w) => ({
            id: w.id,
            label: (
              <>
                <w.icon aria-hidden size={13} />
                {w.label}
              </>
            ),
          }))}
        />
      </div>

      <nav aria-label="Sections" className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {sections.map((s) => (
          <a key={s.id} href={`#sec-${s.id}`} className="text-link">
            {s.title}
            <span className="ml-1 text-muted-foreground">({picks[s.id]})</span>
          </a>
        ))}
      </nav>

      <div className="mt-8 flex flex-col gap-16">
        {sections.map((s) => (
          <section key={s.id} id={`sec-${s.id}`} aria-labelledby={`sec-${s.id}-h`} className="scroll-mt-20">
            <h2 id={`sec-${s.id}-h`} className="m-0 text-lg font-semibold">
              {s.title}
            </h2>
            <p className="m-0 mt-1 max-w-3xl text-sm text-muted-foreground">{s.note}</p>
            <div className="mt-5 flex flex-col gap-6">
              {s.options.map((opt) => {
                const chosen = picks[s.id] === opt.letter;
                return (
                  <div
                    key={opt.letter}
                    className={cn(
                      "min-w-0 rounded-panel border bg-rail p-4 transition-colors @container sm:p-5",
                      chosen ? "border-primary ring-1 ring-primary" : "border-border",
                    )}
                  >
                    <div className="mb-4 flex min-w-0 items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="m-0 text-sm font-semibold">
                          {opt.letter}. {opt.name}
                        </p>
                        <p className="m-0 mt-0.5 text-xs text-muted-foreground">{opt.detail}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => pick(s.id, opt.letter)}
                        aria-pressed={chosen}
                        className={cn(
                          "pressable shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium",
                          chosen ? "bg-primary text-primary-foreground" : "border border-border hover:bg-muted",
                        )}
                      >
                        {chosen ? "Picked" : "Pick"}
                      </button>
                    </div>
                    <div className={cn("mx-auto w-full min-w-0 transition-[max-width] duration-300 motion-reduce:transition-none", frame)}>
                      {render(s.id, opt.letter)}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
