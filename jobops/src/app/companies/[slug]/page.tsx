import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { Button, PageHeader, Panel, StatusBadge } from "@/components/ui";
import { displayDate, getDisplayPreferences } from "@/features/candidate/preferences";
import { companyActivity } from "@/features/companies/domain";
import { readCompanies } from "@/features/companies/read";
import { CompanyResearch } from "@/features/companies/research";
import { CompanyResumeReference } from "@/features/companies/resume-reference";

export default async function CompanyPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ city?: string }>;
}) {
  const [{ slug }, query, data, preferences] = await Promise.all([
    params,
    searchParams,
    readCompanies(),
    getDisplayPreferences(),
  ]);
  const company = data.companies.find((row) => row.id === slug);
  if (!company) notFound();
  const cities = company.cities.length ? company.cities : ["Location not recorded"];
  const selectedCity = cities.includes(query.city ?? "") ? query.city! : cities[0];
  const orderedCities = [selectedCity, ...cities.filter((city) => city !== selectedCity)];
  const activity = companyActivity(company, selectedCity, data.records, data.openings);
  return (
    <div className="space-y-6">
      <Link href="/companies" className="text-sm text-link">
        All companies
      </Link>
      <PageHeader
        title={company.name}
        description={
          company.focus || "Careers, research and your application records in one place."
        }
        actions={
          company.careersUrl ? (
            <Button asChild>
              <a href={company.careersUrl} target="_blank" rel="noopener noreferrer">
                Open careers
                <ArrowUpRight size={16} aria-hidden />
              </a>
            </Button>
          ) : (
            <Button asChild>
              <Link href="/jobs/new">Save an opening</Link>
            </Button>
          )
        }
      />
      <nav className="flex flex-wrap gap-2" aria-label="Company information">
        {[
          ["research", "Research"],
          ["openings", "Saved openings"],
          ["resumes", "Resumes"],
          ["applications", "Applications"],
        ].map(([id, label]) => (
          <Button key={id} asChild variant="secondary">
            <a href={`#${id}`}>{label}</a>
          </Button>
        ))}
      </nav>
      <div className="grid items-start gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="min-w-0 space-y-5">
          <Panel title="Company overview">
            {company.portalNote && (
              <p className="mb-4 whitespace-pre-wrap text-sm leading-6">{company.portalNote}</p>
            )}
            <dl className="space-y-4 text-sm">
              <div>
                <dt className="text-muted-foreground">Careers portal</dt>
                <dd className="mt-1 break-all">
                  {company.careersUrl ? (
                    <a
                      href={company.careersUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-link"
                    >
                      {new URL(company.careersUrl).hostname}
                    </a>
                  ) : (
                    "Not recorded"
                  )}
                </dd>
              </div>
              {company.websiteUrl && (
                <div>
                  <dt className="text-muted-foreground">Website</dt>
                  <dd className="mt-1 break-all">
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
              {!!company.aliases.length && (
                <div>
                  <dt className="text-muted-foreground">Also recorded as</dt>
                  <dd className="mt-1 break-words">{company.aliases.join(", ")}</dd>
                </div>
              )}
            </dl>
          </Panel>
          <Panel title="Locations">
            <div className="space-y-4">
              {company.locations?.map((location) => (
                <div key={location.id} className="space-y-1 text-sm">
                  <p className="font-medium">
                    {location.city}
                    {location.isPrimary ? " · Primary office" : ""}
                  </p>
                  <p className="text-muted-foreground">
                    {[location.state, location.country].filter(Boolean).join(", ")}
                  </p>
                  {!!location.workModes.length && (
                    <p className="capitalize">
                      {location.workModes.map((mode) => mode.toLowerCase()).join(" · ")}
                    </p>
                  )}
                  <p className="text-xs capitalize text-muted-foreground">
                    {location.verificationStatus.toLowerCase().replaceAll("_", " ")}
                  </p>
                  {location.sourceUrl && (
                    <a
                      href={location.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block break-all text-xs text-link"
                    >
                      Location source
                    </a>
                  )}
                  <p className="text-xs text-muted-foreground">
                    First seen {displayDate(location.firstObservedAt, preferences)} · Last seen{" "}
                    {displayDate(location.lastObservedAt, preferences)}
                  </p>
                </div>
              ))}
              {!company.locations?.length && (
                <p className="text-sm text-muted-foreground">No locations recorded yet.</p>
              )}
            </div>
          </Panel>
          <div id="resumes" className="scroll-mt-6">
            <Panel title="Resume references">
              <div className="space-y-5">
                {orderedCities.map((city) => (
                  <CompanyResumeReference key={city} company={company} city={city} data={data} />
                ))}
              </div>
              <Link href="/resumes" className="mt-5 inline-block text-sm text-link">
                Upload or revise a resume
              </Link>
            </Panel>
          </div>
        </div>
        <div className="order-first min-w-0 space-y-5 lg:order-last">
          <div id="research" className="scroll-mt-6">
            <Panel title="Gathered research">
              {company.facts?.length ? (
                <CompanyResearch facts={company.facts} preferences={preferences} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  No sourced research saved yet. Gather information from official careers pages or
                  community reports and keep each source with its notes.
                </p>
              )}
            </Panel>
          </div>
          <div id="openings" className="scroll-mt-6">
            <Panel title={`Saved openings (${activity.allOpenings.length})`}>
              <div className="space-y-3">
                {activity.allOpenings.map((job) => (
                  <div key={job.id} className="rounded-xl bg-background p-3 text-sm">
                    <Link href={`/jobs/${job.id}`} className="font-medium text-link">
                      {job.title}
                    </Link>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {job.location || "Location not recorded"}
                    </p>
                  </div>
                ))}
              </div>
              {!activity.allOpenings.length && (
                <p className="text-sm text-muted-foreground">
                  No saved openings for {company.name} yet.
                </p>
              )}
              <Button asChild size="sm" variant="outline" className="mt-4">
                <Link href="/jobs/new">Save an opening</Link>
              </Button>
            </Panel>
          </div>
          <div id="applications" className="scroll-mt-6">
            <Panel title={`Application history (${activity.records.length})`}>
              <p className="mb-4 text-sm text-muted-foreground">
                {activity.records.filter((record) => record.appliedAt !== null).length} applications
                sent across all locations. Each record keeps its selected or submitted resume file.
              </p>
              <div className="space-y-3">
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
              </div>
              {!activity.records.length && (
                <p className="text-sm text-muted-foreground">
                  No applications recorded yet. Save an opening, then record the application and
                  resume you used.
                </p>
              )}
              <Button asChild size="sm" variant="outline" className="mt-4">
                <Link href="/applications/new">Record an application</Link>
              </Button>
            </Panel>
          </div>
        </div>
      </div>
    </div>
  );
}
