import Link from "next/link";
import { Inbox } from "lucide-react";
import { FetchMail } from "@/features/mail/fetch-mail";
import { InboxesPanel } from "@/features/mail/inboxes-panel";
import type { ProviderId } from "@/services/mail/providers/types";
import { Drawer } from "@/features/timeline/drawer";
import type { MailViewData } from "@/features/timeline/mail-data";
import { mailHref } from "@/features/timeline/query";
import { AttentionFeed } from "./attention-feed";
import type { AttentionMail } from "./read";

export function MobileMailWorkspace({
  data,
  attention,
}: {
  data: MailViewData;
  attention: AttentionMail;
}) {
  const filtered =
    data.query.company ||
    data.query.home ||
    data.query.tag ||
    data.query.q ||
    data.query.cursor ||
    data.query.role;
  return (
    <div className="space-y-5 md:hidden" data-testid="mobile-mail">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="m-0 text-[28px] font-semibold tracking-tight">Mail</h1>
          <p className="m-0 mt-1 text-sm text-muted-foreground">
            {attention.openCount} {attention.openCount === 1 ? "email needs" : "emails need"} your
            attention
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
      {filtered && (
        <Link
          href={mailHref({ mail: data.query.mail })}
          className="inline-flex min-h-11 items-center rounded-full px-3 text-sm font-medium text-link ring-1 ring-border"
        >
          Show all attention mail
        </Link>
      )}
      <AttentionFeed
        data={attention}
        query={data.query}
        inboxes={data.inboxes.connections.map((row) => row.email)}
        placeOptions={data.placeOptions}
      />
    </div>
  );
}
