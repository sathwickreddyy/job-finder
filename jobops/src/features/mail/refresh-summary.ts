import { actionError, type ActionState } from "@/lib/actions";
import { MailRefreshError, type RefreshResult } from "./refresh-service";

/** Count committed pages, including partial results from failed inboxes. */
export function summarizeRefresh(
  results: { email: string; result: PromiseSettledResult<RefreshResult> }[],
): ActionState {
  const done = results.filter((row) => row.result.status === "fulfilled");
  const committed = results.flatMap(({ result }) =>
    result.status === "fulfilled"
      ? [result.value]
      : result.reason instanceof MailRefreshError
        ? [result.reason.result]
        : [],
  );
  const arrived = committed.reduce((sum, row) => sum + row.imported, 0);
  const failures = results.flatMap(({ email, result }) =>
    result.status === "rejected"
      ? [`${email}: ${actionError(result.reason).error ?? "Refresh failed."}`]
      : [],
  );
  const more = committed.some((row) => row.more)
    ? "More messages remain; refresh again to continue."
    : "";
  const mailRefresh = { arrived, completedAt: new Date().toISOString() };
  if (!done.length)
    return {
      error: [
        "No inbox refreshed.",
        arrived ? `${arrived} new messages saved.` : "",
        more,
        failures.join(" "),
      ]
        .filter(Boolean)
        .join(" "),
      mailRefresh,
    };
  return {
    success: [
      `Refreshed ${done.length} of ${results.length} inboxes · ${arrived} new.`,
      more,
      failures.length ? `Needs attention: ${failures.join(" ")}` : "",
    ]
      .filter(Boolean)
      .join(" "),
    mailRefresh,
  };
}
