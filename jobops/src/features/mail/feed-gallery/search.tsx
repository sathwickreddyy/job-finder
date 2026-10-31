"use client";

import { useState, type ReactNode } from "react";
import { Check, Plus, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  genericWords,
  inboxes,
  northstarRule,
  providerQuery,
  type Inbox,
  type SearchRule,
} from "./data";
import { Pane } from "./shared";

type Field = keyof SearchRule;
const fieldNames: Record<Field, string> = {
  addresses: "address",
  domains: "domain",
  aliases: "name",
  keywords: "keyword",
  never: "phrase",
};

function validate(field: Field, value: string, rule: SearchRule): string | null {
  const v = value.trim();
  if (!v) return "Type something first.";
  if (rule[field].some((item) => item.toLowerCase() === v.toLowerCase()))
    return "Already in the list.";
  if (/["\\]/.test(v))
    return "Quotes and backslashes aren't allowed; terms are searched as plain phrases.";
  if (field === "addresses" && !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(v))
    return "That isn't an email address.";
  if (field === "domains" && !/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i.test(v))
    return "Use a domain like northstar.example.";
  if ((field === "keywords" || field === "aliases") && genericWords.includes(v.toLowerCase()))
    return `"${v}" appears in every company's mail, so it can't identify Northstar. Try a phrase like "Northstar Talent".`;
  return null;
}

export function useRule() {
  const [rule, setRule] = useState<SearchRule>(northstarRule);
  const [on, setOn] = useState<Record<Inbox, boolean>>({
    Gmail: true,
    "Outlook (outlook.in)": true,
    "Outlook (outlook.com)": true,
  });
  const [frame, setFrame] = useState<"since" | "days">("days");
  const [days, setDays] = useState(90);
  const [saved, setSaved] = useState(0);
  const save = (next: SearchRule) => {
    setRule(next);
    setSaved((count) => count + 1);
  };
  return {
    rule,
    on,
    toggle: (inbox: Inbox) => setOn({ ...on, [inbox]: !on[inbox] }),
    frame,
    setFrame,
    days,
    setDays: (value: number) => setDays(Math.min(3650, Math.max(1, value || 1))),
    saved,
    add(field: Field, value: string) {
      const error = validate(field, value, rule);
      if (!error) save({ ...rule, [field]: [...rule[field], value.trim()] });
      return error;
    },
    remove: (field: Field, value: string) =>
      save({ ...rule, [field]: rule[field].filter((item) => item !== value) }),
    edit(field: Field, from: string, to: string) {
      if (from === to.trim()) return null;
      const error = validate(field, to, {
        ...rule,
        [field]: rule[field].filter((item) => item !== from),
      });
      if (!error)
        save({ ...rule, [field]: rule[field].map((item) => (item === from ? to.trim() : item)) });
      return error;
    },
  };
}
type Rule = ReturnType<typeof useRule>;

function Chip({
  value,
  onRemove,
  onEdit,
}: {
  value: string;
  onRemove?: () => void;
  onEdit?: (to: string) => string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  if (editing && onEdit)
    return (
      <span className="inline-grid gap-1">
        <input
          autoFocus
          aria-label={`Edit ${value}`}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => setEditing(false)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setEditing(false);
            if (event.key === "Enter") {
              const problem = onEdit(draft);
              setError(problem);
              if (!problem) setEditing(false);
            }
          }}
          className="h-8! min-h-8! w-56! rounded-full! px-3! py-0! text-sm"
        />
        {error && <span className="max-w-64 text-xs text-destructive">{error}</span>}
      </span>
    );
  return (
    <span className="inline-flex h-8 max-w-full items-center rounded-full bg-secondary text-sm text-secondary-foreground">
      <button
        type="button"
        disabled={!onEdit}
        onClick={() => {
          setDraft(value);
          setError(null);
          setEditing(true);
        }}
        title={onEdit ? "Edit" : "The company name is always searched"}
        className="truncate rounded-full py-1 pr-1 pl-3 disabled:cursor-default disabled:opacity-100"
      >
        {value}
      </button>
      {onRemove ? (
        <button
          type="button"
          aria-label={`Remove ${value}`}
          onClick={onRemove}
          className="mr-1 grid size-6 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X aria-hidden size={13} />
        </button>
      ) : (
        <span className="w-2.5" />
      )}
    </span>
  );
}

function Adder({ field, rule, label }: { field: Field; rule: Rule; label?: string }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="pressable inline-flex h-8 items-center gap-1 rounded-full px-3 text-sm text-link ring-1 ring-border ring-inset hover:bg-selected/50"
      >
        <Plus aria-hidden size={14} />
        {label ?? `Add ${fieldNames[field]}`}
      </button>
    );
  return (
    <form
      className="inline-grid gap-1"
      onSubmit={(event) => {
        event.preventDefault();
        const problem = rule.add(field, value);
        setError(problem);
        if (!problem) {
          setValue("");
          setOpen(false);
        }
      }}
    >
      <span className="inline-flex items-center gap-1">
        <input
          autoFocus
          aria-label={`New ${fieldNames[field]}`}
          placeholder={
            field === "addresses"
              ? "careers@northstar.example"
              : field === "domains"
                ? "northstar.example"
                : "Northstar Talent"
          }
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => event.key === "Escape" && setOpen(false)}
          className="h-8! min-h-8! w-56! rounded-full! px-3! py-0! text-sm"
        />
        <button
          type="submit"
          className="morph pressable h-8 bg-primary px-3 text-sm font-medium text-primary-foreground"
        >
          Add
        </button>
      </span>
      {error && <span className="max-w-72 text-xs text-destructive">{error}</span>}
    </form>
  );
}

