import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Button, EmptyState, PageHeader } from "@/components/ui";
import { journeyOf } from "@/features/applications/journey";
import { buildLanes, pendingMailFrom } from "@/features/applications/lanes";
import { resolveLanesView } from "@/features/applications/navigation";
import { buildQueue } from "@/features/applications/queue";
import { readApplications } from "@/features/applications/read";
import { readApplicationStory } from "@/features/applications/story";
import { ApplicationExpanded } from "@/features/applications/views/application-detail";
import { ApplicationList } from "@/features/applications/views/application-list";
import { readMailTriage, readOpenMail } from "@/features/mail/read";
import { queueMailFrom } from "@/features/mail/triage";
import { PREVIOUS_JOB, previousJobs } from "@/features/companies/previous-job";
import { monthLabel } from "@/features/companies/status";

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
  const [{ records: all, snoozes }, previous] = await Promise.all([
    readApplications(),
    previousJobs(),
  ]);
  // Previous jobs are history: listed below, never rows or queue items.
  const records = all.filter((record) => record.source !== PREVIOUS_JOB);
  const triage = await readMailTriage(records);
  const items = buildQueue({ records, mail: queueMailFrom(triage.messages), snoozes, now });
  const lanes = buildLanes({
    records,
    items,
    pending: pendingMailFrom(triage.messages),
    now,
    by: "application",
  });
  const journeys = Object.fromEntries(records.map((record) => [record.id, journeyOf(record)]));
  const openRecord = view.open ? records.find((record) => record.id === view.open) : undefined;
  const openLane = openRecord ? lanes.find((lane) => lane.key === openRecord.id) : undefined;
  const companyName = new Map(all.map((record) => [record.id, record.companyName]));
  let mail = null;
  let mailError: string | undefined;
  if (openRecord && view.mail !== null) {
    if (!z.uuid().safeParse(view.mail).success)
      mailError = "The source message link is invalid. Open Mail to choose a message.";
    else {
      try {
        mail = await readOpenMail(view.mail, openRecord.id);
      } catch (error) {
        mailError =
          error instanceof Error ? error.message : "The source message could not be loaded.";
      }
    }
  }
  const story =
    openRecord &&
    (await readApplicationStory(
      openRecord,
      records.filter((record) => record.companyKey === openRecord.companyKey),
      now,
    ));
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Applications"
        description="How far each application got, and the one thing to do next."
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
        <ApplicationList
          lanes={lanes}
          journeys={journeys}
          openId={openLane ? openRecord!.id : null}
          detail={
            openLane && openRecord && story ? (
              <ApplicationExpanded
                record={openRecord}
                lane={openLane}
                journey={journeys[openRecord.id]}
                story={story}
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
      {previous.length > 0 && (
        <details className="group rounded-3xl bg-card p-4 ring-1 ring-border">
          <summary className="cursor-pointer text-sm font-semibold">
            Previous jobs ({previous.length})
          </summary>
          <ul className="m-0 mt-3 grid list-none gap-2 p-0">
            {previous.map((job) => (
              <li key={job.applicationId} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <span className="font-medium">{companyName.get(job.applicationId)}</span>
                <span>{job.role}</span>
                <span className="text-muted-foreground">
                  {job.joinedOn ? monthLabel(job.joinedOn) : "Joined month not recorded"}
                  {job.leftOn ? ` to ${monthLabel(job.leftOn)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

export const metadata = { title: "Applications" };
