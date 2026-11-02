"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ClipboardCopy, Gauge, X } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { ToolSummary } from "../../fit/derive";
import { Dials } from "../../fit/dials";
import { TOOL_META, TOOL_SOURCES, type ToolSource } from "../../fit/tools";
import type { ReviewedTerm } from "../terms";
import { chipClass } from "./term-review";

export type ScoreFile = { id: string; family: string; label: string };
type Result =
  | { state: "idle" }
  | { state: "running" }
  | { state: "done"; score: number | null; found?: string[] }
  | { state: "error"; message: string };
type Results = Record<ToolSource, Result>;

const MAX_DESCRIPTION = 20_000;
const TERM_TOOLS = ["jobops-lexical", "resume-ats-optimizer"] as const;
const cycle = { required: "preferred", preferred: "skip", skip: "required" } as const;
const label = { required: "Must-have", preferred: "Nice to have", skip: "Not counted" } as const;
const idle = () => Object.fromEntries(TOOL_SOURCES.map((t) => [t, { state: "idle" }])) as Results;

async function post<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error ?? "JobOps couldn't complete this request.");
  return json as T;
}

/** Score a description: any file against pasted text, in a side sheet. Nothing is saved. */
export function ScoreTextSheet({ files, initialId }: { files: ScoreFile[]; initialId?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const close = () => {
    dialog.current?.close();
    setOpen(false);
  };
  return (
    <>
      <Button
        variant="secondary"
        className="!min-h-9 rounded-full px-4"
        aria-haspopup="dialog"
        disabled={!files.length}
        onClick={() => {
          dialog.current?.showModal();
          setOpen(true);
        }}
      >
        <Gauge size={16} aria-hidden />
        Score a description
      </Button>
      <dialog
        ref={dialog}
        onClose={() => setOpen(false)}
        aria-label="Score a description"
        className="mt-0 mr-0 ml-auto h-dvh max-h-none w-[min(34rem,100vw)] max-w-none overflow-y-auto border-l border-border bg-card p-0 text-foreground shadow-surface backdrop:bg-scrim"
      >
        <header className="flex items-start justify-between gap-3 border-b border-border p-6">
          <div>
            <h2 className="m-0 text-xl font-semibold">Score a description</h2>
            <p className="m-0 mt-2 text-xs text-muted-foreground">
              Nothing is saved. Closing clears the description and the scores.
            </p>
          </div>
          <Button type="button" size="icon" variant="ghost" onClick={close} aria-label="Close">
            <X size={20} aria-hidden />
          </Button>
        </header>
        {/* Mounted only while open, so closing clears everything. */}
        {open && <ScoreFields files={files} initialId={initialId} />}
      </dialog>
    </>
  );
}

function ScoreFields({ files, initialId }: { files: ScoreFile[]; initialId?: string }) {
  const id = useId();
  const [versionId, setVersionId] = useState(
    files.find((f) => f.id === initialId)?.id ?? files[0]?.id ?? "",
  );
  const [description, setDescription] = useState("");
  const [terms, setTermsState] = useState<ReviewedTerm[] | null>(null);
  // Taps read the latest list, even two taps before React re-renders.
  const latestTerms = useRef<ReviewedTerm[] | null>(null);
  const setTerms = (next: ReviewedTerm[] | null) => {
    latestTerms.current = next;
    setTermsState(next);
  };
  const [results, setResults] = useState<Results>(idle);
  const [suggesting, setSuggesting] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  // Answers for an older résumé or description (run), or an older term list (termRun), are dropped.
  const run = useRef(0);
  const termRun = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const tooLong = description.length > MAX_DESCRIPTION;
  const mustHaves = terms?.filter((t) => t.importance === "required") ?? [];

  function reset() {
    run.current++;
    termRun.current++;
    clearTimeout(timer.current);
    setTerms(null);
    setResults(idle());
    setError("");
  }

  function runTools(
    tools: readonly ToolSource[],
    list: ReviewedTerm[],
    token: number,
    termToken: number,
  ) {
    // ResumeNext doesn't use terms, so a later tap never drops its answer.
    const current = (tool: ToolSource) =>
      token === run.current && (tool === "resumenext" || termToken === termRun.current);
    setResults((r) => ({
      ...r,
      ...Object.fromEntries(tools.map((t) => [t, { state: "running" }])),
    }));
    for (const tool of tools)
      post<{ score: number | null; found?: string[] }>(`/api/v1/resumes/${versionId}/score-text`, {
        description,
        tool,
        ...(tool === "resumenext" ? {} : { terms: list }),
      }).then(
        (result) =>
          current(tool) && setResults((r) => ({ ...r, [tool]: { state: "done", ...result } })),
        (e: Error) =>
          current(tool) &&
          setResults((r) => ({ ...r, [tool]: { state: "error", message: e.message } })),
      );
  }

  async function score() {
    reset();
    const token = run.current;
    setSuggesting(true);
    try {
      const { terms: suggested } = await post<{ terms: ReviewedTerm[] }>(
        "/api/v1/score-text/terms",
        { description },
      );
      if (token !== run.current) return;
      if (!suggested.length) {
        setError(
          "The scoring service found no job terms in this text. Paste the full description.",
        );
        return;
      }
      setTerms(suggested);
      runTools(TOOL_SOURCES, suggested, token, termRun.current);
    } catch (e) {
      if (token === run.current) setError((e as Error).message);
    } finally {
      if (token === run.current) setSuggesting(false);
    }
  }

  function tap(term: string) {
    if (!latestTerms.current) return;
    const next = latestTerms.current.map((t) =>
      t.term === term ? { ...t, importance: cycle[t.importance] } : t,
    );
    setTerms(next);
    const token = run.current;
    const termToken = ++termRun.current;
    clearTimeout(timer.current);
    if (!next.some((t) => t.importance === "required")) {
      setResults((r) => ({
        ...r,
        ...Object.fromEntries(TERM_TOOLS.map((t) => [t, { state: "idle" }])),
      }));
      return;
    }
    setResults((r) => ({
      ...r,
      ...Object.fromEntries(TERM_TOOLS.map((t) => [t, { state: "running" }])),
    }));
    timer.current = setTimeout(() => runTools(TERM_TOOLS, next, token, termToken), 400);
  }

  const dial = (t: ToolSource): ToolSummary => {
    const r = results[t];
    return {
      score: r.state === "done" ? r.score : null,
      baseScore: null,
      delta: null,
      breakdown: [],
    };
  };
  const dials: Record<ToolSource, ToolSummary> = {
    "jobops-lexical": dial("jobops-lexical"),
    resumenext: dial("resumenext"),
    "resume-ats-optimizer": dial("resume-ats-optimizer"),
  };
  const lexical = results["jobops-lexical"];
  const found = new Set(
    (lexical.state === "done" ? (lexical.found ?? []) : []).map((t) => t.toLocaleLowerCase()),
  );
  const summary = () => {
    const file = files.find((f) => f.id === versionId);
    const line = (tool: ToolSource) => {
      const r = results[tool];
      return `${TOOL_META[tool].name}: ${r.state === "done" && r.score != null ? Math.round(r.score) : "—"}`;
    };
    const have = mustHaves.filter((t) => found.has(t.term.toLocaleLowerCase())).map((t) => t.term);
    const missing = mustHaves
      .filter((t) => !found.has(t.term.toLocaleLowerCase()))
      .map((t) => t.term);
    return [
      `Résumé: ${file?.family} — ${file?.label}`,
      TOOL_SOURCES.map(line).join(" · "),
      `Must-haves found: ${have.join(", ") || "none"}`,
      `Must-haves missing: ${missing.join(", ") || "none"}`,
      "Tool diagnostics, not an employer's ATS.",
    ].join("\n");
  };

  return (
    <div className="space-y-5 p-6">
      <div className="space-y-2">
        <label htmlFor={`${id}-file`} className="text-sm">
          Résumé
        </label>
        <select
          id={`${id}-file`}
          value={versionId}
          onChange={(e) => {
            setVersionId(e.target.value);
            reset();
          }}
        >
          {[...new Set(files.map((f) => f.family))].map((family) => (
            <optgroup key={family} label={family}>
              {files
                .filter((f) => f.family === family)
                .map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <label htmlFor={`${id}-jd`} className="text-sm">
          Job description
        </label>
        <textarea
          id={`${id}-jd`}
          rows={10}
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
            if (terms || error) reset();
          }}
          placeholder="Paste the full description: responsibilities, requirements and nice-to-haves."
        />
        <p className={cn("m-0 text-xs", tooLong ? "text-danger-action" : "text-muted-foreground")}>
          {tooLong
            ? `${description.length.toLocaleString("en-IN")} characters. ResumeNext takes up to 20,000; trim the company and benefits text.`
            : "ResumeNext sends the description and résumé text to resumenext.io."}
        </p>
      </div>
      {!terms && (
        <Button
          className="rounded-full"
          disabled={!versionId || !description.trim() || tooLong || suggesting}
          onClick={score}
        >
          <Gauge size={16} aria-hidden />
          {suggesting ? "Finding job terms…" : "Score this description"}
        </Button>
      )}
      {error && (
        <p role="alert" className="m-0 rounded-xl bg-danger-soft p-3 text-sm text-danger-action">
          {error}
        </p>
      )}
      {terms && (
        <section aria-label="Scores" className="space-y-4 border-t border-border pt-5">
          <Dials
            tools={dials}
            captions={Object.fromEntries(
              TOOL_SOURCES.flatMap((t) => {
                const r = results[t];
                if (r.state === "running") return [[t, "Checking…"]];
                if (r.state === "idle") return [[t, "Needs a must-have"]];
                return [];
              }),
            )}
            footnote="Red is under 50, amber 50–79 and green 80 or more, a JobOps display choice. Tool diagnostics, not an employer's ATS."
          />
          {TOOL_SOURCES.map((t) => {
            const r = results[t];
            return r.state === "error" ? (
              <p key={t} role="alert" className="m-0 text-xs text-danger-action">
                {TOOL_META[t].name}: {r.message}
              </p>
            ) : null;
          })}
          <div className="rounded-panel bg-muted/50 p-4">
            <p className="m-0 mb-3 text-xs font-medium">
              Scored with every suggested term as a must-have. Tap a term to change it and the
              Keyword check and ATS optimizer update.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {terms.map((t) => (
                <button
                  type="button"
                  key={t.term}
                  title={`${label[t.importance]} · ${found.has(t.term.toLocaleLowerCase()) ? "found on the résumé" : "not found"}`}
                  aria-label={`${t.term}: ${label[t.importance]}`}
                  onClick={() => tap(t.term)}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs transition-colors",
                    chipClass(t.importance),
                  )}
                >
                  {t.term}
                </button>
              ))}
            </div>
            <p className="m-0 mt-3 text-[11px] text-muted-foreground">
              Filled is a must-have, outlined is nice to have, struck out isn&apos;t counted.
              {mustHaves.length === 0 && " Mark at least one must-have to score."}
            </p>
          </div>
          <div className="flex gap-3">
            <Button
              variant="secondary"
              className="!min-h-9 rounded-full px-4"
              onClick={() => {
                void navigator.clipboard?.writeText(summary());
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? <Check size={16} aria-hidden /> : <ClipboardCopy size={16} aria-hidden />}
              {copied ? "Copied" : "Copy results"}
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
