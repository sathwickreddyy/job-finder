"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { domainProblem, keywordProblem } from "@/features/mail/keywords";

export type RuleField = "senders" | "domains" | "keywords" | "excludedTerms";
const noun: Record<RuleField, string> = {
  senders: "address",
  domains: "domain",
  keywords: "keyword",
  excludedTerms: "phrase",
};
const placeholder: Record<RuleField, string> = {
  senders: "careers@company.com",
  domains: "company.com",
  keywords: "Company Talent",
  excludedTerms: "Company newsletter",
};
const domainPattern = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/;

/** Why a chip value can't be saved, in the same words the server uses; null when it can. */
export function checkChip(
  field: RuleField,
  raw: string,
  rule: { company: string; existing: string[] },
): string | null {
  const value = raw.trim();
  if (!value) return `Enter a ${noun[field]}.`;
  if (/["\\]/.test(value) || /[\u0000-\u001f]/.test(value))
    return "Remove quotes, backslashes and line breaks.";
  if (field === "senders" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
    return "Enter an email address.";
  if (field === "domains" && !domainPattern.test(value.toLowerCase().replace(/^@/, "")))
    return "Enter a domain like northstar.com.";
  if (field === "domains") {
    const problem = domainProblem(value, rule.company);
    if (problem) return problem;
  }
  if (field === "keywords") {
    const problem = keywordProblem(value, rule.company);
    if (problem) return problem;
  }
  if (rule.existing.some((known) => known.toLowerCase() === value.toLowerCase()))
    return `${value} is already listed.`;
  return null;
}

function Chip({
  value,
  onRemove,
  onEdit,
}: {
  value: string;
  onRemove?: () => void;
  /** Returns why the edit was refused, or null when it was accepted. */
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
              event.preventDefault();
              const problem = onEdit(draft);
              setError(problem);
              if (!problem) setEditing(false);
            }
          }}
          className="h-8! min-h-8! w-56! max-w-full rounded-full! px-3! py-0! text-sm"
        />
        {error && <span className="max-w-72 text-xs text-destructive">{error}</span>}
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

function Adder({ field, onAdd }: { field: RuleField; onAdd: (value: string) => string | null }) {
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
        Add {noun[field]}
      </button>
    );
  return (
    <form
      className="inline-grid gap-1"
      onSubmit={(event) => {
        event.preventDefault();
        const problem = onAdd(value);
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
          aria-label={`New ${noun[field]}`}
          placeholder={placeholder[field]}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => event.key === "Escape" && setOpen(false)}
          className="h-8! min-h-8! w-56! max-w-full rounded-full! px-3! py-0! text-sm"
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

/** One rule row's chips: edit in place, remove, or add; `fixed` chips can't be changed. */
export function Chips({
  field,
  values,
  fixed = [],
  company,
  onChange,
  addable = true,
}: {
  field: RuleField;
  values: string[];
  fixed?: string[];
  company: string;
  onChange: (values: string[]) => void;
  /** Aliases share the keyword row, whose single Add button adds keywords. */
  addable?: boolean;
}) {
  const check = (value: string, others: string[]) =>
    checkChip(field, value, { company, existing: [...fixed, ...others] });
  return (
    <span className="inline-flex flex-wrap items-start gap-1.5">
      {fixed.map((value) => (
        <Chip key={value} value={value} />
      ))}
      {values.map((value) => (
        <Chip
          key={value}
          value={value}
          onRemove={() => onChange(values.filter((item) => item !== value))}
          onEdit={(to) => {
            const problem = check(
              to,
              values.filter((item) => item !== value),
            );
            if (!problem) onChange(values.map((item) => (item === value ? to.trim() : item)));
            return problem;
          }}
        />
      ))}
      {addable && (
        <Adder
          field={field}
          onAdd={(value) => {
            const problem = check(value, values);
            if (!problem) onChange([...values, value.trim()]);
            return problem;
          }}
        />
      )}
    </span>
  );
}
