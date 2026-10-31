"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronRight, Inbox, Search, SlidersHorizontal } from "lucide-react";
import { CompanyRuleEditor } from "@/features/mail/company-rule-editor";
import { InboxesPanel } from "@/features/mail/inboxes-panel";
import { tagClass, tagIcon } from "@/features/mail/tag-pill";
import { mailTags, tagLabel, type MailTag } from "@/features/mail/tags";
import { cn } from "@/lib/utils";
import { CheckMail } from "./check-mail";
import { Drawer } from "./drawer";
import type { RailGroup, RailRow } from "./index-rows";
import type { MailPane, MailViewData } from "./mail-data";
import { mailHref, type MailQuery } from "./query";
import type { TagCounts } from "./read";
import { CompanyTimeline } from "./timeline";

const groupLabel: Record<RailGroup | "home", string> = {
  needs: "Needs you",
  waiting: "Waiting on them",
  closed: "Closed",
  home: "Needs a home",
};
const dueTone = {
  now: "text-link font-medium",
  late: "text-warning font-medium",
  calm: "text-muted-foreground",
};
const rowShell = (selected: boolean) =>
  cn(
    "block w-full rounded-2xl px-3 py-2.5 text-left text-foreground transition-colors hover:no-underline",
    selected ? "bg-selected text-selected-foreground" : "hover:bg-muted/70",
  );
const matchText = (count: number) => `${count} ${count === 1 ? "match" : "matches"}`;

function NewBadge({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground tabular-nums">
      <span className="sr-only">New: </span>
      {count}
    </span>
  );
}

/** Gallery rail A: two lines, the latest signal under the name and the due day on the right. */
function RailLink({ row, selected, href }: { row: RailRow; selected: boolean; href: string }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={selected ? "page" : undefined}
      className={rowShell(selected)}
    >
      <span className="flex min-w-0 items-center gap-2">
        <span className={cn("truncate", row.newCount ? "font-semibold" : "font-medium")}>
          {row.name}
        </span>
        <NewBadge count={row.newCount} />
        {row.due && (
          <span className={cn("ml-auto shrink-0 text-xs", dueTone[row.due.tone])}>
            {row.due.label}
          </span>
        )}
      </span>
      <span className="block truncate text-sm text-muted-foreground">
        {row.matches !== null ? matchText(row.matches) : row.signal}
      </span>
    </Link>
  );
}

function Group({
  label,
  count,
  open,
  children,
}: {
  label: string;
  count: number;
  open: boolean;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={label}>
      <details open={open} className="group">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 pt-4 pb-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
          <ChevronRight
            aria-hidden
            size={15}
            className="transition-transform group-open:rotate-90"
          />
          {label}
          <span className="font-normal tabular-nums">{count}</span>
        </summary>
        <div className="space-y-0.5">{children}</div>
      </details>
    </section>
  );
}

