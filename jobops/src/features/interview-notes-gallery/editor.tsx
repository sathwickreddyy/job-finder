"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { Check, Pencil, X } from "lucide-react";
import { MarkdownEditor } from "@/components/markdown/markdown-editor";
import { MarkdownView } from "@/components/markdown/markdown-view";
import { cn } from "@/lib/utils";
import { HowItWentBadge, howItWent, useEdgeFade } from "./shared";
import type { HowItWent, Question, Variant } from "./types";

type Draft = Pick<Question, "title" | "prompt" | "answer" | "interviewer" | "howItWent" | "time" | "space">;
type Setter = <K extends keyof Draft>(key: K, value: Draft[K]) => void;

const placeholders = {
  prompt: "Paste the problem: constraints, examples, the bonus they mentioned…",
  answer: "Your approach, edge cases, dry runs and code. Use ```python for code and | tables | for traces.",
  interviewer: "What they said, follow-ups they asked, hints they gave.",
};

function MetaRow({ draft, set }: { draft: Draft; set: Setter }) {
  const group = useId();
  return (
    <div className="@container flex min-w-0 flex-col gap-3">
      <input
        aria-label="Question title"
        value={draft.title}
        onChange={(e) => set("title", e.target.value)}
        className="!min-h-0 !rounded-xl !border-transparent !bg-transparent !px-0 !py-0 text-base font-semibold focus:!border-border"
      />
      <div className="flex min-w-0 flex-col gap-2 @2xl:flex-row @2xl:items-center">
        <div
          role="radiogroup"
          aria-labelledby={`${group}-label`}
          className="flex min-w-0 gap-1 overflow-x-auto rounded-full bg-muted p-1 [scrollbar-width:none]"
        >
          <span id={`${group}-label`} className="sr-only">
            How it went
          </span>
          {(Object.keys(howItWent) as HowItWent[]).map((key) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={draft.howItWent === key}
              onClick={() => set("howItWent", key)}
              className={cn(
                "shrink-0 rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap",
                draft.howItWent === key ? "bg-card text-foreground shadow-surface" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {howItWent[key].label}
            </button>
          ))}
        </div>
        <div className="flex shrink-0 gap-2">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            Time
            <input
              value={draft.time}
              onChange={(e) => set("time", e.target.value)}
              className="!min-h-8 !w-24 !rounded-full !px-3 !py-1 text-xs text-foreground"
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            Space
            <input
              value={draft.space}
              onChange={(e) => set("space", e.target.value)}
              className="!min-h-8 !w-24 !rounded-full !px-3 !py-1 text-xs text-foreground"
            />
          </label>
        </div>
      </div>
    </div>
  );
}

function SaveState({ dirty }: { dirty: boolean }) {
  return (
    <span className="text-xs text-muted-foreground" aria-live="polite">
      {dirty ? "Saving…" : "Saved"}
    </span>
  );
}

/** Pretend autosave so the gallery shows the state a real save would. */
function useDraft(q: Question) {
  const [draft, setDraft] = useState<Draft>(() => ({ ...q }));
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!dirty) return;
    const timer = window.setTimeout(() => setDirty(false), 700);
    return () => window.clearTimeout(timer);
  }, [dirty, draft]);
  const set: Setter = (key, value) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setDirty(true);
  };
  return { draft, set, dirty };
}

/* A. Side by side: Markdown on the left, the rendered note on the right. Stacks when narrow. */
function Split({ q }: { q: Question }) {
  const { draft, set, dirty } = useDraft(q);
  const { ref: previewRef, style: previewStyle } = useEdgeFade<HTMLDivElement>("y");
  return (
    <div className="@container flex min-w-0 flex-col gap-4">
      <MetaRow draft={draft} set={set} />
      <div className="grid min-w-0 grid-cols-1 overflow-hidden rounded-2xl border border-border @3xl:grid-cols-2">
        <div className="flex min-h-0 min-w-0 flex-col border-border @3xl:border-r">
          <PaneLabel>How I answered · Markdown</PaneLabel>
          <MarkdownEditor
            value={draft.answer}
            onChange={(v) => set("answer", v)}
            ariaLabel="How I answered, Markdown"
            placeholder={placeholders.answer}
            className="h-[280px] min-w-0 bg-background @3xl:h-[440px]"
          />
        </div>
        <div className="flex min-h-0 min-w-0 flex-col border-t border-border @3xl:border-t-0">
          <PaneLabel>
            Preview <SaveState dirty={dirty} />
          </PaneLabel>
          <div
            ref={previewRef}
            style={previewStyle}
            className="h-[280px] min-w-0 overflow-y-auto bg-card px-4 py-3 @3xl:h-[440px]"
          >
            <MarkdownView source={draft.answer} />
          </div>
        </div>
      </div>
    </div>
  );
}

