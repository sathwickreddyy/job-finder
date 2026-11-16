import type { ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { MarkdownView } from "@/components/markdown/markdown-view";
import { cn } from "@/lib/utils";
import type { InterviewQuestion, QuestionOutcome } from "../types";

export const outcomeMeta: Record<
  QuestionOutcome,
  { label: string; short: string; tone: string; dot: string }
> = {
  solved_code: {
    label: "Solved in code",
    short: "Solved",
    tone: "bg-success-soft text-success",
    dot: "bg-success",
  },
  solved_aloud: {
    label: "Solved, finished aloud",
    short: "Solved aloud",
    tone: "bg-selected text-selected-foreground",
    dot: "bg-primary",
  },
  partial: {
    label: "Partly solved",
    short: "Partly",
    tone: "bg-warning-soft text-warning",
    dot: "bg-warning",
  },
  stuck: {
    label: "Got stuck",
    short: "Stuck",
    tone: "bg-danger-soft text-destructive",
    dot: "bg-destructive",
  },
};

export function HowItWentBadge({
  value,
  short = false,
}: {
  value: QuestionOutcome;
  short?: boolean;
}) {
  const meta = outcomeMeta[value];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        meta.tone,
      )}
    >
      <span aria-hidden className={cn("size-1.5 rounded-full", meta.dot)} />
      {short ? meta.short : meta.label}
    </span>
  );
}

export function PatternChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex max-w-full shrink-0 items-center truncate rounded-full border border-border px-2 py-px text-[11px] font-medium text-muted-foreground">
      {children}
    </span>
  );
}

/** "T O(n)  S O(1)"; nothing when neither is recorded. */
export function Complexity({ time, space }: { time: string; space: string }) {
  if (!time.trim() && !space.trim()) return null;
  return (
    <span className="inline-flex shrink-0 items-baseline gap-2 text-xs whitespace-nowrap text-muted-foreground tabular-nums">
      {time.trim() && (
        <span>
          <span className="sr-only">Time </span>
          <span aria-hidden>T </span>
          <span className="font-medium text-foreground">{time}</span>
        </span>
      )}
      {space.trim() && (
        <span>
          <span className="sr-only">Space </span>
          <span aria-hidden>S </span>
          <span className="font-medium text-foreground">{space}</span>
        </span>
      )}
    </span>
  );
}

function Part({
  title,
  children,
  review,
}: {
  title: string;
  children: ReactNode;
  review?: boolean;
}) {
  return (
    <section
      className={cn("min-w-0", review && "rounded-2xl bg-selected/50 p-4 ring-1 ring-primary/25")}
    >
      <h4 className="m-0 mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        {review && <Sparkles aria-hidden size={13} className="text-link" />}
        {title}
      </h4>
      {children}
    </section>
  );
}

/** What they asked, how the user answered, what the interviewer said and any agent review. */
export function QuestionBody({ q }: { q: InterviewQuestion }) {
  const empty = !q.prompt.trim() && !q.answer.trim() && !q.interviewer.trim() && !q.review.trim();
  return (
    <div className="flex min-w-0 flex-col gap-5">
      {empty && (
        <p className="m-0 text-sm text-muted-foreground">
          Nothing written yet. Edit to add what they asked and how you answered.
        </p>
      )}
      {q.prompt.trim() && (
        <Part title="What they asked">
          <MarkdownView source={q.prompt} />
        </Part>
      )}
      {q.answer.trim() && (
        <Part title="How I answered">
          <MarkdownView source={q.answer} />
        </Part>
      )}
      {q.interviewer.trim() && (
        <Part title="Interviewer">
          <MarkdownView source={q.interviewer} />
        </Part>
      )}
      {q.review.trim() && (
        <Part title={`Review by ${q.reviewSource ?? "an agent"}, for revisiting`} review>
          <MarkdownView source={q.review} />
        </Part>
      )}
    </div>
  );
}
