import { useEffect, useRef } from "react";
import { cn } from "./utils";

export function Dialog({
  open,
  onClose,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  const contentRef = useRef<HTMLDivElement | null>(null);

  // ESC closes, Tab cycles focus inside the modal (simple forward-only
  // trap — enough for the short forms this dialog wraps).
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "Tab" && contentRef.current) {
        const focusable = contentRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (e.shiftKey && active === first) {
          last.focus();
          e.preventDefault();
        } else if (!e.shiftKey && active === last) {
          first.focus();
          e.preventDefault();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    // Move focus into the modal on open so keyboard users are inside the
    // trap boundary.
    contentRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={contentRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={cn(
          "rounded-[2rem] border border-border-strong bg-[rgba(10,15,28,0.96)] shadow-2xl shadow-black/30 backdrop-blur-xl",
          "max-h-[85vh] w-full max-w-2xl overflow-auto p-5",
          "focus:outline-none",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}
