import Link from "next/link";
import { ArrowUpRight, Building2, CodeXml, Globe } from "lucide-react";

export const jobSites = [
  {
    name: "LinkedIn India",
    url: "https://www.linkedin.com/jobs/search/?location=India",
    detail: "Openings & referrals",
    mark: "in",
  },
  { name: "Naukri", url: "https://www.naukri.com/", detail: "Recruiter discovery", mark: "n" },
  { name: "Instahyre", url: "https://www.instahyre.com/", detail: "Tech opportunities", mark: "i" },
  { name: "Cutshort", url: "https://cutshort.io/", detail: "Startup & tech roles", mark: "c" },
  { name: "Hirist", url: "https://www.hirist.tech/", detail: "Technology roles", mark: "h" },
];
export function SiteIcon({ name }: { name: string }) {
  if (/linkedin/i.test(name))
    return (
      <span aria-hidden className="text-2xl font-bold tracking-tighter">
        in
      </span>
    );
  const Icon = /github/i.test(name) ? CodeXml : /portfolio/i.test(name) ? Globe : Building2;
  return <Icon size={26} strokeWidth={1.7} aria-hidden />;
}
export function SiteCards({ sites }: { sites: { name: string; url: string | null }[] }) {
  const cards = [...sites];
  for (const name of ["LinkedIn", "GitHub", "Portfolio"])
    if (!cards.some((site) => site.name.toLowerCase().includes(name.toLowerCase())))
      cards.push({ name, url: null });
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {cards.map((site, index) => (
        <Link
          key={`${site.name}-${index}`}
          href={site.url || "/my-profile#add-link"}
          target={site.url ? "_blank" : undefined}
          rel={site.url ? "noreferrer" : undefined}
          className="pressable group flex gap-4 rounded-card border border-border bg-card p-5 text-foreground hover:border-primary hover:no-underline sm:flex-col sm:p-6"
        >
          <div className="flex items-center justify-between">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-selected text-selected-foreground">
              <SiteIcon name={site.name} />
            </span>
            <ArrowUpRight
              size={18}
              className="hidden text-muted-foreground group-hover:text-primary sm:block"
              aria-hidden
            />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold">{site.name}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {/linkedin/i.test(site.name)
                ? "Your experience & professional network"
                : /github/i.test(site.name)
                  ? "Evidence of the things you build"
                  : /portfolio/i.test(site.name)
                    ? "Your best work, in one place"
                    : "Showcase your work and experience"}
            </p>
            <p className="mt-3 text-sm font-medium text-link">
              {site.url ? "Open profile" : "Add your link"}
            </p>
          </div>
        </Link>
      ))}
    </div>
  );
}
export function JobSiteCards() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {jobSites.map((site) => (
        <a
          key={site.name}
          href={site.url}
          target="_blank"
          rel="noreferrer"
          className="pressable group flex items-center gap-3 rounded-card border border-border bg-card p-4 text-foreground hover:border-primary hover:no-underline lg:flex-col lg:items-start lg:p-5"
        >
          <span
            aria-hidden
            className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-xl font-semibold"
          >
            {site.mark}
          </span>
          <div>
            <h3 className="text-sm font-semibold">{site.name}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{site.detail}</p>
          </div>
          <ArrowUpRight
            size={15}
            className="ml-auto text-muted-foreground group-hover:text-primary"
            aria-hidden
          />
        </a>
      ))}
    </div>
  );
}
