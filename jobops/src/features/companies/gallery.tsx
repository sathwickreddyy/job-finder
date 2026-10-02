"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, BriefcaseBusiness, FileText, MapPin, Search, Sun, Moon } from "lucide-react";
import { Button, StatusBadge } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { WorkspaceData } from "@/features/workspace/read";
import { companies, type Company } from "./catalog";

type Style = "spacious" | "compact" | "history";
const normalize = (value: string) => value.trim().toLocaleLowerCase().replace(/\s+/g, " ");

function CompanyCard({
  company,
  style,
  data,
}: {
  company: Company;
  style: Style;
  data: WorkspaceData;
}) {
  const names = [company.name, ...company.aliases].map(normalize);
  const records = data.applications.filter((row) => names.includes(normalize(row.company)));
  const submitted = records.filter((row) => row.appliedAt);
  const latest = [...records].sort((a, b) =>
    (b.appliedAt ?? "").localeCompare(a.appliedAt ?? ""),
  )[0];
  const used = latest?.versionId
    ? data.resumes.find((row) => row.id === latest.versionId)
    : undefined;
  const current = used
    ? data.resumes.find((row) => row.familyId === used.familyId && row.isCurrent)
    : undefined;
  const openings = data.openings.filter((row) => names.includes(normalize(row.company)));
  const initials = company.name === "ServiceNow" ? "SN" : company.name.slice(0, 2);
  return (
    <article
      className={cn(
        "group flex min-w-0 flex-col rounded-card border border-border bg-card text-foreground shadow-surface transition-[border-color] hover:border-primary",
        style === "compact" ? "p-5" : "p-6 sm:p-7",
      )}
    >
      <div className="flex items-start gap-4">
        <span
          aria-hidden
          className={cn(
            "grid shrink-0 place-items-center rounded-2xl bg-selected font-semibold text-selected-foreground",
            style === "compact" ? "size-11 text-lg" : "size-14 text-xl",
          )}
        >
          {initials}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-xl font-semibold tracking-tight">{company.name}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{company.focus}</p>
        </div>
      </div>
      <p className="mt-5 flex items-center gap-2 text-sm text-muted-foreground">
        <MapPin size={15} aria-hidden />
        {company.cities.join(" / ")}
      </p>
      {style !== "compact" && (
        <p className="mt-3 min-h-11 text-sm text-muted-foreground">{company.portalNote}</p>
      )}
      <div
        className={cn("mt-5 flex gap-5", style !== "compact" && "rounded-2xl bg-background p-4")}
      >
        <div>
          <span className="block text-xl font-semibold tabular-nums">{submitted.length}</span>
          <span className="text-xs text-muted-foreground">Applications sent</span>
        </div>
        <div>
          <span className="block text-xl font-semibold tabular-nums">{openings.length}</span>
          <span className="text-xs text-muted-foreground">Saved openings</span>
        </div>
        {latest && (
          <div className="ml-auto self-center">
            <StatusBadge status={latest.status} />
          </div>
        )}
      </div>
      <div className="my-5 border-t border-border pt-4">
        <div className="flex items-start gap-2 text-sm">
          <FileText size={16} className="mt-0.5 shrink-0 text-primary" aria-hidden />
          {used ? (
            <div className="min-w-0">
              <Link href={`/resumes?file=${used.id}`} className="text-link">
                {latest?.appliedAt ? "Submitted" : "Selected"}: {used.label}
              </Link>
              <p className="mt-1 truncate text-xs text-muted-foreground">{used.filename}</p>
              {current && current.id !== used.id && (
                <Link href={`/resumes?file=${current.id}`} className="mt-2 block text-link">
                  Current revision: {current.label}
                </Link>
              )}
            </div>
          ) : (
            <Link href="/resumes" className="text-link">
              {data.resumes.length
                ? "Choose a resume when recording an application"
                : "Upload your resume"}
            </Link>
          )}
        </div>
      </div>
      {style === "history" && (
        <details className="mb-5 rounded-2xl bg-background p-4">
          <summary className="cursor-pointer text-sm font-medium">
            Application history ({records.length})
          </summary>
          <div className="mt-3 space-y-3">
            {records.map((row) => (
              <Link
                key={row.id}
                href={`/applications/${row.id}`}
                className="flex items-start justify-between gap-3 text-sm text-foreground"
              >
                <span>
                  {row.role}
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {row.appliedAt
                      ? new Date(row.appliedAt).toLocaleDateString("en-IN", {
                          timeZone: "Asia/Kolkata",
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })
                      : "Not submitted"}
                  </span>
                </span>
                <StatusBadge status={row.status} />
              </Link>
            ))}
            {!records.length && (
              <p className="text-sm text-muted-foreground">
                No recorded applications yet. Save an opening, then record your application.
              </p>
            )}
          </div>
        </details>
      )}
      <div className="mt-auto flex flex-wrap gap-2">
        <Button asChild>
          <a href={company.careersUrl} target="_blank" rel="noopener noreferrer">
            Open careers
            <ArrowUpRight size={16} aria-hidden />
          </a>
        </Button>
        {records.length > 0 && (
          <Button variant="ghost" asChild>
            <Link href={`/applications?q=${encodeURIComponent(company.name)}`}>
              <BriefcaseBusiness size={16} aria-hidden />
              Your records
            </Link>
          </Button>
        )}
      </div>
      <a
        href={company.locationSource}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 text-xs text-muted-foreground"
      >
        Official location source
      </a>
    </article>
  );
}

