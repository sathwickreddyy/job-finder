"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import { Delta, fmt, FormatIcon, ScaleBar } from "./bits";
import type { ToolSummary } from "./derive";
import { TOOL_META, TOOL_SOURCES, type OptimizerDetails, type ToolSource } from "./tools";

/** One tool at a time: this file's score, the master's, and the tool's own breakdown. */
export function Scores({
  tools,
  format,
}: {
  tools: Record<ToolSource, ToolSummary>;
  format: OptimizerDetails["format"];
}) {
  const [tab, setTab] = useState<ToolSource>(TOOL_SOURCES[0]);
  const refs = useRef<Partial<Record<ToolSource, HTMLButtonElement | null>>>({});
  function onKey(event: KeyboardEvent) {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const n = TOOL_SOURCES.length;
    const next = TOOL_SOURCES[(TOOL_SOURCES.indexOf(tab) + step + n) % n];
    setTab(next);
    refs.current[next]?.focus();
  }
  return (
    <section aria-label="Scores against this job">
      <div
        role="tablist"
        aria-label="Scoring tool"
        onKeyDown={onKey}
        className="flex gap-1 rounded-full bg-muted p-1"
      >
        {TOOL_SOURCES.map((id) => (
          <button
            key={id}
            ref={(el) => {
              refs.current[id] = el;
            }}
            id={`fit-tab-${id}`}
            role="tab"
            type="button"
            aria-selected={tab === id}
            aria-controls={`fit-panel-${id}`}
            tabIndex={tab === id ? 0 : -1}
            onClick={() => setTab(id)}
            className={cn(
              "flex-1 rounded-full px-2 py-1.5 text-xs font-medium",
              tab === id ? "bg-card text-foreground shadow-surface" : "text-muted-foreground",
            )}
          >
            {TOOL_META[id].name}
          </button>
        ))}
      </div>
      {TOOL_SOURCES.map((id) => {
        const s = tools[id];
        return (
          <div
            key={id}
            id={`fit-panel-${id}`}
            role="tabpanel"
            aria-labelledby={`fit-tab-${id}`}
            hidden={tab !== id}
            className="mt-4"
          >
            {"notChecked" in s ? (
              <p className="m-0 rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                Not checked yet
              </p>
            ) : (
              <>
                <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
                  <span className="text-4xl font-semibold leading-none tabular-nums">
                    {fmt(s.score)}
                  </span>
                  <span className="pb-1 text-sm text-muted-foreground">
                    from {fmt(s.baseScore)} on the master
                  </span>
                  <span className="pb-1">
                    <Delta value={s.delta} />
                  </span>
                </div>
                <p className="m-0 mt-2 text-xs text-muted-foreground">
                  {TOOL_META[id].method}{" "}
                  <span className="whitespace-nowrap">({TOOL_META[id].by})</span>
                </p>
                <div className="mt-4 space-y-2.5">
                  {s.breakdown.map((b) => (
                    <div key={b.label}>
                      <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
                        <span>{b.label}</span>
                        <span className="shrink-0 tabular-nums">
                          <span className="text-muted-foreground">{fmt(b.base)} → </span>
                          <span className="font-medium">{fmt(b.mine)}</span>
                          {b.target != null && (
                            <span className="text-muted-foreground"> (aim {b.target}+)</span>
                          )}
                        </span>
                      </div>
                      <ScaleBar base={b.base} mine={b.mine} target={b.target} />
                    </div>
                  ))}
                  {id === "resume-ats-optimizer" && format.length > 0 && (
                    <ul className="m-0 list-none space-y-1 p-0 pt-1">
                      {format.map((f) => (
                        <li key={f.check} className="flex items-start gap-2 text-xs">
                          <FormatIcon ok={f.ok} warn={f.warn} />
                          <span>{f.check}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
          </div>
        );
      })}
      <p className="m-0 mt-3 text-[11px] text-muted-foreground">
        Tool diagnostics, not an employer&apos;s ATS.
      </p>
    </section>
  );
}
