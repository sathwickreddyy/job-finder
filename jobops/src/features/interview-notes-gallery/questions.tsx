"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, Sparkles } from "lucide-react";
import { MarkdownView } from "@/components/markdown/markdown-view";
import { cn } from "@/lib/utils";
import {
  Complexity,
  Expand,
  ExpandButton,
  HowItWentBadge,
  PatternChip,
  dayTime,
  howItWent,
  useEdgeFade,
} from "./shared";
import type { Question, Round, Variant } from "./types";

function Part({ title, children, tone }: { title: string; children: ReactNode; tone?: "review" }) {
  return (
    <section
      className={cn(
        "min-w-0",
        tone === "review" && "rounded-2xl bg-selected/50 p-4 ring-1 ring-primary/25",
      )}
    >
      <h4 className="m-0 mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        {tone === "review" && <Sparkles aria-hidden size={13} className="text-link" />}
        {title}
      </h4>
      {children}
    </section>
  );
}

export function QuestionBody({ q }: { q: Question }) {
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <Part title="What they asked">
        <MarkdownView source={q.prompt} />
      </Part>
      <Part title="How I answered">
        <MarkdownView source={q.answer} />
      </Part>
      {q.interviewer && (
        <Part title="Interviewer">
          <p className="m-0 text-sm">{q.interviewer}</p>
        </Part>
      )}
      {q.review && (
        <Part title="Review by Claude, for revisiting" tone="review">
          <MarkdownView source={q.review} />
        </Part>
      )}
    </div>
  );
}

function QuestionMeta({ q }: { q: Question }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      {q.patterns.map((p) => (
        <PatternChip key={p}>{p}</PatternChip>
      ))}
    </div>
  );
}

function RoundHeading({ round, action }: { round: Round; action?: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
      <div className="min-w-0">
        <h3 className="m-0 truncate text-base font-semibold">
          Round {round.position} · {round.name}
        </h3>
        <p className="m-0 text-xs text-muted-foreground">
          {round.at ? dayTime(round.at) : "Not booked"} · {round.questions.length} questions
          {round.result === "due" && <span className="font-medium text-warning"> · Result due</span>}
        </p>
      </div>
      {action}
    </div>
  );
}

