"use client";

import Link from "next/link";
import {
  ArrowUpRight,
  BriefcaseBusiness,
  FileText,
  Globe,
  MapPin,
  Search,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui";
import { RemoteImage, type ResumeRef } from "./embeds";
import { experienceLabel, headline, type Identity } from "./identity";
import { favicon, githubAvatar, type ProfileLink } from "./profile-links";

// One orchestrated entrance: 70 ms between items, using the --animate-enter token.
const stagger = (index: number) => ({ animationDelay: `${index * 70}ms` });

function Initial({ identity }: { identity: Identity }) {
  return (
    <span
      aria-hidden
      className="grid size-20 shrink-0 place-items-center rounded-full bg-selected text-xl font-semibold text-selected-foreground"
    >
      {identity.name ? identity.name.slice(0, 1).toUpperCase() : <UserRound size={30} />}
    </span>
  );
}

function Avatar({ links, identity }: { links: ProfileLink[]; identity: Identity }) {
  const github = links.find((link) => link.kind === "github");
  if (!github) return <Initial identity={identity} />;
  return (
    <RemoteImage
      src={githubAvatar(github.handle)}
      alt=""
      className="size-20 shrink-0 rounded-full border border-border"
      fallback={<Initial identity={identity} />}
    />
  );
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
      <RemoteImage
        src={favicon(link.host)}
        alt=""
        className="size-4 rounded-sm"
        fallback={<Globe size={16} aria-hidden className="shrink-0 text-muted-foreground" />}
      />
      <span className="truncate">{link.kind === "portfolio" ? "Portfolio" : link.handle}</span>
      <ArrowUpRight size={14} className="shrink-0 text-muted-foreground" aria-hidden />
    </a>
  );
}

function Facts({ identity, resume }: { identity: Identity; resume: ResumeRef | null }) {
  const facts = [
    identity.city && { icon: MapPin, text: identity.city },
    identity.years !== null && { icon: BriefcaseBusiness, text: experienceLabel(identity.years) },
    resume && {
      icon: FileText,
      text: `Current resume: ${resume.label}`,
      href: `/resumes?file=${resume.id}`,
    },
  ].filter(Boolean) as { icon: typeof MapPin; text: string; href?: string }[];
  if (!facts.length) return null;
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

/** Hero A from /gallery/home: who you are, in one card, with Find openings to the right. */
export function IdentityCard({
  identity,
  links,
  resume,
}: {
  identity: Identity;
  links: ProfileLink[];
  resume: ResumeRef | null;
}) {
  const role = headline(identity);
  return (
    <section className="rounded-panel border border-border bg-card p-6 shadow-surface sm:p-8">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="animate-enter" style={stagger(0)}>
          <Avatar links={links} identity={identity} />
        </div>
        <div className="min-w-0 flex-1">
          {identity.name ? (
            <h1
              className="m-0 animate-enter text-3xl font-semibold tracking-tight"
              style={stagger(1)}
            >
              {identity.name}
            </h1>
          ) : (
            <h1
              className="m-0 animate-enter text-3xl font-semibold tracking-tight"
              style={stagger(1)}
            >
              <Link href="/my-profile" className="text-link">
                Add your name, role and city
              </Link>
            </h1>
          )}
          {role && (
            <p className="mt-1 animate-enter text-lg text-muted-foreground" style={stagger(1)}>
              {role}
            </p>
          )}
          <div className="mt-4 animate-enter" style={stagger(2)}>
            <Facts identity={identity} resume={resume} />
          </div>
          {identity.summary && (
            <p
              className="mt-4 line-clamp-2 max-w-2xl animate-enter text-sm text-muted-foreground"
              style={stagger(3)}
            >
              {identity.summary}
            </p>
          )}
          {links.length > 0 && (
            <div className="mt-5 flex animate-enter flex-wrap gap-2" style={stagger(4)}>
              {links.map((link) => (
                <LinkChip key={link.key} link={link} />
              ))}
            </div>
          )}
        </div>
        <Button asChild className="min-h-12 shrink-0 animate-enter px-7" style={stagger(2)}>
          <Link href="/find">
            <Search size={18} aria-hidden />
            Find openings
          </Link>
        </Button>
      </div>
    </section>
  );
}
