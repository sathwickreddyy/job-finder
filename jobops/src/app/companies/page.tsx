import { Button, PageHeader } from "@/components/ui";
import { companyCities } from "@/features/companies/domain";
import { companyViews, type CompanyView } from "@/features/companies/format";
import { readCompanies } from "@/features/companies/read";
import { companySummaries, sharedPayScale } from "@/features/companies/summary";
import {
  CompanyGridCard,
  CompareTable,
  PipelineBoard,
  ViewSwitcher,
} from "@/features/companies/views";

const unplaced = "Location not recorded";

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; view?: string }>;
}) {
  const [data, query] = await Promise.all([readCompanies(), searchParams]);
  const view: CompanyView = companyViews.some((row) => row.id === query.view)
    ? (query.view as CompanyView)
    : "grid";
  const search = query.q?.trim().toLowerCase() ?? "";
  const all = companySummaries(data);
  const scaleMax = sharedPayScale(all);
  const byId = new Map(data.companies.map((company) => [company.id, company]));
  const companies = all.filter((row) => {
    const company = byId.get(row.id)!;
    return `${row.name} ${company.aliases.join(" ")} ${row.focus} ${row.cities.join(" ")}`
      .toLowerCase()
      .includes(search);
  });
  const href = (next: CompanyView) =>
    `/companies?view=${next}${query.q ? `&q=${encodeURIComponent(query.q)}` : ""}`;
  const otherCities = [...new Set(all.flatMap((row) => row.cities))]
    .filter((city) => !companyCities.includes(city as (typeof companyCities)[number]))
    .sort();
  const cities = [
    ...companyCities,
    ...otherCities,
    ...(all.some((row) => !row.cities.length) ? [unplaced] : []),
  ];
  return (
    <div>
      <PageHeader
        title="Companies"
        description="Pay ranges, interview loops and your progress for each company you are targeting in Bengaluru and Hyderabad."
      />
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <ViewSwitcher
          view={view}
          hrefs={{ grid: href("grid"), compare: href("compare"), pipeline: href("pipeline") }}
        />
        <form className="flex w-full gap-2 sm:w-auto">
          <input type="hidden" name="view" value={view} />
          <input
            type="search"
            name="q"
            aria-label="Search companies"
            placeholder="Company, focus or city"
            defaultValue={query.q}
            className="min-w-0 flex-1 sm:!w-64"
          />
          <Button variant="outline">Search</Button>
        </form>
      </div>
      {view === "grid" && (
        <div className="space-y-12">
          {cities.map((city) => {
            const rows = companies.filter((row) =>
              city === unplaced ? !row.cities.length : row.cities.includes(city),
            );
            const id = city.toLowerCase().replaceAll(" ", "-");
            return (
              <section
                key={city}
                id={id}
                aria-labelledby={`${id}-heading`}
                className="scroll-mt-6 space-y-5"
              >
                <h2
                  id={`${id}-heading`}
                  className="flex items-baseline gap-3 text-xl font-semibold tracking-tight"
                >
                  {city}
                  <span className="text-sm font-normal text-muted-foreground">
                    {rows.length} companies
                  </span>
                </h2>
                {rows.length ? (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 [&>*]:min-w-0">
                    {rows.map((row) => (
                      <CompanyGridCard
                        key={row.id}
                        company={row}
                        label={`View ${row.name} in ${city}`}
                        href={`/companies/${row.id}${city === unplaced ? "" : `?city=${encodeURIComponent(city)}`}`}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="rounded-card border border-dashed border-border p-6 text-muted-foreground">
                    No companies match in {city}. Try another search.
                  </p>
                )}
              </section>
            );
          })}
        </div>
      )}
      {view === "compare" && (
        <CompareTable companies={companies} scaleMax={scaleMax} basePath="/companies" />
      )}
      {view === "pipeline" && <PipelineBoard companies={companies} basePath="/companies" />}
      {view !== "grid" && !companies.length && (
        <p className="rounded-card border border-dashed border-border p-6 text-muted-foreground">
          No companies match “{query.q}”. Try a company name or city.
        </p>
      )}
      <p className="mt-12 text-xs text-muted-foreground">
        Research includes its source and observation dates. Community reports reflect their authors’
        experiences. Pay ranges use INR reports only; stock stays in the currency it was granted in.
      </p>
    </div>
  );
}
