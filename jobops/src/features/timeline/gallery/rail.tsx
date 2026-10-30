"use client";

import { useState, type ReactNode } from "react";
import { ChevronRight, Search } from "lucide-react";
import { mailTags } from "@/features/mail/tags";
import { cn } from "@/lib/utils";
import { companies, groupLabel, unplaced, type Company, type Group, type MailEntry } from "./data";
import { TagDot, clock, dayLabel, tagClass } from "./primitives";

type RowProps = {
  company: Company;
  selected: boolean;
  matches: number | null;
  onSelect: () => void;
};
type RowStyle = (props: RowProps) => ReactNode;

const mailOf = (company: Company) =>
  company.entries.filter((entry): entry is MailEntry => entry.type === "mail");
const openCount = (company: Company) => mailOf(company).filter((mail) => mail.open).length;
const dueTone = {
  now: "text-link font-medium",
  late: "text-tag-process font-medium",
  calm: "text-muted-foreground",
};

function NewBadge({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span className="grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground tabular-nums">
      <span className="sr-only">New: </span>
      {count}
    </span>
  );
}

function Line({ company, matches }: { company: Company; matches: number | null }) {
  return (
    <span className="block truncate text-sm text-muted-foreground">
      {matches !== null ? `${matches} ${matches === 1 ? "match" : "matches"}` : company.signal}
    </span>
  );
}

function rowShell(selected: boolean) {
  return cn(
    "w-full rounded-2xl px-3 text-left transition-colors",
    selected ? "bg-selected text-selected-foreground" : "hover:bg-muted/70",
  );
}

/** A: two lines, the latest signal under the name and the due chip on the right. */
const TwoLineRow: RowStyle = ({ company, selected, matches, onSelect }) => (
  <button
    type="button"
    aria-current={selected}
    onClick={onSelect}
    className={cn(rowShell(selected), "py-2.5")}
  >
    <span className="flex items-center gap-2">
      <span className={cn("truncate", openCount(company) ? "font-semibold" : "font-medium")}>
        {company.name}
      </span>
      <NewBadge count={openCount(company)} />
      {company.due && (
        <span className={cn("ml-auto shrink-0 text-xs", dueTone[company.due.tone])}>
          {company.due.label}
        </span>
      )}
    </span>
    <Line company={company} matches={matches} />
  </button>
);

/** B: one line per company with a monogram; the selected row opens to show its signal. */
const CompactRow: RowStyle = ({ company, selected, matches, onSelect }) => {
  const latest = mailOf(company).at(-1);
  return (
    <button
      type="button"
      aria-current={selected}
      onClick={onSelect}
      className={cn(rowShell(selected), "py-1.5")}
    >
      <span className="flex h-8 items-center gap-2.5">
        <span
          aria-hidden
          className={cn(
            "grid size-7 shrink-0 place-items-center rounded-lg text-xs font-semibold",
            latest ? tagClass[latest.tag].tonal : "bg-muted text-muted-foreground",
          )}
        >
          {company.name.slice(0, 2)}
        </span>
        <span className={cn("truncate", openCount(company) ? "font-semibold" : "font-medium")}>
          {company.name}
        </span>
        {openCount(company) > 0 && (
          <span aria-label="New mail" className="size-2 shrink-0 rounded-full bg-primary" />
        )}
        {company.due && (
          <span className={cn("ml-auto shrink-0 text-xs", dueTone[company.due.tone])}>
            {company.due.label}
          </span>
        )}
      </span>
      {(selected || matches !== null) && (
        <span className="block pb-1 pl-[2.375rem]">
          <Line company={company} matches={matches} />
        </span>
      )}
    </button>
  );
};

/** C: two lines with a small bar showing the mix of this company's mail. */
const MixRow: RowStyle = ({ company, selected, matches, onSelect }) => {
  const mail = mailOf(company);
  return (
    <button
      type="button"
      aria-current={selected}
      onClick={onSelect}
      className={cn(rowShell(selected), "py-2.5")}
    >
      <span className="flex items-center gap-2">
        <span className={cn("truncate", openCount(company) ? "font-semibold" : "font-medium")}>
          {company.name}
        </span>
        <NewBadge count={openCount(company)} />
        {company.due && (
          <span className={cn("ml-auto shrink-0 text-xs", dueTone[company.due.tone])}>
            {company.due.label}
          </span>
        )}
      </span>
      <span className="mt-1 flex items-center gap-2">
        <span
          aria-hidden
          className="flex h-1.5 w-16 shrink-0 gap-px overflow-hidden rounded-full bg-muted"
        >
          {mailTags.map((tag) => {
            const count = mail.filter((item) => item.tag === tag).length;
            return count ? (
              <span key={tag} style={{ flexGrow: count }} className={tagClass[tag].dot} />
            ) : null;
          })}
        </span>
        <span className="min-w-0 flex-1">
          <Line company={company} matches={matches} />
        </span>
      </span>
    </button>
  );
};

function GroupHeader({
  label,
  count,
  open,
  onToggle,
}: {
  label: string;
  count: number;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onToggle}
      className="flex w-full items-center gap-1.5 px-3 pt-4 pb-1.5 text-left text-sm font-semibold text-muted-foreground hover:text-foreground"
    >
      <ChevronRight
        aria-hidden
        size={15}
        className={cn("transition-transform", open && "rotate-90")}
      />
      {label}
      <span className="font-normal tabular-nums">{count}</span>
    </button>
  );
}

