"use client";

import { useState } from "react";
import { Check, CircleDashed, CircleHelp, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Highlight } from "./bits";
import type { Chip } from "./derive";

const LABEL: Record<Chip["closeness"], string> = {
  exact: "Exact match",
  close: "Close match",
  unclear: "Unclear",
  missing: "Not on résumé",
};
const RANK: Record<Chip["closeness"], number> = { exact: 0, close: 1, unclear: 2, missing: 3 };
const tone: Record<Chip["closeness"], string> = {
  exact: "bg-success-soft text-success",
  close: "bg-warning-soft text-warning",
  unclear: "border border-warning text-warning",
  missing: "border border-dashed border-border text-muted-foreground",
};

function Badge({ closeness }: { closeness: Chip["closeness"] }) {
  const Icon = { exact: Check, close: CircleDashed, unclear: CircleHelp, missing: Minus }[
    closeness
  ];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
        tone[closeness],
      )}
    >
      <Icon size={11} aria-hidden />
      {LABEL[closeness]}
    </span>
  );
}

/** The job's wording beside the résumé lines that match it. */
export function ChipDetail({ chip }: { chip: Chip }) {
  return (
    <>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{chip.term}</span>
        <Badge closeness={chip.closeness} />
      </div>
      <div className="space-y-3 text-xs leading-relaxed">
        {chip.quote && (
          <div>
            <p className="m-0 font-medium text-muted-foreground">The job asks</p>
            <p className="m-0 mt-1 text-foreground">“{chip.quote}”</p>
          </div>
        )}
        {chip.closeness === "missing" ? (
          <p className="m-0 rounded-xl bg-card p-2.5 text-muted-foreground">
            {chip.note ?? "Not on this résumé"}
          </p>
        ) : chip.closeness === "unclear" ? (
          <p className="m-0 rounded-xl bg-card p-2.5 text-warning">The tool couldn&apos;t tell</p>
        ) : (
          <div>
            <p className="m-0 font-medium text-muted-foreground">
              Your résumé says
              {chip.where ? ` (${chip.where.count}×, in ${chip.where.places.join(", ")})` : ""}
            </p>
            {chip.evidence.map((line) => (
              <p key={line} className="m-0 mt-1 text-foreground">
                <Highlight text={line} terms={chip.matched} />
              </p>
            ))}
          </div>
        )}
        {chip.isNew && (
          <p className="m-0 text-success">New in this version: the master did not mention it.</p>
        )}
      </div>
    </>
  );
}

export function Chips({ chips }: { chips: Chip[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const onResume = chips.filter((c) => c.closeness === "exact" || c.closeness === "close").length;
  const chosen = chips.find((c) => c.term === selected);
  return (
    <section aria-label="What the job asks for">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="m-0 text-sm font-semibold">What the job asks for</h3>
        <span className="text-xs text-muted-foreground">
          {onResume} of {chips.length} on your résumé
        </span>
      </div>
      {(["required", "preferred"] as const).map((importance) => {
        const group = chips
          .filter((c) => c.importance === importance)
          .sort((a, b) => RANK[a.closeness] - RANK[b.closeness]);
        return group.length ? (
          <div key={importance} className="mt-4">
            <p className="m-0 mb-2 text-xs font-medium text-muted-foreground">
              {importance === "required" ? "Must have" : "Nice to have"}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {group.map((c) => (
                <button
                  key={c.term}
                  type="button"
                  onClick={() => setSelected(selected === c.term ? null : c.term)}
                  aria-pressed={selected === c.term}
                  aria-controls="fit-chip-detail"
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium outline-offset-2",
                    tone[c.closeness],
                    selected === c.term && "ring-2 ring-primary",
                  )}
                >
                  {c.isNew && (
                    <>
                      <Plus size={11} aria-hidden />
                      <span className="sr-only">New in this version</span>
                    </>
                  )}
                  {c.term}
                </button>
              ))}
            </div>
          </div>
        ) : null;
      })}
      <div id="fit-chip-detail" aria-live="polite" className="mt-4 rounded-2xl bg-muted p-3">
        {chosen ? (
          <ChipDetail chip={chosen} />
        ) : (
          <p className="m-0 text-xs text-muted-foreground">
            Green is an exact match, amber a close one, an amber outline means the tool
            couldn&apos;t tell and dashed isn&apos;t on the résumé. A plus marks terms this version
            added. Pick a term to see the job&apos;s wording beside yours.
          </p>
        )}
      </div>
    </section>
  );
}
