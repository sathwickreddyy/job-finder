import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { candidateProfiles, profiles, settings } from "@/db/schema";
import { ActionForm } from "@/components/action-form";
import { Button, Field, PageHeader, Panel } from "@/components/ui";
import {
  saveProfileBasics,
  savePublicProfile,
  saveWorkingContext,
} from "@/features/candidate/hub-actions";
import { SiteIcon } from "@/features/workspace/sites";

function ProfileLinkFields({ profile }: { profile?: typeof profiles.$inferSelect }) {
  return (
    <>
      <input type="hidden" name="id" value={profile?.id ?? ""} />
      <Field name={profile ? `name-${profile.id}` : "displayName"} label="Profile name">
        <input
          id={profile ? `name-${profile.id}` : "displayName"}
          name="displayName"
          required
          maxLength={150}
          defaultValue={profile?.displayName}
          placeholder="GitHub, personal portfolio, Naukri…"
        />
      </Field>
      <Field name={profile ? `url-${profile.id}` : "profileUrl"} label="Profile URL">
        <input
          id={profile ? `url-${profile.id}` : "profileUrl"}
          name="profileUrl"
          required
          type="url"
          defaultValue={profile?.profileUrl}
          placeholder="https://"
        />
      </Field>
      <Field name={profile ? `provider-${profile.id}` : "provider"} label="Platform">
        <select
          id={profile ? `provider-${profile.id}` : "provider"}
          name="provider"
          defaultValue={profile?.provider ?? "OTHER"}
        >
          <option value="OTHER">GitHub, portfolio, Hirist, or another site</option>
          <option value="LINKEDIN">LinkedIn</option>
          <option value="NAUKRI">Naukri</option>
          <option value="INSTAHYRE">Instahyre</option>
          <option value="CUTSHORT">Cutshort</option>
        </select>
      </Field>
      <Field
        name={profile ? `notes-${profile.id}` : "notes"}
        label="What would you like to improve or showcase?"
      >
        <textarea
          id={profile ? `notes-${profile.id}` : "notes"}
          name="notes"
          maxLength={10000}
          defaultValue={profile?.notes}
          rows={3}
        />
      </Field>
      <Button type="submit">Save profile link</Button>
    </>
  );
}
export default async function ProfileHub() {
  const [[candidate], links, [preferences]] = await Promise.all([
    db.select().from(candidateProfiles).limit(1),
    db.select().from(profiles).orderBy(profiles.displayName),
    db.select().from(settings).where(eq(settings.key, "workingPreferences")),
  ]);
  return (
    <div className="space-y-7">
      <PageHeader
        title="My sites & profile"
        description="Your public links and the background you want in your prompts."
      />
      <section id="public-profiles" className="space-y-4">
        <h2 className="text-xl font-semibold">Your sites</h2>
        {!links.length && (
          <Panel>
            <p className="text-muted-foreground">
              Add your LinkedIn, GitHub and portfolio links below. They will appear on Home.
            </p>
          </Panel>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          {links.map((profile) => (
            <Panel key={profile.id}>
              <div className="mb-4 flex items-center gap-3">
                <span className="grid size-12 place-items-center rounded-2xl bg-selected text-selected-foreground">
                  <SiteIcon name={profile.displayName} />
                </span>
                <h3 className="font-semibold">{profile.displayName}</h3>
              </div>
              <a
                href={profile.profileUrl || undefined}
                target="_blank"
                rel="noreferrer"
                className="break-all text-sm text-link"
              >
                {profile.profileUrl}
              </a>
              {profile.notes && (
                <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">
                  {profile.notes}
                </p>
              )}
              <div className="mt-4">
                <Link href={`/profile-prompt?profile=${profile.id}`} className="text-sm text-link">
                  Open improvement prompt
                </Link>
              </div>
              <details className="mt-5 border-t border-border pt-4">
                <summary className="cursor-pointer text-sm font-medium">Edit this link</summary>
                <div className="mt-4">
                  <ActionForm action={savePublicProfile}>
                    <ProfileLinkFields profile={profile} />
                  </ActionForm>
                </div>
              </details>
            </Panel>
          ))}
        </div>
      </section>
      <section id="add-link">
        <Panel title="Add a website">
          <ActionForm action={savePublicProfile}>
            <ProfileLinkFields />
          </ActionForm>
        </Panel>
      </section>
      <section id="preferences">
        <Panel title="Preferences for your prompts">
          <p className="mb-4 text-sm text-muted-foreground">
            Paste a summary from your existing ChatGPT or Claude conversation, or write your own.
            Your assistant can still use what it already knows.
          </p>
          <ActionForm action={saveWorkingContext}>
            <Field name="context" label="My working preferences">
              <textarea
                id="context"
                name="context"
                rows={6}
                maxLength={20000}
                defaultValue={String(preferences?.value.context ?? "")}
                placeholder="Your strengths, the work you enjoy, target roles and how you like to collaborate."
              />
            </Field>
            <Button>Save preferences</Button>
          </ActionForm>
        </Panel>
      </section>
      <details className="rounded-card border border-border bg-card p-6">
        <summary className="cursor-pointer font-medium">About you</summary>
        <div className="mt-5">
          <ActionForm action={saveProfileBasics}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Full name" name="fullName" defaultValue={candidate?.fullName ?? ""} />
              <Field
                label="Current role"
                name="currentRole"
                defaultValue={candidate?.currentRole ?? ""}
              />
              <Field
                label="Current city"
                name="currentCity"
                defaultValue={candidate?.currentCity ?? ""}
              />
              <Field
                label="Notice period"
                name="noticePeriod"
                defaultValue={candidate?.noticePeriod ?? ""}
              />
            </div>
            <Field label="Career summary" name="careerSummary">
              <textarea
                id="careerSummary"
                name="careerSummary"
                rows={5}
                defaultValue={candidate?.careerSummary ?? ""}
              />
            </Field>
            {(["linkedinUrl", "githubUrl", "portfolioUrl"] as const).map((name) => (
              <input key={name} type="hidden" name={name} value={candidate?.[name] ?? ""} />
            ))}
            <Button>Save my details</Button>
          </ActionForm>
          <Link href="/settings" className="mt-5 inline-block text-sm text-link">
            More profile and display settings
          </Link>
        </div>
      </details>
    </div>
  );
}