function Preview({ selected }: { selected: string }) {
  if (selected === "home")
    return (
      <div className="tl-pop">
        <h3 className="m-0 text-xl font-semibold tracking-tight">Needs a home</h3>
        <p className="m-0 mt-1 text-sm text-muted-foreground">
          Mail that matched no company yet. Place it at a company, or mark it as just info.
        </p>
        <ul className="m-0 mt-4 list-none space-y-2 p-0">
          {unplaced.map((mail) => (
            <li
              key={mail.id}
              className="flex items-start gap-3 rounded-2xl bg-card p-3 ring-1 ring-border"
            >
              <TagDot tag={mail.tag} className="mt-2" />
              <span className="min-w-0">
                <span className="block truncate font-medium">{mail.subject}</span>
                <span className="block text-sm text-muted-foreground">
                  {mail.senderName}, {dayLabel(mail.at).toLowerCase()}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  const company = companies.find((item) => item.key === selected)!;
  const recent = [...company.entries].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 4);
  return (
    <div key={selected} className="tl-pop">
      <h3 className="m-0 text-xl font-semibold tracking-tight">{company.name}</h3>
      <p className="m-0 mt-1 text-sm text-muted-foreground">
        {company.city}, {company.roles.map((role) => role.title).join(" and ")}
      </p>
      <ol className="m-0 mt-4 list-none space-y-3 p-0">
        {recent.map((entry) => (
          <li key={entry.id} className="flex items-start gap-3">
            {entry.type === "mail" ? (
              <TagDot tag={entry.tag} className="mt-2" />
            ) : (
              <span
                aria-hidden
                className="mt-2 size-2 shrink-0 rounded-full ring-2 ring-border ring-inset"
              />
            )}
            <span className="min-w-0 flex-1">
              <span
                className={cn(
                  "block truncate",
                  entry.type === "mail" && entry.open && "font-semibold",
                )}
              >
                {entry.type === "mail" ? entry.subject : entry.text}
              </span>
              <span className="block text-xs text-muted-foreground">
                {dayLabel(entry.at)}, {clock(entry.at)}
              </span>
            </span>
          </li>
        ))}
      </ol>
      <p className="m-0 mt-5 text-sm text-muted-foreground">
        The full company timeline opens here.
      </p>
    </div>
  );
}

function Rail({ Row }: { Row: RowStyle }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("northstar");
  const [open, setOpen] = useState<Record<Group | "home", boolean>>({
    needs: true,
    waiting: true,
    closed: false,
    home: false,
  });
  const q = query.trim().toLowerCase();
  const matchesOf = (company: Company) =>
    q
      ? mailOf(company).filter((mail) =>
          `${mail.subject} ${mail.senderName} ${mail.text}`.toLowerCase().includes(q),
        ).length
      : null;
  const visible = (group: Group) =>
    companies.filter(
      (company) =>
        company.group === group &&
        (!q || company.name.toLowerCase().includes(q) || (matchesOf(company) ?? 0) > 0),
    );
  return (
    <div className="grid overflow-hidden rounded-3xl bg-card ring-1 ring-border md:grid-cols-[18.5rem_minmax(0,1fr)]">
      <nav aria-label="Companies" className="border-border p-2 md:border-r">
        <label className="relative block p-1">
          <span className="sr-only">Search mail</span>
          <Search
            aria-hidden
            size={16}
            className="absolute top-1/2 left-4 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search mail"
            className="rounded-full! border-transparent! bg-muted! pl-10!"
          />
        </label>
        {(["needs", "waiting", "closed"] as const).map((group) => {
          const rows = visible(group);
          if (q && !rows.length) return null;
          const expanded = open[group] || Boolean(q);
          return (
            <div key={group}>
              <GroupHeader
                label={groupLabel[group]}
                count={rows.length}
                open={expanded}
                onToggle={() => setOpen({ ...open, [group]: !open[group] })}
              />
              {expanded && (
                <div className="space-y-0.5">
                  {rows.map((company) => (
                    <Row
                      key={company.key}
                      company={company}
                      selected={selected === company.key}
                      matches={matchesOf(company)}
                      onSelect={() => setSelected(company.key)}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {!q && (
          <div>
            <GroupHeader
              label={groupLabel.home}
              count={unplaced.length}
              open={open.home}
              onToggle={() => setOpen({ ...open, home: !open.home })}
            />
            {open.home && (
              <button
                type="button"
                aria-current={selected === "home"}
                onClick={() => setSelected("home")}
                className={cn(rowShell(selected === "home"), "py-2.5")}
              >
                <span className="font-medium">{unplaced.length} emails to place</span>
                <span className="block text-sm text-muted-foreground">
                  A recruiter and a job portal
                </span>
              </button>
            )}
          </div>
        )}
      </nav>
      <div className="border-t border-border p-5 md:border-t-0 md:p-7">
        <Preview selected={selected} />
      </div>
    </div>
  );
}

export const TwoLineRail = () => <Rail Row={TwoLineRow} />;
export const CompactRail = () => <Rail Row={CompactRow} />;
export const MixRail = () => <Rail Row={MixRow} />;
