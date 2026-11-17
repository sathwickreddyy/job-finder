import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { formatDay } from "@/features/applications/dates";
import { normalizeCompany } from "@/features/applications/lanes";
import { mailHref } from "@/features/timeline/query";
import { cn } from "@/lib/utils";
import type { CompanyApplications } from "../applications";
import { Monogram, StageChip } from "../marks";
import type { PipelineStage } from "../metrics";
import { PreviousBadge, StatusPill } from "../status-pill";
import { HeaderMenu } from "./header-menu";

const dueTone = {
  now: "text-link font-medium",
  late: "text-warning font-medium",
  calm: "text-muted-foreground",
};

function Cell({
  label,
  tone,
  children,
}: {
  label: string;
  tone?: "warning";
  children: React.ReactNode;
}) {
  return (
    <div className={cn("min-w-0 bg-card px-4 py-3")}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "m-0 mt-1 flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[15px] font-semibold",
          tone === "warning" && "text-warning",
        )}
      >
        {children}
      </dd>
    </div>
  );
}

const small = "text-xs font-normal text-muted-foreground";

/** The company's title row and a four-cell strip: status, applications, last activity, next. */
export function CompanyHeader({
  name,
  companyKey,
  focus,
  cities,
  workModes,
  careersUrl,
  stage,
  data,
  action,
}: {
  name: string;
  companyKey: string;
  focus?: string | null;
  cities: string[];
  workModes: string[];
  careersUrl?: string | null;
  stage: PipelineStage | null;
  data: CompanyApplications;
  action: { label: string; href: string };
}) {
  const { status, next, lastActivity, rows } = data;
  const closed = rows.filter((row) => row.record.phase === "Closed").length;
  const meta = [
    focus?.trim(),
    cities.join(", "),
    workModes.map((mode) => mode.toLowerCase()).join(", "),
  ].filter(Boolean);
  const late = next?.due?.tone === "late";
  return (
    <header className="space-y-5">
      <Link href="/companies" className="text-sm text-link">
        All companies
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-x-5 gap-y-4">
        <div className="flex min-w-0 items-center gap-4">
          <Monogram name={name} large />
          <div className="min-w-0">
            <h1 className="m-0 truncate text-3xl font-semibold tracking-tight" title={name}>
              {name}
            </h1>
            {!!meta.length && (
              <p className="mt-1.5 text-sm text-muted-foreground [overflow-wrap:anywhere]">
                {meta.join(" · ")}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={mailHref({ company: normalizeCompany(name) })}
            className="flex min-h-10 items-center rounded-full border border-input px-4 text-sm font-medium hover:bg-muted hover:no-underline"
          >
            Company mail
          </Link>
          <Link
            href={action.href}
            className="flex min-h-10 items-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary-hover hover:no-underline"
          >
            {action.label}
          </Link>
          <HeaderMenu careersUrl={careersUrl} company={{ key: companyKey, name }} />
        </div>
      </div>
      <div className="@container">
        <dl className="m-0 grid grid-cols-2 gap-px overflow-hidden rounded-card border border-border bg-border @2xl:grid-cols-4">
          <Cell label="Status">
            <span className="flex min-w-0 flex-col items-start gap-1.5">
              {status && status.tone !== "none" ? (
                <StatusPill status={status} />
              ) : stage ? (
                <StageChip stage={stage} />
              ) : (
                <span className={small}>Not started</span>
              )}
              {status?.previous && <PreviousBadge joined={status.previous.joined} />}
            </span>
          </Cell>
          <Cell label="Applications">
            <span>{rows.length}</span>
            <span className={small}>
              {rows.length - closed} active · {closed} closed
            </span>
          </Cell>
          <Cell label="Last activity">
            {lastActivity ? (
              <>
                <span>{formatDay(new Date(lastActivity.at))}</span>
                <span className={small}>{lastActivity.kind}</span>
              </>
            ) : (
              <span className={small}>No activity yet</span>
            )}
          </Cell>
          <Cell label="Next" tone={late ? "warning" : undefined}>
            {next ? (
              <>
                {late && <AlertTriangle aria-hidden size={14} className="shrink-0 self-center" />}
                <span className="min-w-0 max-w-full truncate" title={next.text}>
                  {next.text}
                </span>
                {next.due && (
                  <span className={cn("shrink-0 text-xs", dueTone[next.due.tone])}>
                    {next.due.label}
                  </span>
                )}
              </>
            ) : (
              <span className={small}>Nothing due</span>
            )}
          </Cell>
        </dl>
      </div>
    </header>
  );
}
