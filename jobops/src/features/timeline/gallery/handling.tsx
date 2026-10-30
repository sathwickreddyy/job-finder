"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, Star } from "lucide-react";
import { outcomeMeta, type OutcomeId } from "@/features/applications/phase";
import { cn } from "@/lib/utils";
import type { MailEntry } from "./data";
import {
  HandledLine,
  SenderLine,
  TagPill,
  chipOrder,
  clock,
  dayLabel,
  useHandling,
  useOutcomeChoice,
} from "./primitives";

const chip =
  "pressable inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium";
const suggestedChip = "bg-selected text-selected-foreground ring-1 ring-primary/35";
const plainChip = "border border-border text-foreground hover:bg-muted";

function SuggestStar() {
  return <Star aria-hidden size={13} className="fill-current" />;
}

/** Option A, also used inside every timeline: the suggested chip first, Just info last. */
export function ChipRow({
  mail,
  onRecord,
  compact,
}: {
  mail: MailEntry;
  onRecord: (label: string) => void;
  compact?: boolean;
}) {
  const { form, choose, details } = useOutcomeChoice(onRecord);
  const info = mail.suggested === "info";
  return (
    <div className={compact ? "mt-3" : "mt-5"}>
      {!compact && (
        <p className="m-0 mb-2 text-sm font-medium text-muted-foreground">What happened?</p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {chipOrder(mail).map((id) => (
          <button
            key={id}
            type="button"
            aria-expanded={outcomeMeta[id].needs ? form === id : undefined}
            onClick={() => choose(id)}
            className={cn(
              chip,
              mail.suggested === id ? suggestedChip : plainChip,
              form === id && "ring-2 ring-primary",
            )}
          >
            {mail.suggested === id && <SuggestStar />}
            {outcomeMeta[id].label}
          </button>
        ))}
        {chipOrder(mail).length > 0 && <span aria-hidden className="mx-1 h-6 w-px bg-border" />}
        <button
          type="button"
          onClick={() => onRecord("Just info")}
          className={cn(chip, info ? suggestedChip : "text-muted-foreground hover:bg-muted")}
        >
          {info && <SuggestStar />}
          Just info
        </button>
      </div>
      {mail.why && (
        <p className="m-0 mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <SuggestStar />
          {mail.why}
        </p>
      )}
      {details}
    </div>
  );
}

function EmailHead({ mail }: { mail: MailEntry }) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <TagPill tag={mail.tag} />
        <span>{mail.kind}</span>
        <span className="ml-auto tabular-nums">
          {dayLabel(mail.at)}, {clock(mail.at)}
        </span>
      </div>
      <h3 className="m-0 mt-3 text-lg leading-snug font-semibold tracking-tight">{mail.subject}</h3>
      <SenderLine mail={mail} className="mt-1" />
    </>
  );
}

function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <article className={cn("rounded-3xl bg-card p-5 ring-1 ring-border sm:p-6", className)}>
      {children}
    </article>
  );
}

export function ChipRowOption({ mail }: { mail: MailEntry }) {
  const { handled, record, undo } = useHandling(mail);
  return (
    <Card className={cn(!handled && "ring-2 ring-primary/50")}>
      <EmailHead mail={mail} />
      <p className="m-0 mt-3 max-w-prose text-[15px] leading-relaxed">{mail.text}</p>
      {handled ? (
        <HandledLine label={handled} onUndo={undo} className="mt-5" />
      ) : (
        <ChipRow mail={mail} onRecord={record} />
      )}
    </Card>
  );
}

/** Option B: one obvious button for the suggestion; everything else one tap away. */
export function SuggestedOption({ mail }: { mail: MailEntry }) {
  const { handled, record, undo } = useHandling(mail);
  const [more, setMore] = useState(false);
  const { form, choose, details } = useOutcomeChoice(record);
  const suggested = mail.suggested && mail.suggested !== "info" ? mail.suggested : null;
  const others = chipOrder(mail).filter((id) => id !== suggested);
  return (
    <Card>
      <EmailHead mail={mail} />
      <p className="m-0 mt-3 max-w-prose text-[15px] leading-relaxed">{mail.text}</p>
      {handled ? (
        <HandledLine label={handled} onUndo={undo} className="mt-5" />
      ) : (
        <div className="mt-5 border-t border-border pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              aria-expanded={
                suggested && outcomeMeta[suggested].needs ? form === suggested : undefined
              }
              onClick={() => (suggested ? choose(suggested) : record("Just info"))}
              className="morph pressable inline-flex h-11 items-center gap-2 bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary-hover"
            >
              <SuggestStar />
              {suggested ? `Record ${outcomeMeta[suggested].label.toLowerCase()}` : "Just info"}
            </button>
            <button
              type="button"
              aria-expanded={more}
              onClick={() => setMore(!more)}
              className="pressable inline-flex h-11 items-center gap-1 rounded-full px-4 text-sm font-medium text-foreground hover:bg-muted"
            >
              Something else
              <ChevronDown
                aria-hidden
                size={16}
                className={cn("transition-transform", more && "rotate-180")}
              />
            </button>
            {suggested && (
              <button
                type="button"
                onClick={() => record("Just info")}
                className="pressable h-11 rounded-full px-4 text-sm text-muted-foreground hover:bg-muted"
              >
                Just info
              </button>
            )}
          </div>
          {mail.why && <p className="m-0 mt-2 text-xs text-muted-foreground">{mail.why}</p>}
          {more && (
            <div className="tl-pop mt-3 flex flex-wrap gap-2">
              {others.map((id: OutcomeId) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => choose(id)}
                  className={cn(chip, plainChip, form === id && "ring-2 ring-primary")}
                >
                  {outcomeMeta[id].label}
                </button>
              ))}
            </div>
          )}
          {details}
        </div>
      )}
    </Card>
  );
}

/** Option C: the email scrolls; the outcome bar stays docked at the bottom of the pane. */
export function DockedOption({ mail }: { mail: MailEntry }) {
  const { handled, record, undo } = useHandling(mail);
  const { form, choose, details } = useOutcomeChoice(record);
  return (
    <div className="flex h-[26rem] flex-col overflow-hidden rounded-3xl bg-card ring-1 ring-border">
      <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
        <EmailHead mail={mail} />
        <p className="m-0 mt-3 max-w-prose text-[15px] leading-relaxed">{mail.text}</p>
        <p className="m-0 mt-3 max-w-prose text-[15px] leading-relaxed text-muted-foreground">
          Regards,
          <br />
          {mail.senderName}
        </p>
      </div>
      <div className="border-t border-border bg-secondary/60 px-4 py-3">
        {handled ? (
          <HandledLine label={handled} onUndo={undo} />
        ) : (
          <>
            <div className="flex items-center gap-2">
              <div className="-my-1 flex min-w-0 flex-1 gap-2 overflow-x-auto py-1">
                {chipOrder(mail).map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => choose(id)}
                    className={cn(
                      chip,
                      mail.suggested === id
                        ? suggestedChip
                        : "bg-card ring-1 ring-border hover:bg-muted",
                      form === id && "ring-2 ring-primary",
                    )}
                  >
                    {mail.suggested === id && <SuggestStar />}
                    {outcomeMeta[id].label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => record("Just info")}
                className={cn(
                  chip,
                  mail.suggested === "info"
                    ? suggestedChip
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                {mail.suggested === "info" && <SuggestStar />}
                Just info
              </button>
            </div>
            {details}
          </>
        )}
      </div>
    </div>
  );
}
