"use client";

import Link from "next/link";
import {
  ArrowUpRight,
  BriefcaseBusiness,
  FileText,
  Inbox,
  MapPin,
  NotebookPen,
  Search,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui";
import { favicon, githubAvatar, type Identity, type ProfileLink, type ResumeRef } from "./data";
import { RemoteImage } from "./embeds";

export type HeroProps = { identity: Identity; links: ProfileLink[]; resume: ResumeRef | null };

const stagger = (index: number) => ({ "--i": index }) as React.CSSProperties;

function Avatar({
  links,
  identity,
  size,
}: {
  links: ProfileLink[];
  identity: Identity;
  size: string;
}) {
  const github = links.find((link) => link.kind === "github");
  if (github)
    return (
      <RemoteImage
        src={githubAvatar(github.handle)}
        alt=""
        className={`${size} shrink-0 rounded-full border border-border`}
      />
    );
  return (
    <span
      aria-hidden
      className={`${size} grid shrink-0 place-items-center rounded-full bg-selected text-xl font-semibold text-selected-foreground`}
    >
      {identity.fullName.slice(0, 1)}
    </span>
  );
}

function headline(identity: Identity) {
  return [identity.role, identity.company].filter(Boolean).join(" at ");
}

function LinkChip({ link }: { link: ProfileLink }) {
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noreferrer"
      aria-label={`${link.name}, ${link.handle} (opens in a new tab)`}
      className="pressable inline-flex min-h-9 max-w-full items-center gap-2 rounded-full border border-border bg-background px-3 text-sm text-foreground hover:border-primary hover:no-underline"
    >
      <RemoteImage src={favicon(link.host)} alt="" className="size-4 rounded-sm" />
      <span className="truncate">{link.kind === "portfolio" ? "Portfolio" : link.handle}</span>
      <ArrowUpRight size={14} className="shrink-0 text-muted-foreground" aria-hidden />
    </a>
  );
}

function Facts({ identity, resume }: { identity: Identity; resume: ResumeRef | null }) {
  const facts = [
    identity.city && { icon: MapPin, text: identity.city },
    identity.years !== null && {
      icon: BriefcaseBusiness,
      text: `${identity.years} years experience`,
    },
    resume && {
      icon: FileText,
      text: `Current resume: ${resume.label}`,
      href: `/resumes?resume=${resume.familyId}`,
    },
  ].filter(Boolean) as { icon: typeof MapPin; text: string; href?: string }[];
  return (
    <ul className="m-0 flex list-none flex-wrap gap-x-5 gap-y-2 p-0 text-sm text-muted-foreground">
      {facts.map(({ icon: Icon, text, href }) => (
        <li key={text} className="flex items-center gap-1.5">
          <Icon size={15} aria-hidden />
          {href ? (
            <Link href={href} className="text-link">
              {text}
            </Link>
          ) : (
            text
          )}
        </li>
      ))}
    </ul>
  );
}

/** A. Who you are, in one card, with Find openings to the right. */
export function HeroIdentity({ identity, links, resume }: HeroProps) {
  return (
    <section className="rounded-panel border border-border bg-card p-6 shadow-surface sm:p-8">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="hg-enter" style={stagger(0)}>
          <Avatar links={links} identity={identity} size="size-20" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="hg-enter m-0 text-3xl font-semibold tracking-tight" style={stagger(1)}>
            {identity.fullName}
          </h3>
          <p className="hg-enter mt-1 text-lg text-muted-foreground" style={stagger(1)}>
            {headline(identity)}
          </p>
          <div className="hg-enter mt-4" style={stagger(2)}>
            <Facts identity={identity} resume={resume} />
          </div>
          <p
            className="hg-enter mt-4 line-clamp-2 max-w-2xl text-sm text-muted-foreground"
            style={stagger(3)}
          >
            {identity.summary}
          </p>
          <div className="hg-enter mt-5 flex flex-wrap gap-2" style={stagger(4)}>
            {links.map((link) => (
              <LinkChip key={link.url} link={link} />
            ))}
          </div>
        </div>
        <Button asChild className="hg-enter min-h-12 shrink-0 px-7" style={stagger(2)}>
          <Link href="/find">
            <Search size={18} aria-hidden />
            Find openings
          </Link>
        </Button>
      </div>
    </section>
  );
}

