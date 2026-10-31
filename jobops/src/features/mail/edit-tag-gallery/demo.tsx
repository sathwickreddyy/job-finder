"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Check, ChevronDown, Pencil, RotateCcw, Tag, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { previewTags, sample, type PreviewTag } from "./data";
import { Pill, PopupGrouped, PopupList, PopupTwoStep, type Saving } from "./popups";

export type Letter = "A" | "B" | "C";
const popups = { A: PopupGrouped, B: PopupList, C: PopupTwoStep };
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const quiet =
  "inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium text-muted-foreground";

/**
 * One sample email that arrived with the wrong tag. `popup` picks the dialog, `feedback`
 * what happens after confirming (none: the pill just changes) and `placement` where the
 * Edit tag button sits.
 */
export function EditTagDemo({
  popup = "A",
  feedback,
  placement = "B",
}: {
  popup?: Letter;
  feedback?: Letter;
  placement?: Letter;
}) {
  const Popup = popups[popup];
  const [tag, setTag] = useState<PreviewTag>(sample.wrongTag);
  const [previous, setPrevious] = useState<PreviewTag | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState<Saving>("idle");
  const [snack, setSnack] = useState<number | null>(null);
  const [glow, setGlow] = useState<"off" | "on" | "fade">("off");
  const [fresh, setFresh] = useState(false);

  useEffect(() => {
    if (snack === null) return;
    const timer = setTimeout(() => setSnack(null), 6000);
    return () => clearTimeout(timer);
  }, [snack]);
  useEffect(() => {
    if (!fresh) return;
    const timer = setTimeout(() => setFresh(false), 2400);
    return () => clearTimeout(timer);
  }, [fresh]);
  useEffect(() => {
    if (glow === "off") return;
    const timer = setTimeout(
      () => setGlow(glow === "on" ? "fade" : "off"),
      glow === "on" ? 60 : 1900,
    );
    return () => clearTimeout(timer);
  }, [glow]);

  async function confirm(next: PreviewTag) {
    // Every option shows the save happening; B lingers on it so it can be read.
    setSaving("saving");
    await wait(feedback === "B" ? 700 : 350);
    if (feedback === "B") {
      setSaving("saved");
      await wait(550);
    }
    setPrevious(tag);
    setTag(next);
    setOpen(false);
    setSaving("idle");
    if (feedback === "A") setSnack(Date.now());
    if (feedback === "C") {
      setGlow("on");
      setFresh(true);
    }
  }
  function undo() {
    if (previous) setTag(previous);
    setPrevious(null);
    setSnack(null);
  }
  function reset() {
    setTag(sample.wrongTag);
    setPrevious(null);
    setSnack(null);
    setFresh(false);
  }

  const anchored = (trigger: ReactNode) => (
    <span className="relative inline-flex">
      {trigger}
      <Popup
        open={open}
        current={tag}
        saving={saving}
        onClose={() => setOpen(false)}
        onConfirm={confirm}
      />
    </span>
  );
  const pill = (
    <span className="relative inline-flex">
      <Pill tag={tag} />
      {fresh && (
        <span className="reveal absolute -top-1.5 -right-1.5 grid size-4 place-items-center rounded-full bg-primary text-primary-foreground">
          <Check aria-hidden size={10} strokeWidth={3} />
        </span>
      )}
    </span>
  );
  const info = previewTags[tag];
  const TagIcon = info.icon;
  const tagCell =
    placement === "A" ? (
      <span className="flex items-center gap-1">
        {pill}
        {anchored(
          <button
            type="button"
            aria-label="Edit tag"
            aria-haspopup="dialog"
            onClick={() => setOpen(true)}
            className="pressable grid size-7 place-items-center rounded-full text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-muted hover:text-foreground focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
          >
            <Pencil aria-hidden size={14} />
          </button>,
        )}
      </span>
    ) : placement === "C" ? (
      anchored(
        <button
          type="button"
          aria-haspopup="dialog"
          aria-label={`Tag: ${info.label}. Edit tag`}
          onClick={() => setOpen(true)}
          className={cn(
            "pressable relative inline-flex h-6 items-center gap-1 rounded-full pr-1.5 pl-2.5 text-xs font-medium transition-shadow hover:ring-2 hover:ring-primary/40",
            info.tone.tonal,
          )}
        >
          <TagIcon aria-hidden size={13} strokeWidth={2.2} />
          {info.label}
          <ChevronDown aria-hidden size={13} />
          {fresh && (
            <span className="reveal absolute -top-1.5 -right-1.5 grid size-4 place-items-center rounded-full bg-primary text-primary-foreground">
              <Check aria-hidden size={10} strokeWidth={3} />
            </span>
          )}
        </button>,
      )
    ) : (
      pill
    );

  return (
    <div>
      <div className="mb-2 flex h-8 justify-end">
        {tag !== sample.wrongTag && (
          <button
            type="button"
            onClick={reset}
            className="pressable inline-flex items-center gap-1.5 rounded-full px-3 text-xs text-muted-foreground hover:bg-muted"
          >
            <RotateCcw aria-hidden size={13} />
            Reset sample
          </button>
        )}
      </div>
      <div className="rounded-3xl bg-card ring-1 ring-border">
        <div
          className={cn(
            "group grid gap-x-4 gap-y-1.5 rounded-t-3xl px-4 py-3 sm:grid-cols-[13rem_minmax(0,1fr)_auto] sm:items-start",
            placement !== "B" && "rounded-b-3xl",
            glow === "on" && "bg-selected",
            glow === "fade" && "bg-transparent transition-colors duration-[1800ms]",
          )}
        >
          <span className="flex min-h-7 items-center">{tagCell}</span>
          <span className="grid min-w-0 gap-0.5">
            <span className="truncate text-sm font-semibold">
              {sample.company}
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {sample.sender}
              </span>
            </span>
            <span className="truncate text-sm">{sample.subject}</span>
            <span className="truncate text-xs text-muted-foreground">{sample.preview}</span>
            {feedback === "B" && previous && (
              <span className="reveal mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                <Check aria-hidden size={13} className="text-link" />
                Tag changed from {previewTags[previous].label} just now
                <button
                  type="button"
                  onClick={undo}
                  className="pressable inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium text-link hover:bg-selected"
                >
                  <Undo2 aria-hidden size={13} />
                  Undo
                </button>
              </span>
            )}
          </span>
          <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
            {sample.time} · {sample.inbox}
          </span>
        </div>
        {placement === "B" && (
          <div className="mx-3 mb-3 rounded-2xl bg-muted/45 p-4 sm:mx-4">
            <p className="m-0 text-[15px] leading-relaxed whitespace-pre-wrap">{sample.body}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
              <span aria-hidden className={cn(quiet, "bg-primary/10 text-foreground")}>
                Record rejected
              </span>
              <span aria-hidden className={quiet}>
                Just info
              </span>
              {anchored(
                <button
                  type="button"
                  aria-haspopup="dialog"
                  onClick={() => setOpen(true)}
                  className="pressable inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium text-foreground ring-1 ring-border hover:bg-muted"
                >
                  <Tag aria-hidden size={15} />
                  Edit tag
                </button>,
              )}
            </div>
          </div>
        )}
      </div>
      {snack !== null && previous && (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-40 flex justify-center px-4">
          <div
            key={snack}
            role="status"
            className="reveal pointer-events-auto flex max-w-full items-center gap-3 rounded-2xl bg-foreground py-2 pr-2 pl-4 text-sm text-background shadow-surface"
          >
            <Check aria-hidden size={16} className="shrink-0" />
            <span className="truncate">Tagged as {info.label}</span>
            <button
              type="button"
              onClick={undo}
              className="pressable shrink-0 rounded-full px-3 py-1.5 font-semibold hover:bg-background/15"
            >
              Undo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
