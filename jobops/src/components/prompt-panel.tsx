"use client";
import { useState, useRef } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
const panel = "rounded-card border border-border bg-card";

export function CopyButton({ text, label = "Copy prompt" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState("");
  const pending = useRef(false);
  async function copy() {
    if (pending.current) return;
    pending.current = true;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(text);
      setError("");
    } catch {
      setError("Clipboard unavailable. Select the prompt text and copy it manually.");
    } finally {
      pending.current = false;
    }
  }
  return (
    <div className="space-y-2">
      <Button type="button" onClick={copy}>
        {copied === text ? <Check size={17} aria-hidden /> : <Copy size={17} aria-hidden />}
        {copied === text ? "Copied" : label}
      </Button>
      <span role="status" className={error ? "block text-sm text-destructive" : "sr-only"}>
        {error || (copied === text ? "Prompt copied. Paste it in ChatGPT or Claude." : "")}
      </span>
    </div>
  );
}

export function PromptPanel({ prompt, compact = false }: { prompt: string; compact?: boolean }) {
  const [edit, setEdit] = useState(false);
  const [override, setOverride] = useState<{ base: string; value: string } | null>(null);
  const value = override?.base === prompt ? override.value : prompt;
  return (
    <section className={cn(panel, "overflow-hidden")} aria-label="Your complete prompt">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-5 py-4 sm:px-7">
        <div>
          <h2 className="text-lg font-semibold">Your prompt, ready to use</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Copy into your existing ChatGPT or Claude conversation.
          </p>
        </div>
        <CopyButton text={value} />
      </div>
      <div className="p-5 sm:p-7">
        {edit || compact ? (
          <textarea
            aria-label="Edit complete prompt"
            className="min-h-[34rem] resize-y !bg-card !p-4 !leading-7"
            value={value}
            onChange={(event) => setOverride({ base: prompt, value: event.target.value })}
          />
        ) : (
          <div className="max-w-[78ch] whitespace-pre-wrap text-[15px] leading-7" tabIndex={0}>
            {value}
          </div>
        )}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          {!compact && (
            <Button variant="outline" onClick={() => setEdit(!edit)}>
              {edit ? "Finish editing" : "Edit prompt"}
            </Button>
          )}
          {override?.base === prompt && (
            <Button variant="ghost" onClick={() => setOverride(null)}>
              Reset my edits
            </Button>
          )}
          <p className="text-sm text-muted-foreground">
            Your assistant can use what it already knows about you.
          </p>
        </div>
      </div>
    </section>
  );
}