/** B. The headline is the search Find openings will run; identity sits beside it. */
export function HeroTarget({ identity, links, resume }: HeroProps) {
  return (
    <section className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
      <div className="flex min-w-0 flex-col justify-between gap-8 rounded-panel bg-selected p-7 text-selected-foreground sm:p-9">
        <div>
          <p className="hg-enter m-0 text-sm" style={stagger(0)}>
            You&apos;re looking for
          </p>
          <h3
            className="hg-enter mt-2 text-4xl font-semibold leading-tight tracking-tight sm:text-5xl"
            style={stagger(1)}
          >
            {identity.searchRole} roles in {identity.searchCity}
          </h3>
          <p className="hg-enter mt-3 max-w-md text-sm opacity-80" style={stagger(2)}>
            Taken from your profile. Change it in{" "}
            <Link href="/my-profile" className="font-medium text-selected-foreground underline">
              My profile
            </Link>
            .
          </p>
        </div>
        <div className="hg-enter flex flex-wrap gap-2" style={stagger(3)}>
          <Button asChild className="min-h-12 px-7">
            <Link href="/find">
              <Search size={18} aria-hidden />
              Find openings
            </Link>
          </Button>
          <Button asChild variant="outline" className="min-h-12 border-current px-6">
            <Link href="/jobs/new">Save a job description</Link>
          </Button>
        </div>
      </div>
      <div
        className="hg-enter min-w-0 rounded-panel border border-border bg-card p-6"
        style={stagger(2)}
      >
        <div className="flex items-center gap-4">
          <Avatar links={links} identity={identity} size="size-14" />
          <div className="min-w-0">
            <p className="m-0 truncate text-lg font-semibold">{identity.fullName}</p>
            <p className="m-0 text-sm text-muted-foreground">{headline(identity)}</p>
          </div>
        </div>
        <div className="mt-4">
          <Facts identity={identity} resume={resume} />
        </div>
        <ul className="m-0 mt-5 list-none divide-y divide-border border-t border-border p-0">
          {links.map((link) => (
            <li key={link.url}>
              <a
                href={link.url}
                target="_blank"
                rel="noreferrer"
                className="group flex items-center gap-3 py-3 text-sm text-foreground hover:no-underline"
              >
                <RemoteImage src={favicon(link.host)} alt="" className="size-5 rounded-sm" />
                <span className="w-20 shrink-0 font-medium">{link.name}</span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground group-hover:text-link">
                  {link.handle}
                </span>
                <ArrowUpRight
                  size={15}
                  className="shrink-0 text-muted-foreground group-hover:text-link"
                  aria-hidden
                />
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** C. A Google-style search bar is the main action; identity is one quiet line above it. */
export function HeroSearch({ identity, links }: HeroProps) {
  const next = [
    { label: "Save a job description", href: "/jobs/new", icon: NotebookPen },
    { label: "Review your resume", href: "/resume-prompt", icon: FileText },
    { label: "Record an application", href: "/applications/new", icon: Send },
    { label: "Refresh inbox", href: "/applications?tab=emails", icon: Inbox },
  ];
  return (
    <section className="py-4">
      <div className="hg-enter flex items-center gap-3" style={stagger(0)}>
        <Avatar links={links} identity={identity} size="size-11" />
        <div className="min-w-0">
          <p className="m-0 font-semibold">{identity.fullName}</p>
          <p className="m-0 text-sm text-muted-foreground">{headline(identity)}</p>
        </div>
        <div className="ml-auto hidden gap-1 sm:flex">
          {links.map((link) => (
            <a
              key={link.url}
              href={link.url}
              target="_blank"
              rel="noreferrer"
              aria-label={`${link.name}, ${link.handle}`}
              title={`${link.name}: ${link.handle}`}
              className="pressable grid size-10 place-items-center rounded-full hover:bg-muted"
            >
              <RemoteImage src={favicon(link.host)} alt="" className="size-5 rounded-sm" />
            </a>
          ))}
        </div>
      </div>
      <Link
        href="/find"
        className="hg-enter group mt-8 flex min-h-16 items-center gap-4 rounded-full border border-border bg-card pl-6 pr-2 text-foreground shadow-surface hover:border-primary hover:no-underline"
        style={stagger(1)}
      >
        <Search size={22} className="shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-lg">
          Find {identity.searchRole} openings in {identity.searchCity}
        </span>
        <span className="hidden min-h-12 items-center rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground group-hover:bg-primary-hover sm:inline-flex">
          Find openings
        </span>
      </Link>
      <div className="hg-enter mt-4 flex flex-wrap gap-2" style={stagger(2)}>
        {next.map(({ label, href, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="pressable inline-flex min-h-9 items-center gap-2 rounded-full border border-border px-4 text-sm text-foreground hover:bg-muted hover:no-underline"
          >
            <Icon size={15} className="text-muted-foreground" aria-hidden />
            {label}
          </Link>
        ))}
      </div>
    </section>
  );
}
