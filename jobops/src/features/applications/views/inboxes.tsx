import { ArrowUpRight, Mail, ShieldCheck } from "lucide-react";
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
      {connections.length > 0 ? (
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-3xl bg-selected/60 px-5 py-4">
          <FreshMailBanner count={count} />
          <RefreshAllButton disabled={false} />
        </div>
      ) : (
        <div className="rounded-3xl border border-border bg-background p-5">
          <div className="mb-3 grid size-11 place-items-center rounded-2xl bg-selected text-selected-foreground">
            <Mail size={22} aria-hidden />
          </div>
          <h3 className="m-0 text-lg font-semibold">Bring your recruiting mail together</h3>
          <p className="mb-0 mt-2 text-sm text-muted-foreground">
            Connect an inbox, then refresh to find recruiter replies, interviews and new roles.
          </p>
          <p className="mb-0 mt-4 flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck size={15} aria-hidden /> Read-only access · Refresh when you choose
          </p>
        </div>
      )}
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
      <div className="space-y-3">
        <h3 className="m-0 text-sm font-semibold">
          {connections.length ? "Add an inbox" : "Choose your email provider"}
        </h3>
        {configs.map((config) => {
          const connected = connections.some(
            (connection) => connection.provider.toLowerCase() === config.slug,
          );
          return (
            <div
              key={config.slug}
              className="min-w-0 rounded-2xl border border-border bg-background p-4"
            >
              <div className="flex items-center gap-3">
                <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-secondary-foreground">
                  <Mail size={20} aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="m-0 text-sm font-semibold">{config.label}</h4>
                  <p className="m-0 mt-1 text-xs text-muted-foreground">
                    {config.slug === "gmail"
                      ? "Your Google inbox"
                      : "Personal Outlook and Hotmail accounts"}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-secondary px-2.5 py-1 text-xs text-secondary-foreground">
                  {config.configured ? "Ready" : "Setup needed"}
                </span>
              </div>
              {config.configured ? (
                <Button className="mt-4 w-full" asChild>
                  <a href={`/api/mail/${config.slug}/connect`}>
                    {connected ? `Add another ${config.label} account` : `Connect ${config.label}`}
                    <ArrowUpRight size={16} aria-hidden />
                  </a>
                </Button>
              ) : (
                <div className="mt-3 border-t border-border pt-3">
                  <p className="m-0 text-xs text-muted-foreground">
                    Finish the one-time provider setup to connect this inbox.
                  </p>
                  <details className="mt-2 text-xs text-muted-foreground">
                    <summary className="cursor-pointer rounded-lg py-2 font-medium text-link focus-visible:outline-2 focus-visible:outline-primary">
                      View setup instructions
                    </summary>
                    <p className="m-0 mt-1 [overflow-wrap:anywhere]">
                      Set {config.missing.join(", ")} in .env, then restart the app. See README ›
                      Inbox setup.
                    </p>
                  </details>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