function Chips({ field, rule, fixed }: { field: Field; rule: Rule; fixed?: string }) {
  return (
    <span className="inline-flex flex-wrap items-start gap-1.5">
      {fixed && <Chip value={fixed} />}
      {rule.rule[field].map((value) => (
        <Chip
          key={value}
          value={value}
          onRemove={() => rule.remove(field, value)}
          onEdit={(to) => rule.edit(field, value, to)}
        />
      ))}
      <Adder field={field} rule={rule} />
    </span>
  );
}

function Inboxes({ rule }: { rule: Rule }) {
  return (
    <span className="inline-flex flex-wrap gap-1.5">
      {inboxes.map((inbox) => (
        <label
          key={inbox}
          className={cn(
            "inline-flex h-8 cursor-pointer items-center gap-2 rounded-full px-3 text-sm ring-1 ring-inset",
            rule.on[inbox]
              ? "bg-selected text-selected-foreground ring-transparent"
              : "text-muted-foreground ring-border",
          )}
        >
          <input
            type="checkbox"
            checked={rule.on[inbox]}
            onChange={() => rule.toggle(inbox)}
            className="sr-only"
          />
          {rule.on[inbox] && <Check aria-hidden size={14} />}
          {inbox}
        </label>
      ))}
    </span>
  );
}

function TimeFrame({ rule, compact }: { rule: Rule; compact?: boolean }) {
  return (
    <span
      role="radiogroup"
      aria-label="Time frame"
      className="inline-flex flex-wrap items-center gap-1 rounded-full bg-muted p-1"
    >
      <button
        type="button"
        role="radio"
        aria-checked={rule.frame === "since"}
        onClick={() => rule.setFrame("since")}
        className={cn(
          "h-8 rounded-full px-3 text-sm",
          rule.frame === "since" ? "bg-card shadow-surface" : "text-muted-foreground",
        )}
      >
        {compact ? "since 31 Oct" : "Since last search, 31 Oct"}
      </button>
      <span
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-full pr-3 pl-1 text-sm",
          rule.frame === "days" ? "bg-card shadow-surface" : "text-muted-foreground",
        )}
      >
        <button
          type="button"
          role="radio"
          aria-checked={rule.frame === "days"}
          onClick={() => rule.setFrame("days")}
          className="h-8 rounded-full pl-2"
        >
          Last
        </button>
        <input
          type="number"
          min={1}
          max={3650}
          aria-label="Number of days"
          value={rule.days}
          onFocus={() => rule.setFrame("days")}
          onChange={(event) => rule.setDays(Number(event.target.value))}
          className="h-7! min-h-7! w-16! rounded-full! px-2! py-0! text-center text-sm"
        />
        days
      </span>
    </span>
  );
}

function Queries({ rule }: { rule: Rule }) {
  const days = rule.frame === "days" ? rule.days : 1;
  return (
    <details className="group rounded-2xl bg-muted/40 px-3 py-2 text-sm">
      <summary className="cursor-pointer text-muted-foreground marker:text-muted-foreground">
        Show the exact search sent to each inbox
      </summary>
      <div className="mt-2 space-y-2">
        {inboxes
          .filter((inbox) => rule.on[inbox])
          .map((inbox) => (
            <div key={inbox}>
              <p className="m-0 text-xs font-medium">{inbox}</p>
              <code className="block rounded-lg bg-background px-2 py-1.5 font-mono text-xs break-all text-muted-foreground">
                {providerQuery(inbox, rule.rule, days)}
              </code>
            </div>
          ))}
      </div>
    </details>
  );
}

function Footer({ rule }: { rule: Rule }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        className="morph pressable inline-flex h-10 items-center gap-2 bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-hover"
      >
        <Search aria-hidden size={15} />
        Search Northstar&apos;s mail
      </button>
      <span className="text-xs text-muted-foreground" role="status">
        {rule.saved ? (
          <span key={rule.saved} className="tl-pop inline-flex items-center gap-1">
            <Check aria-hidden size={13} className="text-success" />
            Saved. Fetches and searches use it from now on.
          </span>
        ) : (
          "Your saved rule"
        )}
      </span>
    </div>
  );
}

