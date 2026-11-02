"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import type { Brief } from "./brief";

/** The brief exactly as GET /api/v1/resumes/{id}/fit hands it to the agent. */
export function BriefView({ brief }: { brief: Brief }) {
  const [copied, setCopied] = useState(false);
  const json = JSON.stringify(brief, null, 2);
  return (
    <details className="rounded-2xl bg-muted/60 p-3">
      <summary className="cursor-pointer text-sm font-semibold">What the agent is told</summary>
      <p className="m-0 mt-2 text-xs text-muted-foreground">
        Claude Code or Codex reads this when it opens the résumé.
      </p>
      <div className="relative mt-2">
        <pre className="m-0 max-h-80 overflow-auto rounded-xl bg-card p-3 pt-10 text-[11px] leading-relaxed whitespace-pre-wrap">
          {json}
        </pre>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(json).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1800);
            });
          }}
          className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
        >
          {copied ? <Check size={12} aria-hidden /> : <Copy size={12} aria-hidden />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </details>
  );
}
