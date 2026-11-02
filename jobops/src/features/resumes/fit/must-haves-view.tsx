import { cn } from "@/lib/utils";
import { FormatIcon } from "./bits";
import type { MustHaveRow, MustHaveState } from "./must-haves";
import type { OptimizerDetails } from "./tools";

const NEXT: Record<MustHaveState, { text: string; tone: string }> = {
  shown: { text: "Shown", tone: "text-success" },
  "add-bullet": { text: "Add a bullet", tone: "text-warning" },
  found: { text: "Found", tone: "text-muted-foreground" },
  elsewhere: { text: "Check where", tone: "text-muted-foreground" },
  unclear: { text: "Ask", tone: "text-warning" },
  missing: { text: "Missing", tone: "text-muted-foreground" },
};
const SPAN: Partial<Record<MustHaveState, string>> = {
  found: "Found, sections not checked",
  elsewhere: "Found in another section",
  unclear: "Unclear",
  missing: "Not on the résumé",
};
const cols = ["summary", "skills", "experience"] as const;

/** Where each must-have appears, and what the next revision should do about it. */
export function MustHaves({
  rows,
  hasOptimizer,
  format,
}: {
  rows: MustHaveRow[];
  hasOptimizer: boolean;
  format: OptimizerDetails["format"];
}) {
  const found = rows.filter((r) => r.state !== "missing" && r.state !== "unclear").length;
  const thin = rows.filter((r) => r.state === "add-bullet").length;
  return (
    <section aria-label="Where must-haves appear">
      <h3 className="m-0 mb-2 text-sm font-semibold">Where must-haves appear</h3>
      <div className="max-h-96 overflow-y-auto pr-1">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 bg-card">
            <tr className="text-muted-foreground">
              <th className="pb-2 text-left font-normal">Must-have</th>
              {hasOptimizer &&
                cols.map((c) => (
                  <th key={c} className="w-12 pb-2 text-center font-normal capitalize">
                    {c === "experience" ? "Exp." : c}
                  </th>
                ))}
              <th className="w-24 pb-2 text-right font-normal whitespace-nowrap">Next</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.term}
                className={cn(
                  (r.state === "missing" || r.state === "unclear") && "text-muted-foreground",
                )}
              >
                <td className="py-0.5 pr-2">{r.term}</td>
                {hasOptimizer &&
                  (r.where && r.state !== "elsewhere" ? (
                    cols.map((c) => (
                      <td key={c} className="p-0.5">
                        <div
                          className={cn(
                            "h-4 w-full rounded-[4px]",
                            r.where![c] > 0 ? "bg-primary" : "bg-muted",
                          )}
                          title={`${r.term} in ${c}: ${r.where![c] > 0 ? "yes" : "no"}`}
                        />
                      </td>
                    ))
                  ) : (
                    <td
                      colSpan={3}
                      className="py-0.5 text-center text-[11px] text-muted-foreground"
                    >
                      {SPAN[r.state]}
                    </td>
                  ))}
                <td
                  className={cn(
                    "py-0.5 pl-2 text-right text-[11px] font-medium whitespace-nowrap",
                    NEXT[r.state].tone,
                  )}
                >
                  {NEXT[r.state].text}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="m-0 mt-2 text-xs leading-relaxed text-muted-foreground">
        {!hasOptimizer
          ? "Sections need the ATS optimizer check."
          : thin
            ? `${thin} of ${found} found must-haves have no Experience mention. A reader trusts a bullet that shows the work more than a skills list.`
            : "Every found must-have is backed by an Experience mention."}
      </p>
      {format.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-medium">Formatting checks</summary>
          <ul className="m-0 mt-2 list-none space-y-1 p-0">
            {format.map((f) => (
              <li
                key={f.check}
                tabIndex={0}
                title={f.detail}
                className="group flex items-start gap-2 rounded text-xs"
              >
                <FormatIcon ok={f.ok} warn={f.warn} />
                <span>
                  {f.check}
                  <span className="hidden text-muted-foreground group-hover:block group-focus:block">
                    {f.detail}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
