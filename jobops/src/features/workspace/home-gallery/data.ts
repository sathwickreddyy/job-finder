// Read-only helpers for the home redesign gallery. Everything shown comes from stored records or
// public embeds; nothing here invents profile metrics.

export type Identity = {
  fullName: string;
  role: string;
  company: string;
  years: number | null;
  city: string;
  summary: string;
  searchRole: string;
  searchCity: string;
};
export type ResumeRef = {
  id: string;
  familyId: string;
  name: string;
  label: string;
  filename: string;
};
export type LinkKind = "linkedin" | "github" | "portfolio" | "medium" | "other";
export type ProfileLink = {
  kind: LinkKind;
  name: string;
  url: string;
  handle: string;
  host: string;
};

const linkOrder: LinkKind[] = ["linkedin", "github", "portfolio", "medium", "other"];
export function profileLinks(sites: { name: string; url: string | null }[]): ProfileLink[] {
  const links: ProfileLink[] = sites.flatMap((site) => {
    if (!site.url) return [];
    const url = new URL(site.url);
    const host = url.hostname.replace(/^www\./, "");
    const kind: LinkKind = /linkedin\.com$/.test(host)
      ? "linkedin"
      : host === "github.com"
        ? "github"
        : /medium\.com$/.test(host)
          ? "medium"
          : /portfolio/i.test(site.name) || host.endsWith("github.io")
            ? "portfolio"
            : "other";
    const segments = url.pathname.split("/").filter(Boolean);
    const handle =
      kind === "linkedin"
        ? (segments[1] ?? host)
        : kind === "github" || kind === "medium"
          ? (segments[0] ?? host)
          : `${host}${url.pathname.replace(/\/$/, "")}`;
    return [{ kind, name: site.name, url: site.url, handle, host }];
  });
  return links.sort((a, b) => linkOrder.indexOf(a.kind) - linkOrder.indexOf(b.kind));
}

export const favicon = (host: string) =>
  `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;
export const githubAvatar = (handle: string) =>
  `https://github.com/${encodeURIComponent(handle)}.png?size=160`;
// Third-party SVG cannot read CSS tokens; this is the light-theme --primary value.
export const contributionChart = (handle: string) =>
  `https://ghchart.rshah.org/1a73e8/${encodeURIComponent(handle)}`;

const slug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
export type JobSite = {
  name: string;
  host: string;
  bestFor: string;
  url: string;
  search?: (role: string, city: string) => string;
};
// Only LinkedIn and Naukri have verified, stable search URLs; the others open their home page.
export const jobSites: JobSite[] = [
  {
    name: "LinkedIn",
    host: "linkedin.com",
    bestFor: "Openings, and referrals through people you know",
    url: "https://www.linkedin.com/jobs/",
    search: (role, city) =>
      `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(role)}&location=${encodeURIComponent(`${city}, India`)}`,
  },
  {
    name: "Naukri",
    host: "naukri.com",
    bestFor: "India's largest job board, where recruiters search profiles",
    url: "https://www.naukri.com/",
    search: (role, city) => `https://www.naukri.com/${slug(role)}-jobs-in-${slug(city)}`,
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
