"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { Library, Pencil, Plus } from "lucide-react";
import { Expand, ExpandButton } from "@/components/ui/expand";
import { cn } from "@/lib/utils";
import type { RoundWithQuestions } from "../types";
import { QuestionEditor } from "./question-editor";
import { Complexity, HowItWentBadge, PatternChip, QuestionBody } from "./question-body";

/**
 * Questions A: one row per question that opens in place, Expand all, Edit inside the opened
 * row, and Add a question at the end. One editor is open at a time.
 */
export function RoundQuestions({
  applicationId,
  round,
}: {
  applicationId: string;
  round: RoundWithQuestions;
}) {
  const base = useId();
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const questions = round.questions;
  const all = questions.length > 0 && open.size === questions.length;
  const toggle = (id: string) =>
    setOpen((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="@container mt-3 flex min-w-0 flex-col gap-2">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <h4 className="m-0 text-sm font-semibold">
          Questions
          {questions.length ? (
            <span className="font-normal text-muted-foreground"> · {questions.length}</span>
          ) : null}
        </h4>
        <div className="flex items-center gap-1">
          {questions.length > 1 && (
            <button
              type="button"
              onClick={() => setOpen(all ? new Set() : new Set(questions.map((q) => q.id)))}
              className="pressable rounded-full px-3 py-1 text-xs font-medium text-link hover:bg-muted"
            >
              {all ? "Collapse all" : "Expand all"}
            </button>
          )}
          {questions.length > 0 && (
            <Link
              href="/applications/questions"
              className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium text-link hover:bg-muted hover:no-underline"
            >
              <Library aria-hidden size={13} /> Question library
            </Link>
          )}
        </div>
      </div>
      {questions.length > 0 && (
        <ol className="m-0 flex list-none flex-col overflow-hidden rounded-2xl border border-border p-0">
          {questions.map((q, index) => {
            const isOpen = open.has(q.id);
            const id = `${base}-${q.id}`;
            if (editing === q.id)
              return (
                <li key={q.id} className="border-b border-border p-2 last:border-b-0">
                  <QuestionEditor
                    applicationId={applicationId}
                    roundId={round.id}
                    question={q}
                    onDone={() => setEditing(null)}
                  />
                </li>
              );
            return (
              <li key={q.id} className="border-b border-border bg-card last:border-b-0">
                <div
                  className={cn(
                    "flex min-w-0 cursor-pointer items-start gap-3 px-4 py-3 hover:bg-muted/40",
                    isOpen && "bg-muted/30",
                  )}
                  onClick={() => toggle(q.id)}
                >
                  <span className="mt-0.5 w-5 shrink-0 text-sm text-muted-foreground tabular-nums">
                    {index + 1}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5 @2xl:flex-row @2xl:items-center @2xl:gap-4">
                    <div className="min-w-0 flex-1">
                      <p
                        className="m-0 text-sm font-medium [overflow-wrap:anywhere] @2xl:truncate"
                        title={q.title}
                      >
                        {q.title}
                      </p>
                      {q.patterns.length > 0 && (
                        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
                          {q.patterns.map((p) => (
                            <PatternChip key={p}>{p}</PatternChip>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 @2xl:shrink-0">
                      {q.outcome && <HowItWentBadge value={q.outcome} />}
                      <Complexity time={q.time} space={q.space} />
                    </div>
                  </div>
                  <span onClick={(event) => event.stopPropagation()}>
                    <ExpandButton
                      open={isOpen}
                      onClick={() => toggle(q.id)}
                      controls={id}
                      label={`${isOpen ? "Collapse" : "Expand"} ${q.title}`}
                    />
                  </span>
                </div>
                <Expand open={isOpen} id={id}>
                  <div className="border-t border-border px-4 py-4 @2xl:pl-12">
                    <QuestionBody q={q} />
                    <button
                      type="button"
                      onClick={() => setEditing(q.id)}
                      className="pressable mt-4 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-link ring-1 ring-border hover:bg-muted"
                    >
                      <Pencil aria-hidden size={13} /> Edit question
                    </button>
                  </div>
                </Expand>
              </li>
            );
          })}
        </ol>
      )}
      {editing === "new" ? (
        <QuestionEditor
          applicationId={applicationId}
          roundId={round.id}
          onDone={() => setEditing(null)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="pressable inline-flex items-center gap-1.5 self-start rounded-full border border-border px-4 py-1.5 text-sm font-medium hover:bg-muted"
        >
          <Plus aria-hidden size={15} /> Add a question
        </button>
      )}
    </div>
  );
}
