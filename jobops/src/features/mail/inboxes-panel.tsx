import { Button } from "@/components/ui";
import { formatDayTime } from "@/features/applications/dates";
import type { Inboxes } from "./inboxes";

/** Accounts, their last check, reconnect links and the folders each check covered. */
export function InboxesPanel({ inboxes }: { inboxes: Inboxes }) {
  return (
    <div className="min-w-0 space-y-5">
      <p className="m-0 text-xs text-muted-foreground">
        Read-only access. Spam and trash are included in provider searches. Sent mail and drafts are
        excluded from new updates.
      </p>
      {inboxes.connections.length ? (
        <ul className="m-0 list-none p-0">
          {inboxes.connections.map((connection) => {
            const coverage = inboxes.coverage.find((item) => item.account === connection.email);
            return (
              <li key={connection.id} className="border-t border-border py-4">
                <p className="m-0 text-sm font-medium [overflow-wrap:anywhere]">
                  {connection.email}
                </p>
                <p className="m-0 mt-1 text-xs text-muted-foreground">
                  {connection.provider === "OUTLOOK" ? "Outlook" : "Gmail"},{" "}
                  {connection.lastChecked
                    ? `last checked ${formatDayTime(new Date(connection.lastChecked))}`
                    : "not checked yet"}
                </p>
                {connection.lastError && (
                  <p className="m-0 mt-2 text-xs text-destructive [overflow-wrap:anywhere]">
                    {connection.lastError}{" "}
                    <a
                      className="text-link"
                      href={`/api/mail/${connection.provider === "GMAIL" ? "gmail" : "outlook"}/connect`}
                    >
                      Reconnect if access expired
                    </a>
                  </p>
                )}
                <details className="mt-3 text-xs">
                  <summary className="cursor-pointer text-link">Folders checked</summary>
                  {coverage?.checkedAt ? (
                    <ul className="mt-3 space-y-1 pl-4 text-muted-foreground">
                      {coverage.folders.map((folder) => (
                        <li key={folder.id}>
                          {folder.name}
                          {folder.contextOnly ? " (context only)" : ""}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-muted-foreground">Use Fetch new mail to discover folders.</p>
                  )}
                </details>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="m-0 text-sm">No inbox connected yet.</p>
      )}
      <div className="flex flex-wrap gap-2">
        {inboxes.configs.map((config) =>
          config.configured ? (
            <Button key={config.slug} size="sm" variant="outline" asChild>
              <a href={`/api/mail/${config.slug}/connect`}>Connect {config.label}</a>
            </Button>
          ) : (
            <p key={config.slug} className="m-0 text-xs text-muted-foreground">
              {config.label} setup needed: {config.missing.join(", ")}
            </p>
          ),
        )}
      </div>
      <p className="m-0 text-xs leading-6 text-muted-foreground">
        Fetch new mail reads from each account&apos;s last fetch to now, or the last 1 to 180 days.
        Older mail is found by searching a company from its page. Permanently deleted mail and
        separate online archive mailboxes cannot be recovered here.
      </p>
    </div>
  );
}
