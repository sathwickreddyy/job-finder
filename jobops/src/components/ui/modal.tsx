"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A modal over the native `<dialog>`: Esc and a click on the scrim close it, the page behind
 * does not scroll, and focus returns to whatever was focused before it opened. Below 640px it
 * fills the screen. Inner scroll areas may use `overscroll-contain` here, and only here.
 */
export function Modal({
  open,
  onClose,
  labelledBy,
  label,
  size = "md",
  className,
  returnFocus,
  children,
}: {
  open: boolean;
  onClose: () => void;
  /** Id of the heading that names the dialog; or pass `label`. */
  labelledBy?: string;
  label?: string;
  size?: "md" | "lg";
  className?: string;
  /** Where focus goes on close when it should not go back to what opened it, such as a row. */
  returnFocus?: () => HTMLElement | null;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const close = useRef(onClose);
  const focusTarget = useRef(returnFocus);
  useEffect(() => {
    close.current = onClose;
    focusTarget.current = returnFocus;
  }, [onClose, returnFocus]);

  useEffect(() => {
    const element = dialog.current;
    if (!open || !element) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = "hidden";
    if (!element.open) element.showModal();
    return () => {
      root.style.overflow = overflow;
      if (element.open) element.close();
      const target = focusTarget.current?.() ?? previous;
      target?.focus({ preventScroll: true });
    };
  }, [open]);

  return (
    <dialog
      ref={dialog}
      aria-labelledby={labelledBy}
      aria-label={labelledBy ? undefined : label}
      onCancel={(event) => {
        event.preventDefault();
        close.current();
      }}
      onClick={(event) => {
        if (event.target === dialog.current) close.current();
      }}
      className={cn(
        "m-auto flex max-h-[calc(100dvh-2rem)] max-w-none flex-col overflow-hidden rounded-[1.75rem] bg-card p-0 text-foreground shadow-surface backdrop:bg-scrim backdrop:backdrop-blur-sm",
        "max-sm:h-dvh max-sm:max-h-none max-sm:w-screen max-sm:rounded-none",
        "[&:not([open])]:hidden",
        size === "md" ? "w-[min(44rem,calc(100vw-2rem))]" : "w-[min(60rem,calc(100vw-2rem))]",
        className,
      )}
    >
      {children}
    </dialog>
  );
}