function Rail({ data, selected }: { data: MailViewData; selected: string | null }) {
  const { query, index, inboxes } = data;
  const filtered = Boolean(query.tag || query.q);
  const keep = { tag: query.tag, q: query.q };
  const groups = (["needs", "waiting", "closed"] as const).map((group) => ({
    group,
    rows: index.rows.filter((row) => row.group === group),
  }));
  // Needs a home counts open mail; it stays listed while it holds any mail at all.
  const homeCount = filtered ? (index.home.matches ?? 0) : index.home.open;
  const homeShown = filtered ? homeCount > 0 : index.home.total > 0;
  const handled = index.home.total - index.home.open;
  return (
    <nav
      aria-label="Companies"
      className="min-w-0 rounded-3xl bg-card p-2 ring-1 ring-border md:sticky md:top-4 md:max-h-[calc(100dvh-2rem)] md:overflow-y-auto"
    >
      <div className="flex items-center justify-between gap-2 px-2 pt-2">
        <h1 className="m-0 text-xl font-semibold tracking-tight">Mail</h1>
        <Drawer
          label="Inboxes"
          icon={<Inbox size={15} aria-hidden />}
          title="Inboxes"
          description="Your connected accounts and the folders each check covers."
        >
          <InboxesPanel inboxes={inboxes} />
        </Drawer>
      </div>
      <CheckMail
        lastChecked={data.lastChecked}
        connected={inboxes.connections.length > 0}
        className="px-2 pt-3"
      />
      <form role="search" action="/mail" className="relative mt-3 block p-1">
        {query.tag && <input type="hidden" name="tag" value={query.tag} />}
        <label htmlFor="mail-search" className="sr-only">
          Search mail
        </label>
        <Search
          aria-hidden
          size={16}
          className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted-foreground"
        />
        <input
          id="mail-search"
          type="search"
          name="q"
          defaultValue={query.q ?? ""}
          placeholder="Search mail"
          maxLength={200}
          className="rounded-full! border-transparent! bg-muted! pl-10!"
        />
      </form>
      {filtered && (
        <p className="m-0 flex flex-wrap items-center gap-x-2 px-3 pt-2 text-xs text-muted-foreground">
          {index.rows.length + (homeCount ? 1 : 0)
            ? `Showing companies with matching mail.`
            : "No mail matches."}
          <Link href={mailHref({})} className="text-link">
            Clear
          </Link>
        </p>
      )}
      {groups.map(({ group, rows }) =>
        rows.length ? (
          <Group
            key={group}
            label={groupLabel[group]}
            count={rows.length}
            open={group !== "closed" || filtered || rows.some((row) => row.key === selected)}
          >
            {rows.map((row) => (
              <RailLink
                key={row.key}
                row={row}
                selected={!query.home && row.key === selected}
                href={mailHref({ ...keep, company: row.key })}
              />
            ))}
          </Group>
        ) : null,
      )}
      {homeShown && (
        <Group
          label={groupLabel.home}
          count={homeCount}
          open={filtered || query.home || index.home.open > 0}
        >
          <Link
            href={mailHref({ ...keep, home: true })}
            scroll={false}
            aria-current={query.home ? "page" : undefined}
            className={rowShell(query.home)}
          >
            <span className={cn("block truncate", homeCount ? "font-semibold" : "font-medium")}>
              {filtered
                ? matchText(homeCount)
                : homeCount
                  ? `${homeCount} ${homeCount === 1 ? "email" : "emails"} to place`
                  : "Nothing to place"}
            </span>
            <span className="block truncate text-sm text-muted-foreground">
              {!filtered && handled ? `${handled} handled` : "Mail that matched no company"}
            </span>
          </Link>
        </Group>
      )}
    </nav>
  );
}

function TagIcon({ tag }: { tag: MailTag }) {
  const Icon = tagIcon[tag];
  return <Icon aria-hidden size={14} strokeWidth={2.2} />;
}

/** Gallery tags B: tonal pills that carry the colour, one tag at a time. */
function TagPills({ query, tags }: { query: MailQuery; tags: TagCounts }) {
  const total = Object.values(tags).reduce((sum, count) => sum + count, 0);
  const base = { ...query, mail: null, cursor: null };
  return (
    <nav role="group" aria-label="Filter by tag" className="flex flex-wrap gap-1.5">
      <Link
        href={mailHref({ ...base, tag: null })}
        scroll={false}
        aria-current={!query.tag ? "page" : undefined}
        className={cn(
          "pressable inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-medium hover:no-underline",
          !query.tag ? "bg-foreground text-background" : "bg-muted text-muted-foreground",
        )}
      >
        All <span className="tabular-nums opacity-70">{total}</span>
      </Link>
      {mailTags
        .filter((tag) => tags[tag] > 0 || query.tag === tag)
        .map((tag) => (
          <Link
            key={tag}
            href={mailHref({ ...base, tag })}
            scroll={false}
            aria-current={query.tag === tag ? "page" : undefined}
            className={cn(
              "pressable inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-medium hover:no-underline",
              tagClass[tag].tonal,
              query.tag === tag ? "ring-2 ring-current" : query.tag && "opacity-60",
            )}
          >
            <TagIcon tag={tag} />
            {tagLabel[tag]} <span className="tabular-nums opacity-70">{tags[tag]}</span>
          </Link>
        ))}
    </nav>
  );
}

