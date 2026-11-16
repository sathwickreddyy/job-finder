import type { ReactNode } from "react";
import Link from "next/link";
import { Building2, ExternalLink, FileText, Mail } from "lucide-react";
import { MiddleTruncate } from "@/components/ui/middle-truncate";
import { mailHref } from "@/features/timeline/query";
import { cn } from "@/lib/utils";
import { formatDay } from "../../dates";
import { currentNamedStep, type NamedStep } from "../../named-steps";
import { isOutreach, methodLabel } from "../../phase";
import type { ApplicationRecord } from "../../read";
import { CompanyMark } from "../marks";

export type Sibling = { id: string; requisition: string | null; label: string };

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 bg-card px-4 py-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="m-0 flex min-w-0 flex-col gap-0.5 text-sm font-medium">{children}</dd>
    </div>
  );
}

const chip =
  "pressable inline-flex h-8 max-w-full items-center gap-1.5 rounded-full px-3 text-xs font-medium text-muted-foreground ring-1 ring-border hover:text-foreground hover:no-underline";

/**
 * Header B: who and which opening, a switcher between applications at the same company, then
 * four facts that tell this application apart: opening, applied, résumé sent, where it stands.
 */
export function ApplicationHeader({
  record,
  siblings,
  steps,
}: {
  record: ApplicationRecord;
  siblings: Sibling[];
  steps: NamedStep[];
}) {
  const current = currentNamedStep(steps);
  const outreach = isOutreach(record.source);
  return (
    <header className="@container flex min-w-0 flex-col gap-4">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <CompanyMark company={record.company} />
          <div className="min-w-0">
            <h1
              className="m-0 truncate text-2xl font-semibold tracking-tight"
              title={record.company}
            >
              {record.company}
            </h1>
            <p className="m-0 truncate text-muted-foreground" title={record.role}>
              {outreach
                ? `${methodLabel[record.source]}${record.contact ? ` · ${record.contact}` : ""} · ${record.role}`
                : record.role}
            </p>
          </div>
        </div>
        {siblings.length > 1 && (
          <nav
            aria-label={`${siblings.length} ${record.company} applications`}
            className="flex max-w-full min-w-0 gap-1 overflow-x-auto rounded-full bg-muted p-1 [scrollbar-width:none]"
          >
            {siblings.map((sibling) => {
              const here = sibling.id === record.id;
              return (
                <Link
                  key={sibling.id}
                  href={`/applications/${sibling.id}`}
                  aria-current={here ? "page" : undefined}
                  className={cn(
                    "shrink-0 rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap hover:no-underline",
                    here
                      ? "bg-card text-foreground shadow-surface"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {sibling.requisition ?? "No requisition"} · {sibling.label}
                </Link>
              );
            })}
          </nav>
        )}
      </div>
      <dl className="m-0 grid grid-cols-1 gap-px overflow-hidden rounded-2xl bg-border ring-1 ring-border @md:grid-cols-2 @3xl:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,1.6fr)_minmax(0,1fr)]">
        <Fact label="Opening">
          <a
            href={record.jobUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-w-0 items-center gap-1"
          >
            <span className="truncate">
              {record.requisition ? `Req ${record.requisition}` : "No requisition saved"}
            </span>
            <ExternalLink aria-hidden size={12} className="shrink-0" />
            <span className="sr-only">, open the job post</span>
          </a>
          {record.city && (
            <span
              className="truncate text-xs font-normal text-muted-foreground"
              title={record.city}
            >
              {record.city}
            </span>
          )}
        </Fact>
        <Fact label={outreach ? "Sent" : "Applied"}>
          <span>{record.sentAt ? formatDay(record.sentAt) : "Not sent yet"}</span>
          <span className="truncate text-xs font-normal text-muted-foreground">
            {methodLabel[record.source] ?? record.source}
          </span>
        </Fact>
        <Fact label="Résumé sent">
          {record.resume ? (
            <Link
              href={`/resumes?file=${record.resume.id}`}
              className="flex min-w-0 flex-col gap-0.5 text-foreground hover:no-underline"
            >
              <span className="flex min-w-0 items-start gap-1.5">
                <FileText aria-hidden size={14} className="mt-[3px] shrink-0 text-link" />
                <span className="line-clamp-2" title={record.resume.label}>
                  {record.resume.label}
                </span>
              </span>
              <MiddleTruncate
                text={record.resume.filename}
                tail={24}
                className="text-xs font-normal text-muted-foreground"
              />
            </Link>
          ) : (
            <span className="text-muted-foreground">No résumé recorded</span>
          )}
        </Fact>
        <Fact label="Where it stands">
          <span data-testid="phase-label" className="truncate" title={current.label}>
            {current.label}
          </span>
          {current.detail && (
            <span
              className={cn(
                "truncate text-xs font-normal text-muted-foreground",
                current.due && "font-medium text-warning",
              )}
              title={current.detail}
            >
              {current.detail}
            </span>
          )}
        </Fact>
      </dl>
      <div className="flex min-w-0 flex-wrap gap-2">
        {record.companyHref && (
          <Link href={record.companyHref} className={chip}>
            <Building2 aria-hidden size={13} /> Company page
          </Link>
        )}
        {record.applicationUrl && (
          <a href={record.applicationUrl} target="_blank" rel="noreferrer" className={chip}>
            <ExternalLink aria-hidden size={13} /> Application page
          </a>
        )}
        <Link href={mailHref({ company: record.companyKey, role: record.id })} className={chip}>
          <Mail aria-hidden size={13} /> Application mail
        </Link>
      </div>
    </header>
  );
}
