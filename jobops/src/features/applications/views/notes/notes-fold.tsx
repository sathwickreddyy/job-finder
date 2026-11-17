"use client";

import { useCallback, useId, useRef, useState } from "react";
import { ChevronRight, X } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { saveApplicationNotes } from "@/features/applications/record-actions";
import { NotesEditor } from "@/features/applications/views/page/notes-editor";
import type { ToolSummary } from "@/features/resumes/fit/derive";
import type { ToolSource } from "@/features/resumes/fit/tools";
import { cn } from "@/lib/utils";
import { NotesView } from "./notes-view";
import { parseNoteSections } from "./sections";

/** The closed line: a template note's section names, otherwise the note's first line. */
function closedLine(notes: string): string {
  const sections = parseNoteSections(notes);
  if (sections) {
    const names = [
      sections.summary !== null && "Summary",
      sections.onTheForm !== null && "On the form",
      sections.proof !== null && "Proof",
    ].filter(Boolean);
    return names.join(" · ");
  }
  const first = notes
    .split(/\r?\n/)
    .map((line) => line.replace(/^[\s#>*+-]+/, "").trim())
    .find(Boolean);
  return first ?? "No notes yet";
}

export const discardNotesPrompt = "Discard your unsaved changes to these notes?";

/**
 * Notes closed to one line, opening to the readable note with Edit notes. The "dialog" variant
 * is a card with the section names and an Open notes button; the same note opens in a dialog.
 */
export function NotesFold({
  recordId,
  notes,
  scores,
  resumesHref,
  variant = "fold",
}: {
  recordId: string;
  notes: string;
  scores: Record<ToolSource, ToolSummary> | null;
  resumesHref?: string;
  variant?: "fold" | "dialog";
}) {
  const [open, setOpen] = useState(false);
  const panel = useId();
  const dirty = useRef(false);
  const setDirty = useCallback((value: boolean) => {
    dirty.current = value;
  }, []);
  // Escape, the scrim and the close button must not drop edits the editor's Cancel would ask about.
  const close = () => {
    if (dirty.current && !window.confirm(discardNotesPrompt)) return;
    setOpen(false);
  };
  const line = closedLine(notes);
  const editor = (
    <NotesEditor
      recordId={recordId}
      notes={notes}
      save={saveApplicationNotes}
      onDirtyChange={setDirty}
      view={<NotesView notes={notes} scores={scores} resumesHref={resumesHref} />}
    />
  );
  if (variant === "dialog")
    return (
      <section aria-label="Notes" className="min-w-0 rounded-2xl bg-card p-4 ring-1 ring-border">
        <div className="flex items-center justify-between gap-3">
          <h3 className="m-0 text-sm font-semibold">Notes</h3>
          <button
            type="button"
            aria-haspopup="dialog"
            onClick={() => setOpen(true)}
            className="rounded-full text-sm font-medium text-link"
          >
            Open notes
          </button>
        </div>
        <p title={line} className="m-0 mt-1.5 truncate text-sm text-muted-foreground">
          {line}
        </p>
        {open && (
          <Modal open onClose={close} labelledBy={panel} size="lg">
            <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-3 sm:px-6">
              <h2 id={panel} className="m-0 text-base font-semibold">
                Notes
              </h2>
              <button
                type="button"
                aria-label="Close"
                onClick={close}
                className="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted"
              >
                <X aria-hidden size={18} />
              </button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
              {editor}
            </div>
          </Modal>
        )}
      </section>
    );
  return (
    <section aria-label="Notes" className="min-w-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panel}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full min-w-0 items-center gap-2 rounded-lg py-1 text-left text-sm"
      >
        <ChevronRight
          aria-hidden
          size={14}
          className={cn("shrink-0 text-muted-foreground transition-transform", open && "rotate-90")}
        />
        <span className="shrink-0 font-medium">Notes</span>
        {!open && (
          <span title={line} className="min-w-0 truncate text-muted-foreground">
            {line}
          </span>
        )}
      </button>
      {open && (
        <div id={panel} className="mt-2 pl-6">
          {editor}
        </div>
      )}
    </section>
  );
}
