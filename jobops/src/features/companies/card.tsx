import Link from "next/link";
import { ArrowUpRight, FileText } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { Button, StatusBadge } from "@/components/ui";
import { displayDate, type DisplayPreferences } from "@/features/candidate/preferences";
import type { Company } from "./catalog";
import { companyActivity, companyResumeKey, type CompanyCity } from "./domain";
import { saveCompanyResume } from "./actions";
import type { CompaniesData } from "./read";

export function CompanyCard({
  company,
  city,
  data,
  preferences,
}: {
  company: Company;
  city: CompanyCity;
  data: CompaniesData;
  preferences: DisplayPreferences;
}) {
  const activity = companyActivity(company, city, data.records, data.openings);
  const latest = activity.localRecords.find((row) => row.version);
  const reference = data.references.find((row) => row.key === companyResumeKey(company.id, city));
  const familyId =
    typeof reference?.value.resumeId === "string"
      ? reference.value.resumeId
      : latest?.version?.familyId;
  const family = data.families.find((row) => row.id === familyId);
  const key = `${company.id}-${city}`;
  return (
    <article className="flex min-w-0 flex-col rounded-card border border-border bg-card p-5 text-foreground shadow-surface transition-[border-color] hover:border-primary">
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
      <p className="mt-4 text-xs text-muted-foreground">{new URL(company.careersUrl).hostname}</p>
      <div className="my-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <span>
          <strong className="text-lg tabular-nums">{activity.sent}</strong>{" "}
          <span className="text-muted-foreground">applications sent</span>
        </span>
        <span>
          <strong className="text-lg tabular-nums">{activity.openings.length}</strong>{" "}
          <span className="text-muted-foreground">saved openings</span>
        </span>
      </div>
      <div className="mb-5 flex min-h-14 items-start gap-2 border-t border-border pt-4">
        <FileText size={16} className="mt-0.5 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0 text-sm">
          {family ? (
            <>
              <Link href={`/resumes/${family.id}`} className="text-link">
                {family.version
                  ? `Current resume: ${family.version.label}`
                  : "Upload a current revision"}
              </Link>
              <p className="mt-1 break-all text-xs text-muted-foreground">
                {family.name}
                {!family.isActive ? " · Archived" : ""}
              </p>
            </>
          ) : (
            <span className="text-muted-foreground">No resume linked yet</span>
          )}
        </div>
      </div>
      <div className="mt-auto flex flex-wrap gap-2">
        <Button asChild>
          <a href={company.careersUrl} target="_blank" rel="noopener noreferrer">
            Open careers
            <ArrowUpRight size={15} aria-hidden />
          </a>
        </Button>
      </div>
      <details id={`${key}-details`} className="mt-5 border-t border-border pt-2">
        <summary className="text-sm font-medium">
          Resume & applications ({activity.records.length})
        </summary>
        <div className="mt-3 space-y-4">
          <p className="text-xs text-muted-foreground">{company.portalNote}</p>
          <Link href="/jobs/new" className="inline-block text-sm text-link">
            Save an opening from this portal
          </Link>
          <ActionForm action={saveCompanyResume}>
            <input type="hidden" name="companyId" value={company.id} />
            <input type="hidden" name="city" value={city} />
            <label htmlFor={`${key}-resume`} className="block text-sm font-medium">
              Resume for {company.name} in {city}
            </label>
            <select
              id={`${key}-resume`}
              name="resumeId"
              defaultValue={
                typeof reference?.value.resumeId === "string" && family?.isActive ? family.id : ""
              }
            >
              <option value="">Use latest application resume, if recorded</option>
              {data.families
                .filter((row) => row.isActive)
                .map((row) => (
                  <option value={row.id} key={row.id}>
                    {row.name}
                    {row.version ? ` — ${row.version.label}` : " — No current PDF"}
                  </option>
                ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Follows the current version of this resume. Submitted files stay unchanged.
            </p>
            <Button size="sm" variant="outline">
              Save resume reference
            </Button>
          </ActionForm>
          <Link href="/resumes" className="inline-block text-sm text-link">
            Upload or revise a resume
          </Link>
          <div className="space-y-3 border-t border-border pt-4">
            <h4 className="text-sm font-semibold">All {company.name} application records</h4>
            {activity.records.map((row) => (
              <div key={row.id} className="rounded-xl bg-background p-3 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <Link href={`/applications/${row.id}`} className="font-medium text-link">
                    {row.title}
                  </Link>
                  <StatusBadge status={row.status} />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {row.location || "Location not recorded"} ·{" "}
                  {row.appliedAt
                    ? `Sent ${displayDate(row.appliedAt, preferences)}`
                    : "Not submitted"}
                </p>
                {row.version ? (
                  <Link
                    href={`/resumes/${row.version.familyId}?version=${row.version.id}`}
                    className="mt-2 block break-all text-xs text-link"
                  >
                    {row.appliedAt ? "Submitted" : "Selected"}: {row.version.filename} (
                    {row.version.label})
                  </Link>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">No resume file recorded</p>
                )}
              </div>
            ))}
            {!activity.records.length && (
              <p className="text-sm text-muted-foreground">
                No applications recorded yet. Save an opening, then record the application and
                resume you used.
              </p>
            )}
            <Button variant="outline" size="sm" asChild>
              <Link href="/applications/new">Record an application</Link>
            </Button>
          </div>
          {activity.openings.length > 0 && (
            <div className="space-y-2 border-t border-border pt-3">
              <h4 className="text-sm font-semibold">Saved in {city}</h4>
              {activity.openings.map((job) => (
                <Link key={job.id} href={`/jobs/${job.id}`} className="block text-sm text-link">
                  {job.title}
                </Link>
              ))}
            </div>
          )}
          <a
            href={company.locationSource}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-xs text-link"
          >
            Official location source
          </a>
        </div>
      </details>
    </article>
  );
}
