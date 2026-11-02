import { cn } from "@/lib/utils";
import { Delta, fmt } from "./bits";
import type { ToolSummary } from "./derive";
import { TOOL_META, TOOL_SOURCES, type ToolSource } from "./tools";

// Display bands only; no tool calls a score good or bad.
const band = (v: number) => (v < 50 ? "danger-action" : v < 80 ? "warning" : "success");
const stroke = {
  "danger-action": "stroke-danger-action",
  warning: "stroke-warning",
  success: "stroke-success",
};
const ink = {
  "danger-action": "text-danger-action",
  warning: "text-warning",
  success: "text-success",
};

const CAPTIONS: Record<ToolSource, string> = {
  "jobops-lexical": "Job terms found, must-haves count 3×",
  resumenext: "Document quality and tailoring",
  "resume-ats-optimizer": "Must-haves found",
};

function Ring({ value, base }: { value: number | null; base: number | null }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const a = base != null ? ((base / 100) * 360 - 90) * (Math.PI / 180) : null;
  return (
    <svg viewBox="0 0 84 84" className="size-full" aria-hidden>
      <circle cx="42" cy="42" r={r} fill="none" strokeWidth="7" className="stroke-muted" />
      {value != null && (
        <circle
          cx="42"
          cy="42"
          r={r}
          fill="none"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={`${(c * value) / 100} ${c}`}
          transform="rotate(-90 42 42)"
          className={stroke[band(value)]}
        />
      )}
      {a != null && (
        <line
          x1={42 + 27 * Math.cos(a)}
          y1={42 + 27 * Math.sin(a)}
          x2={42 + 41 * Math.cos(a)}
          y2={42 + 41 * Math.sin(a)}
          strokeWidth="2.5"
          strokeLinecap="round"
          className="stroke-foreground/60"
        />
      )}
    </svg>
  );
}

/** Each tool's score of 100, coloured by band, with a tick and change from the current résumé. */
export function Dials({
  tools,
  captions = {},
}: {
  tools: Record<ToolSource, ToolSummary>;
  captions?: Partial<Record<ToolSource, string>>;
}) {
  return (
    <section aria-label="Scores against this job">
      <div className="grid grid-cols-3 gap-2">
        {TOOL_SOURCES.map((id) => {
          const s = tools[id];
          const checked = !("notChecked" in s);
          const value = checked ? s.score : null;
          const base = checked ? s.baseScore : null;
          return (
            <div key={id} className="flex flex-col items-center text-center">
              <div className="relative size-24">
                <Ring value={value} base={base} />
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span
                    className={cn(
                      "text-xl leading-none font-semibold tabular-nums",
                      value != null && ink[band(value)],
                    )}
                  >
                    {value == null ? "—" : Math.round(value)}
                  </span>
                  <span className="mt-0.5 text-[10px] text-muted-foreground">of 100</span>
                </div>
              </div>
              <p className="m-0 mt-2 text-xs font-medium">{TOOL_META[id].name}</p>
              <p className="m-0 mt-0.5 text-[11px] leading-snug text-muted-foreground">
                {checked ? (captions[id] ?? CAPTIONS[id]) : "Not checked yet"}
              </p>
              {checked && base != null && (
                <p className="m-0 mt-1 text-[11px] text-muted-foreground tabular-nums">
                  Current {fmt(base)} <Delta value={s.delta} />
                </p>
              )}
            </div>
          );
        })}
      </div>
      {TOOL_SOURCES.some((id) => "notChecked" in tools[id]) && (
        <p className="m-0 mt-3 text-[11px] text-warning">
          The résumé rewrite rule needs all three checks.
        </p>
      )}
      <p className="m-0 mt-3 text-[11px] leading-relaxed text-muted-foreground">
        Red is under 50, amber 50–79 and green 80 or more. The bands are a JobOps display choice (80
        is the ATS optimizer&apos;s suggestion), not a verdict from any tool. The tick marks the
        current résumé. Tool diagnostics, not an employer&apos;s ATS.
      </p>
    </section>
  );
}
