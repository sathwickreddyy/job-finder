import Link from "next/link";
import { Inbox } from "lucide-react";
import { FetchMail } from "@/features/mail/fetch-mail";
import { InboxesPanel } from "@/features/mail/inboxes-panel";
import type { ProviderId } from "@/services/mail/providers/types";
import { Drawer } from "@/features/timeline/drawer";
import type { MailViewData } from "@/features/timeline/mail-data";
import { cn } from "@/lib/utils";
import { mailHref, type MailQuery } from "@/features/timeline/query";
import { AttentionFeed } from "./attention-feed";
import type { MobileMail } from "./read";

export function MobileMailWorkspace({
  data,
  feed,
  query,
}: {
  data: MailViewData;
  feed: MobileMail;
  query: MailQuery;
}) {
  const filtered = query.company || query.home || query.tag || query.q || query.role;
  return (
    <div className="space-y-5 md:hidden" data-testid="mobile-mail">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="m-0 text-[28px] font-semibold tracking-tight">Mail</h1>
          <p className="m-0 mt-1 text-sm text-muted-foreground">
            {feed.openCount} {feed.openCount === 1 ? "email needs" : "emails need"} your attention
          </p>
        </div>
        <Drawer label="Inboxes" icon={<Inbox size={16} aria-hidden />} title="Inboxes">
          <InboxesPanel inboxes={data.inboxes} />
        </Drawer>
      </header>
      <FetchMail
        compact
        inboxes={data.inboxes.connections.map((row) => ({
          account: row.email,
          provider: row.provider as ProviderId,
        }))}
        lastFetched={data.lastChecked}
        companies={data.placeOptions.companies}
      />
      {data.notice && (
        <p
          role="status"
          className="m-0 rounded-2xl bg-selected p-3 text-sm text-selected-foreground [overflow-wrap:anywhere]"
        >
          {data.notice}
        </p>
      )}
      <nav aria-label="Mail view" className="flex flex-wrap gap-2">
        {[
          { all: false, label: "Needs attention" },
          { all: true, label: "All job mail" },
        ].map(({ all, label }) => (
          <Link
            key={label}
            href={mailHref({ all, tag: query.tag, q: query.q })}
            aria-current={query.all === all ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium hover:no-underline",
              query.all === all
                ? "bg-selected text-selected-foreground"
                : "text-link ring-1 ring-border",
            )}
          >
            {label}
          </Link>
        ))}
      </nav>
      {query.cursor && (
        <Link
          href={mailHref({ ...query, cursor: null, mail: null })}
          className="inline-flex min-h-11 items-center rounded-full px-3 text-sm font-medium text-link"
        >
          Back to newest
        </Link>
      )}
      {filtered && (
        <Link
          href={mailHref({ all: query.all, mail: query.mail })}
          className="inline-flex min-h-11 items-center rounded-full px-3 text-sm font-medium text-link ring-1 ring-border"
        >
          Clear filters
        </Link>
      )}
      <AttentionFeed
        data={feed}
        query={query}
        inboxes={data.inboxes.connections.map((row) => row.email)}
        placeOptions={data.placeOptions}
      />
    </div>
  );
}
