import { Button, PageHeader } from "@/components/ui";
import { getDisplayPreferences } from "@/features/candidate/preferences";
import { CompanyCard } from "@/features/companies/card";
import { companyCities } from "@/features/companies/domain";
import { readCompanies } from "@/features/companies/read";

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const [data, preferences, query] = await Promise.all([
    readCompanies(),
    getDisplayPreferences(),
    searchParams,
  ]);
  const search = query.q?.trim().toLowerCase() ?? "";
  const filtered = data.companies.filter((company) =>
    `${company.name} ${company.aliases.join(" ")} ${company.focus} ${(company.facts ?? []).map((fact) => `${fact.title} ${fact.summary}`).join(" ")}`
      .toLowerCase()
      .includes(search),
  );
  const otherCities = [...new Set(data.companies.flatMap((company) => company.cities))]
    .filter((city) => !companyCities.includes(city as "Bengaluru" | "Hyderabad"))
    .sort();
  const cities = [
    ...companyCities,
    ...otherCities,
    ...(data.companies.some((company) => !company.cities.length) ? ["Location not recorded"] : []),
  ];
  return (
    <div className="space-y-8">
      <PageHeader
        title="Companies"
        description="Explore careers in Bengaluru and Hyderabad. Keep your current resume and recorded applications close."
      />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <nav className="flex gap-2" aria-label="Company cities">
          {cities.map((city) => (
            <Button variant="secondary" asChild key={city}>
              <a href={`#${city.toLowerCase().replaceAll(" ", "-")}`}>{city}</a>
            </Button>
          ))}
        </nav>
        <form className="flex w-full gap-2 sm:w-auto">
          <input
            type="search"
            name="q"
            aria-label="Search companies"
            placeholder="Company or focus"
            defaultValue={query.q}
            className="min-w-0 sm:!w-64"
          />
          <Button variant="outline">Search</Button>
        </form>
      </div>
      {cities.map((city) => {
        const cityCompanies = filtered.filter((company) =>
          city === "Location not recorded" ? !company.cities.length : company.cities.includes(city),
        );
        return (
          <section
            id={city.toLowerCase().replaceAll(" ", "-")}
            key={city}
            className="scroll-mt-6"
            aria-labelledby={`${city}-heading`}
          >
            <div className="mb-5 flex items-baseline gap-3">
              <h2 id={`${city}-heading`} className="text-2xl font-semibold tracking-tight">
                {city}
              </h2>
              <span className="text-sm text-muted-foreground">
                {cityCompanies.length} companies
              </span>
            </div>
            <div className="grid items-start gap-4 md:grid-cols-2 lg:grid-cols-3">
              {cityCompanies.map((company) => (
                <CompanyCard
                  key={company.id}
                  company={company}
                  city={city}
                  data={data}
                  preferences={preferences}
                />
              ))}
            </div>
            {!cityCompanies.length && (
              <p className="rounded-card border border-dashed border-border p-6 text-muted-foreground">
                No companies match in {city}. Try another search.
              </p>
            )}
          </section>
        );
      })}
      <p className="text-xs text-muted-foreground">
        Research includes its source and observation dates. Community reports reflect their authors’
        experiences. Check each role’s current location and availability on its careers portal.
      </p>
    </div>
  );
}
