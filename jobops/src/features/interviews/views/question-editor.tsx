"use client";

import { useId, useState, useTransition } from "react";
import { Trash2, X } from "lucide-react";
import { Button } from "@/components/ui";
import { SplitEditor, useLeaveGuard } from "@/features/applications/views/page/notes-editor";
import { cn } from "@/lib/utils";
import { removeQuestion, saveQuestion, type QuestionActionState } from "../actions";
import { questionOutcomeValues, type InterviewQuestion } from "../types";
import { confirmCancel, draftOf, isDirty, type QuestionDraft } from "./editor-state";
import { outcomeMeta } from "./question-body";

const sections = [
  {
    key: "prompt",
    label: "What they asked",
    placeholder: "Paste the problem: constraints, examples, the follow-up they mentioned…",
  },
  {
    key: "answer",
    label: "How I answered",
    placeholder:
      "Your approach, edge cases, dry runs and code. Use ```python for code and | tables | for traces.",
  },
  {
    key: "interviewer",
    label: "Interviewer",
    placeholder: "What they said, follow-ups they asked, hints they gave.",
  },
] as const;

/**
 * Editor A for one question: title, how it went, time and space, patterns, then one
 * side-by-side Markdown editor with a section switcher. Save is explicit (button or ⌘S).
 */