/* A. Accordion ledger: one row per question; it opens in place. */
function Ledger({ round }: { round: Round }) {
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const base = useId();
  const all = open.size === round.questions.length;
  return (
    <div className="@container flex min-w-0 flex-col gap-3">
      <RoundHeading
        round={round}
        action={
          round.questions.length > 1 && (
            <button
              type="button"
              onClick={() => setOpen(all ? new Set() : new Set(round.questions.map((q) => q.id)))}
              className="pressable rounded-full px-3 py-1 text-xs font-medium text-link hover:bg-muted"
            >
              {all ? "Collapse all" : "Expand all"}
            </button>
          )
        }
      />
      <ol className="m-0 flex list-none flex-col overflow-hidden rounded-2xl border border-border p-0">
        {round.questions.map((q, index) => {
          const isOpen = open.has(q.id);
          const id = `${base}-${q.id}`;
          const toggle = () =>
            setOpen((prev) => {
              const next = new Set(prev);
              if (next.has(q.id)) next.delete(q.id);
              else next.add(q.id);
              return next;
            });
          return (
            <li key={q.id} className="border-b border-border bg-card last:border-b-0">
              <div
                className={cn(
                  "flex min-w-0 cursor-pointer items-start gap-3 px-4 py-3 hover:bg-muted/40",
                  isOpen && "bg-muted/30",
                )}
                onClick={toggle}
              >
                <span className="mt-0.5 w-5 shrink-0 text-sm text-muted-foreground tabular-nums">{index + 1}</span>
                <div className="flex min-w-0 flex-1 flex-col gap-1.5 @2xl:flex-row @2xl:items-center @2xl:gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="m-0 text-sm font-medium @2xl:truncate" title={q.title}>
                      {q.title}
                    </p>
                    <div className="mt-1">
                      <QuestionMeta q={q} />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 @2xl:shrink-0">
                    <HowItWentBadge value={q.howItWent} />
                    <Complexity time={q.time} space={q.space} />
                  </div>
                </div>
                <span onClick={(event) => event.stopPropagation()}>
                  <ExpandButton
                    open={isOpen}
                    onClick={toggle}
                    controls={id}
                    label={`${isOpen ? "Collapse" : "Expand"} ${q.title}`}
                  />
                </span>
              </div>
              <Expand open={isOpen} id={id}>
                <div className="border-t border-border px-4 py-4 @2xl:pl-12">
                  <QuestionBody q={q} />
                </div>
              </Expand>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/* B. List and reader: pick on the left, read on the right; each side scrolls by itself. */
function Reader({ round }: { round: Round }) {
  const [selected, setSelected] = useState(round.questions[0]?.id);
  const [reading, setReading] = useState(false);
  const q = round.questions.find((x) => x.id === selected) ?? round.questions[0];
  const { ref: listRef, style: listStyle } = useEdgeFade<HTMLUListElement>("y");
  const { ref: bodyRef, style: bodyStyle } = useEdgeFade<HTMLDivElement>("y");
  if (!q) return null;
  return (
    <div className="@container flex min-w-0 flex-col gap-3">
      <RoundHeading round={round} />
      <div className="grid h-[520px] min-w-0 grid-cols-1 overflow-hidden rounded-2xl border border-border bg-card @2xl:grid-cols-[minmax(220px,280px)_minmax(0,1fr)]">
        <ul
          ref={listRef}
          style={listStyle}
          className={cn(
            "m-0 min-h-0 list-none overflow-y-auto border-border p-2 @2xl:block @2xl:border-r",
            reading && "hidden",
          )}
          aria-label="Questions"
        >
          {round.questions.map((item, index) => (
            <li key={item.id}>
              <button
                type="button"
                aria-current={item.id === q.id ? "true" : undefined}
                onClick={() => {
                  setSelected(item.id);
                  setReading(true);
                  bodyRef.current?.scrollTo({ top: 0 });
                }}
                className={cn(
                  "flex w-full min-w-0 items-start gap-2.5 rounded-xl px-3 py-2.5 text-left",
                  item.id === q.id ? "bg-selected text-selected-foreground" : "hover:bg-muted",
                )}
              >
                <span className="mt-px w-4 shrink-0 text-xs tabular-nums opacity-70">{index + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-sm font-medium">{item.title}</span>
                  <span className="mt-1 flex items-center gap-1.5 text-xs opacity-80">
                    <span aria-hidden className={cn("size-1.5 rounded-full", howItWent[item.howItWent].dot)} />
                    {howItWent[item.howItWent].short} · {item.time}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div className={cn("flex min-h-0 min-w-0 flex-col", !reading && "hidden @2xl:flex")}>
          <div className="flex min-w-0 items-start gap-2 border-b border-border px-4 py-3">
            <button
              type="button"
              onClick={() => setReading(false)}
              className="-ml-1 grid size-8 shrink-0 place-items-center rounded-full hover:bg-muted @2xl:hidden"
              aria-label="Back to questions"
            >
              <ArrowLeft aria-hidden size={16} />
            </button>
            <div className="min-w-0 flex-1">
              <p className="m-0 text-sm font-semibold">{q.title}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <HowItWentBadge value={q.howItWent} />
                <Complexity time={q.time} space={q.space} />
                <QuestionMeta q={q} />
              </div>
            </div>
          </div>
          <div ref={bodyRef} style={bodyStyle} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            <QuestionBody q={q} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* C. Read straight through: titles stay pinned while you scroll; chips jump to a question. */
function Stacked({ round }: { round: Round }) {
  const scroller = useRef<HTMLDivElement>(null);
  const base = useId();
  const { ref: fadeRef, style: fadeStyle } = useEdgeFade<HTMLDivElement>("x");
  function jump(id: string) {
    const root = scroller.current;
    const target = root?.querySelector<HTMLElement>(`[data-q="${id}"]`);
    if (root && target) root.scrollTo({ top: target.offsetTop - 8, behavior: "smooth" });
  }
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <RoundHeading round={round} />
      <div ref={fadeRef} style={fadeStyle} className="flex min-w-0 gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
        {round.questions.map((q, index) => (
          <button
            key={q.id}
            type="button"
            onClick={() => jump(q.id)}
            className="pressable inline-flex shrink-0 items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted"
          >
            <span aria-hidden className={cn("size-1.5 rounded-full", howItWent[q.howItWent].dot)} />
            {index + 1}. {q.title}
          </button>
        ))}
      </div>
      <div
        ref={scroller}
        className="relative h-[520px] overflow-y-auto rounded-2xl border border-border bg-card"
      >
        {round.questions.map((q, index) => (
          <article key={q.id} data-q={q.id} aria-labelledby={`${base}-${q.id}`} className="border-b border-border last:border-b-0">
            <header className="sticky top-0 z-10 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-border bg-card/95 px-4 py-2.5 backdrop-blur">
              <h4 id={`${base}-${q.id}`} className="m-0 min-w-0 flex-1 truncate text-sm font-semibold" title={q.title}>
                {index + 1}. {q.title}
              </h4>
              <HowItWentBadge value={q.howItWent} short />
              <Complexity time={q.time} space={q.space} />
            </header>
            <div className="px-4 py-4">
              <QuestionBody q={q} />
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

export function QuestionsView({ v, round }: { v: Variant; round: Round }) {
  if (round.questions.length === 0)
    return (
      <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-center">
        <p className="m-0 text-sm font-medium">No questions saved for this round</p>
        <p className="m-0 mt-1 text-sm text-muted-foreground">Add what they asked and how you answered while it is fresh.</p>
      </div>
    );
  if (v === "A") return <Ledger round={round} />;
  if (v === "B") return <Reader round={round} />;
  return <Stacked round={round} />;
}
