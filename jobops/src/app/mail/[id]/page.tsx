import { displayDate, getDisplayPreferences } from "@/features/candidate/preferences";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { applications, jobs, mailEvents, mailMessages } from "@/db/schema";
import { PageHeader, Panel, StatusBadge } from "@/components/ui";
import { MailReviewForm } from "@/features/mail/review-form";
export const dynamic = "force-dynamic";
export default async function MailMessagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const [message] = await db.select().from(mailMessages).where(eq(mailMessages.id, id));
  if (!message) notFound();
  const [events, applicationOptions] = await Promise.all([
    db.select().from(mailEvents).where(eq(mailEvents.mailMessageId, id)),
    db
      .select({
        id: applications.id,
        company: jobs.company,
        title: jobs.title,
        status: applications.status,
      })
      .from(applications)
      .innerJoin(jobs, eq(applications.jobId, jobs.id)),
  ]);
  const preferences = await getDisplayPreferences();
  return (
    <>
      <PageHeader
        title={message.subject}
        description={`${message.senderName || message.sender} · ${displayDate(message.receivedAt, preferences, true)}`}
        actions={
          <Link href="/mail" className="button-secondary">
            Return to mail review
          </Link>
        }
      />
      <div className="stack">
        <Panel title="Message">
          <dl className="data-list mb-5">
            <dt>From</dt>
            <dd>{message.sender}</dd>
            <dt>To</dt>
            <dd>{message.recipient || "Not supplied"}</dd>
            <dt>Provider</dt>
            <dd>{message.provider}</dd>
            <dt>Classification</dt>
            <dd>
              <StatusBadge status={message.classification} />
            </dd>
          </dl>
          <div className="whitespace-pre-wrap break-words">
            {message.bodyText || message.snippet || "No plain-text body available."}
          </div>
        </Panel>
        {events.map((event) => (
          <Panel title="Proposed application event" key={event.id}>
            <div className="actions mb-5">
              <StatusBadge status={event.status} />
              <span className="badge">{Math.round(event.confidence * 100)}% rule confidence</span>
            </div>
            {event.status === "NEEDS_REVIEW" ? (
              <MailReviewForm event={event} applications={applicationOptions} />
            ) : (
              <>
                <p className="muted">This proposal was manually reviewed.</p>
                {event.linkedApplicationId && (
                  <Link href={`/applications/${event.linkedApplicationId}`}>
                    Open application timeline
                  </Link>
                )}
              </>
            )}
          </Panel>
        ))}
      </div>
    </>
  );
}
