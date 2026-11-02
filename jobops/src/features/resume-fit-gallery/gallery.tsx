"use client";

import { useState, useSyncExternalStore } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  AdviceDemo,
  ChangesDemo,
  JobDemo,
  KeywordsDemo,
  PanelDemo,
  ScoresDemo,
  type Variant,
} from "./demos";
import type { FitOpening } from "./types";

type SectionId = "job" | "scores" | "keywords" | "changes" | "advice" | "panel";
type Picks = Record<SectionId, Variant>;

const key = "jobops-resume-fit-gallery-picks-v1";
const defaults: Picks = {
  job: "A",
  scores: "A",
  keywords: "A",
  changes: "A",
  advice: "A",
  panel: "B",
};

const sections: {
  id: SectionId;
  title: string;
  note: string;
  options: { letter: Variant; name: string; detail: string }[];
}[] = [
  {
    id: "job",
    title: "Which job this file is for",
    note: "Open the saved description to check exactly what the scores were measured against.",
    options: [
      { letter: "A", name: "A job card", detail: "Role, company, posting date and two buttons." },
      {
        letter: "B",
        name: "One tonal bar",
        detail: "Company and role in a pill; tap to read the description.",
      },
    ],
  },
  {
    id: "scores",
    title: "Scores from each tool",
    note: "Every tool scores this file and your master résumé against the same saved description.",
    options: [
      {
        letter: "A",
        name: "One shared scale",
        detail: "Three bars on 0–100; a ring marks the master.",
      },
      {
        letter: "B",
        name: "A small table",
        detail: "Master, this file and the change, side by side.",
      },
      { letter: "C", name: "One tool at a time", detail: "Tabs with each tool’s own breakdown." },
    ],
  },
  {
    id: "keywords",
    title: "What matches, and how closely",
    note: "Tap a term to see the job’s wording beside the line on your résumé that matches it.",
    options: [
      {
        letter: "A",
        name: "A ranked list",
        detail: "Must-haves first, each with a match label and count.",
      },
      {
        letter: "B",
        name: "Coloured chips",
        detail: "Everything at a glance; details open underneath.",
      },
    ],
  },
  {
    id: "changes",
    title: "What changed from your master",
    note: "Only rewording, reordering and dropping. Nothing new is claimed.",
    options: [
      { letter: "A", name: "Before and after", detail: "One row per edit; open it to compare." },
      { letter: "B", name: "Tracked changes", detail: "Word-level edits grouped by section." },
    ],
  },
  {
    id: "advice",
    title: "Suggestions from the tools",
    note: "Each suggestion says whether it was applied, and why not when it wasn’t.",
    options: [
      {
        letter: "A",
        name: "What to act on",
        detail: "Suggestions with a note on each one left alone.",
      },
      {
        letter: "B",
        name: "Every check by tool",
        detail: "Formatting, issues and missing terms per tool.",
      },
    ],
  },
  {
    id: "panel",
    title: "The whole panel",
    note: "Your picks above, assembled in the right-hand panel beside the PDF.",
    options: [
      { letter: "A", name: "Tabs", detail: "Fit, Changes and Used for, one at a time." },
      {
        letter: "B",
        name: "One scroll",
        detail: "Fit open; Changes and Used for fold away below.",
      },
    ],
  },
];

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

export function ResumeFitGallery({ openings, real }: { openings: FitOpening[]; real: boolean }) {
  const picks = parse(useSyncExternalStore(subscribe, snapshot, () => "{}"));
  const [slug, setSlug] = useState(openings[0].slug);
  const [copied, setCopied] = useState(false);
  const o = openings.find((x) => x.slug === slug) ?? openings[0];

  function pick(id: SectionId, v: Variant) {
    try {
      localStorage.setItem(key, JSON.stringify({ ...picks, [id]: v }));
      window.dispatchEvent(new Event(key));
    } catch {}
  }
  const summary = sections
    .map(
      (s) =>
        `${s.title}: ${picks[s.id]} (${s.options.find((x) => x.letter === picks[s.id])?.name})`,
    )
    .join("; ");

  return (
    <div className="pb-16">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="m-0 text-2xl font-semibold tracking-tight">Résumé fit panel options</h1>
          <p className="m-0 mt-2 text-sm leading-relaxed text-muted-foreground">
            The right-hand panel on Résumés, showing how a tailored file fits the job it was made
            for.
            {real
              ? " These are your real scores from today’s checks."
              : " Sample data: your private check results were not found."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(summary).then(() => setCopied(true));
          }}
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-2 text-sm font-medium hover:bg-muted"
        >
          {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
          {copied ? "Picks copied" : "Copy my picks"}
        </button>
      </header>

      <div className="sticky top-0 z-10 -mx-2 mt-6 overflow-x-auto bg-background/95 px-2 py-3 backdrop-blur">
        <div className="flex gap-2" role="radiogroup" aria-label="Job to preview">
          {openings.map((x) => (
            <button
              key={x.slug}
              type="button"
              role="radio"
              aria-checked={x.slug === slug}
              onClick={() => setSlug(x.slug)}
              className={cn(
                "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium",
                x.slug === slug
                  ? "bg-selected text-selected-foreground"
                  : "border border-border text-muted-foreground hover:bg-muted",
              )}
            >
              {x.company} · {x.reqId ?? x.title}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 space-y-14">
        {sections.map((s) => (
          <section key={s.id} aria-labelledby={`sec-${s.id}`}>
            <h2 id={`sec-${s.id}`} className="m-0 text-lg font-semibold">
              {s.title}
            </h2>
            <p className="m-0 mt-1 text-sm text-muted-foreground">{s.note}</p>
            <div className="mt-4 flex flex-wrap gap-5">
              {s.options.map((opt) => {
                const chosen = picks[s.id] === opt.letter;
                return (
                  <div
                    key={opt.letter}
                    className={cn(
                      "flex w-full max-w-[400px] flex-col rounded-panel border bg-card p-5 shadow-surface",
                      chosen ? "border-primary ring-1 ring-primary" : "border-border",
                    )}
                  >
                    <div className="mb-4 flex items-start gap-3">
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
                          "shrink-0 rounded-full px-3 py-1 text-xs font-medium",
                          chosen
                            ? "bg-primary text-primary-foreground"
                            : "border border-border hover:bg-muted",
                        )}
                      >
                        {chosen ? "Picked" : "Pick"}
                      </button>
                    </div>
                    <div className="border-t border-border pt-4">
                      {s.id === "job" && <JobDemo v={opt.letter} o={o} />}
                      {s.id === "scores" && <ScoresDemo v={opt.letter} o={o} />}
                      {s.id === "keywords" && <KeywordsDemo v={opt.letter} o={o} />}
                      {s.id === "changes" && <ChangesDemo v={opt.letter} o={o} />}
                      {s.id === "advice" && <AdviceDemo v={opt.letter} o={o} />}
                      {s.id === "panel" && <PanelDemo v={opt.letter} o={o} picks={picks} />}
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
