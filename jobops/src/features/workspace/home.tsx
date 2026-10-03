import Link from "next/link";
import { ActivityChart } from "./activity-chart";
import { IdentityCard } from "./identity-card";
import { ProfileMosaic } from "./profile-mosaic";
import { profileLinks } from "./profile-links";
import { JobSiteCards } from "./sites";
import type { WorkspaceData } from "./read";
export function WorkspaceHome({ data }: { data: WorkspaceData }) {
  const stats = [
    { label: "Saved openings", value: data.openings.length, href: "/jobs" },
    {
      label: "Applications sent",
      value: data.applications.filter((app) => app.appliedAt).length,
      href: "/applications?tab=records&filter=active",
    },
    {
      label: "Interview stage",
      value: data.applications.filter(
        (app) => app.status.includes("INTERVIEW") || app.status === "RECRUITER_SCREEN",
      ).length,
      href: "/applications?tab=records&filter=interviewing",
    },
    {
      label: "Offers",
      value: data.applications.filter((app) => app.status === "OFFER").length,
      href: "/applications?tab=records&filter=interviewing",
    },
  ];
  const sources = data.openings.length
    ? [...new Set(data.openings.map((job) => job.source))]
    : ["LinkedIn", "Naukri", "Other sites"];
  const links = profileLinks(data.sites);
  return (
    <div className="space-y-9">
      <IdentityCard identity={data.identity} links={links} resume={data.currentResume} />
      <section aria-labelledby="home-profiles">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id="home-profiles" className="text-xl font-semibold">
            Your profiles
          </h2>
          <Link href="/my-profile" className="text-sm text-link">
            Manage links
          </Link>
        </div>
        <ProfileMosaic links={links} resume={data.currentResume} />
      </section>
      <section aria-labelledby="home-sites">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 id="home-sites" className="text-xl font-semibold">
            Places to find openings
          </h2>
          <Link href="/companies" className="text-sm text-link">
            Browse Bengaluru & Hyderabad companies
          </Link>
        </div>
        <JobSiteCards role={data.identity.searchRole} city={data.identity.searchCity} />
      </section>
      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold">Your search in numbers</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Recorded in JobOps. Site analytics are not connected.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {stats.map((stat) => (
            <Link
              key={stat.label}
              href={stat.href}
              className="pressable rounded-card border border-border bg-card p-5 text-foreground hover:bg-selected hover:no-underline"
            >
              <p className="text-3xl font-semibold tabular-nums">{stat.value}</p>
              <p className="mt-2 text-sm text-muted-foreground">{stat.label}</p>
            </Link>
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
          <ActivityChart data={data} />
          <div className="rounded-card border border-border bg-card p-5 sm:p-6">
            <h3 className="font-semibold">Where you found openings</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Saved openings by source · all time
            </p>
            <div className="mt-6 space-y-4">
              {sources.map((source) => {
                const count = data.openings.filter((job) => job.source === source).length;
                return (
                  <div key={source}>
                    <div className="mb-2 flex justify-between text-sm">
                      <span>{source.replaceAll("_", " ")}</span>
                      <span>{count}</span>
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
      <details className="rounded-card border border-border bg-card p-5">
        <summary className="cursor-pointer font-medium">First time? See the steps</summary>
        <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm text-muted-foreground">
          <li>
            <Link href="/find" className="text-link">
              Find openings
            </Link>
            : copy the prompt into your ChatGPT or Claude conversation.
          </li>
          <li>
            <Link href="/jobs/new" className="text-link">
              Save a job description
            </Link>
            : bring back its full text and source link.
          </li>
          <li>
            <Link href="/resume-prompt" className="text-link">
              Review your resume
            </Link>
            : use your actual file in your assistant, then upload the revised version.
          </li>
          <li>
            <Link href="/applications/new" className="text-link">
              Record an application
            </Link>{" "}
            or referral and the exact resume you used.
          </li>
          <li>
            <Link href="/inbox" className="text-link">
              Refresh Inbox
            </Link>{" "}
            when you want to check replies and deadlines.
          </li>
        </ol>
      </details>
    </div>
  );
}
