"use client";

import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/** Height animates from 0 to content; collapsed content is inert so Tab skips it. */
export function Expand({ open, id, children }: { open: boolean; id?: string; children: ReactNode }) {
  return (
    <div
      id={id}
      className="grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none"
      style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
    >
      <div className="min-h-0 overflow-hidden" inert={!open}>
        {children}
      </div>
    </div>
  );
}

export function ExpandButton({
  open,
  onClick,
  controls,
  label,
}: {
  open: boolean;
  onClick: () => void;
  controls: string;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={controls}
      aria-label={label}
      onClick={onClick}
      className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted"
    >
      <ChevronDown
        aria-hidden
        size={17}
        className={cn("transition-transform duration-300 motion-reduce:transition-none", open && "rotate-180")}
      />
    </button>
  );
}
