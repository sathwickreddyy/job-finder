// India-focused job sites. Only LinkedIn and Naukri have verified, stable search URLs.

export type JobSite = {
  name: string;
  host: string;
  bestFor: string;
  url: string;
  search?: (role: string, city: string) => string;
};

export const slug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export const jobSearchSites: JobSite[] = [
  {
    name: "LinkedIn",
    host: "linkedin.com",
    bestFor: "Openings, and referrals through people you know",
    url: "https://www.linkedin.com/jobs/",
    search: (role, city) =>
      `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(role)}&location=${encodeURIComponent(city ? `${city}, India` : "India")}`,
  },
  {
    name: "Naukri",
    host: "naukri.com",
    bestFor: "India's largest job board, where recruiters search profiles",
    url: "https://www.naukri.com/",
    search: (role, city) =>
      city
        ? `https://www.naukri.com/${slug(role)}-jobs-in-${slug(city)}`
        : `https://www.naukri.com/${slug(role)}-jobs`,
  },
  {
    name: "Instahyre",
    host: "instahyre.com",
    bestFor: "Curated tech roles where companies contact you",
    url: "https://www.instahyre.com/",
  },
  {
    name: "Cutshort",
    host: "cutshort.io",
    bestFor: "Startup and product-company tech roles",
    url: "https://cutshort.io/",
  },
  {
    name: "Hirist",
    host: "hirist.tech",
    bestFor: "Technology-only roles across Indian companies",
    url: "https://www.hirist.tech/",
  },
];

export function jobSiteAction(site: JobSite, role: string, city: string) {
  if (site.search && role)
    return {
      href: site.search(role, city),
      line: `“${role}” in ${city || "India"}`,
      search: true,
    };
  return { href: site.url, line: `Open ${site.name}`, search: false };
}
