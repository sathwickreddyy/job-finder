"use client";

import { useEffect, useId, useRef, useState, useTransition, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { formatDayTime } from "@/features/applications/dates";
import { EditTag } from "@/features/timeline/edit-tag";
import { SourceChip } from "@/features/timeline/source-chip";
import { cn } from "@/lib/utils";
import type { MailItem } from "./mail-item";
import { readMailForDialog } from "./read-actions";
import { TagPill } from "./tag-pill";

const url = /https?:\/\/[^\s<>"'`]+/g;
const trailing = /[.,;:!?'"’”)\]}>]+$/;

/** Plain text with http(s) links made clickable; trailing punctuation stays outside the link. */
export function linkify(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(url)) {
    let href = match[0];
    // Keep a closing bracket that belongs to the URL, such as a Wikipedia path.
    const cut = href.match(trailing)?.[0] ?? "";
    href = href.slice(0, href.length - cut.length);
    if (cut.startsWith(")") && href.includes("(")) href += ")";
    const start = match.index;
    if (start > last) parts.push(text.slice(last, start));
    parts.push(
      <a
        key={`${start}-${href}`}
        href={href}
        target="_blank"
        rel="noreferrer"
        className="break-all text-link"
      >
        {href}
      </a>,
    );
    last = start + href.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

const inboxOf = (item: MailItem) =>
  item.account.split("@")[1] ?? (item.provider === "OUTLOOK" ? "Outlook" : "Gmail");

function Header({
  item,
  titleId,
  onClose,
  onPrev,
  onNext,
  position,
  inbox,
}: {
  item: MailItem;
  titleId: string;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  position?: string;
  inbox?: string;
}) {
  const icon =
    "grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent";
  return (
    <header className="flex shrink-0 flex-col gap-3 border-b border-border px-5 pt-4 pb-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-1">
        <span className="flex min-w-0 flex-1 items-center gap-1">
          <TagPill tag={item.tag} />
          <EditTag item={item} />
        </span>
        {(onPrev || onNext) && (
          <>
            {position && (
              <span className="mr-1 text-xs text-muted-foreground tabular-nums">{position}</span>
            )}
            <button
              type="button"
              aria-label="Previous email"
              disabled={!onPrev}
              onClick={onPrev}
              className={icon}
            >
              <ChevronLeft aria-hidden size={18} />
            </button>
            <button
              type="button"
              aria-label="Next email"
              disabled={!onNext}
              onClick={onNext}
              className={icon}
            >
              <ChevronRight aria-hidden size={18} />
            </button>
          </>
        )}
        <button type="button" aria-label="Close" onClick={onClose} className={icon}>
          <X aria-hidden size={18} />
        </button>
      </div>
      <h2 id={titleId} className="m-0 text-lg leading-snug font-semibold [overflow-wrap:anywhere]">
        {item.subject || "(no subject)"}
      </h2>
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="min-w-0 truncate font-medium" title={item.senderName || item.sender}>
          {item.senderName || item.sender}
        </span>
        {item.senderName && (
          <span className="min-w-0 truncate text-muted-foreground" title={item.sender}>
            {item.sender}
          </span>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-1 text-xs text-muted-foreground tabular-nums">
          <SourceChip
            account={item.account}
            label={inbox ?? inboxOf(item)}
            folders={item.folders}
          />
          {formatDayTime(new Date(item.receivedAt))}
        </span>
      </div>
    </header>
  );
}

/** One email, focused: who sent it, the full text, and the handling actions for it. */
export function MailDialog({
  item,
  onClose,
  onPrev,
  onNext,
  position,
  inbox,
  footer,
  returnFocus,
}: {
  item: MailItem;
  onClose: () => void;
  returnFocus?: () => HTMLElement | null;
  onPrev?: () => void;
  onNext?: () => void;
  /** "3 of 12" when stepping through a list. */
  position?: string;
  inbox?: string;
  footer: ReactNode;
}) {
  const titleId = useId();
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    body.current?.scrollTo({ top: 0 });
  }, [item.id]);
  return (
    <Modal open onClose={onClose} labelledBy={titleId} returnFocus={returnFocus}>
      <Header
        item={item}
        titleId={titleId}
        onClose={onClose}
        onPrev={onPrev}
        onNext={onNext}
        position={position}
        inbox={inbox}
      />
      <div
        ref={body}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6"
      >
        <p className="m-0 max-w-prose text-[15px] leading-relaxed break-words whitespace-pre-wrap">
          {item.text ? (
            linkify(item.text)
          ) : (
            <span className="text-muted-foreground">This email has no text.</span>
          )}
        </p>
      </div>
      {footer && (
        <footer className="shrink-0 border-t border-border bg-muted/30 px-5 py-3 sm:px-6">
          {footer}
        </footer>
      )}
    </Modal>
  );
}

function Skeleton({ onClose, error }: { onClose: () => void; error?: string }) {
  return (
    <Modal open onClose={onClose} label={error ? "Email could not be loaded" : "Loading email"}>
      <div className="flex justify-end px-5 pt-4">
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-muted"
        >
          <X aria-hidden size={18} />
        </button>
      </div>
      {error ? (
        <p role="alert" className="m-0 px-6 pt-2 pb-8 text-sm">
          {error}
        </p>
      ) : (
        <div aria-hidden className="grid gap-3 px-6 pt-2 pb-8">
          {["w-24", "w-3/4", "w-1/2", "w-full", "w-full", "w-5/6"].map((width, index) => (
            <span
              key={index}
              className={cn(
                "h-4 animate-pulse rounded-full bg-muted motion-reduce:animate-none",
                width,
              )}
            />
          ))}
        </div>
      )}
    </Modal>
  );
}

/** A button that loads one email and opens it in the reading popup. */
export function MailDialogButton({
  mailId,
  children,
  className,
  footer,
}: {
  mailId: string;
  children: ReactNode;
  className?: string;
  footer?: (item: MailItem) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [item, setItem] = useState<MailItem | null>(null);
  const [error, setError] = useState<string>();
  const [, start] = useTransition();
  const close = () => setOpen(false);
  const load = () => {
    setOpen(true);
    setError(undefined);
    start(async () => {
      try {
        setItem(await readMailForDialog(mailId));
      } catch {
        setError("This email could not be loaded. It may have been removed.");
      }
    });
  };
  return (
    <>
      <button type="button" aria-haspopup="dialog" onClick={load} className={className}>
        {children}
      </button>
      {open &&
        (item && item.id === mailId ? (
          <MailDialog item={item} onClose={close} footer={footer?.(item) ?? null} />
        ) : (
          <Skeleton onClose={close} error={error} />
        ))}
    </>
  );
}
