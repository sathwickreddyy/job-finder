"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  companyViews,
  payExtras,
  payRange,
  reports,
  stockLabel,
  styleLine,
  typicalGrant,
  type CompanyView,
} from "./format";
import { MixBar, Monogram, RangeBar, StageChip } from "./marks";
import { lpa, pipelineStages } from "./metrics";
import type { CompanySummary } from "./summary";

export function ViewSwitcher({
  view,
  hrefs,
}: {
  view: CompanyView;
  hrefs: Record<CompanyView, string>;
}) {
  return (
    <nav aria-label="Company views" className="inline-flex rounded-full border border-input p-0.5">
      {companyViews.map(({ id, label, icon: Icon }) => (
        <Link
          key={id}
          href={hrefs[id]}
          aria-current={view === id ? "page" : undefined}
          className={cn(
            "flex min-h-10 items-center gap-2 rounded-full px-4 text-sm font-medium hover:no-underline",
            view === id
              ? "bg-selected text-selected-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon size={16} aria-hidden />
          {label}
        </Link>
      ))}
    </nav>
  );
}

/** City chips with company counts; `city: null` is the "All cities" option. */
export function CityFilter({
  active,
  options,
}: {
  active: string | null;
  options: { city: string | null; label: string; count: number; href: string }[];
}) {
  return (
    <nav aria-label="Filter by city" className="flex flex-wrap gap-2">
      {options.map((option) => (
        <Link
          key={option.label}
          href={option.href}
          aria-current={active === option.city ? "page" : undefined}
          className={cn(
            "flex min-h-9 items-center gap-2 rounded-full px-3.5 text-sm font-medium hover:no-underline",
            active === option.city
              ? "bg-selected text-selected-foreground"
              : "border border-border text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
          <span className="tabular-nums opacity-70">{option.count}</span>
        </Link>
      ))}
    </nav>
  );
}

/* ───────── Grid (2B with compensation extras) ───────── */

export function CompanyGridCard({
  company,
  href,
  label = `View ${company.name}`,
}: {
  company: CompanySummary;
  href: string;
  label?: string;
}) {
  const { metrics } = company;
  const extras = payExtras(metrics);
  const fixed = payRange(metrics.fixed);
  return (
    <Link
      href={href}
      aria-label={label}
      className="group block h-full rounded-card text-foreground hover:no-underline"
    >
      <article className="flex h-full flex-col rounded-card border border-border bg-card p-5 shadow-surface transition-[border-color] group-hover:border-primary group-focus-visible:border-primary">
        <div className="flex items-start gap-3">
          <Monogram name={company.name} />
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-semibold tracking-tight">{company.name}</h3>
            <p className="mt-0.5 truncate text-sm text-muted-foreground">
              {company.focus || company.cities.join(", ")}
            </p>
          </div>
          <StageChip stage={company.stage} />
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-3 [&>*]:min-w-0">
          <div className="rounded-2xl bg-background p-3">
            <dt className="text-xs text-muted-foreground">Fixed pay</dt>
            <dd className="mt-1 text-xl font-semibold tabular-nums">
              {fixed ? (
                <>
                  {fixed.replace(" LPA", "")}
                  <span className="ml-1 text-xs font-normal text-muted-foreground">LPA</span>
                </>
              ) : (
                <span className="text-base font-normal text-muted-foreground">
                  {metrics.payReports ? "Needs review" : "Not reported"}
                </span>
              )}
            </dd>
          </div>
          <div className="rounded-2xl bg-background p-3">
            <dt className="text-xs text-muted-foreground">Typical rounds</dt>
            <dd className="mt-1 text-xl font-semibold tabular-nums">
              {metrics.typicalRounds ?? (
                <span className="text-base font-normal text-muted-foreground">Not reported</span>
              )}
              {metrics.roundsRange && metrics.roundsRange[0] !== metrics.roundsRange[1] && (
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  ({metrics.roundsRange[0]}–{metrics.roundsRange[1]})
                </span>
              )}
            </dd>
          </div>
        </dl>

        <ul className="mt-3 flex min-h-7 flex-wrap gap-1.5" aria-label="Bonus, stock and benefits">
          {extras.map((item) => (
            <li key={item} className="rounded-full bg-muted px-2.5 py-1 text-xs tabular-nums">
              {item}
            </li>
          ))}
          {!extras.length && (
            <li className="py-1 text-xs text-muted-foreground">No bonus or stock reported</li>
          )}
        </ul>

        <div className="mt-4">
          <MixBar metrics={metrics} />
        </div>

        <div className="mt-auto pt-5">
          <div className="flex items-center justify-between gap-3 border-t border-border pt-4 text-xs text-muted-foreground">
            <span>
              {metrics.payReports} pay ·{" "}
              {reports(metrics.interviewReports).replace("report", "interview report")}
            </span>
            <span className="flex items-center gap-1 text-sm font-medium text-link">
              View company
              <ChevronRight size={16} aria-hidden />
            </span>
          </div>
        </div>
      </article>
    </Link>
  );
}

/* ───────── Compare (3A) ───────── */

type SortKey = "pay" | "rounds" | "name";
const sorts: { id: SortKey; label: string }[] = [
  { id: "pay", label: "Fixed pay" },
  { id: "rounds", label: "Fewest rounds" },
  { id: "name", label: "Name" },
];

export function CompareTable({
  companies,
  scaleMax,
  basePath,
  linkQuery = "",
}: {
  companies: CompanySummary[];
  scaleMax: number;
  basePath: string;
  /** Appended to company links, e.g. "?city=Hyderabad" so the company page follows the filter. */
  linkQuery?: string;
}) {
  const [key, setKey] = useState<SortKey>("pay");
  const sorted = useMemo(
    () =>
      [...companies].sort((a, b) => {
        if (key === "name") return a.name.localeCompare(b.name);
        if (key === "pay")
          return (
            (b.metrics.fixed?.median ?? -1) - (a.metrics.fixed?.median ?? -1) ||
            a.name.localeCompare(b.name)
          );
        return (
          (a.metrics.typicalRounds ?? 99) - (b.metrics.typicalRounds ?? 99) ||
          a.name.localeCompare(b.name)
        );
      }),
    [companies, key],
  );
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        Sort by
        {sorts.map((sort) => (
          <button
            key={sort.id}
            type="button"
            onClick={() => setKey(sort.id)}
            aria-pressed={key === sort.id}
            className={cn(
              "min-h-9 rounded-full px-3.5 text-sm font-medium",
              key === sort.id
                ? "bg-selected text-selected-foreground"
                : "border border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {sort.label}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto rounded-card border border-border bg-card shadow-surface">
        <table className="min-w-[720px] md:min-w-[980px]">
          <thead>
            <tr className="border-b border-border [&>th]:px-4 [&>th]:py-3 [&>th]:align-bottom">
              <th>Company</th>
              <th className="md:w-[30%]">
                Fixed pay, LPA
                {/* The range bar needs width to read; phones get the plain range instead. */}
                <span className="mt-1 hidden justify-between pr-20 font-normal tabular-nums md:flex">
                  <span>0</span>
                  <span>{lpa(scaleMax / 2)}</span>
                  <span>{lpa(scaleMax)}</span>
                </span>
              </th>
              <th>Total pay, LPA</th>
              <th>Rounds</th>
              <th className="w-[14%]">Style</th>
              <th>Stock</th>
              <th>Stage</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((company) => {
              const { metrics } = company;
              const grant = typicalGrant(metrics.equity);
              return (
                <tr
                  key={company.id}
                  className="border-t border-border first:border-t-0 hover:bg-background [&>td]:px-4 [&>td]:py-3"
                >
                  <td>
                    <Link
                      href={`${basePath}/${company.id}${linkQuery}`}
                      className="font-medium text-foreground"
                    >
                      {company.name}
                    </Link>
                    <span className="block text-xs text-muted-foreground">
                      {company.cities.join(", ")}
                    </span>
                  </td>
                  <td>
                    {metrics.fixed ? (
                      <div className="flex items-center gap-3">
                        <div className="hidden flex-1 md:block">
                          <RangeBar stats={metrics.fixed} scaleMax={scaleMax} />
                        </div>
                        <span className="whitespace-nowrap text-sm tabular-nums md:w-16 md:text-right md:text-xs">
                          {payRange(metrics.fixed)!.replace(" LPA", "").replace("₹", "")}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {metrics.payReports ? "Needs review" : "Not reported"}
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap text-sm tabular-nums">
                    {payRange(metrics.total)?.replace(" LPA", "").replace("₹", "") ?? (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="tabular-nums">{metrics.typicalRounds ?? "—"}</td>
                  <td>
                    <MixBar metrics={metrics} labels={false} />
                  </td>
                  <td className="text-sm tabular-nums">
                    {grant ? stockLabel(grant) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td>
                    <StageChip stage={company.stage} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="hidden text-xs text-muted-foreground md:block">
        Shaded band: middle half of reports. Tick: median. Whiskers: lowest to highest. Hover a dot
        for its level.
      </p>
    </div>
  );
}

/* ───────── Pipeline (4A) ───────── */

export function PipelineBoard({
  companies,
  basePath,
  linkQuery = "",
}: {
  companies: CompanySummary[];
  basePath: string;
  /** Appended to company links, e.g. "?city=Hyderabad" so the company page follows the filter. */
  linkQuery?: string;
}) {
  const moving = companies.some((company) => company.stage !== "Not started");
  return (
    <div className="space-y-4">
      {!moving && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-card bg-selected p-4 text-selected-foreground">
          <p className="text-sm">
            Nothing is in motion yet. Save an opening for a company to start your pipeline.
          </p>
          <Link
            href="/jobs/new"
            className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:no-underline"
          >
            Save an opening
          </Link>
        </div>
      )}
      <div className="flex gap-3 overflow-x-auto pb-2 xl:grid xl:grid-cols-6 xl:overflow-visible">
        {pipelineStages.map((stage) => {
          const rows = companies.filter((company) => company.stage === stage);
          return (
            <section
              key={stage}
              aria-label={stage}
              className="flex w-60 shrink-0 flex-col rounded-card bg-rail p-3 xl:w-auto"
            >
              <h3 className="mb-3 flex items-center justify-between px-1 text-sm font-medium">
                {stage}
                <span className="rounded-full bg-muted px-2 text-xs tabular-nums text-muted-foreground">
                  {rows.length}
                </span>
              </h3>
              <div className="max-h-[60vh] space-y-2 overflow-y-auto">
                {rows.map((company) => (
                  <Link
                    key={company.id}
                    href={`${basePath}/${company.id}${linkQuery}`}
                    className="block rounded-2xl border border-border bg-card p-3 text-foreground hover:border-primary hover:no-underline"
                  >
                    <p className="text-sm font-medium">{company.name}</p>
                    <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                      {payRange(company.metrics.fixed) ??
                        (company.metrics.payReports ? "Pay needs review" : "Pay not reported")}
                      {company.metrics.typicalRounds ? ` · ${styleLine(company.metrics)}` : ""}
                    </p>
                  </Link>
                ))}
                {!rows.length && (
                  <p className="rounded-2xl border border-dashed border-border p-3 text-xs text-muted-foreground">
                    None yet
                  </p>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