export function QuestionEditor({
  applicationId,
  roundId,
  question,
  onDone,
}: {
  applicationId: string;
  roundId: string;
  question?: InterviewQuestion;
  onDone: () => void;
}) {
  const ids = useId();
  const [id, setId] = useState(question?.id);
  const [initial, setInitial] = useState(() => draftOf(question));
  const [draft, setDraft] = useState(initial);
  const [section, setSection] = useState<(typeof sections)[number]["key"]>(
    question && !question.prompt && question.answer ? "answer" : "prompt",
  );
  const [pattern, setPattern] = useState("");
  const [result, setResult] = useState<QuestionActionState>({});
  const [busy, start] = useTransition();
  const dirty = isDirty(initial, draft);
  useLeaveGuard(dirty);
  const set = <K extends keyof QuestionDraft>(key: K, value: QuestionDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const addPattern = () => {
    const value = pattern.trim();
    if (!value) return;
    if (
      !draft.patterns.some((p) => p.toLowerCase() === value.toLowerCase()) &&
      draft.patterns.length < 8
    )
      set("patterns", [...draft.patterns, value]);
    setPattern("");
  };
  const save = () => {
    if (busy || (!dirty && id)) return;
    const form = new FormData();
    form.set("applicationId", applicationId);
    form.set("roundId", roundId);
    if (id) form.set("id", id);
    form.set("title", draft.title);
    form.set("patterns", JSON.stringify(draft.patterns));
    form.set("prompt", draft.prompt);
    form.set("answer", draft.answer);
    form.set("interviewer", draft.interviewer);
    form.set("outcome", draft.outcome ?? "");
    form.set("time", draft.time);
    form.set("space", draft.space);
    const saved = draft;
    start(async () => {
      const state = await saveQuestion({}, form);
      setResult(state);
      if (!state.error) {
        setId(state.id);
        setInitial(saved);
      }
    });
  };
  const close = () => {
    if (confirmCancel(dirty, (message) => window.confirm(message))) onDone();
  };
  const remove = () => {
    if (
      !id ||
      !window.confirm(`Delete “${draft.title || "this question"}”? This cannot be undone.`)
    )
      return;
    const form = new FormData();
    form.set("id", id);
    form.set("applicationId", applicationId);
    start(async () => {
      const state = await removeQuestion({}, form);
      if (state.error) setResult(state);
      else onDone();
    });
  };
  const current = sections.find((s) => s.key === section)!;

  return (
    <div
      className="@container flex min-w-0 flex-col gap-4 rounded-2xl bg-card p-4 ring-1 ring-primary/30"
      onKeyDown={(event) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
          event.preventDefault();
          save();
        }
      }}
    >
      <input
        aria-label="Question title"
        placeholder="Question title, such as Longest substring without repeating characters"
        value={draft.title}
        maxLength={200}
        onChange={(event) => set("title", event.target.value)}
        className="text-base font-semibold"
      />
      <div className="flex min-w-0 flex-col gap-2 @2xl:flex-row @2xl:items-center">
        <div
          role="radiogroup"
          aria-labelledby={`${ids}-outcome`}
          className="flex min-w-0 gap-1 overflow-x-auto rounded-full bg-muted p-1 [scrollbar-width:none]"
        >
          <span id={`${ids}-outcome`} className="sr-only">
            How it went
          </span>
          {questionOutcomeValues.map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={draft.outcome === value}
              onClick={() => set("outcome", draft.outcome === value ? null : value)}
              className={cn(
                "shrink-0 rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap",
                draft.outcome === value
                  ? "bg-card text-foreground shadow-surface"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {outcomeMeta[value].label}
            </button>
          ))}
        </div>
        <div className="flex shrink-0 gap-2">
          {(["time", "space"] as const).map((key) => (
            <label key={key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {key === "time" ? "Time" : "Space"}
              <input
                value={draft[key]}
                maxLength={200}
                placeholder="O(n)"
                onChange={(event) => set(key, event.target.value)}
                className="!min-h-8 !w-24 !rounded-full !px-3 !py-1 text-xs text-foreground"
              />
            </label>
          ))}
        </div>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        {draft.patterns.map((p) => (
          <span
            key={p}
            className="inline-flex max-w-full items-center gap-1 rounded-full border border-border py-0.5 pr-1 pl-2.5 text-xs"
          >
            <span className="truncate">{p}</span>
            <button
              type="button"
              aria-label={`Remove ${p}`}
              onClick={() =>
                set(
                  "patterns",
                  draft.patterns.filter((x) => x !== p),
                )
              }
              className="grid size-5 place-items-center rounded-full text-muted-foreground hover:bg-muted"
            >
              <X aria-hidden size={12} />
            </button>
          </span>
        ))}
        {draft.patterns.length < 8 && (
          <input
            aria-label="Add a pattern"
            placeholder="Add a pattern, such as Sliding window"
            value={pattern}
            maxLength={60}
            onChange={(event) => setPattern(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === ",") {
                event.preventDefault();
                addPattern();
              }
            }}
            onBlur={addPattern}
            className="!min-h-8 !w-56 !max-w-full !rounded-full !px-3 !py-1 text-xs"
          />
        )}
      </div>
      <div
        role="tablist"
        aria-label="Section"
        className="flex min-w-0 gap-1 overflow-x-auto [scrollbar-width:none]"
      >
        {sections.map((s) => (
          <button
            key={s.key}
            type="button"
            role="tab"
            aria-selected={section === s.key}
            onClick={() => setSection(s.key)}
            className={cn(
              "shrink-0 rounded-full px-3 py-1.5 text-sm font-medium whitespace-nowrap",
              section === s.key
                ? "bg-selected text-selected-foreground"
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            {s.label}
            {draft[s.key].trim() && section !== s.key && (
              <span
                aria-hidden
                className="ml-1.5 inline-block size-1.5 rounded-full bg-primary align-middle"
              />
            )}
          </button>
        ))}
      </div>
      <div role="tabpanel" aria-label={current.label}>
        <SplitEditor
          key={current.key}
          value={draft[current.key]}
          onChange={(value) => set(current.key, value)}
          label={current.label}
          placeholder={current.placeholder}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          onClick={save}
          disabled={busy || (!dirty && !!id)}
          className="h-9 px-4"
        >
          {busy ? "Saving…" : id ? "Save changes" : "Save question"}
        </Button>
        <Button type="button" variant="ghost" onClick={close} disabled={busy} className="h-9 px-4">
          {dirty || !id ? "Cancel" : "Done"}
        </Button>
        <span
          role={result.error ? "alert" : "status"}
          className={cn("text-xs", result.error ? "text-destructive" : "text-muted-foreground")}
        >
          {result.error ?? (dirty ? "Unsaved changes · ⌘S to save" : (result.success ?? ""))}
        </span>
        {id && (
          <Button
            type="button"
            variant="ghost"
            onClick={remove}
            disabled={busy}
            className="ml-auto h-9 px-3 text-destructive"
          >
            <Trash2 aria-hidden size={14} /> Delete
          </Button>
        )}
      </div>
    </div>
  );
}
