import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq, ilike } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { contacts, jobs } from "@/db/schema";
import { PageHeader, Panel, StatusBadge } from "@/components/ui";
import { ContactForm } from "@/features/contacts/contact-form";
export const dynamic = "force-dynamic";
export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const [contact] = await db.select().from(contacts).where(eq(contacts.id, id));
  if (!contact) notFound();
  const roles = await db
    .select()
    .from(jobs)
    .where(ilike(jobs.company, contact.company))
    .orderBy(desc(jobs.createdAt));
  return (
    <>
      <PageHeader
        title={contact.name}
        description={`${contact.title || "Contact"} at ${contact.company}`}
        actions={
          <>
            <Link
              className="button-secondary"
              href={`/missions/new?type=VERIFY_CONTACT&entityType=CONTACT&entityId=${id}`}
            >
              Create verification mission
            </Link>
            {contact.linkedinUrl && (
              <a
                href={contact.linkedinUrl}
                className="button-secondary"
                target="_blank"
                rel="noopener noreferrer"
              >
                Open public profile
              </a>
            )}
          </>
        }
      />
      <div className="split-layout">
        <Panel title="Contact details">
          <ContactForm contact={contact} />
        </Panel>
        <div className="stack">
          <Panel title="Verification">
            <StatusBadge status={contact.verificationStatus} />
            <p className="muted mt-4">
              {contact.verificationSource ??
                "No verification evidence recorded. Treat this contact as unverified."}
            </p>
          </Panel>
          <Panel title={`Jobs at ${contact.company}`}>
            {roles.length ? (
              roles.map((job) => (
                <div className="queue-row" key={job.id}>
                  <div>
                    <Link href={`/jobs/${job.id}`} className="cell-title">
                      {job.title}
                    </Link>
                    <p className="cell-subtitle">{job.location}</p>
                  </div>
                  <StatusBadge status={job.status} />
                </div>
              ))
            ) : (
              <p className="muted">No stored jobs for this company yet.</p>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
