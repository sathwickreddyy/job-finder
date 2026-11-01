import Link from "next/link";
import { Button, PageHeader } from "@/components/ui";
import { normalizeCompany } from "@/features/applications/lanes";
import { PreviousJobForm } from "@/features/companies/previous-job-form";
import { PreviousBadge } from "@/features/companies/status-pill";
import { readCompanyIndex } from "@/features/timeline/read";
import { companyCities } from "@/features/companies/domain";
import { companyViews, type CompanyView } from "@/features/companies/format";
import { readCompanies } from "@/features/companies/read";
import {
  companySummaries,
  sharedPayScale,
  shortlistViews,
  type CompanySummary,
} from "@/features/companies/summary";
import {
  CityFilter,
  CompanyGridCard,
  CompareTable,
  PipelineBoard,
  ViewSwitcher,
} from "@/features/companies/views";

const unplaced = "Location not recorded";
const inCity = (row: CompanySummary, city: string) =>
  city === unplaced ? !row.cities.length : row.cities.includes(city);

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; view?: string; city?: string }>;
}) {
  const [data, query, index] = await Promise.all([
    readCompanies(),
    searchParams,
    readCompanyIndex({}),
  ]);
  const view: CompanyView = companyViews.some((row) => row.id === query.view)
    ? (query.view as CompanyView)
    : "compare";
  const search = query.q?.trim().toLowerCase() ?? "";
  // The same derived status as Mail; previous employers that don't qualify are listed apart.
  const { shortlist: all, previous } = shortlistViews(
    companySummaries(data).map((row) => ({
      ...row,
      status: index.statuses[normalizeCompany(row.name)],
    })),
  );
  // One pay scale for every filter, so bars stay comparable as the list narrows.
  const scaleMax = sharedPayScale(all);
  const byId = new Map(data.companies.map((company) => [company.id, company]));
  const companies = all.filter((row) => {
    const company = byId.get(row.id)!;
    return `${row.name} ${company.aliases.join(" ")} ${row.focus} ${row.cities.join(" ")}`
      .toLowerCase()
      .includes(search);
  });
  const otherCities = [...new Set(all.flatMap((row) => row.cities))]
    .filter((city) => !companyCities.includes(city as (typeof companyCities)[number]))
    .sort();
  const cities = [
    ...companyCities,
    ...otherCities,
    ...(all.some((row) => !row.cities.length) ? [unplaced] : []),
  ];
  const city = cities.find((row) => row.toLowerCase() === query.city?.trim().toLowerCase()) ?? null;
  const located = city ? companies.filter((row) => inCity(row, city)) : companies;
  const href = (next: { view?: CompanyView; city?: string | null }) => {
    const params = new URLSearchParams({ view: next.view ?? view });
    const place = next.city === undefined ? city : next.city;
    if (place) params.set("city", place);
    if (query.q) params.set("q", query.q);
    return `/companies?${params}`;
  };
  const linkQuery = city && city !== unplaced ? `?city=${encodeURIComponent(city)}` : "";
  return (
    <div>
      <PageHeader
        title="Companies"
        description="Pay ranges, interview loops and your progress for each company you are targeting in Bengaluru and Hyderabad."
      />
      <div className="mb-8 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <ViewSwitcher
            view={view}
            hrefs={{
              compare: href({ view: "compare" }),
              grid: href({ view: "grid" }),
              pipeline: href({ view: "pipeline" }),
            }}
          />
          <form className="flex w-full gap-2 sm:w-auto">
            <input type="hidden" name="view" value={view} />
            {city && <input type="hidden" name="city" value={city} />}
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
        <CityFilter
          active={city}
          options={[
            {
              city: null,
              label: "All cities",
              count: companies.length,
              href: href({ city: null }),
            },
            ...cities.map((place) => ({
              city: place,
              label: place,
              count: companies.filter((row) => inCity(row, place)).length,
              href: href({ city: place }),
            })),
          ]}
        />
      </div>
      {view === "grid" && (
        <div className="space-y-12">
          {(city ? [city] : cities).map((place) => {
            const rows = companies.filter((row) => inCity(row, place));
            const id = place.toLowerCase().replaceAll(" ", "-");
            return (
              <section
                key={place}
                id={id}
                aria-labelledby={`${id}-heading`}
                className="scroll-mt-6 space-y-5"
              >
                <h2
                  id={`${id}-heading`}
                  className="flex items-baseline gap-3 text-xl font-semibold tracking-tight"
                >
                  {place}
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
                        label={`View ${row.name} in ${place}`}
                        href={`/companies/${row.id}${place === unplaced ? "" : `?city=${encodeURIComponent(place)}`}`}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="rounded-card border border-dashed border-border p-6 text-muted-foreground">
                    No companies match in {place}. Try another search.
                  </p>
                )}
              </section>
            );
          })}
        </div>
      )}
      {view === "compare" && (
        <CompareTable
          companies={located}
          scaleMax={scaleMax}
          basePath="/companies"
          linkQuery={linkQuery}
        />
      )}
      {view === "pipeline" && (
        <PipelineBoard companies={located} basePath="/companies" linkQuery={linkQuery} />
      )}
      {view !== "grid" && !located.length && (
        <p className="rounded-card border border-dashed border-border p-6 text-muted-foreground">
          {city ? `No companies in ${city}` : "No companies"}
          {query.q ? ` match “${query.q}”` : ""}. Try another city or search.
        </p>
      )}
      <section aria-labelledby="previous-employers" className="mt-12">
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-lg font-semibold tracking-tight [&::-webkit-details-marker]:hidden">
            <span id="previous-employers">Previous employers</span>
            <span className="text-sm font-normal text-muted-foreground">{previous.length}</span>
          </summary>
          <div className="mt-4 space-y-5">
            {previous.length ? (
              <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2 lg:grid-cols-3">
                {previous.map((row) => (
                  <li key={row.id}>
                    <Link
                      href={`/companies/${row.id}`}
                      className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-3 text-foreground hover:border-primary hover:no-underline"
                    >
                      <span className="font-medium">{row.name}</span>
                      {row.status?.previous && (
                        <PreviousBadge joined={row.status.previous.joined} />
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="m-0 text-sm text-muted-foreground">
                Former employers you add appear here, outside the shortlist.
              </p>
            )}
            <div className="rounded-card border border-border bg-card p-5">
              <h3 className="m-0 mb-3 text-base font-semibold">Add a previous employer</h3>
              <PreviousJobForm />
            </div>
          </div>
        </details>
      </section>
      <p className="mt-12 text-xs text-muted-foreground">
        Research includes its source and observation dates. Community reports reflect their authors’
        experiences. Pay ranges use INR reports only; stock stays in the currency it was granted in.
      </p>
    </div>
  );
}

export const metadata = { title: "Companies" };
