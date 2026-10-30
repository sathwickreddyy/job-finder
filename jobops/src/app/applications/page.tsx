import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Button, EmptyState, PageHeader } from "@/components/ui";
import { buildLanes, laneViews, laneWindow, pendingMailFrom } from "@/features/applications/lanes";
import { resolveLanesView } from "@/features/applications/navigation";
import { buildQueue } from "@/features/applications/queue";
import { readApplications } from "@/features/applications/read";
import { LaneDetail } from "@/features/applications/views/lane-detail";
import { LanesChart } from "@/features/applications/views/lanes";
import { readMailTriage, readOpenMail } from "@/features/mail/read";
import { queueMailFrom } from "@/features/mail/triage";

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
  const query = await searchParams;
  if (query.emails === "1" || query.tab === "emails")
    redirect(
      `/mail${query.notice ? `?notice=${encodeURIComponent(query.notice.slice(0, 300))}` : ""}`,
    );
  const view = resolveLanesView(query);
  const now = new Date();
  const { records, snoozes } = await readApplications();
  const triage = await readMailTriage(records);
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
  const recordOptions = records.map((record) => ({
    id: record.id,
    label: `${record.companyName} · ${record.role}`,
  }));
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Applications"
        description="Every company on one calendar: what happened, where it stands and what to do next."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/mail">Mail</Link>
            </Button>
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
                records={recordOptions}
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
