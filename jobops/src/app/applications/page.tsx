import Link from "next/link";
import { Button, PageHeader } from "@/components/ui";
import { matchesFilter, queueKeyPattern, resolveView } from "@/features/applications/navigation";
import { buildQueue } from "@/features/applications/queue";
import { readApplications } from "@/features/applications/read";
import { NextView, SnoozeToast } from "@/features/applications/views/next";
import { RecordsView } from "@/features/applications/views/records";
import { ApplicationsTabs } from "@/features/applications/views/tabs";
import { readMailTriage } from "@/features/mail/read";
import { queueMailFrom } from "@/features/mail/triage";
import { EmailsView } from "@/features/applications/views/emails";
import { InboxStatus } from "@/features/applications/views/inboxes";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { mailConnections } from "@/db/schema";
import { providers } from "@/services/mail/providers";

export const dynamic = "force-dynamic";

export default async function Applications({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    filter?: string;
    view?: string;
    q?: string;
    snoozed?: string;
    title?: string;
    notice?: string;
  }>;
}) {
  const params = await searchParams;
  const view = resolveView(params);
  const now = new Date();
  const { records, snoozes } = await readApplications();
  const triage = await readMailTriage(records);
  // Public projection only: encrypted tokens and OAuth secrets never reach client props.
  const connections = await db
    .select({
      id: mailConnections.id,
      provider: mailConnections.provider,
      email: mailConnections.email,
      lastRefreshedAt: mailConnections.lastRefreshedAt,
      lastRefreshedCount: mailConnections.lastRefreshedCount,
      lastError: mailConnections.lastError,
    })
    .from(mailConnections)
    .orderBy(asc(mailConnections.createdAt), asc(mailConnections.id));
  const configs = providers.map((provider) => {
    const { configured, missing } = provider.configuration();
    return { slug: provider.slug, label: provider.label, configured, missing };
  });
  const items = buildQueue({ records, mail: queueMailFrom(triage.messages), snoozes, now });
  return (
    <div className="space-y-6">
      <PageHeader
        title="Applications"
        description="What needs you next, where each record stands, and recruiting mail."
        actions={
          <Button asChild>
            <Link href="/applications/new">Record an application</Link>
          </Button>
        }
      />
      <ApplicationsTabs
        active={view.tab}
        counts={{
          next: items.filter((item) => item.due !== "week").length,
          records: records.filter((record) => matchesFilter(record, "active", "", now)).length,
          emails: triage.messages.length,
        }}
      />
      {view.tab === "next" && <NextView items={items} now={now} />}
      {view.tab === "records" && (
        <RecordsView records={records} filter={view.filter} q={view.q} now={now} />
      )}
      {view.tab === "emails" && (
        <EmailsView
          data={triage}
          records={records.map((record) => ({
            id: record.id,
            label: `${record.company} — ${record.role}`,
          }))}
          refresh={
            <InboxStatus
              connections={connections}
              configs={configs}
              now={now}
              count={triage.messages.length}
            />
          }
          accountIndex={Object.fromEntries(
            connections.map((connection, index) => [connection.email, index]),
          )}
          notice={params.notice?.slice(0, 300)}
        />
      )}
      <SnoozeToast
        snoozed={
          view.tab === "next" && params.snoozed && queueKeyPattern.test(params.snoozed)
            ? { key: params.snoozed, title: (params.title ?? "").slice(0, 200) }
            : undefined
        }
      />
    </div>
  );
}
