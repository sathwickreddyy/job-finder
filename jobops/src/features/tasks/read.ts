import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  candidateProfiles,
  jobs,
  jobSnapshots,
  missions,
  profiles,
  resumeVersions,
  resumes,
  settings,
  taskCredentials,
  taskDecisions,
  taskProposals,
  taskUpdates,
} from "@/db/schema";
import { proposalSchema, taskGuardrails, updateSchema } from "./domain";

export async function taskOptions() {
  const [candidate, preferenceRows, jobRows, profileRows, versions] = await Promise.all([
    db.select().from(candidateProfiles).limit(1),
    db.select().from(settings).where(eq(settings.key, "workingPreferences")),
    db
      .select({ id: jobs.id, title: jobs.title, company: jobs.company })
      .from(jobs)
      .orderBy(desc(jobs.updatedAt))
      .limit(200),
    db
      .select({
        id: profiles.id,
        displayName: profiles.displayName,
        profileUrl: profiles.profileUrl,
      })
      .from(profiles)
      .orderBy(profiles.displayName),
    db
      .select({
        id: resumeVersions.id,
        name: resumes.name,
        label: resumeVersions.versionLabel,
        isCurrent: resumeVersions.isCurrent,
      })
      .from(resumeVersions)
      .innerJoin(resumes, eq(resumes.id, resumeVersions.resumeId))
      .where(and(eq(resumes.isActive, true), eq(resumeVersions.isCurrent, true))),
  ]);
  return {
    candidate: candidate[0] ?? null,
    context: String(preferenceRows[0]?.value.context ?? ""),
    jobs: jobRows,
    profiles: profileRows,
    resumes: versions,
  };
}
export async function readTask(id: string) {
  if (!z.uuid().safeParse(id).success) return null;
  const [task] = await db.select().from(missions).where(eq(missions.id, id));
  if (!task || task.input.workflow !== true) return null;
  const [proposals, updates, credentials] = await Promise.all([
    db
      .select({ proposal: taskProposals, decision: taskDecisions })
      .from(taskProposals)
      .leftJoin(taskDecisions, eq(taskDecisions.proposalId, taskProposals.id))
      .where(eq(taskProposals.missionId, id))
      .orderBy(desc(taskProposals.createdAt)),
    db
      .select()
      .from(taskUpdates)
      .where(eq(taskUpdates.missionId, id))
      .orderBy(desc(taskUpdates.createdAt)),
    db
      .select({
        id: taskCredentials.id,
        expiresAt: taskCredentials.expiresAt,
        revokedAt: taskCredentials.revokedAt,
      })
      .from(taskCredentials)
      .where(eq(taskCredentials.missionId, id))
      .orderBy(desc(taskCredentials.createdAt))
      .limit(1),
  ]);
  return { task, proposals, updates, credential: credentials[0] ?? null };
}
export async function taskContext(id: string) {
  const result = await readTask(id);
  if (!result) return null;
  const { task, proposals, updates } = result;
  const [candidate] = await db.select().from(candidateProfiles).limit(1);
  const jobId = task.input.jobId;
  const profileId = task.input.profileId;
  const resumeId = task.input.selectedResumeVersionId;
  const [job] =
    typeof jobId === "string" ? await db.select().from(jobs).where(eq(jobs.id, jobId)) : [];
  const [snapshot] = job
    ? await db
        .select()
        .from(jobSnapshots)
        .where(eq(jobSnapshots.jobId, job.id))
        .orderBy(desc(jobSnapshots.capturedAt))
        .limit(1)
    : [];
  const [profile] =
    typeof profileId === "string"
      ? await db.select().from(profiles).where(eq(profiles.id, profileId))
      : [];
  const [resume] =
    typeof resumeId === "string"
      ? await db
          .select({
            id: resumeVersions.id,
            filename: resumeVersions.originalFilename,
            extractedText: resumeVersions.extractedText,
            keywords: resumeVersions.keywords,
          })
          .from(resumeVersions)
          .where(eq(resumeVersions.id, resumeId))
      : [];
  return {
    task: {
      id,
      title: task.title,
      goal: task.goal,
      status: task.status,
      kind: task.input.kind,
      assistant: task.input.assistant,
    },
    preferences: task.input.context ?? "",
    guardrails: taskGuardrails,
    candidate: candidate
      ? {
          fullName: candidate.fullName,
          currentRole: candidate.currentRole,
          currentCity: candidate.currentCity,
          careerSummary: candidate.careerSummary,
          desiredRoles: candidate.desiredRoles,
          preferredLocations: candidate.preferredLocations,
          noticePeriod: candidate.noticePeriod,
          linkedinUrl: candidate.linkedinUrl,
          githubUrl: candidate.githubUrl,
          portfolioUrl: candidate.portfolioUrl,
          workAuthorization: candidate.workAuthorization,
          sponsorship: candidate.sponsorship,
          standardAnswers: candidate.standardAnswers,
          ...(task.input.kind === "APPLY"
            ? { email: candidate.primaryEmail, phone: candidate.phone }
            : {}),
        }
      : null,
    job: job ? { ...job, description: snapshot?.description ?? "" } : null,
    profile: profile
      ? {
          displayName: profile.displayName,
          profileUrl: profile.profileUrl,
          knownState: profile.knownState,
          targetState: profile.targetState,
          notes: profile.notes,
        }
      : null,
    resume: resume
      ? { ...resume, downloadUrl: `/api/v1/tasks/${id}/resume?versionId=${resume.id}` }
      : null,
    proposals: proposals.map(({ proposal, decision }) => ({
      id: proposal.id,
      summary: proposal.summary,
      payload: proposal.payload,
      decision: decision
        ? {
            decision: decision.decision,
            feedback: decision.feedback,
            createdAt: decision.createdAt,
          }
        : null,
    })),
    updates: updates.map(({ status, summary, evidenceUrl, createdAt }) => ({
      status,
      summary,
      evidenceUrl,
      createdAt,
    })),
    endpoints: {
      progress: `/api/v1/tasks/${id}/updates`,
      proposal: `/api/v1/tasks/${id}/proposals`,
      resumeUpload: `/api/v1/tasks/${id}/resume`,
      humanReview: `/tasks/${id}`,
    },
    apiGuide: {
      authentication:
        "Send the task bearer credential in Authorization on every API request. Never call human approval controls.",
      json: "Use Content-Type: application/json. Maximum 512 KiB. Reuse requestId for identical retries; changed content with that ID returns 409.",
      proposalSchema: z.toJSONSchema(proposalSchema, { io: "input", unrepresentable: "any" }),
      updateSchema: z.toJSONSchema(updateSchema, { io: "input", unrepresentable: "any" }),
      resumeUpload:
        "POST multipart/form-data with file (PDF, <=10 MiB), label (1–100 characters), requestId (1–120 characters). Identical retries return the same draft versionId. Select an original resume when creating the task first.",
      approval:
        "Proposals are newest first. Only the exact latest proposal with decision APPROVE permits external action. Re-read context before acting. EXECUTED must reference its proposalId; other statuses must omit proposalId. Only PROFILE, APPLICATION, OUTREACH and SHOWCASE have external execution. Other approved results are saved by JobOps.",
      facts:
        "Resolve unknown application answers before approval. Application job and resume IDs must match selected context. Profile before values must match recorded values. JSON schemas describe structure; server validation also enforces these checks.",
    },
  };
}
export async function listTasks(limit = 30) {
  return db.select().from(missions).orderBy(desc(missions.updatedAt)).limit(limit);
}
export async function pendingTasks() {
  return db
    .select()
    .from(missions)
    .where(inArray(missions.status, ["READY_FOR_REVIEW", "WAITING_FOR_USER"]))
    .orderBy(missions.priority, desc(missions.updatedAt))
    .limit(20);
}
