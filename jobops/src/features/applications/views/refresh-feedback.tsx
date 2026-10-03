"use client";

import { useActionState, useSyncExternalStore } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui";
import { useLoadingTask } from "@/components/loading/overlay";
import { refreshAllInboxes } from "@/features/mail/actions";
import type { ActionState } from "@/lib/actions";

const storageKey = "jobops:inbox-refresh";
const recentMs = 60_000;
let retained: string | null = null;
const changed = "jobops:inbox-refresh-completed";
function snapshot() {
  try {
    retained = sessionStorage.getItem(storageKey) ?? retained;
  } catch {
    /* Memory still works if storage is unavailable. */
  }
  if (!retained) return null;
  try {
    const result = JSON.parse(retained) as ActionState;
    const time = Date.parse(result.mailRefresh?.completedAt ?? "");
    const age = Date.now() - time;
    return Number.isFinite(time) && age >= 0 && age < recentMs ? retained : null;
  } catch {
    return null;
  }
}
function subscribe(listener: () => void) {
  window.addEventListener(changed, listener);
  const timer = window.setInterval(listener, 1_000);
  return () => {
    window.removeEventListener(changed, listener);
    window.clearInterval(timer);
  };
}
function retain(result: ActionState) {
  if (!result.mailRefresh) {
    retained = null;
    try {
      sessionStorage.removeItem(storageKey);
    } catch {
      /* The in-memory copy was cleared. */
    }
    window.dispatchEvent(new Event(changed));
    return;
  }
  retained = JSON.stringify(result);
  try {
    sessionStorage.setItem(storageKey, retained);
  } catch {
    /* Keep the current-page confirmation. */
  }
  window.dispatchEvent(new Event(changed));
}

export function FreshMailBanner({ count }: { count: number }) {
  const text = useSyncExternalStore(subscribe, snapshot, () => null);
  const result = text ? (JSON.parse(text) as ActionState) : null;
  return (
    <div className="min-w-0 space-y-2">
      <p role="status" className="m-0 text-selected-foreground">
        <strong className="tabular-nums">{count}</strong>{" "}
        {count === 1 ? "message needs" : "messages need"} a decision
        {result?.mailRefresh && (
          <span className="opacity-80"> · {result.mailRefresh.arrived} arrived just now</span>
        )}
      </p>
      {result?.success && (
        <p role="status" className="m-0 text-sm text-selected-foreground [overflow-wrap:anywhere]">
          {result.success}
        </p>
      )}
      {result?.error && (
        <p role="alert" className="m-0 text-sm text-destructive [overflow-wrap:anywhere]">
          {result.error}
        </p>
      )}
    </div>
  );
}

export function RefreshAllButton({ disabled }: { disabled: boolean }) {
  const [state, action, pending] = useActionState(async (previous: ActionState) => {
    const result = await refreshAllInboxes(previous);
    // Persist before React consumes the result: server revalidation can replace the view.
    retain(result);
    return result;
  }, {});
  useLoadingTask(pending, "Refreshing inboxes");
  return (
    <form action={action} aria-busy={pending} className="min-w-0 space-y-2">
      {!state.mailRefresh && state.error && (
        <p role="alert" className="m-0 text-sm text-destructive [overflow-wrap:anywhere]">
          {state.error}
        </p>
      )}
      <Button
        type="submit"
        variant="outline"
        className="h-10 bg-card"
        disabled={disabled || pending}
      >
        <RefreshCw size={15} aria-hidden className={pending ? "animate-spin" : undefined} />
        {pending ? "Refreshing inboxes…" : "Refresh all inboxes"}
      </Button>
    </form>
  );
}
