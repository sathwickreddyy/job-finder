import { displayDate, getDisplayPreferences } from "@/features/candidate/preferences";
import Link from "next/link";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { db } from "@/db";
import { applications, gmailConnections, jobs, mailEvents, mailMessages } from "@/db/schema";
import { ActionForm } from "@/components/action-form";
import { Button, EmptyState, PageHeader, Panel, StatusBadge } from "@/components/ui";
import { disconnectGmail, syncGmail } from "@/features/mail/actions";
import { MailReviewForm } from "@/features/mail/review-form";
import { gmailConfiguration } from "@/services/mail/gmail";
export const dynamic = "force-dynamic";
export default async function MailPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; notice?: string }>;
}) {
  const filters = await searchParams;
  const status = ["NEEDS_REVIEW", "REVIEWED", "DISMISSED"].includes(filters.status ?? "")
    ? filters.status!
    : "NEEDS_REVIEW";
  const [events, applicationOptions, connections] = await Promise.all([
    db
      .select({ event: mailEvents, message: mailMessages })
      .from(mailEvents)
      .innerJoin(mailMessages, eq(mailEvents.mailMessageId, mailMessages.id))
      .where(
        and(
          eq(mailEvents.status, status),
          filters.q
            ? or(
                ilike(mailMessages.subject, `%${filters.q}%`),
                ilike(mailMessages.sender, `%${filters.q}%`),
              )
            : undefined,
        ),
      )
      .orderBy(desc(mailMessages.receivedAt))
      .limit(100),
    db
      .select({
        id: applications.id,
        company: jobs.company,
        title: jobs.title,
        status: applications.status,
      })
      .from(applications)
      .innerJoin(jobs, eq(applications.jobId, jobs.id)),
    db
      .select({
        id: gmailConnections.id,
        email: gmailConnections.email,
        lastSyncedAt: gmailConnections.lastSyncedAt,
      })
      .from(gmailConnections),
  ]);
  const gmail = gmailConfiguration();
  const preferences = await getDisplayPreferences();
  return (
    <>
      <PageHeader
        title="Mail connections & linked records"
        description="Connect your inbox or link a recruiting message to an existing record."
        actions={
          <>
            <Link href="/mail/import" className="button-secondary">
              Import messages
            </Link>
            {gmail.configured && (
              <a href="/api/gmail/connect" className="button">
                Connect Gmail read-only
              </a>
            )}
          </>
        }
      />
      {filters.notice && (
        <p className="notice mb-5" role="status">
          {filters.notice.slice(0, 600)}
        </p>
      )}
      <div className="stack">
        {!gmail.configured && (
          <Panel title="Import mode is ready" className="scroll-mt-6">
            <span id="gmail-setup" />
            <p className="muted">
              Paste recruiting messages as JSON to classify and review them locally. Gmail sync
              requires Google OAuth credentials and an encryption key.
            </p>
            <details className="mt-2">
              <summary>Gmail configuration</summary>
              <p className="field-hint">
                Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI and
                GMAIL_TOKEN_ENCRYPTION_KEY in your local environment. The only requested permission
                is gmail.readonly.
              </p>
              <p className="field-hint mt-2">
                Register the callback shown in .env.example. Use a Google OAuth web application and
                enable Gmail API. The README describes setup.
              </p>
            </details>
          </Panel>
        )}
        {connections.map((connection) => (
          <Panel key={connection.id}>
            <div className="panel-header">
              <div>
                <h2>{connection.email}</h2>
                <p className="cell-subtitle">
                  Last complete sync: {displayDate(connection.lastSyncedAt, preferences, true)}
                </p>
              </div>
              <span className="badge">Read-only</span>
            </div>
            <div className="actions">
              <ActionForm action={syncGmail}>
                <input type="hidden" name="connectionId" value={connection.id} />
                <Button type="submit">Sync recruiting mail</Button>
              </ActionForm>
              <ActionForm action={disconnectGmail}>
                <input type="hidden" name="connectionId" value={connection.id} />
                <Button variant="outline" type="submit">
                  Disconnect locally
                </Button>
              </ActionForm>
            </div>
          </Panel>
        ))}
        <section>
          <div className="tabs">
            {[
              ["NEEDS_REVIEW", "Unlinked"],
              ["REVIEWED", "Linked"],
              ["DISMISSED", "Kept unlinked"],
            ].map(([value, name]) => (
              <Link
                className={`tab ${status === value ? "active" : ""}`}
                href={`/mail?status=${value}`}
                key={value}
              >
                {name}
              </Link>
            ))}
          </div>
          <form className="filter-bar" action="/mail">
            <input type="hidden" name="status" value={status} />
            <input
              type="search"
              name="q"
              aria-label="Search recruiting mail"
              placeholder="Search subject or sender"
              defaultValue={filters.q}
            />
            <button className="button-secondary">Filter</button>
          </form>
          {events.length ? (
            <div className="stack">
              {events.map(({ event, message }) => (
                <Panel key={event.id}>
                  <div className="panel-header">
                    <div>
                      <Link href={`/mail/${message.id}`} className="cell-title">
                        {message.subject}
                      </Link>
                      <p className="cell-subtitle">
                        {message.sender} · {displayDate(message.receivedAt, preferences, true)}
                      </p>
                    </div>
                    <div className="actions">
                      <StatusBadge status={event.type} />
                    </div>
                  </div>
                  <p className="muted mb-4">
                    {message.snippet ||
                      message.bodyText?.slice(0, 320) ||
                      "No message body supplied."}
                  </p>
                  {event.status === "NEEDS_REVIEW" ? (
                    <MailReviewForm event={event} applications={applicationOptions} />
                  ) : (
                    <div className="actions">
                      <StatusBadge status={event.status} />
                      {event.linkedApplicationId && (
                        <Link href={`/applications/${event.linkedApplicationId}`}>
                          Open linked application
                        </Link>
                      )}
                    </div>
                  )}
                </Panel>
              ))}
            </div>
          ) : (
            <EmptyState
              title={
                status === "NEEDS_REVIEW" ? "No unlinked messages here" : "No messages in this view"
              }
              description="Import recruiting messages or sync a connected Gmail account. Link a message when it belongs to an application or outreach record."
              action={
                <Link href="/mail/import" className="button">
                  Import recruiting mail
                </Link>
              }
            />
          )}
        </section>
      </div>
    </>
  );
}
