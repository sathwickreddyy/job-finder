"use client";

import { useState, type ReactNode } from "react";
import { Check } from "lucide-react";
import { mailTags, tagLabel, type MailTag } from "./legacy-tags";
import { cn } from "@/lib/utils";
import { allMail } from "./data";
import { TagDot, TagPill, shortDay, tagClass } from "./primitives";

type Row = (typeof allMail)[number];
const counts = Object.fromEntries(
  mailTags.map((tag) => [tag, allMail.filter((mail) => mail.tag === tag).length]),
) as Record<MailTag, number>;

function useTagFilter(multi: boolean) {
  const [active, setActive] = useState<MailTag[]>([]);
  return {
    active,
    toggle(tag: MailTag) {
      if (!multi) setActive(active[0] === tag ? [] : [tag]);
      else
        setActive(active.includes(tag) ? active.filter((item) => item !== tag) : [...active, tag]);
    },
    clear: () => setActive([]),
    rows: allMail.filter((mail) => !active.length || active.includes(mail.tag)),
  };
}

function RowText({ mail }: { mail: Row }) {
  return (
    <span className="min-w-0">
      <span className="block truncate font-medium">{mail.subject}</span>
      <span className="block truncate text-sm text-muted-foreground">
        {mail.company ?? "Needs a home"}, {mail.kind.toLowerCase()}
      </span>
    </span>
  );
}

function List({ rows, render }: { rows: Row[]; render: (mail: Row) => ReactNode }) {
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, 6);
  return (
    <div className="mt-4">
      <ul className="m-0 list-none divide-y divide-border p-0">
        {shown.map((mail) => (
          <li key={mail.id}>{render(mail)}</li>
        ))}
      </ul>
      {rows.length > 6 && (
        <button
          type="button"
          onClick={() => setAll(!all)}
          className="pressable mt-2 h-9 rounded-full px-3 text-sm font-medium text-link hover:bg-selected"
        >
          {all ? "Show fewer" : `Show all ${rows.length}`}
        </button>
      )}
      {!rows.length && (
        <p className="m-0 py-6 text-center text-sm text-muted-foreground">
          No emails with this tag.
        </p>
      )}
    </div>
  );
}

/** A: a small dot and the tag's words; filters combine. */
export function DotTags() {
  const { active, toggle, rows } = useTagFilter(true);
  return (
    <div className="rounded-3xl bg-card p-5 ring-1 ring-border">
      <div role="group" aria-label="Filter by tag" className="flex flex-wrap gap-2">
        {mailTags.map((tag) => {
          const on = active.includes(tag);
          return (
            <button
              key={tag}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(tag)}
              className={cn(
                "pressable inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-sm font-medium",
                on ? tagClass[tag].tonal : "ring-1 ring-border hover:bg-muted",
              )}
            >
              {on ? <Check aria-hidden size={14} /> : <TagDot tag={tag} />}
              {tagLabel[tag]}
              <span className="text-xs tabular-nums opacity-70">{counts[tag]}</span>
            </button>
          );
        })}
      </div>
      <List
        rows={rows}
        render={(mail) => (
          <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 py-3">
            <TagDot tag={mail.tag} className="size-2.5" />
            <RowText mail={mail} />
            <span className="text-xs text-muted-foreground tabular-nums">{shortDay(mail.at)}</span>
          </div>
        )}
      />
    </div>
  );
}

/** B: tonal pills, one tag at a time, the colour carried by the whole label. */
export function PillTags() {
  const { active, toggle, clear, rows } = useTagFilter(false);
  return (
    <div className="rounded-3xl bg-card p-5 ring-1 ring-border">
      <div role="radiogroup" aria-label="Filter by tag" className="flex flex-wrap gap-1.5">
        <button
          type="button"
          role="radio"
          aria-checked={!active.length}
          onClick={clear}
          className={cn(
            "pressable h-9 rounded-full px-4 text-sm font-medium",
            !active.length ? "bg-foreground text-background" : "bg-muted text-muted-foreground",
          )}
        >
          All <span className="tabular-nums opacity-70">{allMail.length}</span>
        </button>
        {mailTags.map((tag) => (
          <button
            key={tag}
            type="button"
            role="radio"
            aria-checked={active[0] === tag}
            onClick={() => toggle(tag)}
            className={cn(
              "pressable h-9 rounded-full px-4 text-sm font-medium",
              tagClass[tag].tonal,
              active[0] === tag ? "ring-2 ring-current" : active.length && "opacity-55",
            )}
          >
            {tagLabel[tag]} <span className="tabular-nums opacity-70">{counts[tag]}</span>
          </button>
        ))}
      </div>
      <List
        rows={rows}
        render={(mail) => (
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto_3.5rem]">
            <RowText mail={mail} />
            <span className="hidden sm:block">
              <TagPill tag={mail.tag} />
            </span>
            <span className="text-right text-xs text-muted-foreground tabular-nums">
              {shortDay(mail.at)}
            </span>
          </div>
        )}
      />
    </div>
  );
}

/** C: one bar shows the mix of this mail; press a band to filter. Rows carry an edge stripe. */
export function MixTags() {
  const { active, toggle, rows } = useTagFilter(true);
  return (
    <div className="rounded-3xl bg-card p-5 ring-1 ring-border">
      <div
        className="flex h-3 gap-0.5 overflow-hidden rounded-full"
        role="group"
        aria-label="Filter by tag"
      >
        {mailTags
          .filter((tag) => counts[tag])
          .map((tag) => (
            <button
              key={tag}
              type="button"
              aria-pressed={active.includes(tag)}
              aria-label={`${tagLabel[tag]}, ${counts[tag]}`}
              onClick={() => toggle(tag)}
              style={{ flexGrow: counts[tag] }}
              className={cn(
                "min-w-3 transition-opacity",
                tagClass[tag].dot,
                active.length && !active.includes(tag) && "opacity-25",
              )}
            />
          ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {mailTags.map((tag) => (
          <button
            key={tag}
            type="button"
            aria-pressed={active.includes(tag)}
            onClick={() => toggle(tag)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full",
              active.length && !active.includes(tag) ? "text-muted-foreground" : "text-foreground",
            )}
          >
            <TagDot tag={tag} />
            {tagLabel[tag]}
            <span className="tabular-nums text-muted-foreground">{counts[tag]}</span>
          </button>
        ))}
      </div>
      <List
        rows={rows}
        render={(mail) => (
          <div
            className={cn(
              "my-1.5 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-l-[3px] py-1.5 pl-3",
              tagClass[mail.tag].stripe,
            )}
          >
            <RowText mail={mail} />
            <span className="text-xs text-muted-foreground tabular-nums">{shortDay(mail.at)}</span>
          </div>
        )}
      />
    </div>
  );
}
