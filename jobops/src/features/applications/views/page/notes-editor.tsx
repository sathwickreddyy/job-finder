"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { Pencil } from "lucide-react";
import { MarkdownEditor } from "@/components/markdown/markdown-editor";
import { MarkdownView } from "@/components/markdown/markdown-view";
import { Button } from "@/components/ui";
import { useEdgeFade } from "@/lib/use-edge-fade";
import { cn } from "@/lib/utils";
import type { ActionState } from "@/lib/actions";

export function PaneLabel({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-border bg-muted/40 px-4 text-xs font-medium text-muted-foreground">
      {children}
    </div>
  );
}

/**
 * Asks before leaving the page while there are unsaved edits: on reload or tab close, and on
 * in-app links, which navigate without unloading the page.
 */
export function useLeaveGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    const guardLinks = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (
        !(link instanceof HTMLAnchorElement) ||
        link.target === "_blank" ||
        link.hasAttribute("download")
      )
        return;
      const to = new URL(link.href, window.location.href);
      const here = window.location;
      if (to.origin !== here.origin || (to.pathname === here.pathname && to.search === here.search))
        return;
      if (!window.confirm("Leave this page? Your unsaved changes will be lost.")) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", guardLinks, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", guardLinks, true);
    };
  }, [dirty]);
}

/**
 * Editor A: Markdown on the left and the rendered note on the right, stacked below 768px.
 * Save is explicit (button or ⌘S / Ctrl+S).
 */
export function SplitEditor({
  value,
  onChange,
  label,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
}) {
  const { ref, style } = useEdgeFade<HTMLDivElement>("y");
  return (
    <div className="@container min-w-0">
      <div className="grid min-w-0 grid-cols-1 overflow-hidden rounded-2xl border border-border @3xl:grid-cols-2">
        <div className="flex min-h-0 min-w-0 flex-col border-border @3xl:border-r">
          <PaneLabel>{label} · Markdown</PaneLabel>
          <MarkdownEditor
            value={value}
            onChange={onChange}
            ariaLabel={`${label}, Markdown`}
            placeholder={placeholder}
            className="h-[260px] min-w-0 bg-background @3xl:h-[420px]"
          />
        </div>
        <div className="flex min-h-0 min-w-0 flex-col border-t border-border @3xl:border-t-0">
          <PaneLabel>Preview</PaneLabel>
          <div
            ref={ref}
            style={style}
            className="h-[260px] min-w-0 overflow-y-auto bg-card px-4 py-3 @3xl:h-[420px]"
          >
            {value.trim() ? (
              <MarkdownView source={value} />
            ) : (
              <p className="m-0 text-sm text-muted-foreground">Nothing written yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** The application's notes as Markdown, with an Edit button that opens the side-by-side editor. */
export function NotesEditor({
  recordId,
  notes,
  save,
  view,
  onDirtyChange,
}: {
  recordId: string;
  /** Tells a host (such as a dialog) whether there are unsaved edits it must not discard. */
  onDirtyChange?: (dirty: boolean) => void;
  notes: string;
  /** Replaces the plain Markdown rendering shown while not editing. */
  view?: ReactNode;
  save: (state: ActionState, form: FormData) => Promise<ActionState>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(notes);
  const [result, setResult] = useState<ActionState>({});
  const [saving, start] = useTransition();
  const editButton = useRef<HTMLButtonElement>(null);
  const dirty = editing && draft !== notes;
  useLeaveGuard(dirty);
  useEffect(() => {
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
  }, [dirty, onDirtyChange]);

  const submit = () => {
    if (saving || !dirty) return;
    const form = new FormData();
    form.set("id", recordId);
    form.set("notes", draft);
    start(async () => {
      const state = await save({}, form);
      setResult(state);
      if (!state.error) {
        setEditing(false);
        requestAnimationFrame(() => editButton.current?.focus());
      }
    });
  };
  const cancel = () => {
    if (dirty && !window.confirm("Discard your unsaved changes to these notes?")) return;
    setDraft(notes);
    setEditing(false);
    setResult({});
  };

  if (!editing)
    return (
      <div className="flex min-w-0 flex-col gap-3">
        {view ? (
          view
        ) : notes.trim() ? (
          <MarkdownView source={notes} />
        ) : (
          <p className="m-0 text-sm text-muted-foreground">
            Nothing yet. Keep prep notes, who you spoke to and what to ask next here.
          </p>
        )}
        <div className="flex items-center gap-3">
          <Button
            ref={editButton}
            type="button"
            variant="outline"
            size="sm"
            className="h-9 rounded-full px-4"
            onClick={() => {
              setDraft(notes);
              setResult({});
              setEditing(true);
            }}
          >
            <Pencil aria-hidden size={14} />
            {notes.trim() ? "Edit notes" : "Write notes"}
          </Button>
          {result.success && (
            <span role="status" className="text-xs text-muted-foreground">
              {result.success}
            </span>
          )}
        </div>
      </div>
    );

  return (
    <div
      className="flex min-w-0 flex-col gap-3"
      onKeyDown={(event) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
          event.preventDefault();
          submit();
        }
      }}
    >
      <SplitEditor
        value={draft}
        onChange={setDraft}
        label="Notes"
        placeholder="Markdown works: **bold**, - lists, ```code``` and | tables |."
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={submit} disabled={saving || !dirty} className="h-9 px-4">
          {saving ? "Saving…" : "Save notes"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={cancel}
          disabled={saving}
          className="h-9 px-4"
        >
          Cancel
        </Button>
        <span
          role={result.error ? "alert" : "status"}
          className={cn("text-xs", result.error ? "text-destructive" : "text-muted-foreground")}
        >
          {result.error ?? (dirty ? "Unsaved changes · ⌘S to save" : "")}
        </span>
      </div>
    </div>
  );
}
