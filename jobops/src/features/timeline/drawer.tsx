"use client";

import { useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";

/** A side drawer like the resume upload drawer; its content mounts only while open. */
export function Drawer({
  label,
  icon,
  title,
  description,
  className,
  children,
}: {
  label: string;
  icon?: ReactNode;
  title: string;
  description?: string;
  className?: string;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const close = () => {
    dialog.current?.close();
    setOpen(false);
  };
  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => {
          dialog.current?.showModal();
          setOpen(true);
        }}
        className={cn(
          "pressable inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-foreground ring-1 ring-border hover:bg-muted",
          className,
        )}
      >
        {icon}
        {label}
      </button>
      <dialog
        ref={dialog}
        onClose={() => setOpen(false)}
        aria-label={title}
        className="mt-0 mr-0 ml-auto h-dvh max-h-none w-[min(32rem,100vw)] max-w-none overflow-y-auto border-l border-border bg-card p-0 text-foreground shadow-surface backdrop:bg-scrim"
      >
        <header className="flex items-start justify-between gap-3 border-b border-border p-6">
          <div className="min-w-0">
            <h2 className="m-0 text-xl font-semibold break-words">{title}</h2>
            {description && <p className="m-0 mt-2 text-xs text-muted-foreground">{description}</p>}
          </div>
          <Button type="button" size="icon" variant="ghost" onClick={close} aria-label="Close">
            <X size={20} aria-hidden />
          </Button>
        </header>
        <div className="p-6">{open && children}</div>
      </dialog>
    </>
  );
}