function RuleDrawer({
  rule,
}: {
  rule: NonNullable<Extract<MailPane, { kind: "company" }>["rule"]>;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState("");
  const [pending, setPending] = useState(false);
  return (
    <Drawer
      label="Mail rule"
      icon={<SlidersHorizontal size={15} aria-hidden />}
      title={`Mail rule for ${rule.rule.company}`}
      description={rule.source}
    >
      {
        <div className="space-y-4">
          {saved && (
            <p role="status" className="m-0 rounded-2xl bg-foreground p-3 text-sm text-background">
              {saved}
            </p>
          )}
          <CompanyRuleEditor
            company={rule.company}
            rule={rule.rule}
            disabled={pending}
            onPending={setPending}
            onSaved={(message) => {
              setSaved(message);
              router.refresh();
            }}
          />
        </div>
      }
    </Drawer>
  );
}

function Pane({ data }: { data: MailViewData }) {
  const { pane, query } = data;
  const back = (
    <Link
      href={mailHref({ tag: query.tag, q: query.q })}
      className="mb-3 inline-flex h-9 items-center gap-1.5 rounded-full pr-3 text-sm font-medium text-link hover:no-underline md:hidden"
    >
      <ArrowLeft size={16} aria-hidden />
      All companies
    </Link>
  );
  if (pane.kind === "empty") {
    const filtered = Boolean(query.tag || query.q);
    return (
      <section
        aria-labelledby="mail-pane-title"
        className="grid min-h-80 min-w-0 place-content-center gap-3 rounded-3xl bg-card p-6 text-center ring-1 ring-border"
      >
        <h2 id="mail-pane-title" className="m-0 text-2xl font-semibold tracking-tight">
          {filtered ? "No mail matches" : "Nothing needs you"}
        </h2>
        <p className="m-0 max-w-sm text-sm text-muted-foreground">
          {filtered
            ? "Try another word, or clear the search and tag."
            : "Every email is handled and no step is due. New mail arrives when you check."}
        </p>
        {!filtered && (
          <CheckMail
            lastChecked={data.lastChecked}
            connected={data.inboxes.connections.length > 0}
            className="mx-auto"
          />
        )}
      </section>
    );
  }
  const company = pane.kind === "company" ? pane : null;
  return (
    <section
      aria-labelledby="mail-pane-title"
      className="min-w-0 rounded-3xl bg-card p-4 ring-1 ring-border sm:p-6"
    >
      <h1 className="sr-only md:hidden">Mail</h1>
      {back}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2
            id="mail-pane-title"
            className="m-0 text-2xl font-semibold tracking-tight break-words"
          >
            {company?.company.slug ? (
              <Link
                href={`/companies/${company.company.slug}`}
                className="text-foreground hover:underline"
              >
                {company.company.name}
              </Link>
            ) : (
              (company?.company.name ?? "Needs a home")
            )}
          </h2>
          <p className="m-0 mt-1 text-sm text-muted-foreground">
            {company
              ? company.company.city || "Company mail"
              : "Mail that matched no company yet. Place it at a company, or mark it as just info."}
          </p>
          {company?.row?.next && (
            <p className="m-0 mt-2 text-sm">
              <span className="text-muted-foreground">Next: </span>
              {company.row.next}
              {company.row.due && (
                <span className={cn("ml-2 text-xs", dueTone[company.row.due.tone])}>
                  {company.row.due.label}
                </span>
              )}
            </p>
          )}
        </div>
        {company?.rule && <RuleDrawer key={company.company.key} rule={company.rule} />}
      </header>
      <div className="mt-4 mb-5">
        <TagPills query={query} tags={pane.tags} />
      </div>
      {pane.newestHref && (
        <Link href={pane.newestHref} scroll={false} className="mb-3 inline-block text-sm text-link">
          Back to the newest
        </Link>
      )}
      <CompanyTimeline
        days={pane.days}
        handling={pane.handling}
        roles={company?.roles ?? []}
        allRolesHref={company?.allRolesHref ?? ""}
        role={query.role}
        openMail={query.mail}
        olderHref={pane.olderHref}
        placeOptions={data.placeOptions}
      />
    </section>
  );
}

/**
 * `/mail`: the company rail beside one company's timeline. On a phone the rail is the
 * page until a company (or Needs a home) is chosen in the URL.
 */
export function MailView({ data }: { data: MailViewData }) {
  const chosen = data.pinned;
  useEffect(() => {
    if (data.pinned || data.pane.kind === "empty") return;
    // On a wide screen the default company is on show. Naming it in the URL keeps it there
    // after handling its last open email moves it out of Needs you.
    if (!window.matchMedia("(min-width: 768px)").matches) return;
    window.history.replaceState(window.history.state, "", mailHref(data.query));
  }, [data]);
  const selected = data.pane.kind === "company" ? data.pane.company.key : null;
  return (
    <div className="space-y-4">
      {data.notice && (
        <p
          role="status"
          className="m-0 rounded-2xl bg-foreground p-3 text-sm text-background [overflow-wrap:anywhere]"
        >
          {data.notice}
        </p>
      )}
      <div className="grid min-w-0 gap-4 md:grid-cols-[18.5rem_minmax(0,1fr)] md:items-start">
        <div className={cn("min-w-0", chosen && "hidden md:block")}>
          <Rail data={data} selected={selected} />
        </div>
        <div className={cn("min-w-0", !chosen && "hidden md:block")}>
          <Pane data={data} />
        </div>
      </div>
    </div>
  );
}