export function CompanyGallery({ data }: { data: WorkspaceData }) {
  const [city, setCity] = useState("Both cities");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Style | null>(null);
  const [light, setLight] = useState(false);
  const filtered = companies.filter(
    (company) =>
      (city === "Both cities" || company.cities.includes(city as "Bengaluru" | "Hyderabad")) &&
      `${company.name} ${company.focus}`.toLowerCase().includes(query.toLowerCase()),
  );
  function toggleTheme() {
    const next = document.documentElement.dataset.theme !== "light";
    document.documentElement.dataset.theme = next ? "light" : "dark";
    localStorage.setItem("jobops-theme", next ? "light" : "dark");
    window.dispatchEvent(new Event("jobops-theme"));
    setLight(next);
  }
  return (
    <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <Link href="/" className="text-lg font-semibold text-foreground">
          JobOps
          <span className="ml-3 text-sm font-normal text-muted-foreground">
            Company card gallery
          </span>
        </Link>
        <Button variant="outline" onClick={toggleTheme}>
          {light ? <Moon size={16} aria-hidden /> : <Sun size={16} aria-hidden />}Switch theme
        </Button>
      </header>
      <div className="mb-8 mt-12 max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Your next company, in view.
        </h1>
        <p className="mt-4 text-base text-muted-foreground">
          Official careers portals in Bengaluru and Hyderabad, with your resumes and application
          history together. Compare three live card styles below.
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          Preview using your actual JobOps records. Company presence does not guarantee a current
          opening.
        </p>
      </div>
      <div className="mb-10 flex flex-wrap items-center gap-3">
        <div className="relative w-full min-w-0 flex-none sm:flex-1 sm:max-w-sm">
          <Search
            size={17}
            aria-hidden
            className="pointer-events-none absolute left-3 top-3 text-muted-foreground"
          />
          <input
            aria-label="Search companies"
            type="search"
            placeholder="Search companies or focus"
            className="!pl-10"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div
          className="flex flex-wrap gap-1 rounded-full border border-border p-1"
          aria-label="Company city"
        >
          {["Both cities", "Bengaluru", "Hyderabad"].map((value) => (
            <Button
              key={value}
              variant={city === value ? "secondary" : "ghost"}
              aria-pressed={city === value}
              onClick={() => setCity(value)}
              className="min-h-10 px-4"
            >
              {value}
            </Button>
          ))}
        </div>
      </div>
      <div className="space-y-12">
        {(
          [
            [
              "spacious",
              "A · Spacious",
              "Careers first, with a clear resume reference and a quiet activity summary.",
            ],
            [
              "compact",
              "B · Compact",
              "More companies in view; the same links and records in a smaller footprint.",
            ],
            [
              "history",
              "C · Application history",
              "Expand a card to see every recorded role, status and submission date.",
            ],
          ] as const
        ).map(([style, title, description]) => (
          <section key={style} aria-label={title}>
            <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">{title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{description}</p>
              </div>
              <Button
                variant={selected === style ? "default" : "outline"}
                aria-pressed={selected === style}
                onClick={() => setSelected(style)}
              >
                {selected === style ? "Selected" : `Choose ${title.charAt(0)}`}
              </Button>
            </div>
            <div
              className={cn(
                "grid gap-5",
                style === "compact" ? "md:grid-cols-2 xl:grid-cols-3" : "lg:grid-cols-2",
              )}
            >
              {filtered.map((company) => (
                <CompanyCard key={company.id} company={company} style={style} data={data} />
              ))}
            </div>
            {!filtered.length && (
              <p className="rounded-card border border-dashed border-border p-8 text-muted-foreground">
                No companies match. Try another name or city.
              </p>
            )}
          </section>
        ))}
      </div>
      <footer
        aria-live="polite"
        className="mt-10 flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-popover p-5 shadow-surface sm:sticky sm:bottom-4"
      >
        <p>
          {selected
            ? `Option ${selected === "spacious" ? "A" : selected === "compact" ? "B" : "C"} selected. Tell me your choice in chat to use it on the Companies page.`
            : "Try the cards, then pick A, B or C in chat."}
        </p>
        <Link href="/gallery/simple" className="text-sm text-link">
          Existing page gallery
        </Link>
      </footer>
    </div>
  );
}
