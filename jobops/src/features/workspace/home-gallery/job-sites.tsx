"use client";

import { ArrowUpRight, Search } from "lucide-react";
import { favicon, jobSites, type Identity } from "./data";
import { RemoteImage } from "./embeds";

function action(site: (typeof jobSites)[number], identity: Identity) {
  return site.search
    ? {
        href: site.search(identity.searchRole, identity.searchCity),
        label: `Search ${identity.searchCity}`,
        detail: `“${identity.searchRole}” in ${identity.searchCity}`,
      }
    : { href: site.url, label: `Open ${site.name}`, detail: "Opens the home page; search there" };
}

/** A. Recognisable cards; the bottom line says exactly what the click opens. */
export function JobSiteCards({ identity }: { identity: Identity }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {jobSites.map((site) => {
        const link = action(site, identity);
        return (
          <a
            key={site.name}
            href={link.href}
            target="_blank"
            rel="noreferrer"
            className="pressable group flex flex-col rounded-card border border-border bg-card p-5 text-foreground hover:border-primary hover:no-underline"
          >
            <span className="grid size-12 place-items-center rounded-2xl bg-background">
              <RemoteImage src={favicon(site.host)} alt="" className="size-7 rounded" />
            </span>
            <span className="mt-4 font-semibold">{site.name}</span>
            <span className="mt-1 flex-1 text-sm text-muted-foreground">{site.bestFor}</span>
            <span className="mt-5 flex items-start gap-1.5 border-t border-border pt-3 text-sm font-medium text-link">
              {site.search ? (
                <Search size={15} className="mt-0.5 shrink-0" aria-hidden />
              ) : (
                <ArrowUpRight size={15} className="mt-0.5 shrink-0" aria-hidden />
              )}
              <span>{site.search ? link.detail : link.label}</span>
            </span>
          </a>
        );
      })}
    </div>
  );
}

/** B. One panel of rows; each row ends in a labelled button. */
export function JobSiteRows({ identity }: { identity: Identity }) {
  return (
    <ul className="m-0 list-none divide-y divide-border overflow-hidden rounded-panel border border-border bg-card p-0">
      {jobSites.map((site) => {
        const link = action(site, identity);
        return (
          <li
            key={site.name}
            className="flex flex-wrap items-center gap-4 px-5 py-4 sm:flex-nowrap"
          >
            <RemoteImage src={favicon(site.host)} alt="" className="size-8 shrink-0 rounded-md" />
            <div className="min-w-0 flex-1">
              <p className="m-0 font-semibold">{site.name}</p>
              <p className="m-0 text-sm text-muted-foreground">{site.bestFor}</p>
            </div>
            <p className="m-0 hidden w-56 shrink-0 text-sm text-muted-foreground lg:block">
              {link.detail}
            </p>
            <a
              href={link.href}
              target="_blank"
              rel="noreferrer"
              className={
                site.search
                  ? "pressable inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary-hover hover:no-underline"
                  : "pressable inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full border border-border px-5 text-sm font-medium text-foreground hover:bg-muted hover:no-underline"
              }
            >
              {site.search ? <Search size={15} aria-hidden /> : null}
              {link.label}
              <ArrowUpRight size={15} aria-hidden />
            </a>
          </li>
        );
      })}
    </ul>
  );
}
