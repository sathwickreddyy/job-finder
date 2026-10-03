"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export function NotesText({ text }: { text: string }) {
  const [all, setAll] = useState(false);
  const [clipped, setClipped] = useState(false);
  const paragraph = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    const node = paragraph.current;
    if (!node) return;
    // The same note may fit on desktop and overflow on a phone.
    const observer = new ResizeObserver(() => {
      const lineHeight = Number.parseFloat(getComputedStyle(node).lineHeight);
      setClipped(node.scrollHeight > Math.ceil(lineHeight * 4) + 1);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [text]);
  if (!text) return <p className="m-0 text-sm text-muted-foreground">No notes yet.</p>;
  return (
    <div className="flex flex-col items-start gap-1">
      <p
        ref={paragraph}
        className={cn(
          "m-0 text-sm whitespace-pre-wrap text-muted-foreground [overflow-wrap:anywhere]",
          !all && "line-clamp-4",
        )}
      >
        {text}
      </p>
      {(clipped || all) && (
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
