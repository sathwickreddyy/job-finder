"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  BriefcaseBusiness,
  Building2,
  Check,
  CodeXml,
  Copy,
  FileText,
  Globe,
  House,
  Mail,
  Plus,
  Search,
  Sun,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SimplePreviewData } from "./read";
import { resumePrompt, searchPrompt } from "./prompts";

const portalSites = [
  {
    name: "LinkedIn India",
    url: "https://www.linkedin.com/jobs/search/?location=India",
    detail: "Openings & referrals",
    icon: "in",
  },
  { name: "Naukri", url: "https://www.naukri.com/", detail: "Recruiter discovery", icon: "n" },
  { name: "Instahyre", url: "https://www.instahyre.com/", detail: "Tech opportunities", icon: "i" },
  { name: "Cutshort", url: "https://cutshort.io/", detail: "Startup & tech roles", icon: "c" },
  { name: "Hirist", url: "https://www.hirist.tech/", detail: "Technology roles", icon: "h" },
];
const panel = "rounded-card border border-border bg-card";
const nav = [
  ["home", "Home", House],
  ["find", "Find openings", Search],
  ["resumes", "Resumes", FileText],
  ["applications", "Applications", BriefcaseBusiness],
] as const;

function SiteIcon({ name }: { name: string }) {
  const normalized = name.toLowerCase();
  if (normalized.includes("linkedin"))
    return (
      <span className="text-2xl font-bold tracking-tighter" aria-hidden>
        in
      </span>
    );
  if (normalized.includes("github")) return <CodeXml size={26} strokeWidth={1.7} aria-hidden />;
  if (normalized.includes("portfolio")) return <Globe size={26} strokeWidth={1.7} aria-hidden />;
  return <Building2 size={25} strokeWidth={1.7} aria-hidden />;
}

function CopyButton({ text, label = "Copy prompt" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState("");
  const pending = useRef(false);
  async function copy() {
    if (pending.current) return;
    pending.current = true;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(text);
      setError("");
    } catch {
      setError("Clipboard unavailable. Select the prompt text and copy it manually.");
    } finally {
      pending.current = false;
    }
  }
  return (
    <div className="space-y-2">
      <Button type="button" onClick={copy}>
        {copied === text ? <Check size={17} aria-hidden /> : <Copy size={17} aria-hidden />}
        {copied === text ? "Copied" : label}
      </Button>
      <span role="status" className={error ? "block text-sm text-destructive" : "sr-only"}>
        {error || (copied === text ? "Prompt copied. Paste it in ChatGPT or Claude." : "")}
      </span>
    </div>
  );
}

function PromptPanel({ prompt, compact }: { prompt: string; compact: boolean }) {
  const [edit, setEdit] = useState(false);
  const [override, setOverride] = useState<{ base: string; value: string } | null>(null);
  const value = override?.base === prompt ? override.value : prompt;
  return (
    <section className={cn(panel, "overflow-hidden")} aria-label="Your complete prompt">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-5 py-4 sm:px-7">
        <div>
          <h2 className="text-lg font-semibold">Your prompt, ready to use</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Copy into your existing ChatGPT or Claude conversation.
          </p>
        </div>
        <CopyButton text={value} />
      </div>
      <div className="p-5 sm:p-7">
        {edit || compact ? (
          <textarea
            aria-label="Edit complete prompt"
            className="min-h-[34rem] resize-y !bg-card !p-4 !leading-7"
            value={value}
            onChange={(event) => setOverride({ base: prompt, value: event.target.value })}
          />
        ) : (
          <div className="max-w-[78ch] whitespace-pre-wrap text-[15px] leading-7" tabIndex={0}>
            {value}
          </div>
        )}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          {!compact && (
            <Button variant="outline" onClick={() => setEdit(!edit)}>
              {edit ? "Finish editing" : "Edit prompt"}
            </Button>
          )}
          {override?.base === prompt && (
            <Button variant="ghost" onClick={() => setOverride(null)}>
              Reset my edits
            </Button>
          )}
          <p className="text-sm text-muted-foreground">
            Your assistant can use what it already knows about you.
          </p>
        </div>
      </div>
    </section>
  );
}

