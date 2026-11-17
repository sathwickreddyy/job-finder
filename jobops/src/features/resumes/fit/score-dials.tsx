import Link from "next/link";
import { cn } from "@/lib/utils";
import { Delta, fmt } from "./bits";
import { band, Ring } from "./dials";
import type { ToolSummary } from "./derive";
import { TOOL_META, TOOL_SOURCES, type ToolSource } from "./tools";

const ink = {
  "danger-action": "text-danger-action",
  warning: "text-warning",
  success: "text-success",
};

/**
 * The three tool scores stored for a submitted résumé against the application's saved job, with
 * the master's score and the change. Renders nothing when no tool has a stored result.
 */
export function ScoreDials({
  tools,
  href,
}: {
  tools: Record<ToolSource, ToolSummary>;
  href: string;
}) {
  if (TOOL_SOURCES.every((id) => "notChecked" in tools[id])) return null;
  return (
    <section aria-label="Résumé scores" className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap gap-x-6 gap-y-3">
        {TOOL_SOURCES.map((id) => {
          const summary = tools[id];
          const checked = !("notChecked" in summary);
          const value = checked ? summary.score : null;
          const base = checked ? summary.baseScore : null;
          return (
            <div key={id} className="flex w-[88px] flex-col items-center text-center">
              <div className="relative size-[88px]">
                <Ring value={value} base={base} />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span
                    className={cn(
                      "text-xl leading-none font-semibold tabular-nums",
                      value != null && ink[band(value)],
                    )}
                  >
                    {value == null ? "—" : Math.round(value)}
                  </span>
                </div>
              </div>
              <p className="m-0 mt-1.5 text-xs font-medium">{TOOL_META[id].name}</p>
              <p className="m-0 mt-0.5 text-[11px] text-muted-foreground tabular-nums">
                {!checked ? (
                  "Not checked"
                ) : base != null ? (
                  <>
                    Master {fmt(base)} <Delta value={summary.delta} />
                  </>
                ) : null}
              </p>
            </div>
          );
        })}
      </div>
      <Link href={href} className="w-fit text-xs text-link underline underline-offset-3">
        Open in Résumés
      </Link>
    </section>
  );
}
