import Link from "next/link";
import { cn } from "@/lib/utils";
import { Delta, fmt } from "./bits";
import type { FitGroup } from "./service";
import { TOOL_META, TOOL_SOURCES } from "./tools";

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Shown when a file has scores for more than its tailored job. */
export const showsComparison = (groups: FitGroup[]) =>
  groups.length > 1 || (groups.length === 1 && !groups[0].tailored);

/** One row per job the file was scored against; arrows compare with the current résumé on the same job. */
export function ComparisonTable({
  versionId,
  groups,
  selected,
}: {
  versionId: string;
  groups: FitGroup[];
  selected: string;
}) {
  const href = (snapshotId: string, rescore = false) =>
    `/resumes?file=${versionId}&fitJob=${snapshotId}${rescore ? "&rescore=1" : ""}`;
  return (
    <section aria-label="Jobs this file was scored against">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th className="pb-2 font-medium">Job</th>
            {TOOL_SOURCES.map((s) => (
              <th key={s} className="pb-2 pl-2 text-right font-medium">
                {TOOL_META[s].name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => {
            const older = TOOL_SOURCES.some((s) => g.olderTerms[s]);
            const current = g.snapshotId === selected;
            return (
              <tr
                key={g.snapshotId}
                aria-current={current ? "true" : undefined}
                className={cn("border-t border-border align-top", current && "bg-muted")}
              >
                <td className="max-w-0 py-2 pr-2 pl-1">
                  <Link
                    href={href(g.snapshotId)}
                    scroll={false}
                    className="block truncate font-medium text-foreground"
                  >
                    {g.target.company}
                  </Link>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {g.tailored ? "Tailored for" : g.target.title}
                  </span>
                  {g.earlierDescription && (
                    <span className="block text-[11px] text-muted-foreground">
                      earlier description
                    </span>
                  )}
                  {older && (
                    <span className="block text-[11px] text-warning">
                      older terms ·{" "}
                      <Link href={href(g.snapshotId, true)} scroll={false} className="font-medium">
                        Re-score
                      </Link>
                    </span>
                  )}
                </td>
                {TOOL_SOURCES.map((s) => {
                  const mine = g.mine[s]?.score ?? null;
                  const base = g.base[s]?.score ?? null;
                  return (
                    <td key={s} className="py-2 pl-2 text-right tabular-nums">
                      <span className="block text-sm font-semibold">{fmt(mine)}</span>
                      {!g.olderTerms[s] && mine != null && base != null && (
                        <Delta value={round1(mine - base)} />
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="m-0 mt-2 px-1 text-[11px] text-muted-foreground">
        Arrows compare with the current résumé on the same job.
      </p>
    </section>
  );
}
