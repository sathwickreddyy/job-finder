"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, LoaderCircle, Pencil, X } from "lucide-react";
import { useSnackbar } from "@/components/snackbar";
import { Button } from "@/components/ui";
import type { MailItem } from "@/features/mail/mail-item";
import { TagPill, tagClass, tagIcon } from "@/features/mail/tag-pill";
import { tagLabel, tagMeaning, tagsByStage, type MailTag } from "@/features/mail/tags";
import { restoreMailKind, retagMail } from "@/features/mail/workspace-actions";
import { cn } from "@/lib/utils";

/** Step 1: every tag in the order of the search, with what it means; the current one is shown. */
export function TagChoices({
  current,
  onPick,
}: {
  current: MailTag;
  onPick: (tag: MailTag) => void;
}) {
  return (
    <div className="grid gap-2 px-6 py-5 sm:grid-cols-2">
      {tagsByStage.map((tag) => {
        const Icon = tagIcon[tag];
        const isCurrent = tag === current;
        return (
          <button
            key={tag}
            type="button"
            disabled={isCurrent}
            onClick={() => onPick(tag)}
            className={cn(
              "pressable grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-2xl p-3 text-left ring-1 ring-border transition-colors",
              isCurrent ? "cursor-default bg-muted/60" : "hover:bg-muted",
            )}
          >
            <span
              className={cn("grid size-9 place-items-center rounded-full", tagClass[tag].tonal)}
            >
              <Icon aria-hidden size={16} strokeWidth={2.2} />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium">
                <span>{tagLabel[tag]}</span>
                {isCurrent && <span className="font-normal text-muted-foreground"> · now</span>}
              </span>
              <span className="block text-xs text-muted-foreground">{tagMeaning[tag]}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** The step's title over the email it is about; the dialog's close button sits beside it. */
function Header({ title, item }: { title: string; item: MailItem }) {
  return (
    <header className="min-w-0 px-6 pt-6 pr-16">
      <h2 className="m-0 text-xl font-semibold">{title}</h2>
      <p className="m-0 mt-1 truncate text-sm text-muted-foreground">
        {item.company?.name ?? "Needs a home"} · {item.subject}
      </p>
    </header>
  );
}

/** What the mail rule does to the company's one live application when an email gets this tag. */
const ruleEffect: Partial<Record<MailTag, string>> = {
  application: "that application is marked acknowledged",
  applicationRejected: "that application is marked rejected",
  interviewRejected: "that application is marked rejected",
  offer: "an offer is recorded on that application",
};

/** Step 2: what will and won't change, then the one button that changes it. */
export function ConfirmChange({
  item,
  next,
  saving,
  error,
  onBack,
  onConfirm,
}: {
  item: MailItem;
  next: MailTag;
  saving: boolean;
  error?: string;
  onBack: () => void;
  onConfirm: () => void;
}) {
  // A retag first undoes an outcome the rule recorded from this email, then the rule reads the
  // new tag. It never overrides the user's own decisions, so a handled or linked email keeps them.
  const undoesFirst = !!item.autoOutcome?.undoable && !item.autoOutcome.undone;
  const untouched = item.attention === "open" && !item.application && !item.outcome;
  const rule = item.company && (undoesFirst || untouched) ? ruleEffect[next] : undefined;
  return (
    <>
      <Header title="Change this email's tag?" item={item} />
      <div className="grid gap-5 px-6 py-6">
        <div className="flex flex-wrap items-center justify-center gap-3 rounded-3xl bg-muted/50 px-4 py-6">
          <TagPill tag={item.tag} className="h-8 px-3.5 text-sm" />
          <ArrowRight aria-hidden size={20} className="text-muted-foreground" />
          <TagPill tag={next} className="h-8 px-3.5 text-sm" />
        </div>
        <ul className="m-0 grid gap-2 pl-5 text-sm text-muted-foreground">
          <li>
            It moves from {tagLabel[item.tag]} to {tagLabel[next]} in the feed, filters and counts.
          </li>
          {undoesFirst && <li>The outcome it recorded on your application is undone first.</li>}
          {rule ? (
            <li>
              If it&apos;s about your one live application at {item.company?.name}, {rule} and this
              email is handled. Undo puts it back.
            </li>
          ) : (
            !undoesFirst && (
              <li>
                It stays where it is: same company, same application,{" "}
                {item.attention === "handled" ? "stays handled" : "still needs you"}.
              </li>
            )
          )}
          <li>You can change it again later.</li>
        </ul>
      </div>
      <footer className="grid gap-2 border-t border-border px-6 py-4">
        <div className="flex justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={onBack}
            disabled={saving}
            className="h-10 rounded-full px-4"
          >
            Back
          </Button>
          <Button
            type="button"
            onClick={() => !saving && onConfirm()}
            aria-busy={saving || undefined}
            className="h-10 rounded-full px-5"
          >
            {saving && <LoaderCircle aria-hidden size={16} className="animate-spin" />}
            {saving ? "Saving…" : "Yes, change tag"}
          </Button>
        </div>
        {error && (
          <p role="alert" className="m-0 text-sm text-destructive">
            {error}
          </p>
        )}
      </footer>
    </>
  );
}

/** The pencil beside a row's tag and the two-step dialog it opens. Nothing changes until Yes. */
export function EditTag({ item, className }: { item: MailItem; className?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [next, setNext] = useState<MailTag | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const { show } = useSnackbar();
  // The dialog is only on the page while open, so a long feed carries no hidden dialogs.
  useEffect(() => {
    if (open) dialog.current?.showModal();
  }, [open]);
  /** close() gives focus back to the pencil; the close event then takes the dialog off the page. */
  function close() {
    if (!saving) dialog.current?.close();
  }
  function closed() {
    setOpen(false);
    setNext(null);
    setError(undefined);
  }
  async function confirm() {
    if (!next || saving) return;
    setSaving(true);
    setError(undefined);
    const state = await retagMail(item.id, next);
    setSaving(false);
    if (state.error || !state.previous) {
      setError(state.error ?? "The tag could not be changed. Try again.");
      return;
    }
    const previous = state.previous;
    dialog.current?.close();
    show({
      message: state.success ?? `Tagged as ${tagLabel[next]}`,
      action: {
        label: "Undo",
        onClick: async () => {
          // Undo can also change the application, so the result is always said.
          const undone = await restoreMailKind(item.id, previous);
          show({ message: undone.error ?? undone.success ?? "Tag restored." });
        },
      },
    });
  }
  return (
    <>
      <button
        type="button"
        aria-label="Edit tag"
        aria-haspopup="dialog"
        onClick={() => {
          setError(undefined);
          setOpen(true);
        }}
        className={cn(
          "pressable grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground transition-[opacity,background-color] hover:bg-muted hover:text-foreground",
          className,
        )}
      >
        <Pencil aria-hidden size={14} />
      </button>
      {open && (
        <dialog
          ref={dialog}
          aria-label={next ? "Change this email's tag?" : "Edit tag"}
          onCancel={(event) => {
            event.preventDefault();
            close();
          }}
          onClose={closed}
          onClick={(event) => event.target === dialog.current && close()}
          className="m-auto max-h-[calc(100dvh-2rem)] w-[min(34rem,calc(100vw-2rem))] max-w-none overflow-y-auto rounded-[1.75rem] bg-card p-0 text-foreground shadow-surface backdrop:bg-scrim"
        >
          <div className="reveal relative">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={close}
              aria-label="Close"
              className="absolute top-5 right-5"
            >
              <X size={20} aria-hidden />
            </Button>
            {next === null ? (
              <>
                <Header title="Edit tag" item={item} />
                <p className="m-0 px-6 pt-4 text-sm text-muted-foreground">
                  Pick the tag this email should have.
                </p>
                <TagChoices current={item.tag} onPick={setNext} />
              </>
            ) : (
              <ConfirmChange
                item={item}
                next={next}
                saving={saving}
                error={error}
                onBack={() => {
                  setNext(null);
                  setError(undefined);
                }}
                onConfirm={confirm}
              />
            )}
          </div>
        </dialog>
      )}
    </>
  );
}
