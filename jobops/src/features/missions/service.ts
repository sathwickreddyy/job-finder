import { and, asc, desc, eq, ilike, or } from "drizzle-orm";
import { db } from "@/db";
import {
  activityLogs,
  applications,
  candidateProfiles,
  contacts,
  jobs,
  jobSnapshots,
  missionEvidence,
  missionExecutions,
  missions,
  missionSteps,
  profiles,
  resumes,
  resumeVersions,
  settings,
} from "@/db/schema";
import {
  buildMissionContext,
  type JsonRecord,
  MISSION_STATUSES,
  MISSION_TYPES,
  OPERATORS,
} from "./domain";
import { z } from "zod";
import { redirect } from "next/navigation";

export async function listMissions(filters: { q?: string; status?: string; type?: string }) {
  const status = z.enum(MISSION_STATUSES).safeParse(filters.status);
  const type = z.enum(MISSION_TYPES).safeParse(filters.type);
  return db
    .select()
    .from(missions)
    .where(
      and(
        filters.q
          ? or(ilike(missions.title, `%${filters.q}%`), ilike(missions.goal, `%${filters.q}%`))
          : undefined,
        status.success ? eq(missions.status, status.data) : undefined,
        type.success ? eq(missions.type, type.data) : undefined,
      ),
    )
    .orderBy(asc(missions.priority), desc(missions.createdAt));
}

export async function getMissionOptions() {
  const [
    candidate,
    jobRows,
    profileRows,
    applicationRows,
    contactRows,
    resumeRows,
    preferenceRows,
    defaultRows,
  ] = await Promise.all([
    db.select().from(candidateProfiles).limit(1),
    db.select().from(jobs).orderBy(desc(jobs.createdAt)).limit(500),
    db.select().from(profiles).orderBy(asc(profiles.displayName)),
    db.select().from(applications).orderBy(desc(applications.updatedAt)).limit(500),
    db.select().from(contacts).orderBy(asc(contacts.company)),
    db
      .select({
        id: resumeVersions.id,
        label: resumeVersions.versionLabel,
        name: resumes.name,
        isCurrent: resumeVersions.isCurrent,
        resumeId: resumes.id,
      })
      .from(resumeVersions)
      .innerJoin(resumes, eq(resumes.id, resumeVersions.resumeId))
      .where(eq(resumes.isActive, true))
      .orderBy(asc(resumes.name), desc(resumeVersions.createdAt)),
    db.select().from(settings).where(eq(settings.key, "jobPreferences")),
    db.select().from(settings).where(eq(settings.key, "missionDefaults")),
  ]);
  const savedDefaults = defaultRows[0]?.value ?? {};
  const priority = z.number().int().min(1).max(3).safeParse(savedDefaults.priority);
  const maxResults = z
    .number()
    .int()
    .min(1)
    .max(100)
    .safeParse(savedDefaults.maxResults ?? savedDefaults.maximumResults);
  const freshnessDays = z.number().int().min(1).max(365).safeParse(savedDefaults.freshnessDays);
  const defaults = {
    ...savedDefaults,
    priority: priority.success ? priority.data : 2,
    maxResults: maxResults.success ? maxResults.data : 30,
    freshnessDays: freshnessDays.success ? freshnessDays.data : 7,
  };
  return {
    candidate: candidate[0] ?? null,
    jobs: jobRows,
    profiles: profileRows,
    applications: applicationRows,
    contacts: contactRows,
    resumes: resumeRows,
    preferences: preferenceRows[0]?.value ?? {},
    defaults,
  };
}

