import Link from "next/link";
import { Button, PageHeader, Panel } from "@/components/ui";
import { matchesFilter, queueKeyPattern, resolveView } from "@/features/applications/navigation";
import { buildQueue } from "@/features/applications/queue";
import { readApplications } from "@/features/applications/read";
import { NextView, SnoozeToast } from "@/features/applications/views/next";
import { RecordsView } from "@/features/applications/views/records";
import { ApplicationsTabs } from "@/features/applications/views/tabs";
import { MailRefresh } from "@/features/mail/refresh";

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
  }>;
}) {
  const params = await searchParams;
  const view = resolveView(params);
  const now = new Date();
  const { records, snoozes } = await readApplications();
  const items = buildQueue({ records, mail: [], snoozes, now });
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
          emails: null,
        }}
      />
      {view.tab === "next" && <NextView items={items} now={now} />}
      {view.tab === "records" && (
        <RecordsView records={records} filter={view.filter} q={view.q} now={now} />
      )}
      {view.tab === "emails" && (
        <Panel>
          <MailRefresh />
          <Link href="/mail" className="mt-4 inline-block text-sm text-link">
            Review imported mail
          </Link>
        </Panel>
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
