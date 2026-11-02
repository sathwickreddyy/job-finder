"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { ReviewedTerm } from "../terms";

const cycle = { required: "preferred", preferred: "skip", skip: "required" } as const;
const label = { required: "Required", preferred: "Preferred", skip: "Not counted" } as const;

export function chipClass(importance: ReviewedTerm["importance"]) {
  return importance === "required"
    ? "bg-selected font-medium text-selected-foreground"
    : importance === "preferred"
      ? "border border-border text-foreground"
      : "border border-dashed border-border text-muted-foreground line-through";
}

/** The saved line a selection sits on, so an added term stays tied to the job's own words. */
function quoteFor(description: string, selected: string) {
  const line = description.split("\n").find((l) => l.includes(selected));
  return line && line.length <= 2000 ? line : selected;
}

/** Tap-to-change chips over the scoring service's suggestions, plus terms selected in the job. */
export function TermReview({
  opening,
  description,
  initial,
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  opening: { company: string; title: string };
  description: string;
  initial: ReviewedTerm[];
  busy?: boolean;
  error?: string;
  onConfirm: (terms: ReviewedTerm[]) => void;
  onCancel: () => void;
}) {
  const [terms, setTerms] = useState(initial);
  const [focus, setFocus] = useState(initial[0]?.term ?? null);
  const [adding, setAdding] = useState(initial.length === 0);
  const box = useRef<HTMLDivElement>(null);
  const count = (i: ReviewedTerm["importance"]) => terms.filter((t) => t.importance === i).length;
  const focused = terms.find((t) => t.term === focus);
  const canScore = count("required") > 0;

  function change(term: string) {
    setTerms((list) =>
      list.map((t) => (t.term === term ? { ...t, importance: cycle[t.importance] } : t)),
    );
    setFocus(term);
  }
  function addSelection() {
    const selection = window.getSelection();
    if (!selection || !box.current?.contains(selection.anchorNode)) return;
    const selected = selection.toString().replace(/\s+/g, " ").trim();
    if (!selected || selected.length > 100 || !description.includes(selected)) return;
    setTerms((list) => {
      const existing = list.find(
        (t) => t.term.toLocaleLowerCase() === selected.toLocaleLowerCase(),
      );
      if (existing)
        return list.map((t) => (t === existing ? { ...t, importance: "required" as const } : t));
      return [
        ...list,
        {
          term: selected,
          aliases: [],
          importance: "required",
          jdQuote: quoteFor(description, selected),
          added: true,
        },
      ];
    });
    setFocus(selected);
    selection.removeAllRanges();
  }

  return (
    <section aria-label="Confirm what the job requires" className="rounded-3xl bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="m-0 min-w-0 text-xs text-muted-foreground">
          {opening.company} · {opening.title}
        </p>
        <button type="button" onClick={onCancel} className="shrink-0 text-xs font-medium text-link">
          Cancel
        </button>
      </div>
      {terms.length > 0 ? (
        <>
          <p className="m-0 mt-2 text-xs text-muted-foreground">
            Suggested from the saved description. Tap a term to change it.
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {terms.map((t) => (
              <button
                key={t.term}
                type="button"
                onClick={() => change(t.term)}
                onMouseEnter={() => setFocus(t.term)}
                onFocus={() => setFocus(t.term)}
                aria-label={`${t.term}: ${label[t.importance]}`}
                className={cn(
                  "rounded-full px-3 py-1 text-xs transition-colors motion-reduce:transition-none",
                  chipClass(t.importance),
                )}
              >
                {t.term}
              </button>
            ))}
          </div>
          {focused && (
            <p className="m-0 mt-3 rounded-xl bg-muted px-3 py-2 text-xs">
              <span className="font-medium">{focused.term}</span>
              <span className="text-muted-foreground">
                {" "}
                is {label[focused.importance].toLocaleLowerCase()}. The job says:{" "}
              </span>
              “{focused.jdQuote}”
            </p>
          )}
        </>
      ) : (
        <p className="m-0 mt-2 text-xs text-muted-foreground">
          No terms were suggested for this job. Select the skills it asks for.
        </p>
      )}
      {adding ? (
        <div className="mt-3">
          <p className="m-0 mb-1.5 text-[11px] text-muted-foreground">
            Select a word or phrase below to add it as a required term.
          </p>
          <div
            ref={box}
            tabIndex={0}
            onMouseUp={addSelection}
            onKeyUp={(e) => e.shiftKey && addSelection()}
            aria-label="Saved job description"
            className="max-h-56 overflow-auto rounded-xl bg-muted p-3 text-xs leading-relaxed whitespace-pre-line select-text"
          >
            {description}
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mt-3 text-xs font-medium text-link"
        >
          Add a term from the job
        </button>
      )}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground tabular-nums">
          {count("required")} required, {count("preferred")} preferred, {count("skip")} not counted
        </span>
        <button
          type="button"
          disabled={!canScore || busy}
          onClick={() => onConfirm(terms)}
          className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover"
        >
          Score with these terms
        </button>
      </div>
      {!canScore && (
        <p className="m-0 mt-1.5 text-right text-[11px] text-muted-foreground">
          Mark at least one term as required
        </p>
      )}
      {error && <p className="m-0 mt-2 text-xs text-danger-action">{error}</p>}
    </section>
  );
}
