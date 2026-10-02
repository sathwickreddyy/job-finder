import Link from "next/link";
import { ArrowUpRight, ChevronDown } from "lucide-react";
import { StatusBadge } from "@/components/ui";
import { displayDate, type DisplayPreferences } from "@/features/candidate/preferences";
import { cn } from "@/lib/utils";
import type { Company } from "./catalog";
import { DetailTabs, QuestionBank } from "./detail-client";
import { companyActivity } from "./domain";
import { familyFill, money, payRange, reports as reportCount, stockLabel } from "./format";
import { LoopStepper, MixBar, Monogram, RangeBar, StageChip } from "./marks";
import {
  lpa,
  roundFamily,
  roundKindLabel,
  type InterviewOutcome,
  type InterviewReport,
} from "./metrics";
import type { CompaniesData } from "./read";
import { CompanyResearch } from "./research";
import { compensationAmount, publicationYear, type ResearchFact } from "./research-data";
import { CompanyResumeReference } from "./resume-reference";
import type { CompanySummary } from "./summary";

export type DetailProps = {
  company: Company;
  summary: CompanySummary;
  reports: InterviewReport[];
  data: CompaniesData;
  preferences: DisplayPreferences;
  scaleMax: number;
  /** City the visitor came from; its resume reference is listed first. */
  city?: string;
};

/* ───────── shared structure ───────── */

function Section({
  id,
  title,
  note,
  children,
}: {
  id: string;
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24 space-y-5">
      <div>
        <h2 id={`${id}-title`} className="text-xl font-semibold tracking-tight">
          {title}
        </h2>
        {note && <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{note}</p>}
      </div>
      {children}
    </section>
  );
}

const box = "rounded-card border border-border bg-card p-5 shadow-surface sm:p-6";

function nextAction(summary: CompanySummary) {
  switch (summary.stage) {
    case "Not started":
      return { label: "Save an opening", href: "/jobs/new" };
    case "Opening saved":
      return { label: "Record application", href: "/applications/new" };
    case "Interviewing":
      return { label: "Practise questions", href: "?tab=interviews#questions" };
    default:
      return { label: "View applications", href: "?tab=progress" };
  }
}

