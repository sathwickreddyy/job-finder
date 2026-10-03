"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Inbox, Mail, X } from "lucide-react";
import { Button } from "@/components/ui";
import { focusAfterClose } from "./outcome-chips";

export function EmailsDrawer({
  count,
  connected,
  children,
}: {
  count: number;
  connected: boolean;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const restoreOnClose = useRef(true);
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const search = params.toString();
  const wanted = params.get("emails") === "1" || params.get("tab") === "emails";
  // The URL decides: ?emails=1 opens the drawer and any navigation away from it, such as
  // "Link and update" continuing into a lane, closes it.
  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (wanted && !node.open) node.showModal();
    else if (!wanted && node.open) {
      // Continuing into a lane should leave focus available for that lane.
      restoreOnClose.current = false;
      node.close();
    }
  }, [wanted, search]);
  function onClose() {
    if (restoreOnClose.current) focusAfterClose(trigger.current);
    restoreOnClose.current = true;
    if (!["emails", "tab", "notice"].some((key) => params.has(key))) return;
    const next = new URLSearchParams(params);
    for (const key of ["emails", "tab", "notice"]) next.delete(key);
    router.replace(next.size ? `${pathname}?${next}` : pathname, { scroll: false });
  }
  return (
    <>
      <Button
        ref={trigger}
        variant="outline"
        aria-haspopup="dialog"
        onClick={() => {
          const next = new URLSearchParams(params);
          next.delete("tab");
          next.set("emails", "1");
          router.push(`${pathname}?${next}`, { scroll: false });
        }}
      >
        {connected ? <Mail size={16} aria-hidden /> : <Inbox size={16} aria-hidden />}
        {connected ? "Emails" : "Connect inboxes"}
        {count > 0 && (
          <>
            <span
              aria-hidden
              className="grid min-w-5 place-items-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground"
            >
              {count}
            </span>
            <span className="sr-only">, {count} need a decision</span>
          </>
        )}
      </Button>
      <dialog
        ref={dialog}
        onClose={onClose}
        onClick={(event) => {
          if (event.target === dialog.current) dialog.current?.close();
        }}
        aria-label="Emails"
        className="mt-0 mr-0 ml-auto h-dvh max-h-none w-[min(30rem,100vw)] max-w-none overflow-y-auto border-l border-border bg-card p-0 text-foreground shadow-surface backdrop:bg-scrim"
      >
        {/* Fills the panel so clicks on its empty space never count as backdrop clicks. */}
        <div className="min-h-full">
          <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-card px-5 py-4">
            <h2 className="m-0 text-lg font-semibold">Emails</h2>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="Close emails"
              onClick={() => dialog.current?.close()}
            >
              <X size={18} aria-hidden />
            </Button>
          </header>
          <div className="p-5">{children}</div>
        </div>
      </dialog>
    </>
  );
}