function Chart({
  series,
  compact,
  label,
}: {
  series: { label: string; value: number }[];
  compact: boolean;
  label: string;
}) {
  const max = Math.max(1, ...series.map((item) => item.value));
  const points = series
    .map((item, index) => `${60 + index * 120},${145 - (item.value / max) * 110}`)
    .join(" ");
  return (
    <figure aria-label={label}>
      <svg
        viewBox="0 0 480 180"
        className="w-full text-primary"
        role="img"
        aria-label={`${label}: ${series.map((item) => `${item.label}: ${item.value}`).join(", ")}`}
      >
        {[35, 90, 145].map((y) => (
          <line
            key={y}
            x1="20"
            x2="465"
            y1={y}
            y2={y}
            className="stroke-border"
            strokeDasharray="3 5"
          />
        ))}
        {compact ? (
          <>
            <polyline points={points} fill="none" stroke="currentColor" strokeWidth="3" />
            {series.map((item, index) => (
              <circle
                key={item.label}
                cx={60 + index * 120}
                cy={145 - (item.value / max) * 110}
                r="4"
                fill="currentColor"
              />
            ))}
          </>
        ) : (
          series.map((item, index) => (
            <rect
              key={item.label}
              x={42 + index * 120}
              y={145 - (item.value / max) * 110}
              width="36"
              height={(item.value / max) * 110}
              rx="5"
              fill="currentColor"
            />
          ))
        )}
        {series.map((item, index) => (
          <g key={item.label}>
            <text
              x={60 + index * 120}
              y={Math.max(20, 131 - (item.value / max) * 110)}
              textAnchor="middle"
              className="fill-foreground text-[13px]"
            >
              {item.value}
            </text>
            <text
              x={60 + index * 120}
              y="170"
              textAnchor="middle"
              className="fill-muted-foreground text-[12px]"
            >
              {item.label}
            </text>
          </g>
        ))}
      </svg>
      <figcaption className="mt-3 text-sm text-muted-foreground">
        {series.every((item) => item.value === 0)
          ? "No recorded activity yet. Your graph will fill as you save and apply."
          : "Based on your recorded activity in JobOps."}
      </figcaption>
    </figure>
  );
}

