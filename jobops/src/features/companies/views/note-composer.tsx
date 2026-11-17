"use client";

import { useRef, useState } from "react";
import { PenLine } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui";
import { addApplicationNote } from "@/features/applications/actions";

const placeholder = "Add a note to this application's history…";

/**
 * One rounded line for a history note. It grows as the text wraps or on Shift+Enter; Enter
 * submits.
 */
export function NoteComposer({ recordId }: { recordId: string }) {
  const field = useRef<HTMLTextAreaElement>(null);
  const [message, setMessage] = useState("");
  const [empty, setEmpty] = useState(true);
  const fit = () => {
    const element = field.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  };
  return (
    <div className="space-y-2">
      {message && (
        <p
          role="status"
          className="m-0 rounded-2xl bg-foreground p-3 text-sm text-background shadow-surface"
        >
          {message}
        </p>
      )}
      <ActionForm
        action={addApplicationNote}
        className="space-y-0"
        onSuccess={(text) => {
          setMessage(text);
          setEmpty(true);
          if (field.current) {
            field.current.value = "";
            fit();
          }
        }}
      >
        <input type="hidden" name="id" value={recordId} />
        <div className="flex items-end gap-2.5 rounded-3xl bg-muted/60 py-1.5 pr-1.5 pl-3.5 ring-1 ring-border transition-shadow focus-within:ring-2 focus-within:ring-primary">
          <PenLine aria-hidden size={15} className="mb-2.5 shrink-0 text-muted-foreground" />
          <textarea
            ref={field}
            name="summary"
            rows={1}
            required
            maxLength={20000}
            aria-label={placeholder}
            placeholder={placeholder}
            onInput={(event) => {
              setMessage("");
              setEmpty(event.currentTarget.value.trim() === "");
              fit();
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }}
            className="!m-0 !min-h-9 max-h-40 min-w-0 flex-1 resize-none !border-0 !bg-transparent !px-0 !py-[7px] text-sm leading-snug outline-none focus:!border-0 focus-visible:outline-none"
          />
          <Button size="sm" className="h-9 shrink-0 rounded-full px-4" disabled={empty}>
            Add
          </Button>
        </div>
      </ActionForm>
    </div>
  );
}
