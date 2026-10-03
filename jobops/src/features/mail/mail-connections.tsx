"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useSyncExternalStore } from "react";
import { Button } from "@/components/ui";
import { useLoading, useLoadingTask } from "@/components/loading/overlay";
import { HIDDEN } from "@/components/loading/controller";
import type { ActionState } from "@/lib/actions";
import { disconnectInbox } from "./actions";

type Connection = { id: string; email: string; provider: string; lastRefreshedLabel: string };
const noSubscription = () => () => {};
const hidden = () => HIDDEN;

/** The form and live confirmation outlive every account row removed by revalidation. */
export function MailConnections({ connections }: { connections: Connection[] }) {
  const connect = useRef<HTMLAnchorElement>(null);
  const submitted = useRef<string | null>(null);
  const [state, action, pending] = useActionState(async (previous: ActionState, form: FormData) => {
    submitted.current = String(form.get("connectionId") ?? "");
    return disconnectInbox(previous, form);
  }, {});
  const loading = useLoading();
  const snapshot = useSyncExternalStore(
    loading?.subscribe ?? noSubscription,
    loading?.getSnapshot ?? hidden,
    hidden,
  );
  useLoadingTask(pending, "Disconnecting inbox");
  useEffect(() => {
    if (
      !state.success ||
      pending ||
      snapshot.visible ||
      !submitted.current ||
      connections.some((connection) => connection.id === submitted.current)
    )
      return;
    // Wait for both the removed-row render and the app-wide inert overlay to clear.
    connect.current?.focus();
    submitted.current = null;
  }, [connections, pending, snapshot.visible, state]);
  return (
    <div className="min-w-0 space-y-4">
      {state.success && (
        <p
          role="status"
          className="m-0 rounded-2xl bg-foreground p-3 text-sm text-background [overflow-wrap:anywhere]"
        >
          {state.success}
        </p>
      )}
      {state.error && (
        <p
          role="alert"
          className="m-0 rounded-2xl bg-danger-soft p-3 text-sm text-destructive [overflow-wrap:anywhere]"
        >
          {state.error}
        </p>
      )}
      <form action={action} aria-busy={pending}>
        <fieldset disabled={pending} className="min-w-0">
          {connections.length ? (
            <ul className="m-0 list-none space-y-3 p-0">
              {connections.map((connection) => (
                <li
                  key={connection.id}
                  className="flex min-w-0 flex-wrap items-center justify-between gap-3"
                >
                  <span className="min-w-0 [overflow-wrap:anywhere]">
                    <strong>{connection.email}</strong>{" "}
                    <span className="muted">
                      · {connection.provider === "OUTLOOK" ? "Outlook" : "Gmail"} · last refreshed{" "}
                      {connection.lastRefreshedLabel}
                    </span>
                  </span>
                  <Button
                    type="submit"
                    name="connectionId"
                    value={connection.id}
                    variant="destructive"
                    size="sm"
                    aria-label={`Disconnect ${connection.email}`}
                  >
                    Disconnect
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-0">No inbox connected.</p>
          )}
        </fieldset>
      </form>
      {pending && (
        <p role="status" className="m-0 text-sm text-muted-foreground">
          Disconnecting inbox…
        </p>
      )}
      <div className="actions">
        <Link ref={connect} href="/applications?emails=1" className="button-secondary">
          Connect or refresh inboxes
        </Link>
      </div>
    </div>
  );
}
