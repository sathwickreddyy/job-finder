import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { ArrowUpRight, FileText, Globe2 } from "lucide-react";
import { db } from "@/db";
import { profiles, resumes, resumeVersions } from "@/db/schema";
import { ActionForm } from "@/components/action-form";
import { Button, Field, PageHeader, Panel } from "@/components/ui";
import {
  quickResumeUpload,
  saveProfileBasics,
  savePublicProfile,
  saveWorkingContext,
} from "@/features/candidate/hub-actions";
import { taskOptions } from "@/features/tasks/read";

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
  const [options, links, versions] = await Promise.all([
    taskOptions(),
    db.select().from(profiles).orderBy(profiles.displayName),
    db
      .select({ version: resumeVersions, resume: resumes })
      .from(resumeVersions)
      .innerJoin(resumes, eq(resumes.id, resumeVersions.resumeId))
      .where(eq(resumeVersions.isCurrent, true))
      .orderBy(desc(resumeVersions.createdAt)),
  ]);
  const c = options.candidate;
  return (
    <>
      <PageHeader
        title="My profile"
        description="Your story, your work, and every place you show up."
      />
      <nav className="mb-8 flex flex-wrap gap-5 text-sm text-link" aria-label="Profile sections">
        <a href="#preferences">Working preferences</a>
        <a href="#public-profiles">Profiles & portfolio</a>
        <a href="#resume">Resume</a>
        <a href="#about-you">About you</a>
      </nav>
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(18rem,1fr)]">
        <div className="min-w-0 space-y-6">
          <section id="preferences">
            <Panel title="How you want to work">
              <p className="mb-5 text-sm leading-relaxed text-muted-foreground">
                Paste a summary from ChatGPT or Claude, or write it yourself. Describe the work you
                enjoy, your strengths, priorities, and how you want your assistant to help. You can
                refine this for every task.
              </p>
              <ActionForm action={saveWorkingContext}>
                <Field name="context" label="My working preferences">
                  <textarea
                    id="context"
                    name="context"
                    maxLength={20000}
                    rows={8}
                    defaultValue={options.context}
                    placeholder="What should an assistant understand about me and my next move?"
                  />
                </Field>
                <Button type="submit">Save preferences</Button>
              </ActionForm>
              <p className="mt-4 text-xs text-muted-foreground">
                Your assistants keep their own memory. Share the context you want JobOps to
                remember; confirmed facts stay in About you.
              </p>
            </Panel>
          </section>
          <section id="public-profiles" className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <h2 className="m-0 text-lg">Profiles & portfolio</h2>
              <Link href="/tasks/new?kind=SHOWCASE" className="text-sm text-link">
                Showcase my work →
              </Link>
            </div>
            {!links.length && (
              <Panel>
                <Globe2 className="mb-4 text-link" size={26} aria-hidden />
                <h3>Your online presence, together.</h3>
                <p className="text-sm text-muted-foreground">
                  Add LinkedIn, GitHub, portfolio websites and job portals. Keep improvement ideas
                  alongside each one.
                </p>
              </Panel>
            )}
            {links.map((p) => (
              <Panel key={p.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-base">{p.displayName}</h3>
                    <a
                      href={p.profileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex max-w-full items-center gap-1 break-all text-xs text-link"
                    >
                      {p.profileUrl}
                      <ArrowUpRight size={14} className="shrink-0" aria-hidden />
                    </a>
                  </div>
                  <Globe2 size={20} className="shrink-0 text-muted-foreground" aria-hidden />
                </div>
                {p.notes && (
                  <p className="mt-4 whitespace-pre-wrap text-sm text-muted-foreground">
                    {p.notes}
                  </p>
                )}
                <div className="mt-5 flex flex-wrap gap-2">
                  <Button asChild variant="outline">
                    <Link href={`/tasks/new?kind=PROFILE&profileId=${p.id}`}>
                      Improve this profile
                    </Link>
                  </Button>
                  <Button asChild variant="ghost">
                    <Link href={`/tasks/new?kind=SHOWCASE&profileId=${p.id}`}>
                      Create a showcase
                    </Link>
                  </Button>
                </div>
                <details className="mt-4 border-t border-border pt-3">
                  <summary className="text-xs text-muted-foreground">
                    Edit link and improvement notes
                  </summary>
                  <div className="mt-4">
                    <ActionForm action={savePublicProfile}>
                      <ProfileLinkFields profile={p} />
                    </ActionForm>
                  </div>
                </details>
              </Panel>
            ))}
            <Panel>
              <details open={!links.length}>
                <summary className="text-sm">Add a profile or website</summary>
                <div className="mt-5">
                  <ActionForm action={savePublicProfile}>
                    <ProfileLinkFields />
                  </ActionForm>
                </div>
              </details>
            </Panel>
          </section>
        </div>
        <div className="min-w-0 space-y-6">
          <section id="resume">
            <Panel title="Your resume">
              {versions.map(({ resume, version }) => (
                <div key={version.id} className="mb-5 border-b border-border pb-5">
                  <FileText size={22} className="mb-3 text-link" aria-hidden />
                  <h3>{resume.name}</h3>
                  <p className="text-xs text-muted-foreground">
                    {version.versionLabel} · {version.originalFilename}
                  </p>
                  <div className="mt-3 flex gap-4 text-sm text-link">
                    <Link href={`/api/resumes/${version.id}/file`} target="_blank">
                      Preview PDF ↗
                    </Link>
                    <Link href={`/resumes/${resume.id}`}>Versions & keywords</Link>
                  </div>
                </div>
              ))}
              {!versions.length && (
                <p className="mb-4 text-sm text-muted-foreground">
                  Start with the resume you already use. Tailored versions keep the original safe.
                </p>
              )}
              <details open={!versions.length}>
                <summary className="text-sm">Add a resume</summary>
                <div className="mt-4">
                  <ActionForm action={quickResumeUpload}>
                    <Field
                      name="name"
                      label="Resume name"
                      maxLength={100}
                      placeholder="My resume"
                    />
                    <Field
                      name="file"
                      label="Resume PDF"
                      type="file"
                      accept="application/pdf"
                      required
                      hint="Up to 10 MiB. Stored privately."
                    />
                    <Button type="submit">Save resume</Button>
                  </ActionForm>
                </div>
              </details>
            </Panel>
          </section>
          <section id="about-you">
            <Panel title="About you">
              <ActionForm action={saveProfileBasics}>
                <Field name="fullName" label="Your name" defaultValue={c?.fullName ?? ""} />
                <Field
                  name="currentRole"
                  label="Current role"
                  defaultValue={c?.currentRole ?? ""}
                />
                <Field
                  name="currentCity"
                  label="City in India"
                  defaultValue={c?.currentCity ?? ""}
                />
                <Field
                  name="noticePeriod"
                  label="Notice period"
                  defaultValue={c?.noticePeriod ?? ""}
                />
                <Field name="careerSummary" label="Your skills and experience">
                  <textarea
                    id="careerSummary"
                    name="careerSummary"
                    maxLength={15000}
                    rows={5}
                    defaultValue={c?.careerSummary ?? ""}
                  />
                </Field>
                <details>
                  <summary className="text-sm">LinkedIn, GitHub & portfolio links</summary>
                  <div className="mt-4 space-y-4">
                    <Field
                      name="linkedinUrl"
                      label="LinkedIn URL"
                      type="url"
                      defaultValue={c?.linkedinUrl ?? ""}
                    />
                    <Field
                      name="githubUrl"
                      label="GitHub URL"
                      type="url"
                      defaultValue={c?.githubUrl ?? ""}
                    />
                    <Field
                      name="portfolioUrl"
                      label="Portfolio URL"
                      type="url"
                      defaultValue={c?.portfolioUrl ?? ""}
                    />
                  </div>
                </details>
                <Button type="submit">Save my details</Button>
              </ActionForm>
              <Link href="/settings#candidate" className="mt-5 inline-block text-xs text-link">
                Application answers & additional details →
              </Link>
            </Panel>
          </section>
        </div>
      </div>
    </>
  );
}
