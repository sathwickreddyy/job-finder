import { ArrowUpRight, Building2, CodeXml, Globe, Search } from "lucide-react";
import { RemoteImage } from "./embeds";
import { jobSearchSites, jobSiteAction } from "./job-sites";
import { favicon } from "./profile-links";

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

/** Job sites A from /gallery/home: the bottom line says exactly what the click opens. */
export function JobSiteCards({ role, city }: { role: string; city: string }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {jobSearchSites.map((site) => {
        const action = jobSiteAction(site, role, city);
        return (
          <a
            key={site.name}
            href={action.href}
            target="_blank"
            rel="noreferrer"
            className="pressable group flex flex-col rounded-card border border-border bg-card p-5 text-foreground hover:border-primary hover:no-underline"
          >
            <span className="grid size-12 place-items-center rounded-2xl bg-background">
              <RemoteImage
                src={favicon(site.host)}
                alt=""
                className="size-7 rounded"
                fallback={<Globe size={24} aria-hidden className="text-muted-foreground" />}
              />
            </span>
            <span className="mt-4 font-semibold">{site.name}</span>
            <span className="mt-1 flex-1 text-sm text-muted-foreground">{site.bestFor}</span>
            <span className="mt-5 flex items-start gap-1.5 border-t border-border pt-3 text-sm font-medium text-link">
              {action.search ? (
                <Search size={15} className="mt-0.5 shrink-0" aria-hidden />
              ) : (
                <ArrowUpRight size={15} className="mt-0.5 shrink-0" aria-hidden />
              )}
              <span>{action.line}</span>
            </span>
          </a>
        );
      })}
    </div>
  );
}
