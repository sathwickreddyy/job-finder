"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { useLoadingTask } from "@/components/loading/overlay";
import { relativeTime } from "@/features/applications/dates";
import { checkMail } from "@/features/mail/workspace-actions";
import { cn } from "@/lib/utils";

/** Check mail from each account's last fetch to now, one page per inbox per call. */
export function CheckMail({
  lastChecked,
  connected,
  className,
}: {
  lastChecked: string | null;
  connected: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState("");
  useLoadingTask(pending, "Checking mail");
  function run() {
    startTransition(async () => {
      let arrived = 0;
      let result: Awaited<ReturnType<typeof checkMail>> = {};
      try {
        // An interrupted check resumes from each account's checkpoint on the next press.
        for (let call = 0; call < 20; call++) {
          result = await checkMail();
          if (result.error || !result.mailCheck) break;
          arrived += result.mailCheck.newAttention;
          setFeedback(`Checking ${result.mailCheck.accounts.length} inboxes…`);
          if (!result.mailCheck.more) break;
        }
        const failed = result.mailCheck?.accounts.filter((row) => row.status === "failed") ?? [];
        setFeedback(
          result.error ??
            [
              arrived ? `${arrived} new need you.` : "No new mail.",
              result.mailCheck?.more ? "More mail remains; check again to continue." : "",
              failed.length
                ? `Reconnect ${failed.map((row) => row.account).join(", ")} in Inboxes.`
                : "",
            ]
              .filter(Boolean)
              .join(" "),
        );
        router.refresh();
      } catch {
        setFeedback("Connection interrupted. Checked pages are safe. Check again to continue.");
      }
    });
  }
  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <button
          type="button"
          disabled={pending || !connected}
          onClick={run}
          title={connected ? undefined : "Connect an inbox first"}
          className="morph pressable group inline-flex h-10 items-center gap-2 bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-60"
        >
          <RefreshCw
            size={15}
            aria-hidden
            className={
              pending
                ? "animate-spin"
                : "transition-transform group-hover:rotate-45 motion-reduce:transition-none"
            }
          />
          {pending ? "Checking…" : "Check mail"}
        </button>
        <span className="text-xs text-muted-foreground">
          {lastChecked
            ? `Checked ${relativeTime(new Date(lastChecked), new Date())}`
            : connected
              ? "Not checked yet"
              : "No inbox connected"}
        </span>
      </div>
      {feedback && (
        <p role="status" className="m-0 mt-2 text-xs text-muted-foreground">
          {feedback}
        </p>
      )}
    </div>
  );
}
