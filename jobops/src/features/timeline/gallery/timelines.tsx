"use client";

import { useState, type ReactNode } from "react";
import { Check, Hourglass, Mail } from "lucide-react";
import { tagLabel } from "./legacy-tags";
import { cn } from "@/lib/utils";
import { ChipRow } from "./handling";
import { NOW, type Company, type Entry, type MailEntry, type StepEntry } from "./data";
import {
  HandledLine,
  SenderLine,
  StepGlyph,
  TagDot,
  clock,
  dayKey,
  dayLabel,
  tagClass,
  useHandling,
} from "./primitives";

export type TimelineProps = { company: Company };

/** Role chips filter a company's single timeline; they appear only with two or more roles. */
function useRoleFilter(company: Company) {
  const [role, setRole] = useState<string | null>(null);
  const entries = company.entries.filter((entry) => !role || entry.roleId === role);
  const roleOf = (entry: Entry) =>
    company.roles.length > 1
      ? company.roles.find((item) => item.id === entry.roleId)?.title
      : undefined;
  const filter =
    company.roles.length > 1 ? (
      <div role="group" aria-label="Filter by role" className="mb-5 flex flex-wrap gap-2">
        {[{ id: null, title: "All roles" }, ...company.roles].map((item) => (
          <button
            key={item.id ?? "all"}
            type="button"
            aria-pressed={role === item.id}
            onClick={() => setRole(item.id)}
            className={cn(
              "pressable h-8 rounded-full px-3 text-sm",
              role === item.id
                ? "bg-foreground text-background"
                : "text-muted-foreground ring-1 ring-border hover:text-foreground",
            )}
          >
            {item.title}
          </button>
        ))}
      </div>
    ) : null;
  return { entries, filter, roleOf };
}

const byTime = (a: Entry, b: Entry) => a.at.localeCompare(b.at);

function MailBody({ mail, onRecord }: { mail: MailEntry; onRecord: (label: string) => void }) {
  return (
    <>
      <SenderLine mail={mail} />
      <p className="m-0 mt-2 max-w-prose text-[15px] leading-relaxed">{mail.text}</p>
      <ChipRow mail={mail} onRecord={onRecord} compact />
    </>
  );
}

/** A: a spine read oldest to newest, so each company reads as one story. */

function SpineMail({ mail, role }: { mail: MailEntry; role?: string }) {
  const { handled, record, undo } = useHandling(mail);
  const [open, setOpen] = useState(!handled);
  const needs = !handled;
  return (
    <div
      className={cn(
        "rounded-2xl transition-[box-shadow,background-color]",
        open ? "bg-card p-4 ring-1 ring-border" : "-mx-2 px-2 py-1 hover:bg-muted/60",
        needs && "ring-2 ring-primary/55",
      )}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="block w-full text-left"
      >
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className={cn("text-[15px]", needs ? "font-semibold" : "font-medium")}>
            {mail.subject}
          </span>
          <span className={cn("text-xs font-medium", tagClass[mail.tag].text)}>{mail.kind}</span>
        </span>
        {!open && (
          <span className="mt-0.5 flex flex-wrap gap-x-3 text-sm text-muted-foreground">
            <span>{mail.senderName}</span>
            {role && <span>{role}</span>}
            {handled && (
              <span className="inline-flex items-center gap-1">
                <Check aria-hidden size={13} className="text-tag-offer" />
                {handled}
              </span>
            )}
          </span>
        )}
      </button>
      {open && (
        <div className="tl-pop mt-2">
          {handled ? (
            <>
              <SenderLine mail={mail} />
              <p className="m-0 mt-2 max-w-prose text-[15px] leading-relaxed">{mail.text}</p>
              <HandledLine label={handled} onUndo={mail.open ? undo : undefined} className="mt-3" />
            </>
          ) : (
            <MailBody mail={mail} onRecord={record} />
          )}
        </div>
      )}
    </div>
  );
}

function SpineNode({ entry }: { entry: Entry }) {
  if (entry.type === "mail")
    return (
      <span className="relative mt-2 grid size-4 place-items-center">
        {entry.open && (
          <span aria-hidden className="tl-ping absolute inset-0 rounded-full bg-primary/40" />
        )}
        <TagDot tag={entry.tag} className="relative size-3 ring-4 ring-background" />
      </span>
    );
  return (
    <span
      className={cn(
        "relative grid size-7 place-items-center rounded-full ring-4 ring-background",
        entry.by === "you"
          ? "bg-foreground text-background"
          : "bg-tag-offer-container text-tag-offer",
      )}
    >
      <StepGlyph icon={entry.icon} />
    </span>
  );
}

