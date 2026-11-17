"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, DoorOpen, MoreHorizontal, Settings2, X } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { PreviousJobForm } from "../previous-job-form";

const item =
  "flex min-h-10 w-full items-center gap-2.5 px-3 text-left text-sm hover:bg-muted hover:no-underline";

/** The header's quiet actions: the careers site, a previous job, and the mail search settings. */
export function HeaderMenu({
  careersUrl,
  company,
}: {
  careersUrl?: string | null;
  company: { key: string; name: string };
}) {
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button
        ref={trigger}
        type="button"
        aria-label="More company actions"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
        className="grid size-10 place-items-center rounded-full border border-input text-muted-foreground hover:bg-muted"
      >
        <MoreHorizontal aria-hidden size={18} />
      </button>
      {open && (
        <div
          id={menuId}
          className="absolute right-0 top-full z-20 mt-2 w-56 overflow-hidden rounded-xl border border-border bg-card py-1 shadow-surface"
        >
          {careersUrl && (
            <a
              href={careersUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              className={item}
            >
              <ArrowUpRight aria-hidden size={16} className="text-muted-foreground" />
              Open careers site
            </a>
          )}
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setDialog(true);
            }}
            className={item}
          >
            <DoorOpen aria-hidden size={16} className="text-muted-foreground" />
            Add previous job
          </button>
          <Link
            href="?tab=applications#mail-search"
            onClick={() => setOpen(false)}
            className={item}
          >
            <Settings2 aria-hidden size={16} className="text-muted-foreground" />
            Mail search settings
          </Link>
        </div>
      )}
      {dialog && (
        <Modal
          open
          onClose={() => setDialog(false)}
          labelledBy={titleId}
          returnFocus={() => trigger.current}
        >
          <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-3 sm:px-6">
            <h2 id={titleId} className="m-0 min-w-0 truncate text-base font-semibold">
              Add previous job
            </h2>
            <button
              type="button"
              aria-label="Close"
              onClick={() => setDialog(false)}
              className="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted"
            >
              <X aria-hidden size={18} />
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
            <PreviousJobForm company={company} onSaved={() => setDialog(false)} />
          </div>
        </Modal>
      )}
    </div>
  );
}