export function SimpleWorkspace({
  screen,
  compact,
  data,
}: {
  screen: string;
  compact: boolean;
  data: SimplePreviewData;
}) {
  const href = (page: string) =>
    `/gallery/simple${page === "home" ? "" : `/${page}`}${compact ? "?layout=compact" : ""}`;
  const [role, setRole] = useState(data.role);
  const [location, setLocation] = useState(data.location);
  const [context, setContext] = useState(data.context);
  const [company, setCompany] = useState("");
  const [jobRole, setJobRole] = useState("");
  const [description, setDescription] = useState("");
  const [jobSaved, setJobSaved] = useState(false);
  const [metric, setMetric] = useState("saved");
  const [selectedResume, setSelectedResume] = useState(data.resumes[0]?.id ?? "");
  const [localFile, setLocalFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [fileTab, setFileTab] = useState("File");
  const upload = useRef<HTMLInputElement>(null);
  useEffect(() => {
    return () => {
      if (fileUrl) URL.revokeObjectURL(fileUrl);
    };
  }, [fileUrl]);
  const version = data.resumes.find((item) => item.id === selectedResume);
  const publicCards: { name: string; url: string | null }[] = [...data.sites];
  for (const name of ["LinkedIn", "GitHub", "Portfolio"])
    if (!publicCards.some((item) => item.name.toLowerCase().includes(name.toLowerCase())))
      publicCards.push({ name, url: null });
  const applied = data.applications.filter((item) => item.appliedAt);
  const today = new Date(
    `${new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(data.today))}T00:00:00+05:30`,
  ).valueOf();
  const end = today + 86400000;
  const dateFormat = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
  });
  const series = Array.from({ length: 4 }, (_, index) => {
    const start = end - (4 - index) * 7 * 86400000;
    const dates =
      metric === "saved"
        ? data.openings.map((item) => item.createdAt)
        : applied.map((item) => item.appliedAt!);
    return {
      label: dateFormat.format(start),
      value: dates.filter(
        (value) =>
          new Date(value).valueOf() >= start && new Date(value).valueOf() < start + 7 * 86400000,
      ).length,
    };
  });
  const stats = [
    { label: "Saved openings", value: data.openings.length, page: "find" },
    { label: "Applications sent", value: applied.length, page: "applications" },
    {
      label: "Interview stage",
      value: data.applications.filter(
        (item) => item.status.includes("INTERVIEW") || item.status === "RECRUITER_SCREEN",
      ).length,
      page: "applications",
    },
    {
      label: "Offers",
      value: data.applications.filter((item) => item.status === "OFFER").length,
      page: "applications",
    },
  ];
  const siteDescriptions: Record<string, string> = {
    linkedin: "Your experience & professional network",
    github: "Evidence of the things you build",
    portfolio: "Your best work, in one place",
  };
  const activeScreen =
    screen === "job"
      ? "find"
      : screen === "resume-prompt"
        ? "resumes"
        : screen === "sites"
          ? "home"
          : screen;
  function toggleTheme() {
    const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("jobops-theme", next);
    } catch {
      /* Session-only theme. */
    }
    window.dispatchEvent(new Event("jobops-theme"));
  }
  const header = (title: string, subtitle: string, action?: ReactNode) => (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
        <p className="mt-3 max-w-2xl text-base text-muted-foreground">{subtitle}</p>
      </div>
      {action}
    </div>
  );
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <div className="border-b border-border bg-selected px-4 py-2.5 text-selected-foreground">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2">
          <p className="text-xs sm:text-sm">
            <strong>Live design preview</strong> · Real records. Changes here are temporary.
          </p>
          <div className="flex gap-1" aria-label="Compare layouts">
            <Button asChild size="sm" variant={compact ? "ghost" : "default"}>
              <Link
                href={`/gallery/simple${screen === "home" ? "" : `/${screen}`}`}
                aria-current={!compact ? "true" : undefined}
              >
                A · Spacious
              </Link>
            </Button>
            <Button asChild size="sm" variant={compact ? "default" : "ghost"}>
              <Link
                href={`/gallery/simple${screen === "home" ? "" : `/${screen}`}?layout=compact`}
                aria-current={compact ? "true" : undefined}
              >
                B · Compact
              </Link>
            </Button>
          </div>
        </div>
      </div>
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-8">
          <Link
            href={href("home")}
            className="flex items-center gap-3 text-lg font-semibold text-foreground hover:no-underline"
          >
            <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground">
              J
            </span>
            JobOps
          </Link>
          <nav
            aria-label="Preview pages"
            className="order-3 flex w-full gap-1 overflow-x-auto pb-1 md:order-none md:w-auto md:pb-0"
          >
            {nav.map(([key, name, Icon]) => (
              <Link
                key={key}
                href={href(key)}
                aria-current={activeScreen === key ? "page" : undefined}
                className={cn(
                  "pressable flex min-h-11 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-medium hover:no-underline",
                  activeScreen === key
                    ? "bg-selected text-selected-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {!compact && <Icon size={16} aria-hidden />}
                {name}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Button variant="ghost" asChild className="px-3">
              <Link href="/inbox">
                <Mail size={17} aria-hidden />
                <span className="hidden sm:inline">Inbox</span>
                <span className="sr-only sm:hidden">Inbox</span>
              </Link>
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={toggleTheme}
              aria-label="Switch light or dark theme"
            >
              <Sun size={17} aria-hidden />
            </Button>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-10">
        {screen === "home" && (
          <div className="space-y-9">
            <section className="flex flex-wrap items-center justify-between gap-6">
              <div>
                <p className="mb-2 text-sm text-muted-foreground">Your job search in India</p>
                <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                  {data.name ? `${data.name}, find your next role.` : "Find your next role."}
                </h1>
                <p className="mt-3 max-w-xl text-base text-muted-foreground">
                  Your sites, your resumes, and a clear place to start.
                </p>
              </div>
              <Button asChild className="min-h-12 px-7">
                <Link href={href("find")}>
                  <Search size={18} aria-hidden />
                  Find openings
                  <ArrowRight size={17} aria-hidden />
                </Link>
              </Button>
            </section>
            <section aria-labelledby="my-sites-heading">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 id="my-sites-heading" className="text-xl font-semibold">
                  Your online presence
                </h2>
                <Link href={href("sites")} className="text-sm text-link hover:underline">
                  Manage links
                </Link>
              </div>
              <div
                className={cn(
                  "grid gap-3",
                  compact ? "sm:grid-cols-2 lg:grid-cols-3" : "sm:grid-cols-3",
                )}
              >
                {publicCards.map((site, index) => (
                  <Link
                    key={`${site.name}-${index}`}
                    href={site.url || href("sites")}
                    target={site.url ? "_blank" : undefined}
                    rel={site.url ? "noreferrer" : undefined}
                    className={cn(
                      panel,
                      "pressable group flex gap-4 p-5 text-foreground hover:border-primary hover:no-underline",
                      !compact && "sm:flex-col sm:p-6",
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-selected text-selected-foreground">
                        <SiteIcon name={site.name} />
                      </span>
                      {!compact && (
                        <ArrowUpRight
                          size={18}
                          className="text-muted-foreground group-hover:text-primary"
                          aria-hidden
                        />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold">{site.name}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {siteDescriptions[
                          Object.keys(siteDescriptions).find((key) =>
                            site.name.toLowerCase().includes(key),
                          ) ?? ""
                        ] || "Showcase your work and experience"}
                      </p>
                      <p className="mt-3 text-sm font-medium text-link">
                        {site.url ? "Open profile" : "Add your link"}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
            <section aria-labelledby="job-sites-heading">
              <h2 id="job-sites-heading" className="mb-4 text-xl font-semibold">
                Places to find openings
              </h2>
              <div
                className={cn(
                  "grid gap-3",
                  compact
                    ? "grid-cols-1 sm:grid-cols-3 lg:grid-cols-5"
                    : "sm:grid-cols-2 lg:grid-cols-5",
                )}
              >
                {portalSites.map((site) => (
                  <a
                    key={site.name}
                    href={site.url}
                    target="_blank"
                    rel="noreferrer"
                    className={cn(
                      panel,
                      "pressable group flex items-center gap-3 p-4 text-foreground hover:border-primary hover:no-underline",
                      !compact && "lg:flex-col lg:items-start lg:p-5",
                    )}
                  >
                    <span
                      aria-hidden
                      className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-xl font-semibold"
                    >
                      {site.icon}
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
            </section>
            <section aria-labelledby="metrics-heading" className="space-y-4">
              <div>
                <h2 id="metrics-heading" className="text-xl font-semibold">
                  Your search in numbers
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Recorded in JobOps. Profile views and site analytics are not connected.
                </p>
              </div>
              <div
                className={cn(
                  "grid grid-cols-2 gap-3 sm:grid-cols-4",
                  compact && "rounded-card border border-border bg-card p-2",
                )}
              >
                {stats.map((stat) => (
                  <Link
                    key={stat.label}
                    href={href(stat.page)}
                    className={cn(
                      "pressable p-5 text-foreground hover:bg-selected hover:no-underline",
                      compact ? "rounded-xl" : panel,
                    )}
                  >
                    <p className="text-3xl font-semibold tabular-nums">{stat.value}</p>
                    <p className="mt-2 text-sm text-muted-foreground">{stat.label}</p>
                  </Link>
                ))}
              </div>
              <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
                <div className={cn(panel, "p-5 sm:p-6")}>
                  <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="font-semibold">Activity over 4 weeks</h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Week starting · India time
                      </p>
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <span className="sr-only">Activity to display</span>
                      <select
                        className="!w-auto !bg-card"
                        value={metric}
                        onChange={(event) => setMetric(event.target.value)}
                      >
                        <option value="saved">Saved openings</option>
                        <option value="applied">Applications sent</option>
                      </select>
                    </label>
                  </div>
                  <Chart
                    series={series}
                    compact={compact}
                    label={
                      metric === "saved" ? "Saved openings per week" : "Applications sent per week"
                    }
                  />
                </div>
                <div className={cn(panel, "p-5 sm:p-6")}>
                  <h3 className="font-semibold">Where you found openings</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Saved openings by source · all time
                  </p>
                  <div className="mt-6 space-y-4">
                    {(data.openings.length
                      ? [...new Set(data.openings.map((item) => item.source))]
                      : ["LinkedIn", "Naukri", "Other sites"]
                    ).map((source) => {
                      const count = data.openings.filter((item) => item.source === source).length;
                      return (
                        <div key={source}>
                          <div className="mb-2 flex justify-between text-sm">
                            <span>{source}</span>
                            <span className="tabular-nums">{count}</span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-secondary">
                            <div
                              className="h-full rounded-full bg-primary"
                              style={{
                                width: `${data.openings.length ? (count / data.openings.length) * 100 : 0}%`,
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </section>
            <details className={cn(panel, "p-5")}>
              <summary className="cursor-pointer font-medium">First time? See the steps</summary>
              <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm text-muted-foreground">
                <li>
                  Open Find openings. Copy the prompt into your ChatGPT or Claude conversation.
                </li>
                <li>Choose an opening and copy its full job description into the job page.</li>
                <li>
                  Use the resume prompt with your actual file. Upload the revised file and record
                  its changes.
                </li>
                <li>
                  Choose direct apply or referral. Record what you sent and the resume you used.
                </li>
                <li>Refresh Inbox when you want to check replies and deadlines.</li>
              </ol>
            </details>
          </div>
        )}

        {screen === "find" && (
          <div className="space-y-6">
            {header(
              "Find openings",
              "Copy the prompt, paste it into ChatGPT or Claude, then choose a role.",
            )}
            <PromptPanel compact={compact} prompt={searchPrompt(role, location, context)} />
            <details className={cn(panel, "p-5")}>
              <summary className="cursor-pointer font-medium">
                Adjust role, location or preferences
              </summary>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="space-y-2">
                  Role
                  <input
                    value={role}
                    onChange={(event) => setRole(event.target.value)}
                    placeholder="Use what my assistant knows about me"
                  />
                </label>
                <label className="space-y-2">
                  Location
                  <input
                    value={location}
                    onChange={(event) => setLocation(event.target.value)}
                    placeholder="India"
                  />
                </label>
                <label className="space-y-2 sm:col-span-2">
                  My preferences
                  <textarea
                    value={context}
                    onChange={(event) => setContext(event.target.value)}
                    placeholder="Paste preferences from your existing conversations, or leave this blank."
                  />
                </label>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                Changing these fields refreshes the prompt above and replaces any direct prompt
                edits.
              </p>
            </details>
            <div className={cn(panel, "flex flex-wrap items-center justify-between gap-4 p-6")}>
              <div>
                <h2 className="font-semibold">Found a role you like?</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Bring the link and full job description back here.
                </p>
              </div>
              <Button variant="outline" asChild>
                <Link href={href("job")}>
                  Add a job description
                  <ArrowRight size={16} aria-hidden />
                </Link>
              </Button>
            </div>
            {data.openings.length > 0 && (
              <section>
                <h2 className="mb-3 text-xl font-semibold">Your saved openings</h2>
                <div className={cn(panel, "divide-y divide-border")}>
                  {data.openings.map((job) => (
                    <Link
                      key={job.id}
                      href={`/jobs/${job.id}`}
                      className="flex items-center justify-between gap-4 p-5 text-foreground hover:bg-selected hover:no-underline"
                    >
                      <div>
                        <h3 className="font-semibold">{job.role}</h3>
                        <p className="text-sm text-muted-foreground">
                          {job.company} · {job.source}
                        </p>
                      </div>
                      <ArrowUpRight size={17} aria-hidden />
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        {screen === "job" && (
          <div className="mx-auto max-w-3xl space-y-6">
            {header(
              "Save a job description",
              "Keep the actual description so your resume review has the right context.",
            )}
            <form
              className={cn(panel, "space-y-5 p-6")}
              onSubmit={(event) => {
                event.preventDefault();
                setJobSaved(true);
              }}
              onChange={() => setJobSaved(false)}
            >
              <div className="grid gap-5 sm:grid-cols-2">
                <label className="space-y-2">
                  Company
                  <input
                    required
                    value={company}
                    onChange={(event) => setCompany(event.target.value)}
                  />
                </label>
                <label className="space-y-2">
                  Role
                  <input
                    required
                    value={jobRole}
                    onChange={(event) => setJobRole(event.target.value)}
                  />
                </label>
              </div>
              <label className="block space-y-2">
                Job link
                <input required type="url" placeholder="https://…" />
              </label>
              <label className="block space-y-2">
                Full job description
                <textarea
                  required
                  rows={12}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Paste the full description from the listing."
                />
              </label>
              <Button>
                {jobSaved ? <Check size={17} aria-hidden /> : <Plus size={17} aria-hidden />}
                {jobSaved ? "Added to this preview" : "Try saving this job"}
              </Button>
              <p role="status" className="text-sm text-muted-foreground">
                {jobSaved
                  ? `${company} · ${jobRole} is ready to use below. This preview does not save to your library.`
                  : "Preview form — nothing is saved to your library."}
              </p>
            </form>
            {jobSaved && (
              <PromptPanel
                compact={compact}
                prompt={resumePrompt(company, jobRole, description, context)}
              />
            )}
          </div>
        )}

        {screen === "resume-prompt" && (
          <div className="space-y-6">
            {header(
              "Review my resume",
              "Attach your actual file in ChatGPT or Claude and work through changes there.",
            )}
            <PromptPanel
              compact={compact}
              prompt={resumePrompt(company, jobRole, description, context)}
            />
            <Button variant="outline" asChild>
              <Link href={href("resumes")}>Back to my files</Link>
            </Button>
          </div>
        )}

        {screen === "resumes" && (
          <div className="space-y-6">
            {header(
              "Your resumes",
              "Originals and revised files, with the roles they were used for.",
              <Button onClick={() => upload.current?.click()}>
                <Upload size={17} aria-hidden />
                Preview a PDF
              </Button>,
            )}
            <input
              ref={upload}
              type="file"
              accept="application/pdf,.pdf"
              className="sr-only"
              aria-label="Choose a resume PDF for this preview"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                if (
                  !file.name.toLowerCase().endsWith(".pdf") ||
                  file.size > 10 * 1024 * 1024 ||
                  !file.size
                ) {
                  setUploadError("Choose a non-empty PDF up to 10 MiB.");
                  return;
                }
                const signature = await file.slice(0, 5).text();
                if (upload.current?.files?.[0] !== file) return;
                if (signature !== "%PDF-") {
                  setUploadError("This file is not a PDF. Choose an exported PDF resume.");
                  return;
                }
                setLocalFile(file);
                setFileUrl(URL.createObjectURL(new Blob([file], { type: "application/pdf" })));
                setUploadError("");
                setFileTab("File");
              }}
            />
            {uploadError && (
              <p role="alert" className="text-destructive">
                {uploadError}
              </p>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-selected p-5 text-selected-foreground">
              <p className="text-sm">Want to tailor a version for a specific role?</p>
              <Button variant="outline" asChild>
                <Link href={href("resume-prompt")}>
                  Open resume prompt
                  <ArrowRight size={16} aria-hidden />
                </Link>
              </Button>
            </div>
            <div className={cn("grid gap-5", !compact && "lg:grid-cols-[280px_minmax(0,1fr)]")}>
              <section aria-label="Resume versions" className={cn(panel, "p-4")}>
                <h2 className="mb-4 font-semibold">Your files</h2>
                {data.resumes.length ? (
                  <div className={cn("grid gap-2", compact && "sm:grid-cols-2")}>
                    {data.resumes.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => {
                          setSelectedResume(item.id);
                          setLocalFile(null);
                          setFileUrl("");
                        }}
                        aria-pressed={!localFile && selectedResume === item.id}
                        className={cn(
                          "pressable rounded-xl border p-4 text-left",
                          !localFile && selectedResume === item.id
                            ? "border-primary bg-selected text-selected-foreground"
                            : "border-border hover:bg-muted",
                        )}
                      >
                        <FileText size={20} className="mb-3" aria-hidden />
                        <strong className="block text-sm">{item.label}</strong>
                        <span className="mt-1 block break-all text-xs text-muted-foreground">
                          {item.filename}
                        </span>
                        <span className="mt-2 block text-xs text-muted-foreground">
                          {item.usage.length} recorded applications
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No uploaded resumes yet. Try a PDF to see how the viewer feels.
                  </p>
                )}
                {localFile && (
                  <div
                    role="status"
                    className="mt-3 rounded-xl bg-selected p-4 text-sm text-selected-foreground"
                  >
                    <Check size={18} className="mb-2" aria-hidden />
                    <strong className="block break-all">{localFile.name}</strong>
                    <p className="mt-2">Local preview only. Your file has not been uploaded.</p>
                  </div>
                )}
              </section>
              <section
                className={cn(panel, "min-w-0 overflow-hidden")}
                aria-label="Selected resume"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
                  <div className="flex flex-wrap gap-1" aria-label="Resume details">
                    {["File", "Bullet changes", "Used for", "ATS assessment"].map((tab) => (
                      <Button
                        key={tab}
                        variant={fileTab === tab ? "secondary" : "ghost"}
                        aria-pressed={fileTab === tab}
                        className="px-3 text-xs"
                        onClick={() => setFileTab(tab)}
                      >
                        {tab}
                      </Button>
                    ))}
                  </div>
                  {(localFile || version) && (
                    <Button variant="outline" size="sm" asChild>
                      <a
                        href={localFile ? fileUrl : `/api/resumes/${version!.id}/file?download=1`}
                        download={localFile?.name}
                      >
                        <ArrowDownToLine size={15} aria-hidden />
                        Download
                      </a>
                    </Button>
                  )}
                </div>
                {fileTab === "File" &&
                  (localFile || version ? (
                    <iframe
                      title="Selected resume PDF"
                      className="h-[650px] w-full bg-white"
                      src={localFile ? fileUrl : `/api/resumes/${version!.id}/file`}
                    />
                  ) : (
                    <div className="grid min-h-80 place-items-center p-8 text-center">
                      <div>
                        <FileText
                          size={40}
                          strokeWidth={1.4}
                          className="mx-auto mb-5 text-primary"
                          aria-hidden
                        />
                        <h3 className="text-lg font-medium">Your actual resume belongs here</h3>
                        <p className="mx-auto mt-2 max-w-xs text-sm text-muted-foreground">
                          View your PDF, keep each version, and track where you use it.
                        </p>
                        <Button
                          variant="outline"
                          className="mt-5"
                          onClick={() => upload.current?.click()}
                        >
                          Choose a PDF
                        </Button>
                      </div>
                    </div>
                  ))}
                {fileTab === "Bullet changes" && (
                  <div className="space-y-4 p-6">
                    <h3 className="font-semibold">What changed in this version?</h3>
                    <p className="text-sm text-muted-foreground">
                      Keep the bullet-by-bullet edits your assistant helped you make.
                    </p>
                    <label className="block space-y-2">
                      Change notes
                      <textarea
                        rows={6}
                        placeholder={
                          "• Original bullet → revised bullet\n• Why it changed\n• Facts you confirmed"
                        }
                      />
                    </label>
                    <p className="text-xs text-muted-foreground">
                      Try editing these notes. They are temporary in this preview.
                    </p>
                  </div>
                )}
                {fileTab === "Used for" && (
                  <div className="p-6">
                    <h3 className="mb-4 font-semibold">Company and role</h3>
                    {!localFile && version?.usage.length ? (
                      version.usage.map((item, index) => (
                        <div key={index} className="border-b border-border py-4">
                          <p className="font-medium">{item.company}</p>
                          <p className="text-sm text-muted-foreground">
                            {item.role} · {item.status.toLowerCase().replaceAll("_", " ")}
                          </p>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No recorded applications for this file. A submitted application will show
                        its company, role and the exact resume used.
                      </p>
                    )}
                  </div>
                )}
                {fileTab === "ATS assessment" && (
                  <div className="space-y-5 p-6">
                    <div>
                      <h3 className="font-semibold">Assessment for a specific job</h3>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Save the score, method and feedback from your assistant or an assessment
                        tool. Scores are estimates, not employer ATS results.
                      </p>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="space-y-2">
                        Score out of 100
                        <input type="number" min="0" max="100" placeholder="Not assessed" />
                      </label>
                      <label className="space-y-2">
                        Assessed by
                        <input placeholder="e.g. Claude · rubric name" />
                      </label>
                      <label className="space-y-2">
                        Company
                        <input placeholder="Company for this assessment" />
                      </label>
                      <label className="space-y-2">
                        Role
                        <input placeholder="Exact job title" />
                      </label>
                    </div>
                    <label className="block space-y-2">
                      Findings and scoring method
                      <textarea placeholder="Keywords covered, missing evidence, formatting issues, date and scoring method." />
                    </label>
                    <p className="text-xs text-muted-foreground">
                      Temporary preview fields. Save support will be part of the selected design.
                    </p>
                    {!localFile &&
                      version?.matches.map((match, index) => (
                        <div key={index} className="rounded-xl bg-secondary p-4">
                          <p className="font-medium">
                            Keyword coverage: {Math.round(match.score)}%
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {match.company} · {match.role}
                          </p>
                          <p className="mt-2 text-xs text-muted-foreground">
                            Existing dictionary match, separate from an ATS assessment.
                          </p>
                        </div>
                      ))}
                  </div>
                )}
              </section>
            </div>
          </div>
        )}

        {screen === "applications" && (
          <div className="space-y-6">
            {header(
              "Your applications",
              "See which role you applied to, the resume you used, and what happened next.",
            )}
            <div className={cn(panel, "p-6")}>
              {data.applications.length ? (
                <div className="divide-y divide-border">
                  {data.applications.map((item) => (
                    <Link
                      key={item.id}
                      href={`/applications/${item.id}`}
                      className="flex flex-wrap items-center justify-between gap-4 py-4 text-foreground"
                    >
                      <div>
                        <h2 className="font-semibold">{item.company}</h2>
                        <p className="text-sm text-muted-foreground">{item.role}</p>
                      </div>
                      <span className="rounded-full bg-selected px-3 py-1 text-sm text-selected-foreground">
                        {item.status.toLowerCase().replaceAll("_", " ")}
                      </span>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="py-12 text-center">
                  <BriefcaseBusiness
                    size={38}
                    className="mx-auto mb-5 text-primary"
                    strokeWidth={1.5}
                    aria-hidden
                  />
                  <h2 className="text-xl font-semibold">No applications recorded yet</h2>
                  <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
                    Start with an opening. Once your resume is ready, choose direct apply or a
                    referral and record what you sent.
                  </p>
                  <Button asChild className="mt-6">
                    <Link href={href("find")}>Find an opening</Link>
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        {screen === "sites" && (
          <div className="mx-auto max-w-3xl space-y-6">
            {header("Your sites", "Bring your profiles and portfolio links together.")}
            <SiteEditor data={data} compact={compact} />
            <Button variant="outline" asChild>
              <Link href={href("home")}>Back to home</Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function SiteEditor({ data, compact }: { data: SimplePreviewData; compact: boolean }) {
  const [kind, setKind] = useState("LinkedIn");
  const [notice, setNotice] = useState("");
  return (
    <form
      className={cn(panel, "space-y-5 p-6")}
      onSubmit={(event) => {
        event.preventDefault();
        setNotice(`${kind} link checked. This preview does not save changes.`);
      }}
      onChange={() => setNotice("")}
    >
      {compact ? (
        <fieldset>
          <legend className="mb-3 font-medium">Website</legend>
          <div className="flex flex-wrap gap-2">
            {["LinkedIn", "GitHub", "Portfolio", "Other"].map((site) => (
              <Button
                key={site}
                type="button"
                variant={kind === site ? "secondary" : "outline"}
                aria-pressed={kind === site}
                onClick={() => {
                  setKind(site);
                  setNotice("");
                }}
              >
                {site}
              </Button>
            ))}
          </div>
        </fieldset>
      ) : (
        <label className="block space-y-2">
          Website
          <select value={kind} onChange={(event) => setKind(event.target.value)}>
            {["LinkedIn", "GitHub", "Portfolio", "Other"].map((site) => (
              <option key={site}>{site}</option>
            ))}
          </select>
        </label>
      )}
      <label className="block space-y-2">
        Your {kind.toLowerCase()} URL
        <input
          key={kind}
          type="url"
          required
          defaultValue={data.sites.find((site) => site.name === kind)?.url ?? ""}
          placeholder="https://…"
        />
      </label>
      <label className="block space-y-2">
        What would you like to improve?
        <textarea placeholder="e.g. Showcase a project with a clear problem, my contribution and a working demo." />
      </label>
      <Button type="submit">
        {notice ? <Check size={17} aria-hidden /> : <Plus size={17} aria-hidden />}
        {notice ? "Link checked" : "Try this link"}
      </Button>
      <p role="status" className="text-sm text-muted-foreground">
        {notice || "Changes are temporary while you compare the layouts."}
      </p>
    </form>
  );
}
