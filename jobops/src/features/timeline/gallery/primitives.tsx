"use client";

import { useId, useState, type ReactNode } from "react";
import {
  Check,
  CircleCheck,
  CircleSlash,
  FileText,
  Send,
  Undo2,
  Upload,
  type LucideIcon,
} from "lucide-react";
import { outcomeMeta, type OutcomeId } from "@/features/applications/phase";
import { roundKindLabel } from "@/features/companies/metrics";
import { tagLabel, type MailTag } from "@/features/mail/tags";
import { roundKinds } from "@/lib/round-kinds";
import { cn } from "@/lib/utils";
import { NOW, type MailEntry, type StepIcon } from "./data";

/** Literal class names so Tailwind keeps every tag colour pair. */
export const tagClass: Record<
  MailTag,
  { dot: string; text: string; tonal: string; stripe: string; ring: string; fill: string }
> = {
  opportunity: {
    dot: "bg-tag-opportunity",
    text: "text-tag-opportunity",
    tonal: "bg-tag-opportunity-container text-tag-opportunity",
    stripe: "border-l-tag-opportunity",
    ring: "ring-tag-opportunity",
    fill: "bg-tag-opportunity-container",
  },
  process: {
    dot: "bg-tag-process",
    text: "text-tag-process",
    tonal: "bg-tag-process-container text-tag-process",
    stripe: "border-l-tag-process",
    ring: "ring-tag-process",
    fill: "bg-tag-process-container",
  },
  offer: {
    dot: "bg-tag-offer",
    text: "text-tag-offer",
    tonal: "bg-tag-offer-container text-tag-offer",
    stripe: "border-l-tag-offer",
    ring: "ring-tag-offer",
    fill: "bg-tag-offer-container",
  },
  rejected: {
    dot: "bg-tag-rejected",
    text: "text-tag-rejected",
    tonal: "bg-tag-rejected-container text-tag-rejected",
    stripe: "border-l-tag-rejected",
    ring: "ring-tag-rejected",
    fill: "bg-tag-rejected-container",
  },
  other: {
    dot: "bg-tag-other",
    text: "text-tag-other",
    tonal: "bg-tag-other-container text-tag-other",
    stripe: "border-l-tag-other",
    ring: "ring-tag-other",
    fill: "bg-tag-other-container",
  },
};

export function TagDot({ tag, className }: { tag: MailTag; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2 shrink-0 rounded-full", tagClass[tag].dot, className)}
    />
  );
}

export function TagPill({ tag }: { tag: MailTag }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-full px-2.5 text-xs font-medium",
        tagClass[tag].tonal,
      )}
    >
      {tagLabel[tag]}
    </span>
  );
}

const zone = "Asia/Kolkata";
const parts = (at: string, options: Intl.DateTimeFormatOptions) =>
  Object.fromEntries(
    new Intl.DateTimeFormat("en-IN", { timeZone: zone, ...options })
      .formatToParts(new Date(at))
      .map((part) => [part.type, part.value]),
  );
const dayKeyOf = (at: string | Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: zone }).format(new Date(at));
export const dayKey = (at: string) => dayKeyOf(at);

