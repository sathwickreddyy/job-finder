"use client";
import { startTransition, useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { ActionState } from "@/lib/actions";
import { useLoading, useLoadingTask } from "@/components/loading/overlay";
import { isNewLocation, labelForPath } from "@/components/loading/routes";
export function ActionForm({
  action,
  children,
  className = "space-y-4",
  pendingLabel = "Saving",
  onSuccess,
  feedback = "default",
}: {
  action: (state: ActionState, data: FormData) => Promise<ActionState>;
  children: React.ReactNode;
  className?: string;
  /** Shown in the loading popup while the action runs. */
  pendingLabel?: string;
  /** Retain confirmation in a parent when a successful inline panel closes. */
  onSuccess?: (message: string) => void;
  feedback?: "default" | "inverse";
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const router = useRouter();
  const loading = useLoading();
  const handled = useRef<ActionState | null>(null);
  useLoadingTask(pending, pendingLabel);
  useEffect(() => {
    if (handled.current === state) return;
    handled.current = state;
    if (state.success) onSuccess?.(state.success);
    if (state.redirect) {
      // Keep the popup up from the save through the page it opens.
      if (isNewLocation(state.redirect, window.location))
        loading?.navigate(labelForPath(new URL(state.redirect, window.location.href).pathname));
      router.push(state.redirect);
    }
    // Server actions already revalidate their pages; another refresh can rerun this effect.
  }, [state, router, loading, onSuccess]);
  return (
    <form
      action={formAction}
      className={className}
      aria-busy={pending}
      onSubmit={(event) => {
        // Preserve entered values on validation errors instead of React's native action reset.
        event.preventDefault();
        const data = new FormData(
          event.currentTarget,
          (event.nativeEvent as SubmitEvent).submitter,
        );
        startTransition(() => formAction(data));
      }}
    >
      {state.error && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-danger-soft p-3 text-sm text-destructive"
        >
          {state.error}
        </div>
      )}
      {state.success && !onSuccess && (
        <div
          role="status"
          className={
            feedback === "inverse"
              ? "rounded-2xl bg-foreground p-3 text-sm text-background shadow-surface"
              : "rounded-lg border border-success/40 bg-success-soft p-3 text-sm text-success"
          }
        >
          {state.success}
        </div>
      )}
      <fieldset disabled={pending} className="min-w-0 space-y-4">
        {children}
      </fieldset>
      {pending && (
        <p role="status" className="text-sm text-muted-foreground">
          Saving…
        </p>
      )}
    </form>
  );
}
