import Link from "next/link";
import { asc } from "drizzle-orm";
import { z } from "zod";
import { Button, EmptyState, PageHeader } from "@/components/ui";
import { db } from "@/db";
import { mailConnections } from "@/db/schema";
import { buildLanes, laneViews, laneWindow, pendingMailFrom } from "@/features/applications/lanes";
import { resolveLanesView } from "@/features/applications/navigation";
import { buildQueue } from "@/features/applications/queue";
import { readApplications } from "@/features/applications/read";
import { EmailsView } from "@/features/applications/views/emails";
import { EmailsDrawer } from "@/features/applications/views/emails-drawer";
import { InboxStatus } from "@/features/applications/views/inboxes";
import { LaneDetail } from "@/features/applications/views/lane-detail";
import { LanesChart } from "@/features/applications/views/lanes";
import { readMailTriage, readOpenMail } from "@/features/mail/read";
import { queueMailFrom } from "@/features/mail/triage";
import { providers } from "@/services/mail/providers";

export const dynamic = "force-dynamic";

export default async function Applications({
  searchParams,
}: {
  searchParams: Promise<{
    open?: string;
    mail?: string;
    outcome?: string;
    emails?: string;
    tab?: string;
    notice?: string;
  }>;
}) {
  const view = resolveLanesView(await searchParams);
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
  const lanes = buildLanes({ records, items, pending: pendingMailFrom(triage.messages), now });
  const chart = laneViews(lanes, laneWindow(lanes, now), now);
  const openRecord = view.open ? records.find((record) => record.id === view.open) : undefined;
  const openLane = openRecord
    ? lanes.find((lane) => lane.key === openRecord.companyKey)
    : undefined;
  let mail = null;
  let mailError: string | undefined;
  if (openRecord && view.mail !== null) {
    if (!z.uuid().safeParse(view.mail).success)
      mailError = "The source message link is invalid. Open Emails to choose a message.";
    else {
      try {
        mail = await readOpenMail(view.mail, openRecord.id);
      } catch (error) {
        mailError =
          error instanceof Error ? error.message : "The source message could not be loaded.";
      }
    }
  }
  const decisions = triage.messages.filter(
    (message) => message.bucket === "roles" || (message.bucket === "updates" && !message.record),
  ).length;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Applications"
        description="Every company on one calendar: what happened, where it stands and what to do next."
        actions={
          <>
            <EmailsDrawer
              count={decisions}
              connected={connections.length > 0}
              initialOpen={view.emails}
            >
              <EmailsView
                data={triage}
                records={records.map((record) => ({
                  id: record.id,
                  label: `${record.companyName} · ${record.role}`,
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
                notice={view.emails ? view.notice : undefined}
              />
            </EmailsDrawer>
            <Button asChild>
              <Link href="/applications/new">Record an application</Link>
            </Button>
          </>
        }
      />
      {view.notice && !view.emails && (
        <p
          role="status"
          className="m-0 rounded-2xl bg-foreground px-4 py-3 text-sm text-background shadow-surface"
        >
          {view.notice}
        </p>
      )}
      {records.length ? (
        <LanesChart
          {...chart}
          openKey={openLane?.key ?? null}
          detail={
            openLane && openRecord ? (
              <LaneDetail
                lane={openLane}
                record={openRecord}
                now={now}
                requested={view.outcome}
                mail={mail}
                mailIntent={view.mail ?? undefined}
                mailError={mailError}
              />
            ) : null
          }
        />
      ) : (
        <EmptyState
          title="No applications yet"
          description="Find an opening, then record the application or referral you sent."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="outline" asChild>
                <Link href="/find">Find openings</Link>
              </Button>
              <Button asChild>
                <Link href="/applications/new">Record an application</Link>
              </Button>
            </div>
          }
        />
      )}
    </div>
  );
}
