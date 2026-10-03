import { displayDate, getDisplayPreferences } from "@/features/candidate/preferences";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { applications, jobs, mailEvents, mailMessages } from "@/db/schema";
import { PageHeader, Panel, StatusBadge } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui";
import { RecordPicker } from "@/features/applications/views/record-picker";
import { dismissMail, linkMailOnly } from "@/features/mail/triage-actions";
import { bucketOf, linkHref, suggestedOutcome } from "@/features/mail/triage";
import { mailIsOpen } from "@/features/mail/state";
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
  const suggestedId = events.find(
    (event) => typeof event.details.suggestedApplicationId === "string",
  )?.details.suggestedApplicationId;
  const suggested = applicationOptions.find((option) => option.id === suggestedId);
  const bucket = bucketOf({ ...message, recordId: suggested?.id ?? null });
  const open = mailIsOpen(message, events);
  const linkedId =
    message.linkedApplicationId ??
    events.find((event) => event.linkedApplicationId)?.linkedApplicationId;
  const preferences = await getDisplayPreferences();
  return (
    <>
      <PageHeader
        title={message.subject}
        description={`${message.senderName || message.sender} · ${displayDate(message.receivedAt, preferences, true)}`}
        actions={
          <Link href="/applications?tab=emails" className="button-secondary">
            Back to Emails
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
        <Panel title="What to do with this message">
          {open ? (
            <div className="flex flex-wrap items-center gap-2">
              {bucket === "updates" &&
                (suggested ? (
                  <Button asChild size="sm">
                    <Link href={linkHref(message, suggested.id)}>Link and update</Link>
                  </Button>
                ) : (
                  <RecordPicker
                    mailId={message.id}
                    outcome={suggestedOutcome[message.classification]}
                    records={applicationOptions.map((option) => ({
                      id: option.id,
                      label: `${option.company} — ${option.title}`,
                    }))}
                  />
                ))}
              {bucket === "roles" && (
                <Button asChild size="sm" variant="outline">
                  <Link href={`/jobs/new?fromMail=${message.id}`}>Save as opening</Link>
                </Button>
              )}
              {bucket === "noise" &&
                message.classification === "APPLICATION_ACKNOWLEDGEMENT" &&
                suggested && (
                  <ActionForm
                    action={linkMailOnly}
                    feedback="inverse"
                    className="contents"
                    pendingLabel="Linking"
                  >
                    <input type="hidden" name="mailId" value={message.id} />
                    <input type="hidden" name="recordId" value={suggested.id} />
                    <Button size="sm" variant="outline">
                      Link
                    </Button>
                  </ActionForm>
                )}
              <ActionForm
                action={dismissMail}
                feedback="inverse"
                className="contents"
                pendingLabel="Dismissing"
              >
                <input type="hidden" name="mailId" value={message.id} />
                <Button size="sm" variant="ghost">
                  Dismiss
                </Button>
              </ActionForm>
            </div>
          ) : (
            <p className="m-0 text-sm text-muted-foreground">
              {linkedId ? (
                <>
                  Linked to <Link href={`/applications/${linkedId}`}>its record</Link>.
                </>
              ) : events.some((event) => event.status === "DISMISSED") ? (
                "Dismissed."
              ) : (
                "Handled."
              )}
            </p>
          )}
        </Panel>
      </div>
    </>
  );
}
