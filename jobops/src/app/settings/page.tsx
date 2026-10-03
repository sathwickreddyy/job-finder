import { asc } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db";
import { candidateProfiles, mailConnections, settings } from "@/db/schema";
import { ActionForm } from "@/components/action-form";
import { Button, Field, PageHeader, Panel } from "@/components/ui";
import { CandidateForm } from "@/features/candidate/candidate-form";
import { saveAppPreferences, saveJobPreferences } from "@/features/candidate/actions";
import { disconnectInbox } from "@/features/mail/actions";
import { displayDate, getDisplayPreferences } from "@/features/candidate/preferences";
import { remotePreferences } from "@/features/candidate/validation";

export const dynamic = "force-dynamic";
function list(value: unknown): string {
  return Array.isArray(value) ? value.join(", ") : "";
}
export default async function SettingsPage() {
  const [[candidate], allSettings, connections, display] = await Promise.all([
    db.select().from(candidateProfiles).limit(1),
    db.select().from(settings),
    db
      .select({
        id: mailConnections.id,
        provider: mailConnections.provider,
        email: mailConnections.email,
        lastRefreshedAt: mailConnections.lastRefreshedAt,
      })
      .from(mailConnections)
      .orderBy(asc(mailConnections.createdAt), asc(mailConnections.id)),
    getDisplayPreferences(),
  ]);
  const saved = Object.fromEntries(allSettings.map((entry) => [entry.key, entry.value]));
  const prefs = saved.jobPreferences ?? {};
  const appPrefs = saved.appPreferences ?? {};
  return (
    <>
      <PageHeader
        title="Settings"
        description="Your saved details, search preferences, display settings and mail connection."
      />
      <nav aria-label="Settings sections" className="section-links">
        {[
          ["Candidate", "candidate"],
          ["Job preferences", "job-preferences"],
          ["Standard answers", "standard-answers"],
          ["Storage", "storage"],
          ["Mail", "mail-integration"],
          ["Export", "export"],
        ].map(([name, id]) => (
          <a href={`#${id}`} key={id}>
            {name}
          </a>
        ))}
      </nav>
      <div className="stack">
        <section id="candidate">
          <Panel title="Candidate profile">
            <p className="muted mb-5">
              Only supply facts you know. Compensation and unrelated metadata are excluded from
              copied prompts.
            </p>
            <CandidateForm candidate={candidate} />
          </Panel>
        </section>
        <section id="job-preferences">
          <Panel title="Job preferences">
            <ActionForm action={saveJobPreferences}>
              <div className="form-grid">
                <Field
                  name="desiredRoles"
                  label="Desired roles"
                  defaultValue={list(prefs.desiredRoles ?? candidate?.desiredRoles)}
                  hint="Comma-separated"
                />
                <Field
                  name="locations"
                  label="Preferred locations"
                  defaultValue={list(prefs.locations ?? candidate?.preferredLocations)}
                />
                <Field
                  name="minExperience"
                  label="Minimum experience"
                  type="number"
                  min={0}
                  max={80}
                  step="0.1"
                  defaultValue={String(prefs.minExperience ?? 0)}
                />
                <Field
                  name="maxExperience"
                  label="Maximum experience"
                  type="number"
                  min={0}
                  max={80}
                  step="0.1"
                  defaultValue={String(prefs.maxExperience ?? 20)}
                />
                <Field
                  name="preferredTechnologies"
                  label="Preferred technologies"
                  defaultValue={list(prefs.preferredTechnologies)}
                />
                <Field
                  name="excludedRoles"
                  label="Excluded roles"
                  defaultValue={list(prefs.excludedRoles)}
                />
                <Field name="remotePreference" label="Remote preference">
                  <select
                    name="remotePreference"
                    id="remotePreference"
                    defaultValue={String(
                      prefs.remotePreference ?? candidate?.remotePreference ?? "UNKNOWN",
                    )}
                  >
                    {remotePreferences.map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <Button type="submit">Save job preferences</Button>
            </ActionForm>
          </Panel>
        </section>
        <div className="grid-2">
          <section id="storage">
            <Panel title="Resume storage">
              <p className="muted">
                Original PDFs and evidence use local private storage behind a storage adapter.
              </p>
              <dl className="data-list mt-4">
                <dt>Storage location</dt>
                <dd>
                  <code>{process.env.STORAGE_ROOT ?? "data/uploads"}</code>
                </dd>
                <dt>Backup</dt>
                <dd>Back up this directory together with PostgreSQL.</dd>
                <dt>Access</dt>
                <dd>Files are downloaded through protected routes.</dd>
              </dl>
              <Link href="/resumes" className="button-secondary mt-5">
                Open resume vault
              </Link>
            </Panel>
          </section>
          <section id="mail-integration">
            <Panel title="Mail connections">
              <p className="muted">
                Inbox access is read-only. Connect and refresh inboxes from Applications → Emails.
              </p>
              <p className="muted mt-2 text-sm">
                Disconnect removes local credentials only. Also remove JobOps from your Google or
                Microsoft account permissions to revoke the grant; imported mail and history remain.
              </p>
              {connections.length ? (
                <ul className="m-0 mt-4 list-none space-y-3 p-0">
                  {connections.map((connection) => (
                    <li
                      key={connection.id}
                      className="flex min-w-0 flex-wrap items-center justify-between gap-3"
                    >
                      <span className="min-w-0 [overflow-wrap:anywhere]">
                        <strong>{connection.email}</strong>{" "}
                        <span className="muted">
                          · {connection.provider === "OUTLOOK" ? "Outlook" : "Gmail"} · last
                          refreshed {displayDate(connection.lastRefreshedAt, display, true)}
                        </span>
                      </span>
                      <ActionForm
                        action={disconnectInbox}
                        className="contents"
                        pendingLabel="Disconnecting"
                        feedback="inverse"
                      >
                        <input type="hidden" name="connectionId" value={connection.id} />
                        <Button
                          variant="destructive"
                          size="sm"
                          aria-label={`Disconnect ${connection.email}`}
                        >
                          Disconnect
                        </Button>
                      </ActionForm>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4">No inbox connected.</p>
              )}
              <div className="actions mt-5">
                <Link href="/applications?tab=emails" className="button-secondary">
                  Connect or refresh inboxes
                </Link>
              </div>
            </Panel>
          </section>
        </div>

        <Panel title="Application preferences">
          <ActionForm action={saveAppPreferences}>
            <div className="form-grid">
              <Field
                name="timezone"
                label="Display timezone"
                defaultValue={String(appPrefs.timezone ?? "Asia/Kolkata")}
              />
              <Field name="dateFormat" label="Date format">
                <select
                  id="dateFormat"
                  name="dateFormat"
                  defaultValue={String(appPrefs.dateFormat ?? "ISO")}
                >
                  <option value="ISO">ISO date</option>
                  <option value="LOCAL">Local date</option>
                </select>
              </Field>
            </div>
            <Button type="submit">Save application preferences</Button>
          </ActionForm>
        </Panel>
        <section id="export">
          <Panel title="Data export">
            <p className="muted mb-4">
              Download your records for backup or offline review. Resume files are backed up
              separately.
            </p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Records</th>
                    <th>JSON</th>
                    <th>CSV</th>
                  </tr>
                </thead>
                <tbody>
                  {["jobs", "applications", "contacts", "candidate"].map((entity) => (
                    <tr key={entity}>
                      <td className="capitalize">{entity}</td>
                      <td>
                        <a href={`/api/export?entity=${entity}&format=json`}>Download JSON</a>
                      </td>
                      <td>
                        {["jobs", "applications", "contacts"].includes(entity) ? (
                          <a href={`/api/export?entity=${entity}&format=csv`}>Download CSV</a>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </section>
      </div>
    </>
  );
}
