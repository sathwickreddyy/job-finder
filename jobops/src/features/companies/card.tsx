import Link from "next/link";
import { ChevronRight, FileText } from "lucide-react";
import type { Company } from "./catalog";
import { companyResumeReference, type CompanyCity } from "./domain";
import type { CompaniesData } from "./read";

export function CompanyCard({
  company,
  city,
  data,
}: {
  company: Company;
  city: CompanyCity;
  data: CompaniesData;
}) {
  const { activity, family } = companyResumeReference(company, city, data);
  const location = company.locations?.find((place) => place.city === city);
  return (
    <Link
      href={`/companies/${company.id}?city=${encodeURIComponent(city)}`}
      aria-label={`View ${company.name} in ${city}`}
      className="group block rounded-card text-foreground hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
    >
      <article className="flex min-w-0 flex-col rounded-card border border-border bg-card p-5 shadow-surface transition-[border-color] group-hover:border-primary group-focus-visible:border-primary">
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="grid size-11 shrink-0 place-items-center rounded-2xl bg-selected text-lg font-semibold text-selected-foreground"
          >
            {company.name === "ServiceNow" ? "SN" : company.name.slice(0, 2)}
          </span>
          <div className="min-w-0">
            <h3 className="text-lg font-semibold tracking-tight">{company.name}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{company.focus}</p>
          </div>
        </div>
        <p className="mt-4 break-all text-xs text-muted-foreground">
          {company.careersUrl
            ? new URL(company.careersUrl).hostname
            : "Careers portal not recorded"}
        </p>
        {!!location?.workModes.length && (
          <p className="mt-1 text-xs capitalize text-muted-foreground">
            {location.workModes.map((mode) => mode.toLowerCase()).join(" · ")}
          </p>
        )}
        <div className="my-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <span>
            <strong className="text-lg tabular-nums">{activity.sent}</strong>{" "}
            <span className="text-muted-foreground">applications sent</span>
          </span>
          <span>
            <strong className="text-lg tabular-nums">{activity.openings.length}</strong>{" "}
            <span className="text-muted-foreground">saved openings</span>
          </span>
        </div>
        <div className="flex min-h-14 items-start gap-2 border-t border-border pt-4 text-sm">
          <FileText size={16} className="mt-0.5 shrink-0 text-primary" aria-hidden />
          <div className="min-w-0">
            <p>
              {family?.version
                ? `Current resume: ${family.version.label}`
                : family
                  ? "Upload a current revision"
                  : "No resume linked yet"}
            </p>
            {family && (
              <p className="mt-1 break-all text-xs text-muted-foreground">
                {family.name}
                {!family.isActive ? " · Archived" : ""}
              </p>
            )}
          </div>
        </div>
        <div className="mt-5 flex items-center justify-between gap-3 border-t border-border pt-4 text-sm">
          <span className="text-xs text-muted-foreground">
            {company.facts?.length
              ? `${company.facts.length} sourced research ${company.facts.length === 1 ? "note" : "notes"}`
              : "Research not gathered yet"}
          </span>
          <span className="flex shrink-0 items-center gap-1 font-medium text-primary">
            View company
            <ChevronRight size={16} aria-hidden />
          </span>
        </div>
      </article>
    </Link>
  );
}
