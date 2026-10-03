import Link from "next/link";
import { db } from "@/db";
import { candidateProfiles, gmailConnections, settings } from "@/db/schema";
import { ActionForm } from "@/components/action-form";
import { Button, Field, PageHeader, Panel } from "@/components/ui";
import { CandidateForm } from "@/features/candidate/candidate-form";
import { saveAppPreferences, saveJobPreferences } from "@/features/candidate/actions";
import { gmailConfiguration } from "@/services/mail/gmail";
import { remotePreferences } from "@/features/candidate/validation";

export const dynamic = "force-dynamic";
function list(value: unknown): string {
  return Array.isArray(value) ? value.join(", ") : "";
}
export default async function SettingsPage() {
  const [[candidate], allSettings, connections] = await Promise.all([
    db.select().from(candidateProfiles).limit(1),
    db.select().from(settings),
    db
      .select({ email: gmailConnections.email, lastSyncedAt: gmailConnections.lastSyncedAt })
      .from(gmailConnections),
  ]);
  const saved = Object.fromEntries(allSettings.map((entry) => [entry.key, entry.value]));
  const prefs = saved.jobPreferences ?? {};
  const appPrefs = saved.appPreferences ?? {};
  const gmail = gmailConfiguration();
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
            <Panel title="Mail integration">
              <p className="muted">
                Gmail access is read-only. Imported messages and proposed updates always require
                review.
              </p>
              <p className="mt-4">
                {connections.length
                  ? `Connected: ${connections.map((v) => v.email).join(", ")}`
                  : "No Gmail account connected."}
              </p>
              {!gmail.configured && (
                <p className="field-hint mt-2">
                  Gmail configuration is incomplete. Mail JSON import works immediately.
                </p>
              )}
              <div className="actions mt-5">
                <Link href="/applications?tab=emails" className="button-secondary">
                  Open mail review
                </Link>
                {gmail.configured && (
                  <a href="/api/gmail/connect" className="button">
                    Connect Gmail read-only
                  </a>
                )}
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
