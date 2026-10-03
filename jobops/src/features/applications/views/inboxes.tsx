import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { relativeTime } from "../dates";
import { FreshMailBanner, RefreshAllButton } from "./refresh-feedback";
export { RefreshAllButton } from "./refresh-feedback";
const tones = ["bg-chart-coding", "bg-chart-design", "bg-chart-people", "bg-chart-other"];
export const accountTone = (index: number) =>
  tones[((index % tones.length) + tones.length) % tones.length];
type Connection = {
  id: string;
  provider: string;
  email: string;
  lastRefreshedAt: Date | null;
  lastRefreshedCount: number | null;
  lastError: string | null;
};
type Config = { slug: string; label: string; configured: boolean; missing: string[] };
export function InboxStatus({
  connections,
  configs,
  now,
  count,
}: {
  connections: Connection[];
  configs: Config[];
  now: Date;
  count: number;
}) {
  return (
    <div className="space-y-3">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-3xl bg-selected/60 px-5 py-4">
        <FreshMailBanner count={count} />
        <RefreshAllButton disabled={!connections.length} />
      </div>
      <ul aria-label="Connected inboxes" className="m-0 list-none space-y-2 p-0 text-sm">
        {connections.map((connection, index) => (
          <li key={connection.id} className="flex min-w-0 items-start gap-2">
            <span
              aria-hidden
              className={cn("mt-1.5 size-2 shrink-0 rounded-full", accountTone(index))}
            />
            <div className="min-w-0 [overflow-wrap:anywhere]">
              <strong className="font-medium">{connection.email}</strong>{" "}
              <span className="text-muted-foreground">
                · {connection.provider === "OUTLOOK" ? "Outlook" : "Gmail"} ·{" "}
              </span>
              {connection.lastError ? (
                <>
                  <span className="text-destructive">{connection.lastError}</span>{" "}
                  {configs.find(
                    (config) =>
                      config.slug === (connection.provider === "OUTLOOK" ? "outlook" : "gmail"),
                  )?.configured ? (
                    <>
                      <a
                        href={`/api/mail/${connection.provider === "OUTLOOK" ? "outlook" : "gmail"}/connect`}
                        className="text-link"
                        aria-label={`Reconnect ${connection.email}`}
                        aria-describedby={`reconnect-${connection.id}`}
                      >
                        Reconnect
                      </a>{" "}
                    </>
                  ) : (
                    <span className="text-muted-foreground">
                      Set up {connection.provider === "OUTLOOK" ? "Outlook" : "Gmail"} below to
                      reconnect.
                    </span>
                  )}{" "}
                  <span id={`reconnect-${connection.id}`} className="text-muted-foreground">
                    Choose {connection.email} when you sign in again.
                  </span>
                </>
              ) : (
                <span className="text-muted-foreground tabular-nums">
                  {connection.lastRefreshedAt
                    ? `Refreshed ${relativeTime(connection.lastRefreshedAt, now)} · ${connection.lastRefreshedCount ?? 0} new`
                    : "Not refreshed yet"}
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
      <div className="flex min-w-0 flex-wrap items-start gap-3">
        {configs.map((config) =>
          config.configured ? (
            <Button key={config.slug} variant="ghost" size="sm" asChild>
              <a href={`/api/mail/${config.slug}/connect`}>Connect {config.label}</a>
            </Button>
          ) : (
            <div key={config.slug} className="min-w-0 flex-1 basis-60 space-y-1">
              <Button
                variant="ghost"
                size="sm"
                disabled
                aria-describedby={`${config.slug}-configuration`}
              >
                Connect {config.label}
              </Button>
              <p id={`${config.slug}-configuration`} className="m-0 text-xs text-muted-foreground">
                {config.label} isn&apos;t set up on this computer yet.
              </p>
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer">Setup details</summary>
                <p className="m-0 mt-1 [overflow-wrap:anywhere]">
                  Set {config.missing.join(", ")} in .env, then restart the app. See README › Inbox
                  setup.
                </p>
              </details>
            </div>
          ),
        )}
      </div>
    </div>
  );
}
