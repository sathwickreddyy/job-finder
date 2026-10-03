"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export function NotesText({ text }: { text: string }) {
  const [all, setAll] = useState(false);
  if (!text) return <p className="m-0 text-sm text-muted-foreground">No notes yet.</p>;
  const long = text.split("\n").length > 4 || text.length > 320;
  return (
    <div className="flex flex-col items-start gap-1">
      <p
        className={cn(
          "m-0 text-sm whitespace-pre-wrap text-muted-foreground [overflow-wrap:anywhere]",
          long && !all && "line-clamp-4",
        )}
      >
        {text}
      </p>
      {long && (
        <button
          type="button"
          aria-expanded={all}
          onClick={() => setAll((value) => !value)}
          className="pressable rounded-full px-2 py-0.5 text-xs font-medium text-link hover:bg-muted"
        >
          {all ? "Show less" : "Show all"}
        </button>
      )}
    </div>
  );
}
