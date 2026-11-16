"use client";

import { useState, type ReactNode } from "react";
import type { Components } from "react-markdown";
import { Check, Copy } from "lucide-react";
import { MarkdownView } from "@/components/markdown/markdown-view";
import { ScoreDials } from "@/features/resumes/fit/score-dials";
import type { ToolSummary } from "@/features/resumes/fit/derive";
import type { ToolSource } from "@/features/resumes/fit/tools";
import { parseNoteSections } from "./sections";

const HEX = /^[0-9a-f]{24,}$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PATH = /^(?:[A-Za-z]:[\\/]|~?\/|\.{1,2}\/).*[^\\/\s]$/;

/** What to show for a long identifier or file path, or null for ordinary inline code. */
function proofLabel(value: string): string | null {
  if (HEX.test(value) || UUID.test(value)) return `${value.slice(0, 8)}…${value.slice(-8)}`;
  if (PATH.test(value)) return value.split(/[\\/]/).pop() || null;
  return null;
}

function CopyToken({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 align-baseline">
      <code title={value} className="min-w-0 truncate">
        {label}
      </code>
      <button
        type="button"
        aria-label={`Copy ${label}`}
        className="inline-flex h-6 shrink-0 items-center gap-1 rounded-full border border-border px-2 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
        onClick={() => {
          void navigator.clipboard?.writeText(value).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
      >
        {copied ? <Check aria-hidden size={11} /> : <Copy aria-hidden size={11} />}
        {copied ? "Copied" : "Copy"}
      </button>
    </span>
  );
}

const formMarks: Components = {
  input: ({ checked, type }) =>
    type === "checkbox" ? (
      checked ? (
        <span role="img" aria-label="Done" className="mr-2 font-semibold text-success">
          ✓
        </span>
      ) : (
        <span role="img" aria-label="Not done" className="mr-2 font-semibold text-danger-action">
          ✕
        </span>
      )
    ) : null,
};

const proofTokens: Components = {
  code: ({ className, children, ...rest }) => {
    const text = typeof children === "string" ? children : null;
    const label = !className && text && !text.includes("\n") ? proofLabel(text) : null;
    if (text && label) return <CopyToken value={text} label={label} />;
    return (
      <code className={className} {...rest}>
        {children}
      </code>
    );
  },
};

const emphasis: Components = {
  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
};

function Heading({ children }: { children: ReactNode }) {
  return (
    <h3 className="m-0 mb-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
      {children}
    </h3>
  );
}

/**
 * The application's notes, read top to bottom: Summary, the stored résumé scores, On the form
 * and Proof for a template note; any other Markdown renders as written.
 */
export function NotesView({
  notes,
  scores,
  resumesHref = "/resumes",
}: {
  notes: string;
  scores: Record<ToolSource, ToolSummary> | null;
  resumesHref?: string;
}) {
  if (!notes.trim()) return <p className="m-0 text-sm text-muted-foreground">Nothing yet.</p>;
  const sections = parseNoteSections(notes);
  if (!sections) return <MarkdownView source={notes} />;
  return (
    <div className="flex min-w-0 flex-col gap-4">
      {sections.summary && (
        <MarkdownView
          source={sections.summary}
          components={emphasis}
          className="text-muted-foreground [&_p]:text-[15px]"
        />
      )}
      {scores && <ScoreDials tools={scores} href={resumesHref} />}
      {sections.onTheForm && (
        <section aria-label="On the form">
          <Heading>On the form</Heading>
          <MarkdownView source={sections.onTheForm} components={formMarks} />
        </section>
      )}
      {sections.proof && (
        <section aria-label="Proof">
          <Heading>Proof</Heading>
          <MarkdownView source={sections.proof} components={proofTokens} />
        </section>
      )}
      {sections.rest && <MarkdownView source={sections.rest} />}
    </div>
  );
}