function PaneLabel({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-border bg-muted/40 px-4 text-xs font-medium text-muted-foreground">
      {children}
    </div>
  );
}

/* B. Write and preview tabs: one pane, the full width for each. */
function Tabs({ q }: { q: Question }) {
  const { draft, set, dirty } = useDraft(q);
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [field, setField] = useState<"prompt" | "answer" | "interviewer">("answer");
  const base = useId();
  const fields = [
    ["prompt", "What they asked"],
    ["answer", "How I answered"],
    ["interviewer", "Interviewer"],
  ] as const;
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <MetaRow draft={draft} set={set} />
      <div className="overflow-hidden rounded-2xl border border-border">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/40 px-2 py-1.5">
          <div className="flex min-w-0 gap-1 overflow-x-auto [scrollbar-width:none]" role="tablist" aria-label="Section">
            {fields.map(([key, name]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={field === key}
                onClick={() => setField(key)}
                className={cn(
                  "shrink-0 rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap",
                  field === key ? "bg-selected text-selected-foreground" : "text-muted-foreground hover:bg-muted",
                )}
              >
                {name}
              </button>
            ))}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <SaveState dirty={dirty} />
            <div className="flex rounded-full bg-muted p-0.5" role="tablist" aria-label="Mode">
              {(["write", "preview"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  role="tab"
                  id={`${base}-${mode}`}
                  aria-selected={tab === mode}
                  onClick={() => setTab(mode)}
                  className={cn(
                    "rounded-full px-3 py-0.5 text-xs font-medium capitalize",
                    tab === mode ? "bg-card text-foreground shadow-surface" : "text-muted-foreground",
                  )}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>
        </div>
        {tab === "write" ? (
          <MarkdownEditor
            key={field}
            value={draft[field]}
            onChange={(v) => set(field, v)}
            ariaLabel={fields.find(([k]) => k === field)![1]}
            placeholder={placeholders[field]}
            className="h-[400px] min-w-0 bg-background"
          />
        ) : (
          <div className="h-[400px] overflow-y-auto bg-card px-4 py-3">
            {draft[field].trim() ? (
              <MarkdownView source={draft[field]} />
            ) : (
              <p className="m-0 text-sm text-muted-foreground">Nothing written yet.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* C. Read first: the note looks finished; Edit turns one section into an editor. */
function Inline({ q }: { q: Question }) {
  const { draft, set } = useDraft(q);
  const [editing, setEditing] = useState<keyof typeof placeholders | null>(null);
  const [buffer, setBuffer] = useState("");
  const sections = [
    ["prompt", "What they asked"],
    ["answer", "How I answered"],
    ["interviewer", "Interviewer"],
  ] as const;
  function start(key: keyof typeof placeholders) {
    setBuffer(draft[key]);
    setEditing(key);
  }
  function done() {
    if (editing) set(editing, buffer);
    setEditing(null);
  }
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <p className="m-0 min-w-0 flex-1 truncate text-base font-semibold">{draft.title}</p>
        <HowItWentBadge value={draft.howItWent} />
      </div>
      {sections.map(([key, name]) => (
        <section key={key} className="group min-w-0 rounded-2xl border border-border bg-card">
          <div className="flex h-10 items-center justify-between gap-2 border-b border-border px-4">
            <h4 className="m-0 text-xs font-semibold text-muted-foreground">{name}</h4>
            {editing === key ? (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium hover:bg-muted"
                >
                  <X aria-hidden size={13} /> Cancel
                </button>
                <button
                  type="button"
                  onClick={done}
                  className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary-hover"
                >
                  <Check aria-hidden size={13} /> Done
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => start(key)}
                disabled={editing !== null}
                className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-link hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Pencil aria-hidden size={12} /> Edit
              </button>
            )}
          </div>
          {editing === key ? (
            <div
              onKeyDown={(event) => {
                if (event.key === "Escape") setEditing(null);
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) done();
              }}
            >
              <MarkdownEditor
                value={buffer}
                onChange={setBuffer}
                ariaLabel={name}
                placeholder={placeholders[key]}
                autoFocus
                className="max-h-[420px] min-h-[160px] overflow-hidden bg-background [&_.cm-editor]:max-h-[420px]"
              />
              <p className="m-0 border-t border-border px-4 py-1.5 text-[11px] text-muted-foreground">
                ⌘ Enter to finish · Esc to cancel
              </p>
            </div>
          ) : (
            <div className="px-4 py-3">
              {draft[key].trim() ? (
                <MarkdownView source={draft[key]} />
              ) : (
                <button type="button" onClick={() => start(key)} className="text-sm text-link">
                  Add {name.toLowerCase()}
                </button>
              )}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

export function EditorDemo({ v, q }: { v: Variant; q: Question }) {
  if (v === "A") return <Split q={q} />;
  if (v === "B") return <Tabs q={q} />;
  return <Inline q={q} />;
}