export function SpineTimeline({ company }: TimelineProps) {
  const { entries, filter, roleOf } = useRoleFilter(company);
  const sorted = [...entries].sort(byTime);
  return (
    <div>
      {filter}
      <ol className="m-0 list-none p-0">
        {sorted.map((entry, index) => {
          const newDay = index === 0 || dayKey(sorted[index - 1].at) !== dayKey(entry.at);
          const last = index === sorted.length - 1;
          return (
            <li key={entry.id} className="grid grid-cols-[5rem_1.75rem_minmax(0,1fr)] gap-x-3">
              <div className="pt-1.5 text-right text-xs leading-tight text-muted-foreground tabular-nums">
                {newDay && (
                  <span className="block font-semibold whitespace-nowrap text-foreground">
                    {dayLabel(entry.at)}
                  </span>
                )}
                <span className="block">{clock(entry.at)}</span>
              </div>
              <div className="relative flex justify-center">
                {!last && <span aria-hidden className="absolute top-3 -bottom-3 w-px bg-border" />}
                <SpineNode entry={entry} />
              </div>
              <div className={cn("min-w-0", last ? "pb-1" : "pb-6")}>
                {entry.type === "mail" ? (
                  <SpineMail mail={entry} role={roleOf(entry)} />
                ) : (
                  <p className="m-0 pt-1 text-[15px]">
                    {entry.text}
                    {roleOf(entry) && (
                      <span className="ml-2 text-sm text-muted-foreground">{roleOf(entry)}</span>
                    )}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** B: newest first, grouped by day, one dense row per entry like an inbox. */

function LedgerMail({ mail, role }: { mail: MailEntry; role?: string }) {
  const { handled, record, undo } = useHandling(mail);
  const [open, setOpen] = useState(false);
  const needs = !handled;
  return (
    <li
      className={cn(
        "relative",
        needs &&
          "before:absolute before:inset-y-1 before:-left-3 before:w-[3px] before:rounded-full before:bg-primary",
      )}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="grid w-full grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 rounded-xl py-2 text-left hover:bg-muted/60"
      >
        <span
          className={cn("grid size-8 place-items-center rounded-full", tagClass[mail.tag].tonal)}
        >
          <Mail aria-hidden size={15} />
        </span>
        <span className="min-w-0">
          <span className="flex items-baseline gap-2">
            <span className={cn("truncate", needs ? "font-semibold" : "font-medium")}>
              {mail.senderName}
            </span>
            {needs && (
              <span className="shrink-0 rounded-full bg-selected px-2 text-xs font-medium text-selected-foreground">
                Needs you
              </span>
            )}
          </span>
          <span className="block truncate text-sm text-muted-foreground">
            {mail.subject}
            {role && ` (${role})`}
          </span>
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">{clock(mail.at)}</span>
      </button>
      {open && (
        <div className="tl-pop mb-2 ml-11 rounded-2xl bg-card p-4 ring-1 ring-border">
          {handled ? (
            <>
              <SenderLine mail={mail} />
              <p className="m-0 mt-2 max-w-prose text-[15px] leading-relaxed">{mail.text}</p>
              <HandledLine label={handled} onUndo={mail.open ? undo : undefined} className="mt-3" />
            </>
          ) : (
            <MailBody mail={mail} onRecord={record} />
          )}
        </div>
      )}
      {!open && needs && (
        <div className="ml-11 pb-2">
          <ChipRow mail={mail} onRecord={record} compact />
        </div>
      )}
    </li>
  );
}

function LedgerStep({ step, role }: { step: StepEntry; role?: string }) {
  return (
    <li className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 py-2">
      <span className="grid size-8 place-items-center rounded-full bg-muted text-muted-foreground">
        <StepGlyph icon={step.icon} />
      </span>
      <span className="min-w-0 truncate">
        {step.text}
        {role && <span className="ml-2 text-sm text-muted-foreground">{role}</span>}
      </span>
      <span className="text-xs text-muted-foreground tabular-nums">{clock(step.at)}</span>
    </li>
  );
}

export function LedgerTimeline({ company }: TimelineProps) {
  const { entries, filter, roleOf } = useRoleFilter(company);
  const days = new Map<string, Entry[]>();
  for (const entry of [...entries].sort(byTime).reverse())
    days.set(dayKey(entry.at), [...(days.get(dayKey(entry.at)) ?? []), entry]);
  return (
    <div>
      {filter}
      <div className="space-y-4 pl-3">
        {[...days.values()].map((items) => (
          <section key={items[0].id}>
            <h4 className="m-0 mb-1 text-sm font-semibold">{dayLabel(items[0].at)}</h4>
            <ul className="m-0 list-none p-0">
              {items.map((entry) =>
                entry.type === "mail" ? (
                  <LedgerMail key={entry.id} mail={entry} role={roleOf(entry)} />
                ) : (
                  <LedgerStep key={entry.id} step={entry} role={roleOf(entry)} />
                ),
              )}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

/** C: a conversation, your steps on the right and their emails on the left. */

function ThreadMail({ mail, role }: { mail: MailEntry; role?: string }) {
  const { handled, record, undo } = useHandling(mail);
  const [open, setOpen] = useState(!handled);
  return (
    <div className="flex justify-start">
      <div
        className={cn(
          "w-full max-w-[36rem] rounded-3xl rounded-bl-md bg-card p-4 ring-1 ring-border",
          !handled && "ring-2 ring-primary/55",
        )}
      >
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="block w-full text-left"
        >
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <TagDot tag={mail.tag} />
            <span className="font-medium text-foreground">{mail.senderName}</span>
            <span>{tagLabel[mail.tag]}</span>
            <span className="ml-auto tabular-nums">{clock(mail.at)}</span>
          </span>
          <span className="mt-1.5 block text-[15px] font-semibold">{mail.subject}</span>
          {role && <span className="block text-sm text-muted-foreground">{role}</span>}
          {!open && handled && (
            <span className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
              <Check aria-hidden size={13} className="text-tag-offer" />
              {handled}
            </span>
          )}
        </button>
        {open && (
          <div className="tl-pop">
            <p className="m-0 mt-2 max-w-prose text-[15px] leading-relaxed">{mail.text}</p>
            {handled ? (
              <HandledLine label={handled} onUndo={mail.open ? undo : undefined} className="mt-3" />
            ) : (
              <ChipRow mail={mail} onRecord={record} compact />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ThreadStep({ step, role }: { step: StepEntry; role?: string }) {
  if (step.by === "them")
    return (
      <p className="m-0 flex items-center justify-center gap-2 text-sm text-muted-foreground">
        <Check aria-hidden size={14} className="text-tag-offer" />
        {step.text}
        {role && <span>({role})</span>}
      </p>
    );
  return (
    <div className="flex justify-end">
      <div className="max-w-[26rem] rounded-3xl rounded-br-md bg-selected px-4 py-2.5 text-selected-foreground">
        <p className="m-0 flex items-center gap-2 text-[15px] font-medium">
          <StepGlyph icon={step.icon} />
          {step.text}
        </p>
        <p className="m-0 text-xs opacity-80">
          {role ? `${role}, ` : ""}
          {clock(step.at)}
        </p>
      </div>
    </div>
  );
}

export function ThreadTimeline({ company }: TimelineProps) {
  const { entries, filter, roleOf } = useRoleFilter(company);
  const sorted = [...entries].sort(byTime);
  const last = sorted.at(-1);
  const quiet =
    last?.type === "step" && last.by === "you"
      ? Math.floor((NOW.getTime() - new Date(last.at).getTime()) / 86_400_000)
      : null;
  const rows: ReactNode[] = [];
  sorted.forEach((entry, index) => {
    if (index === 0 || dayKey(sorted[index - 1].at) !== dayKey(entry.at))
      rows.push(
        <p
          key={`day-${entry.id}`}
          className="m-0 pt-2 text-center text-xs font-semibold text-muted-foreground"
        >
          {dayLabel(entry.at)}
        </p>,
      );
    rows.push(
      entry.type === "mail" ? (
        <ThreadMail key={entry.id} mail={entry} role={roleOf(entry)} />
      ) : (
        <ThreadStep key={entry.id} step={entry} role={roleOf(entry)} />
      ),
    );
  });
  return (
    <div>
      {filter}
      <div className="space-y-3">{rows}</div>
      {quiet !== null && (
        <p className="m-0 mt-5 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Hourglass aria-hidden size={14} />
          Waiting on them for {quiet} {quiet === 1 ? "day" : "days"}
        </p>
      )}
    </div>
  );
}
