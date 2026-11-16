"use client";

import { useId, useState } from "react";
import { ChevronRight } from "lucide-react";
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

/** Notes closed to one line, opening to the readable note with Edit notes. */
export function NotesFold({
  recordId,
  notes,
  scores,
  resumesHref,
}: {
  recordId: string;
  notes: string;
  scores: Record<ToolSource, ToolSummary> | null;
  resumesHref?: string;
}) {
  const [open, setOpen] = useState(false);
  const panel = useId();
  const line = closedLine(notes);
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
          <NotesEditor
            recordId={recordId}
            notes={notes}
            save={saveApplicationNotes}
            view={<NotesView notes={notes} scores={scores} resumesHref={resumesHref} />}
          />
        </div>
      )}
    </section>
  );
}