function Group({ title, help, children }: { title: string; help?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="m-0 text-sm font-medium">{title}</p>
      {help && <p className="m-0 text-xs text-muted-foreground">{help}</p>}
      {children}
    </div>
  );
}

export function GroupedPanel() {
  const rule = useRule();
  return (
    <Pane className="max-w-lg space-y-5">
      <h3 className="m-0 text-base font-semibold">How we find Northstar&apos;s mail</h3>
      <Group title="Email addresses" help="Mail from these addresses is always kept.">
        <Chips field="addresses" rule={rule} />
      </Group>
      <Group title="Domains" help="Mail from anyone at these domains, if it's about a job.">
        <Chips field="domains" rule={rule} />
      </Group>
      <Group
        title="Names and keywords"
        help="Found in the subject or the sender's name, never in the body."
      >
        <Chips field="keywords" rule={rule} fixed="Northstar" />
      </Group>
      <details>
        <summary className="cursor-pointer text-sm font-medium">
          Never include ({rule.rule.never.length})
        </summary>
        <div className="mt-2">
          <Chips field="never" rule={rule} />
        </div>
      </details>
      <Group title="Inboxes" help="Every folder, including Spam, Junk and Trash.">
        <Inboxes rule={rule} />
      </Group>
      <Group title="Time frame">
        <TimeFrame rule={rule} />
      </Group>
      <Queries rule={rule} />
      <Footer rule={rule} />
    </Pane>
  );
}

function Word({ children }: { children: ReactNode }) {
  return <span className="font-semibold text-foreground">{children}</span>;
}

export function SentencePanel() {
  const rule = useRule();
  return (
    <Pane className="max-w-2xl space-y-5">
      <h3 className="m-0 text-base font-semibold">How we find Northstar&apos;s mail</h3>
      <div className="space-y-3 text-[15px] leading-10 text-muted-foreground">
        <p className="m-0">
          <Word>Keep</Word> everything from <Chips field="addresses" rule={rule} />
        </p>
        <p className="m-0">
          and job mail from anyone at <Chips field="domains" rule={rule} />
        </p>
        <p className="m-0">
          or with <Chips field="keywords" rule={rule} fixed="Northstar" /> in the subject or
          sender&apos;s name,
        </p>
        <p className="m-0">
          <Word>except</Word> mail mentioning <Chips field="never" rule={rule} />
        </p>
        <p className="m-0">
          <Word>Look in</Word> <Inboxes rule={rule} />, every folder including Spam,
        </p>
        <p className="m-0">
          <Word>over</Word> <TimeFrame rule={rule} compact />.
        </p>
      </div>
      <Queries rule={rule} />
      <Footer rule={rule} />
    </Pane>
  );
}

const lastRun = { addresses: 5, domains: 1, keywords: 2, never: 1 };
export function CountsPanel() {
  const rule = useRule();
  const rows: { field: Field; title: string; found: string; fixed?: string }[] = [
    { field: "addresses", title: "Addresses", found: `${lastRun.addresses} kept` },
    { field: "domains", title: "Domains", found: `${lastRun.domains} kept` },
    {
      field: "keywords",
      title: "Names and keywords",
      found: `${lastRun.keywords} kept`,
      fixed: "Northstar",
    },
    { field: "never", title: "Never include", found: `${lastRun.never} left out` },
  ];
  return (
    <Pane className="max-w-2xl space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="m-0 text-base font-semibold">How we find Northstar&apos;s mail</h3>
        <span className="text-xs text-muted-foreground">
          Last search 31 Oct, last 90 days: 6 kept, 6 dropped
        </span>
      </div>
      <dl className="m-0 divide-y divide-border/60">
        {rows.map((row) => (
          <div
            key={row.field}
            className="grid gap-2 py-3 sm:grid-cols-[9rem_1fr_5.5rem] sm:items-start"
          >
            <dt className="pt-1.5 text-sm font-medium">{row.title}</dt>
            <dd className="m-0">
              <Chips field={row.field} rule={rule} fixed={row.fixed} />
            </dd>
            <dd className="m-0 pt-1.5 text-xs text-muted-foreground sm:text-right">{row.found}</dd>
          </div>
        ))}
        <div className="grid gap-2 py-3 sm:grid-cols-[9rem_1fr]">
          <dt className="pt-1.5 text-sm font-medium">Inboxes</dt>
          <dd className="m-0">
            <Inboxes rule={rule} />
          </dd>
        </div>
        <div className="grid gap-2 py-3 sm:grid-cols-[9rem_1fr]">
          <dt className="pt-1.5 text-sm font-medium">Time frame</dt>
          <dd className="m-0">
            <TimeFrame rule={rule} />
          </dd>
        </div>
      </dl>
      <Queries rule={rule} />
      <Footer rule={rule} />
    </Pane>
  );
}