export function DetailHeader({ company, summary }: Pick<DetailProps, "company" | "summary">) {
  const action = nextAction(summary);
  const modes = [...new Set(company.locations?.flatMap((row) => row.workModes) ?? [])];
  return (
    <header className="space-y-5">
      <Link href="/companies" className="text-sm text-link">
        All companies
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="flex min-w-0 items-center gap-4">
          <Monogram name={company.name} large />
          <div className="min-w-0">
            <h1 className="text-3xl font-semibold tracking-tight">{company.name}</h1>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              <StageChip stage={summary.stage} />
              <span>{company.cities.join(", ") || "Location not recorded"}</span>
              {!!modes.length && (
                <span className="capitalize">
                  {modes.map((mode) => mode.toLowerCase()).join(", ")}
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {company.careersUrl && (
            <a
              href={company.careersUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-10 items-center gap-1.5 rounded-full border border-input px-4 text-sm font-medium text-link hover:no-underline"
            >
              Open careers
              <ArrowUpRight size={15} aria-hidden />
            </a>
          )}
          <Link
            href={action.href}
            className="flex min-h-10 items-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary-hover hover:no-underline"
          >
            {action.label}
          </Link>
        </div>
      </div>
      {company.focus && <p className="max-w-3xl text-sm text-muted-foreground">{company.focus}</p>}
    </header>
  );
}

export function MetricTiles({ summary }: Pick<DetailProps, "summary">) {
  const { metrics } = summary;
  const tiles = [
    {
      label: "Fixed pay",
      value: payRange(metrics.fixed),
      note: metrics.fixed
        ? reportCount(metrics.fixed.n)
        : metrics.payReports
          ? "Needs review"
          : "Not reported",
    },
    {
      label: "Total pay",
      value: payRange(metrics.total),
      note: metrics.total ? reportCount(metrics.total.n) : "Not reported",
    },
    {
      label: "Typical rounds",
      value: metrics.typicalRounds ? String(metrics.typicalRounds) : null,
      note: metrics.roundsRange
        ? `${metrics.roundsRange[0]}–${metrics.roundsRange[1]} across ${reportCount(metrics.interviewReports)}`
        : "Not reported",
    },
    {
      label: "Offers in reports",
      value: metrics.interviewReports
        ? `${metrics.outcomes.offer} of ${metrics.interviewReports}`
        : null,
      note: "Community outcomes",
    },
    {
      label: "Your applications",
      value: String(summary.applications),
      note: `${summary.openings} saved ${summary.openings === 1 ? "opening" : "openings"}`,
    },
  ];
  return (
    <dl className="grid grid-cols-2 gap-3 md:grid-cols-5">
      {tiles.map((tile) => (
        <div
          key={tile.label}
          className="rounded-2xl border border-border bg-card p-4 last:col-span-2 md:last:col-span-1"
        >
          <dt className="text-xs text-muted-foreground">{tile.label}</dt>
          <dd className="mt-1.5 text-lg font-semibold tabular-nums">{tile.value ?? "—"}</dd>
          <dd className="mt-0.5 text-xs text-muted-foreground">{tile.note}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ───────── pay ───────── */

function stringValue(value: unknown) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && typeof (value as { text?: unknown }).text === "string")
    return (value as { text: string }).text;
}

function payCell(data: Record<string, unknown>, numeric: string, original: string) {
  if (typeof data[numeric] === "number") return compensationAmount(data[numeric], data.currency);
  const text = stringValue(data[original]);
  return text ? (
    <span className="text-warning" title="Not normalized yet">
      {text}
    </span>
  ) : (
    <span className="text-muted-foreground">—</span>
  );
}

export function PaySection({
  summary,
  company,
  scaleMax,
}: Pick<DetailProps, "summary" | "company" | "scaleMax">) {
  const { metrics } = summary;
  const facts = (company.facts ?? []).filter((fact) => fact.category === "COMPENSATION");
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((q) => scaleMax * q);
  const variable = metrics.variablePercent.length
    ? `${Math.min(...metrics.variablePercent)}–${Math.max(...metrics.variablePercent)}% of fixed`
    : metrics.variable
      ? `${money(metrics.variable.median)} median`
      : null;
  const extras = [
    { label: "Variable", value: variable },
    {
      label: "Joining bonus",
      value: metrics.joiningBonus
        ? metrics.joiningBonus.n === 1
          ? money(metrics.joiningBonus.median)
          : `${money(metrics.joiningBonus.min)}–${money(metrics.joiningBonus.max)}`
        : null,
    },
    {
      label: "Stock",
      value: metrics.equity.length
        ? metrics.equity
            .slice(0, 2)
            .map((grant) => stockLabel(grant, " over "))
            .join(", ")
        : null,
      note: metrics.equity.length ? "Original currency, not converted" : undefined,
    },
    {
      label: "Benefits",
      value: metrics.benefits.length
        ? metrics.benefits
            .slice(0, 3)
            .map((row) => row.label)
            .join(", ")
        : null,
    },
  ];
  return (
    <Section
      id="pay"
      title="Compensation"
      note="Fixed annual pay from sourced community reports, in INR. Stock stays in the currency it was granted in."
    >
      <div className={box}>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">
              {metrics.fixed?.n === 1
                ? "Fixed annual, one report"
                : "Middle half of reports, fixed annual"}
            </p>
            <p className="mt-1 text-4xl font-semibold tracking-tight tabular-nums">
              {payRange(metrics.fixed) ?? (metrics.payReports ? "Needs review" : "Not reported")}
            </p>
          </div>
          {metrics.fixed && metrics.fixed.n > 1 && (
            <p className="text-sm text-muted-foreground sm:text-right">
              Median{" "}
              <strong className="text-foreground tabular-nums">
                ₹{lpa(metrics.fixed.median)} LPA
              </strong>
              <br />
              Lowest to highest ₹{lpa(metrics.fixed.min)}–{lpa(metrics.fixed.max)} LPA
            </p>
          )}
        </div>
        {metrics.fixed && (
          <div className="mt-8">
            <RangeBar stats={metrics.fixed} scaleMax={scaleMax} tall />
            <div
              className="mt-2 flex justify-between text-xs tabular-nums text-muted-foreground"
              aria-hidden
            >
              {ticks.map((tick) => (
                <span key={tick}>{lpa(tick)}</span>
              ))}
            </div>
          </div>
        )}
        <dl className="mt-6 grid gap-4 border-t border-border pt-5 sm:grid-cols-2 lg:grid-cols-4">
          {extras.map((item) => (
            <div key={item.label}>
              <dt className="text-xs text-muted-foreground">{item.label}</dt>
              <dd className="mt-1 text-sm font-medium tabular-nums">
                {item.value ?? (
                  <span className="font-normal text-muted-foreground">Not reported</span>
                )}
              </dd>
              {item.note && <dd className="text-xs text-muted-foreground">{item.note}</dd>}
            </div>
          ))}
        </dl>
        {metrics.payNeedsReview > 0 && (
          <p className="mt-5 rounded-2xl bg-warning-soft px-4 py-3 text-sm text-warning">
            {metrics.payNeedsReview} of {reportCount(metrics.payReports)} still store pay as text
            and are left out of the range until normalized.
          </p>
        )}
      </div>
      {!!facts.length && (
        <div className="overflow-x-auto rounded-card border border-border bg-card shadow-surface">
          <table className="min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-border [&>th]:px-4 [&>th]:py-3">
                <th>Year</th>
                <th>Role and level</th>
                <th>Experience</th>
                <th>Fixed</th>
                <th>Total</th>
                <th>Stock</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {facts.map((fact) => {
                const data = fact.data;
                const stock =
                  stringValue(data.equityOriginal) ?? (data.equityOriginal ? "Reported" : null);
                const grant = metrics.equity.find(
                  (row) => row.sourceUrl === fact.sourceUrl && row.level === data.level,
                );
                return (
                  <tr
                    key={fact.id}
                    className="border-t border-border first:border-t-0 [&>td]:px-4 [&>td]:py-3 [&>td]:align-top"
                  >
                    <td className="tabular-nums">{publicationYear(data)}</td>
                    <td>
                      {typeof data.role === "string" ? data.role : fact.title}
                      {typeof data.level === "string" && data.level !== data.role && (
                        <span className="block text-xs text-muted-foreground">{data.level}</span>
                      )}
                    </td>
                    <td className="tabular-nums">
                      {typeof data.yearsExperience === "number"
                        ? `${data.yearsExperience} yrs`
                        : "—"}
                    </td>
                    <td className="tabular-nums">
                      {payCell(data, "fixedAnnual", "fixedAnnualOriginal")}
                    </td>
                    <td className="tabular-nums">
                      {payCell(data, "totalAnnual", "totalAnnualOriginal")}
                    </td>
                    <td className="max-w-48 text-xs">
                      {grant
                        ? stockLabel(grant)
                        : (stock ?? <span className="text-muted-foreground">—</span>)}
                    </td>
                    <td>
                      <a
                        href={fact.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-link"
                      >
                        {fact.sourceKind === "LEETCODE" ? "LeetCode" : "Source"}
                        <ArrowUpRight size={13} aria-hidden />
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

/* ───────── interviews ───────── */

const outcomeTone: Record<InterviewOutcome, string> = {
  OFFER: "bg-success-soft text-success",
  REJECTED: "bg-danger-soft text-destructive",
  PENDING: "bg-warning-soft text-warning",
  WITHDREW: "bg-muted text-muted-foreground",
  UNKNOWN: "bg-muted text-muted-foreground",
};
const outcomeLabel: Record<InterviewOutcome, string> = {
  OFFER: "Offer",
  REJECTED: "Rejected",
  PENDING: "Pending",
  WITHDREW: "Withdrew",
  UNKNOWN: "Outcome unknown",
};

function ReportRow({ report }: { report: InterviewReport }) {
  return (
    <details className="group rounded-card border border-border bg-card shadow-surface">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4 [&::-webkit-details-marker]:hidden">
        <span className="w-10 text-sm tabular-nums text-muted-foreground">{report.year}</span>
        <span className="min-w-0 flex-1 basis-60">
          <span className="block font-medium">{report.role ?? report.title}</span>
          <span className="block text-xs text-muted-foreground">
            {[
              report.level,
              report.years !== undefined ? `${report.years} yrs` : null,
              `${report.roundCount} rounds`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </span>
        <span className="flex flex-wrap gap-1">
          {report.rounds.map((round, index) => (
            <span
              key={index}
              className="flex items-center gap-1 rounded-full bg-background px-2 py-0.5 text-xs"
            >
              <span
                className={cn("size-1.5 rounded-full", familyFill[roundFamily(round.kind)])}
                aria-hidden
              />
              {roundKindLabel[round.kind]}
            </span>
          ))}
        </span>
        <span
          className={cn(
            "whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium",
            outcomeTone[report.outcome],
          )}
        >
          {outcomeLabel[report.outcome]}
        </span>
        <ChevronDown
          size={18}
          aria-hidden
          className="text-muted-foreground transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="space-y-5 border-t border-border px-5 py-5">
        {report.summary && (
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{report.summary}</p>
        )}
        <ol className="space-y-4">
          {report.rounds.map((round, index) => (
            <li key={index} className="grid gap-1 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-4">
              <p className="flex items-start gap-2 text-sm font-medium">
                <span
                  className={cn(
                    "mt-1.5 size-2 shrink-0 rounded-full",
                    familyFill[roundFamily(round.kind)],
                  )}
                  aria-hidden
                />
                {round.name}
              </p>
              <div className="space-y-2 text-sm">
                {round.summary && <p className="leading-6">{round.summary}</p>}
                {!!round.questions.length && (
                  <ul className="space-y-1">
                    {round.questions.map((question) => (
                      <li key={question.text}>
                        <a
                          href={question.referenceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-link"
                        >
                          {question.text}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
                {!!round.topics.length && (
                  <p className="text-xs text-muted-foreground">{round.topics.join(", ")}</p>
                )}
              </div>
            </li>
          ))}
        </ol>
        <a
          href={report.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm text-link"
        >
          Read the full report
          <ArrowUpRight size={14} aria-hidden />
        </a>
      </div>
    </details>
  );
}

export function InterviewSection({ summary, reports }: Pick<DetailProps, "summary" | "reports">) {
  const { metrics } = summary;
  return (
    <Section
      id="interviews"
      title="Interview loop"
      note="The typical sequence comes from the report closest to the median round count. Open a report for its rounds and questions."
    >
      <div className={cn(box, "grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]")}>
        <div>
          <p className="mb-5 text-sm text-muted-foreground">
            {metrics.typicalRounds
              ? `Typically ${metrics.typicalRounds} rounds`
              : "No round details reported yet"}
          </p>
          <LoopStepper metrics={metrics} />
        </div>
        <div className="space-y-5">
          <div>
            <p className="mb-2 text-sm text-muted-foreground">Style across all reported rounds</p>
            <MixBar metrics={metrics} />
          </div>
          {!!metrics.topTopics.length && (
            <div>
              <p className="mb-2 text-sm text-muted-foreground">Most reported topics</p>
              <ul className="flex flex-wrap gap-1.5">
                {metrics.topTopics.map((row) => (
                  <li
                    key={row.topic}
                    className="rounded-full border border-border px-2.5 py-1 text-xs"
                  >
                    {row.topic}{" "}
                    <span className="tabular-nums text-muted-foreground">{row.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
      <div className="space-y-2">
        {reports.map((report) => (
          <ReportRow key={report.id} report={report} />
        ))}
        {!reports.length && (
          <p className="text-sm text-muted-foreground">No interview reports saved yet.</p>
        )}
      </div>
    </Section>
  );
}

export function QuestionsSection({ reports }: Pick<DetailProps, "reports">) {
  return (
    <Section
      id="questions"
      title="Questions to practise"
      note="Every reported question, without duplicates. Filter by round type."
    >
      <QuestionBank reports={reports} />
    </Section>
  );
}

/* ───────── your progress ───────── */

export function ProgressSection({
  company,
  data,
  preferences,
  city,
}: Pick<DetailProps, "company" | "data" | "preferences" | "city">) {
  const activity = companyActivity(company, "", data.records, data.openings);
  const cities = company.cities.length ? company.cities : ["Location not recorded"];
  const first = cities.includes(city ?? "") ? city! : cities[0];
  const ordered = [first, ...cities.filter((row) => row !== first)];
  return (
    <Section
      id="progress"
      title="Your progress"
      note="Openings you saved, applications you recorded and the resume you use here."
    >
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3 [&>*]:min-w-0">
        <div id="openings" className={box}>
          <h3 className="mb-4 font-semibold">Saved openings ({activity.allOpenings.length})</h3>
          <ul className="space-y-2">
            {activity.allOpenings.map((job) => (
              <li key={job.id} className="text-sm">
                <Link href={`/jobs/${job.id}`} className="font-medium text-link">
                  {job.title}
                </Link>
                <span className="block text-xs text-muted-foreground">
                  {job.location || "Location not recorded"}
                </span>
              </li>
            ))}
          </ul>
          {!activity.allOpenings.length && (
            <p className="text-sm text-muted-foreground">None saved yet.</p>
          )}
          <Link href="/jobs/new" className="mt-4 inline-block text-sm text-link">
            Save an opening
          </Link>
        </div>
        <div id="applications" className={box}>
          <h3 className="mb-4 font-semibold">Applications ({activity.records.length})</h3>
          <ul className="space-y-4">
            {activity.records.map((row) => (
              <li key={row.id} className="text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <Link href={`/applications/${row.id}`} className="font-medium text-link">
                    {row.title}
                  </Link>
                  <StatusBadge status={row.status} />
                </div>
                <span className="block text-xs text-muted-foreground">
                  {row.location || "Location not recorded"} ·{" "}
                  {row.appliedAt
                    ? `Sent ${displayDate(row.appliedAt, preferences)}`
                    : "Not submitted"}
                </span>
                {row.version ? (
                  <Link
                    href={`/resumes/${row.version.familyId}?version=${row.version.id}`}
                    className="mt-1 block break-all text-xs text-link"
                  >
                    {row.appliedAt ? "Submitted" : "Selected"}: {row.version.filename} (
                    {row.version.label})
                  </Link>
                ) : (
                  <span className="mt-1 block text-xs text-muted-foreground">
                    No resume file recorded
                  </span>
                )}
              </li>
            ))}
          </ul>
          {!activity.records.length && (
            <p className="text-sm text-muted-foreground">No applications recorded yet.</p>
          )}
          <Link href="/applications/new" className="mt-4 inline-block text-sm text-link">
            Record an application
          </Link>
        </div>
        <div id="resumes" className={box}>
          <h3 className="mb-4 font-semibold">Resume</h3>
          <div className="space-y-5">
            {ordered.map((row) => (
              <CompanyResumeReference key={row} company={company} city={row} data={data} />
            ))}
          </div>
          <Link href="/resumes" className="mt-5 inline-block text-sm text-link">
            Upload or revise a resume
          </Link>
        </div>
      </div>
    </Section>
  );
}

/* ───────── about and sources ───────── */

export function AboutCard({ company, preferences }: Pick<DetailProps, "company" | "preferences">) {
  return (
    <div className={box}>
      <h3 className="mb-4 font-semibold">About</h3>
      <dl className="space-y-4 text-sm">
        {company.careersUrl && (
          <div>
            <dt className="text-xs text-muted-foreground">Careers portal</dt>
            <dd className="mt-0.5 break-all">
              <a
                href={company.careersUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-link"
              >
                {new URL(company.careersUrl).hostname}
              </a>
            </dd>
          </div>
        )}
        {company.websiteUrl && (
          <div>
            <dt className="text-xs text-muted-foreground">Website</dt>
            <dd className="mt-0.5 break-all">
              <a
                href={company.websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-link"
              >
                {new URL(company.websiteUrl).hostname}
              </a>
            </dd>
          </div>
        )}
        {company.locations?.map((location) => (
          <div key={location.id}>
            <dt className="text-xs text-muted-foreground">
              {location.isPrimary ? "Primary office" : "Office"}
            </dt>
            <dd className="mt-0.5">
              {location.city}, {location.country}
              <span className="block text-xs capitalize text-muted-foreground">
                {[
                  location.workModes.map((mode) => mode.toLowerCase()).join(", "),
                  location.verificationStatus.toLowerCase().replaceAll("_", " "),
                  `seen ${displayDate(location.lastObservedAt, preferences)}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </dd>
          </div>
        ))}
        {!!company.aliases.length && (
          <div>
            <dt className="text-xs text-muted-foreground">Also recorded as</dt>
            <dd className="mt-0.5">{company.aliases.join(", ")}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}

export function SourcesSection({
  company,
  preferences,
}: Pick<DetailProps, "company" | "preferences">) {
  const facts: ResearchFact[] = company.facts ?? [];
  return (
    <Section
      id="sources"
      title="Recent sourced research"
      note="The latest 10 community conversations and all official evidence. Metrics use all saved research."
    >
      <details className={cn(box, "group")}>
        <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium [&::-webkit-details-marker]:hidden">
          Show recent research ({facts.length} saved {facts.length === 1 ? "note" : "notes"})
          <ChevronDown
            size={18}
            aria-hidden
            className="text-muted-foreground transition-transform group-open:rotate-180"
          />
        </summary>
        <div className="mt-6">
          <CompanyResearch facts={facts} preferences={preferences} />
        </div>
      </details>
    </Section>
  );
}

/* ───────── page ───────── */

export const detailTabs = ["pay", "interviews", "progress", "about"] as const;
export type DetailTab = (typeof detailTabs)[number];

/** Header and tiles stay put; tabs swap one short page at a time. The tab lives in `?tab=`. */
export function CompanyDetail(props: DetailProps & { tab: DetailTab }) {
  return (
    <div className="space-y-8">
      <DetailHeader {...props} />
      <MetricTiles {...props} />
      <DetailTabs
        key={props.tab}
        initial={props.tab}
        tabs={[
          { id: "pay", label: "Compensation", content: <PaySection {...props} /> },
          {
            id: "interviews",
            label: "Interview loop",
            content: (
              <div className="space-y-14">
                <InterviewSection {...props} />
                <QuestionsSection {...props} />
              </div>
            ),
          },
          { id: "progress", label: "Your progress", content: <ProgressSection {...props} /> },
          {
            id: "about",
            label: "About & sources",
            content: (
              <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px] [&>*]:min-w-0">
                <SourcesSection {...props} />
                <AboutCard {...props} />
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
