"use client";

import { createContext, useContext, useId, useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const Disclosure = createContext<{ open: boolean; toggle: () => void; panel: string } | null>(null);

/** Shares whether a narrow row has its details open between the facts row and the aside. */
export function DetailsProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const panel = useId();
  return (
    <Disclosure.Provider value={{ open, toggle: () => setOpen((value) => !value), panel }}>
      {children}
    </Disclosure.Provider>
  );
}

/** Below @3xl: one line of the main facts with a Details button that reveals the aside. */
export function CompactFacts({
  applied,
  opening,
  openingHref,
  resume,
}: {
  applied: string;
  opening: string;
  openingHref: string;
  resume: string | null;
}) {
  const state = useContext(Disclosure);
  if (!state) return null;
  const text = [applied, opening, resume ?? "No résumé"].join(" · ");
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-2xl bg-card px-3.5 py-2 text-sm ring-1 ring-border @3xl:hidden">
      <p className="m-0 flex min-w-0 flex-1 items-center gap-1.5 truncate" title={text}>
        <span className="shrink-0">{applied}</span>
        <span aria-hidden>·</span>
        <a
          href={openingHref}
          target="_blank"
          rel="noopener noreferrer"
          className="min-w-0 truncate text-link"
        >
          {opening}
        </a>
        <span aria-hidden>·</span>
        <span className="min-w-0 truncate text-muted-foreground">{resume ?? "No résumé"}</span>
      </p>
      <button
        type="button"
        aria-expanded={state.open}
        aria-controls={state.panel}
        onClick={state.toggle}
        className="inline-flex shrink-0 items-center gap-1 rounded-full text-sm font-medium text-link"
      >
        Details
        <ChevronRight
          aria-hidden
          size={14}
          className={cn("transition-transform", state.open && "rotate-90")}
        />
      </button>
    </div>
  );
}

/** The aside's slot: always shown at @3xl and up, and below it only once Details is open. */
export function AsideSlot({ children }: { children: React.ReactNode }) {
  const state = useContext(Disclosure);
  return (
    <div
      id={state?.panel}
      className={cn(
        "min-w-0 @3xl:col-start-2 @3xl:row-span-3 @3xl:row-start-1 @3xl:block",
        state?.open ? "block" : "hidden",
      )}
    >
      {children}
    </div>
  );
}
