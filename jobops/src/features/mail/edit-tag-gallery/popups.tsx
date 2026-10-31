"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRight, Check, LoaderCircle, X } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { previewTags, sample, tagGroups, tagOrder, type PreviewTag } from "./data";

export type Saving = "idle" | "saving" | "saved";
export type PopupProps = {
  open: boolean;
  current: PreviewTag;
  saving: Saving;
  onClose: () => void;
  onConfirm: (tag: PreviewTag) => void;
};

export function Pill({ tag, className }: { tag: PreviewTag; className?: string }) {
  const { label, icon: Icon, tone } = previewTags[tag];
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium",
        tone.tonal,
        className,
      )}
    >
      <Icon aria-hidden size={13} strokeWidth={2.2} />
      {label}
    </span>
  );
}

/** The confirm button says what it will do and shows the save happening. */
function ConfirmButton({
  chosen,
  current,
  saving,
  onClick,
  children,
}: {
  chosen: PreviewTag | null;
  current: PreviewTag;
  saving: Saving;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      disabled={!chosen || chosen === current}
      onClick={() => saving === "idle" && onClick()}
      aria-busy={saving !== "idle" || undefined}
      className="h-10 rounded-full px-5"
    >
      {saving === "saving" && <LoaderCircle aria-hidden size={16} className="animate-spin" />}
      {saving === "saved" && <Check aria-hidden size={16} />}
      {saving === "saving" ? "Saving…" : saving === "saved" ? "Saved" : children}
    </Button>
  );
}

/** A native modal dialog: Escape and the scrim close it, focus stays inside while open. */
function Modal({
  open,
  label,
  onClose,
  className,
  children,
}: {
  open: boolean;
  label: string;
  onClose: () => void;
  className?: string;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);
  return (
    <dialog
      ref={dialog}
      aria-label={label}
      onClose={onClose}
      onClick={(event) => event.target === dialog.current && onClose()}
      className={cn(
        "m-auto max-h-[calc(100dvh-2rem)] w-[min(34rem,calc(100vw-2rem))] max-w-none overflow-y-auto rounded-[1.75rem] bg-card p-0 text-foreground shadow-surface backdrop:bg-scrim",
        className,
      )}
    >
      {open && <div className="reveal">{children}</div>}
    </dialog>
  );
}

function DialogHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <header className="flex items-start justify-between gap-3 px-6 pt-6">
      <div className="min-w-0">
        <h2 className="m-0 text-xl font-semibold">{title}</h2>
        <p className="m-0 mt-1 truncate text-sm text-muted-foreground">
          {sample.company} · {sample.subject}
        </p>
      </div>
      <Button type="button" size="icon" variant="ghost" onClick={onClose} aria-label="Close">
        <X size={20} aria-hidden />
      </Button>
    </header>
  );
}

function FromTo({ from, to }: { from: PreviewTag; to: PreviewTag | null }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-muted/50 px-4 py-3 text-sm">
      <span className="text-muted-foreground">Now</span>
      <Pill tag={from} />
      <ArrowRight aria-hidden size={16} className="text-muted-foreground" />
      {to && to !== from ? (
        <Pill tag={to} />
      ) : (
        <span className="text-muted-foreground">pick the right tag</span>
      )}
    </div>
  );
}