export async function getMission(id: string) {
  if (!z.uuid().safeParse(id).success) return null;
  const [mission] = await db.select().from(missions).where(eq(missions.id, id));
  if (!mission) return null;
  if (mission.input.workflow === true) redirect(`/tasks/${id}`);
  const [steps, executions, evidence, activity, candidate, defaultRows] = await Promise.all([
    db
      .select()
      .from(missionSteps)
      .where(eq(missionSteps.missionId, id))
      .orderBy(asc(missionSteps.sequence)),
    db
      .select()
      .from(missionExecutions)
      .where(eq(missionExecutions.missionId, id))
      .orderBy(desc(missionExecutions.startedAt)),
    db
      .select()
      .from(missionEvidence)
      .where(eq(missionEvidence.missionId, id))
      .orderBy(desc(missionEvidence.createdAt)),
    db
      .select()
      .from(activityLogs)
      .where(and(eq(activityLogs.entityType, "MISSION"), eq(activityLogs.entityId, id)))
      .orderBy(desc(activityLogs.createdAt)),
    db.select().from(candidateProfiles).limit(1),
    db.select().from(settings).where(eq(settings.key, "missionDefaults")),
  ]);
  let entity: JsonRecord | null = null;
  let relatedJob: typeof jobs.$inferSelect | null = null;
  let relatedApplication: typeof applications.$inferSelect | null = null;
  if (mission.entityId) {
    if (mission.entityType === "JOB") {
      const [job] = await db.select().from(jobs).where(eq(jobs.id, mission.entityId));
      if (job) {
        relatedJob = job;
        const [snapshot] = await db
          .select()
          .from(jobSnapshots)
          .where(eq(jobSnapshots.jobId, job.id))
          .orderBy(desc(jobSnapshots.capturedAt))
          .limit(1);
        entity = {
          ...job,
          description: snapshot?.description ?? "",
          requirements: snapshot?.requirements ?? [],
          skills: snapshot?.skills ?? [],
        };
      }
    } else if (mission.entityType === "PROFILE") {
      const [profile] = await db.select().from(profiles).where(eq(profiles.id, mission.entityId));
      entity = profile ?? null;
    } else if (mission.entityType === "APPLICATION") {
      const [application] = await db
        .select()
        .from(applications)
        .where(eq(applications.id, mission.entityId));
      if (application) {
        entity = application;
        relatedApplication = application;
        const [job] = await db.select().from(jobs).where(eq(jobs.id, application.jobId));
        relatedJob = job ?? null;
      }
    } else if (mission.entityType === "CONTACT") {
      const [contact] = await db.select().from(contacts).where(eq(contacts.id, mission.entityId));
      entity = contact ?? null;
    }
  }
  if (
    typeof mission.input.applicationId === "string" &&
    z.uuid().safeParse(mission.input.applicationId).success
  ) {
    const [application] = await db
      .select()
      .from(applications)
      .where(eq(applications.id, mission.input.applicationId));
    relatedApplication = application ?? null;
  }
  const selectedResumeVersionId = mission.input.selectedResumeVersionId;
  let resume: {
    id: string;
    versionLabel: string;
    originalFilename: string;
    mimeType: string;
    fileSize: number;
    resumeName: string;
    resumeId: string;
  } | null = null;
  if (
    typeof selectedResumeVersionId === "string" &&
    z.uuid().safeParse(selectedResumeVersionId).success
  ) {
    const [version] = await db
      .select({
        id: resumeVersions.id,
        versionLabel: resumeVersions.versionLabel,
        originalFilename: resumeVersions.originalFilename,
        mimeType: resumeVersions.mimeType,
        fileSize: resumeVersions.fileSize,
        resumeName: resumes.name,
        resumeId: resumes.id,
      })
      .from(resumeVersions)
      .innerJoin(resumes, eq(resumes.id, resumeVersions.resumeId))
      .where(eq(resumeVersions.id, selectedResumeVersionId));
    resume = version ?? null;
  }
  const context = buildMissionContext({
    mission,
    candidate: candidate[0] ?? null,
    entity,
    application: relatedApplication,
    job: relatedJob,
    resume,
    steps,
  });
  const operator = z
    .enum(OPERATORS)
    .safeParse(defaultRows[0]?.value.operator ?? defaultRows[0]?.value.defaultOperator);
  return {
    mission,
    steps,
    executions,
    evidence,
    activity,
    entity,
    relatedJob,
    relatedApplication,
    resume,
    context,
    defaultOperator: operator.success ? operator.data : "HUMAN",
  };
}