/** "Today", "Yesterday" or "Fri 30 Oct", always in India time. */
export function dayLabel(at: string) {
  const days = Math.round((Date.parse(dayKeyOf(NOW)) - Date.parse(dayKeyOf(at))) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  const p = parts(at, { weekday: "short", day: "numeric", month: "short" });
  return `${p.weekday} ${p.day} ${p.month}`;
}
export function shortDay(at: string) {
  const p = parts(at, { day: "numeric", month: "short" });
  return `${p.day} ${p.month}`;
}
export function clock(at: string) {
  const p = parts(at, { hour: "numeric", minute: "2-digit", hour12: true });
  return `${p.hour}:${p.minute} ${String(p.dayPeriod).toLowerCase()}`;
}

const stepIcons: Record<StepIcon, LucideIcon> = {
  applied: FileText,
  outreach: Send,
  round: CircleCheck,
  submitted: Upload,
  closed: CircleSlash,
};
export function StepGlyph({ icon, className }: { icon: StepIcon; className?: string }) {
  const Icon = stepIcons[icon];
  return <Icon aria-hidden size={14} strokeWidth={2} className={className} />;
}

/** Each option keeps its own handled state so trying one never changes another. */
export function useHandling(mail: MailEntry) {
  const [handled, setHandled] = useState<string | null>(mail.open ? null : (mail.handled ?? null));
  return {
    handled,
    record: (label: string) => setHandled(label),
    undo: () => setHandled(null),
  };
}

export function chipOrder(mail: MailEntry): OutcomeId[] {
  const outcomes = mail.outcomes ?? [];
  const first = mail.suggested && mail.suggested !== "info" ? [mail.suggested] : [];
  return [...first, ...outcomes.filter((id) => !first.includes(id))];
}

export function SenderLine({ mail, className }: { mail: MailEntry; className?: string }) {
  return (
    <p className={cn("m-0 flex min-w-0 flex-wrap items-baseline gap-x-2 text-sm", className)}>
      <span className="truncate font-semibold text-foreground">{mail.senderName}</span>
      <span className="truncate text-xs text-muted-foreground">{mail.sender}</span>
      {mail.folder !== "Inbox" && (
        <span className="rounded-md bg-muted px-1.5 text-xs text-muted-foreground">
          {mail.account} {mail.folder}
        </span>
      )}
    </p>
  );
}

export function HandledLine({
  label,
  onUndo,
  className,
}: {
  label: string;
  onUndo?: () => void;
  className?: string;
}) {
  return (
    <p className={cn("m-0 flex items-center gap-2 text-sm text-muted-foreground", className)}>
      <Check aria-hidden size={15} className="text-tag-offer" />
      <span>{label === "Just info" ? "Marked as just info" : `Recorded: ${label}`}</span>
      {onUndo && (
        <button
          type="button"
          onClick={onUndo}
          className="pressable ml-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-link hover:bg-selected"
        >
          <Undo2 aria-hidden size={13} />
          Undo
        </button>
      )}
    </p>
  );
}

/** The one-line form for outcomes that need a time or a deadline. */
export function OutcomeDetails({
  outcome,
  onSave,
  onCancel,
}: {
  outcome: OutcomeId;
  onSave: (label: string) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const meta = outcomeMeta[outcome];
  const [kind, setKind] = useState<string>("DSA");
  const [at, setAt] = useState(meta.needs === "deadline" ? "2026-11-01" : "2026-11-03T15:00");
  const when =
    meta.needs === "deadline"
      ? shortDay(`${at}T23:59:00+05:30`)
      : `${dayLabel(`${at}:00+05:30`)}, ${clock(`${at}:00+05:30`)}`;
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSave(
          meta.needs === "round"
            ? `${meta.label}: ${roundKindLabel[kind as keyof typeof roundKindLabel]} on ${when}`
            : meta.needs === "deadline"
              ? `${meta.label}, due ${when}`
              : `${meta.label}, ${when}`,
        );
      }}
      className="tl-pop mt-3 flex flex-wrap items-end gap-2 rounded-2xl bg-secondary p-3"
    >
      {meta.needs === "round" && (
        <label className="grid gap-1 text-xs text-muted-foreground" htmlFor={`${id}-kind`}>
          Round
          <select
            id={`${id}-kind`}
            value={kind}
            onChange={(event) => setKind(event.target.value)}
            className="min-h-9! w-32! py-1!"
          >
            {roundKinds.map((value) => (
              <option key={value} value={value}>
                {roundKindLabel[value]}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="grid gap-1 text-xs text-muted-foreground" htmlFor={`${id}-at`}>
        {meta.needs === "deadline" ? "Due" : "When"}
        <input
          id={`${id}-at`}
          type={meta.needs === "deadline" ? "date" : "datetime-local"}
          value={at}
          onChange={(event) => setAt(event.target.value)}
          className="min-h-9! w-auto! py-1!"
        />
      </label>
      <button
        type="submit"
        className="morph pressable h-9 bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-hover"
      >
        Save
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="pressable h-9 rounded-full px-3 text-sm text-muted-foreground hover:bg-muted"
      >
        Cancel
      </button>
    </form>
  );
}

/** Shared by every option: a chip either records at once or opens its one-line form. */
export function useOutcomeChoice(onRecord: (label: string) => void) {
  const [form, setForm] = useState<OutcomeId | null>(null);
  return {
    form,
    choose(id: OutcomeId) {
      if (outcomeMeta[id].needs) setForm(form === id ? null : id);
      else onRecord(outcomeMeta[id].label);
    },
    details: form ? (
      <OutcomeDetails
        key={form}
        outcome={form}
        onCancel={() => setForm(null)}
        onSave={(label) => {
          setForm(null);
          onRecord(label);
        }}
      />
    ) : null,
  };
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (value: T) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex flex-wrap gap-1 rounded-full bg-muted p-1"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "pressable min-h-9 rounded-full px-4 text-sm font-medium",
            value === option.value
              ? "bg-card text-foreground shadow-surface"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