/** A: a centred dialog with the tags grouped by stage and the change spelled out on top. */
export function PopupGrouped({ open, current, saving, onClose, onConfirm }: PopupProps) {
  const [chosen, setChosen] = useState<PreviewTag | null>(null);
  const close = () => {
    setChosen(null);
    onClose();
  };
  return (
    <Modal open={open} label="Edit tag" onClose={close}>
      <DialogHeader title="Edit tag" onClose={close} />
      <div className="grid gap-5 px-6 py-5">
        <FromTo from={current} to={chosen} />
        <div role="radiogroup" aria-label="Tag" className="grid gap-4">
          {tagGroups.map((group) => (
            <div key={group.label} className="grid gap-2">
              <p className="m-0 text-xs font-medium text-muted-foreground">{group.label}</p>
              <div className="flex flex-wrap gap-2">
                {group.tags.map((tag) => {
                  const info = previewTags[tag];
                  const Icon = chosen === tag ? Check : info.icon;
                  const isCurrent = tag === current;
                  return (
                    <button
                      key={tag}
                      type="button"
                      role="radio"
                      aria-checked={chosen === tag}
                      disabled={isCurrent}
                      onClick={() => setChosen(tag)}
                      className={cn(
                        "pressable inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition-shadow",
                        info.tone.tonal,
                        chosen === tag && "ring-2 ring-primary ring-offset-2 ring-offset-card",
                        isCurrent && "cursor-default opacity-55",
                      )}
                    >
                      <Icon aria-hidden size={15} strokeWidth={2.2} />
                      {info.label}
                      {isCurrent && <span className="text-xs font-normal">· now</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <p className="m-0 min-h-5 text-sm text-muted-foreground" aria-live="polite">
          {chosen && chosen !== current ? previewTags[chosen].meaning : ""}
        </p>
      </div>
      <footer className="flex justify-end gap-2 border-t border-border px-6 py-4">
        <Button type="button" variant="ghost" onClick={close} className="h-10 rounded-full px-4">
          Cancel
        </Button>
        <ConfirmButton
          chosen={chosen}
          current={current}
          saving={saving}
          onClick={() => chosen && onConfirm(chosen)}
        >
          Change tag
        </ConfirmButton>
      </footer>
    </Modal>
  );
}

/** B: a popover under the button, one row per tag with what it means; Escape or a click outside closes it. */
export function PopupList({ open, current, saving, onClose, onConfirm }: PopupProps) {
  const [chosen, setChosen] = useState<PreviewTag | null>(null);
  const close = () => {
    setChosen(null);
    onClose();
  };
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setChosen(null);
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <>
      <div aria-hidden className="fixed inset-0 z-40" onClick={close} />
      <div
        role="dialog"
        aria-label="Edit tag"
        className="reveal absolute top-full left-0 z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-3xl bg-popover text-foreground shadow-surface ring-1 ring-border"
      >
        <p className="m-0 px-4 pt-4 pb-2 text-sm font-semibold">Edit tag</p>
        <div role="radiogroup" aria-label="Tag" className="max-h-[21rem] overflow-y-auto px-2">
          {tagOrder.map((tag) => {
            const info = previewTags[tag];
            const isCurrent = tag === current;
            return (
              <button
                key={tag}
                type="button"
                role="radio"
                aria-checked={chosen === tag}
                disabled={isCurrent}
                onClick={() => setChosen(tag)}
                className={cn(
                  "grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors",
                  chosen === tag ? "bg-selected" : "hover:bg-muted",
                  isCurrent && "cursor-default",
                )}
              >
                <span className={cn("size-2.5 rounded-full", info.tone.dot)} />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{info.label}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {info.meaning}
                  </span>
                </span>
                {isCurrent ? (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                    Current
                  </span>
                ) : (
                  chosen === tag && <Check aria-hidden size={16} className="text-link" />
                )}
              </button>
            );
          })}
        </div>
        <footer className="flex items-center justify-end gap-2 border-t border-border p-3">
          <Button type="button" variant="ghost" onClick={close} className="h-10 rounded-full px-4">
            Cancel
          </Button>
          <ConfirmButton
            chosen={chosen}
            current={current}
            saving={saving}
            onClick={() => chosen && onConfirm(chosen)}
          >
            {chosen && chosen !== current ? `Change to ${previewTags[chosen].label}` : "Change tag"}
          </ConfirmButton>
        </footer>
      </div>
    </>
  );
}

/** C: two steps in one dialog: pick the tag, then confirm the change on its own screen. */
export function PopupTwoStep({ open, current, saving, onClose, onConfirm }: PopupProps) {
  const [chosen, setChosen] = useState<PreviewTag | null>(null);
  const close = () => {
    setChosen(null);
    onClose();
  };
  return (
    <Modal open={open} label="Edit tag" onClose={close}>
      {chosen === null ? (
        <>
          <DialogHeader title="Edit tag" onClose={close} />
          <p className="m-0 px-6 pt-4 text-sm text-muted-foreground">
            Pick the tag this email should have.
          </p>
          <div className="grid gap-2 px-6 py-5 sm:grid-cols-2">
            {tagOrder.map((tag) => {
              const info = previewTags[tag];
              const Icon = info.icon;
              const isCurrent = tag === current;
              return (
                <button
                  key={tag}
                  type="button"
                  disabled={isCurrent}
                  onClick={() => setChosen(tag)}
                  className={cn(
                    "pressable grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-2xl p-3 text-left ring-1 ring-border transition-colors",
                    isCurrent ? "cursor-default bg-muted/60" : "hover:bg-muted",
                  )}
                >
                  <span
                    className={cn("grid size-9 place-items-center rounded-full", info.tone.tonal)}
                  >
                    <Icon aria-hidden size={16} strokeWidth={2.2} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">
                      {info.label}
                      {isCurrent && (
                        <span className="font-normal text-muted-foreground"> · now</span>
                      )}
                    </span>
                    <span className="block text-xs text-muted-foreground">{info.meaning}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <>
          <DialogHeader title="Change this email's tag?" onClose={close} />
          <div className="grid gap-5 px-6 py-6">
            <div className="flex flex-wrap items-center justify-center gap-3 rounded-3xl bg-muted/50 px-4 py-6">
              <Pill tag={current} className="h-8 px-3.5 text-sm" />
              <ArrowRight aria-hidden size={20} className="text-muted-foreground" />
              <Pill tag={chosen} className="h-8 px-3.5 text-sm" />
            </div>
            <ul className="m-0 grid gap-2 pl-5 text-sm text-muted-foreground">
              <li>
                It moves from {previewTags[current].label} to {previewTags[chosen].label} in the
                feed, filters and counts.
              </li>
              <li>It stays where it is: same company, same application, still needs you.</li>
              <li>You can change it again later.</li>
            </ul>
          </div>
          <footer className="flex justify-between gap-2 border-t border-border px-6 py-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setChosen(null)}
              className="h-10 rounded-full px-4"
            >
              Back
            </Button>
            <ConfirmButton
              chosen={chosen}
              current={current}
              saving={saving}
              onClick={() => onConfirm(chosen)}
            >
              Yes, change tag
            </ConfirmButton>
          </footer>
        </>
      )}
    </Modal>
  );
}
