import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  activityLogs,
  applicationEvents,
  applications,
  jobs,
  missionEvidence,
  missions,
  profiles,
  resumes,
  resumeVersions,
  settings,
  taskDecisions,
  taskProposals,
  taskUpdates,
} from "@/db/schema";
import { importJobRows } from "@/features/jobs/service";
import { jobStateForApplication } from "@/features/applications/domain";
import {
  createTaskSchema,
  externalKinds,
  proposalSchema,
  stableDigest,
  taskGuardrails,
  updateSchema,
  type Proposal,
} from "./domain";
import { TaskError } from "./credentials";

export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
async function lockedTask(tx: Transaction, id: string) {
  z.uuid().parse(id);
  const [task] = await tx.select().from(missions).where(eq(missions.id, id)).for("update");
  if (!task || task.input.workflow !== true) throw new TaskError("Task not found.", 404);
  return task;
}
export async function createTask(value: unknown) {
  const data = createTaskSchema.parse(value);
  if (["TAILOR", "APPLY"].includes(data.kind) && !data.resumeVersionId)
    throw new TaskError("Select your original resume before creating this task.");
  if (data.kind === "APPLY" && !data.jobId)
    throw new TaskError("Select an opportunity before preparing an application.");
  return db.transaction(async (tx) => {
    if (
      data.jobId &&
      !(await tx.select({ id: jobs.id }).from(jobs).where(eq(jobs.id, data.jobId)))[0]
    )
      throw new TaskError("Choose an existing opportunity.");
    if (
      data.profileId &&
      !(
        await tx.select({ id: profiles.id }).from(profiles).where(eq(profiles.id, data.profileId))
      )[0]
    )
      throw new TaskError("Choose an existing profile.");
    if (
      data.resumeVersionId &&
      !(
        await tx
          .select({ id: resumeVersions.id })
          .from(resumeVersions)
          .where(
            and(eq(resumeVersions.id, data.resumeVersionId), eq(resumeVersions.isCurrent, true)),
          )
      )[0]
    )
      throw new TaskError("Choose an approved current resume.");
    const [task] = await tx
      .insert(missions)
      .values({
        type: data.kind === "FIND" ? "DISCOVER_JOBS" : "CUSTOM",
        title: data.title,
        goal: data.goal,
        status: "READY",
        entityType: data.jobId ? "JOB" : data.profileId ? "PROFILE" : "NONE",
        entityId: data.jobId ?? data.profileId,
        constraints: taskGuardrails,
        input: {
          workflow: true,
          kind: data.kind,
          assistant: data.assistant,
          context: data.context,
          jobId: data.jobId,
          profileId: data.profileId,
          selectedResumeVersionId: data.resumeVersionId,
        },
        expectedResult: { workflow: "Proposal → human decision → operator evidence" },
      })
      .returning();
    await tx.insert(activityLogs).values({
      action: "TASK_CREATED",
      entityType: "MISSION",
      entityId: task.id,
      summary: data.title,
    });
    return task;
  });
}
async function validatePayload(
  tx: Transaction,
  task: typeof missions.$inferSelect,
  payload: Proposal["payload"],
) {
  if (payload.kind === "RESUME") {
    const [evidence] = await tx
      .select()
      .from(missionEvidence)
      .where(
        and(
          eq(missionEvidence.missionId, task.id),
          eq(missionEvidence.type, "RESUME_DRAFT"),
          eq(missionEvidence.value, payload.versionId),
        ),
      );
    if (!evidence)
      throw new TaskError("Upload the proposed PDF through this task before proposing it.");
  }
  if (payload.kind === "APPLICATION") {
    if (
      payload.jobId !== task.input.jobId ||
      payload.resumeVersionId !== task.input.selectedResumeVersionId
    )
      throw new TaskError(
        "The application must use the opportunity and resume selected by you when creating this task.",
      );
    const [job] = await tx.select({ id: jobs.id }).from(jobs).where(eq(jobs.id, payload.jobId));
    const [resume] = await tx
      .select({ id: resumeVersions.id })
      .from(resumeVersions)
      .where(
        and(eq(resumeVersions.id, payload.resumeVersionId), eq(resumeVersions.isCurrent, true)),
      );
    if (!job || !resume) throw new TaskError("Choose an existing job and approved current resume.");
  }
  if (payload.kind === "PROFILE" && typeof task.input.profileId === "string") {
    const [profile] = await tx.select().from(profiles).where(eq(profiles.id, task.input.profileId));
    if (!profile || new URL(profile.profileUrl).href !== new URL(payload.targetUrl).href)
      throw new TaskError("The proposed change must target the selected profile URL.");
    for (const change of payload.changes) {
      const known = profile.knownState[change.field];
      if (
        known !== undefined &&
        (typeof known === "string" ? known : JSON.stringify(known)) !== change.before
      )
        throw new TaskError(
          "The recorded profile has changed. Ask for an updated comparison.",
          409,
        );
    }
  }
}
export async function proposeTask(id: string, value: unknown) {
  const data = proposalSchema.parse(value),
    digest = stableDigest(data);
  return db.transaction(async (tx) => {
    const task = await lockedTask(tx, id);
    const [previous] = await tx
      .select()
      .from(taskProposals)
      .where(and(eq(taskProposals.missionId, id), eq(taskProposals.requestId, data.requestId)));
    if (previous) {
      if (previous.digest !== digest)
        throw new TaskError("This request ID was already used for different content.", 409);
      return previous;
    }
    if (["COMPLETED", "CANCELLED"].includes(task.status))
      throw new TaskError("Create a new task for further work.", 409);
    await validatePayload(tx, task, data.payload);
    const [latestProposal] = await tx
      .select({ createdAt: taskProposals.createdAt })
      .from(taskProposals)
      .where(eq(taskProposals.missionId, id))
      .orderBy(desc(taskProposals.createdAt))
      .limit(1);
    const [proposal] = await tx
      .insert(taskProposals)
      .values({
        missionId: id,
        requestId: data.requestId,
        digest,
        kind: data.payload.kind,
        summary: data.summary,
        payload: data.payload,
        createdAt: new Date(Math.max(Date.now(), (latestProposal?.createdAt.getTime() ?? 0) + 1)),
      })
      .returning();
    await tx
      .update(missions)
      .set({ status: "READY_FOR_REVIEW", updatedAt: new Date() })
      .where(eq(missions.id, id));
    await tx.insert(activityLogs).values({
      action: "TASK_PROPOSAL",
      entityType: "MISSION",
      entityId: id,
      summary: data.summary,
      metadata: { proposalId: proposal.id },
    });
    return proposal;
  });
}
export async function reportTask(id: string, value: unknown) {
  const data = updateSchema.parse(value),
    digest = stableDigest(data);
  return db.transaction(async (tx) => {
    const task = await lockedTask(tx, id);
    const [previous] = await tx
      .select()
      .from(taskUpdates)
      .where(and(eq(taskUpdates.missionId, id), eq(taskUpdates.requestId, data.requestId)));
    if (previous) {
      if (previous.digest !== digest)
        throw new TaskError("This request ID was already used for different content.", 409);
      return previous;
    }
    if (["COMPLETED", "CANCELLED"].includes(task.status))
      throw new TaskError("This task is closed.", 409);
    if (data.status === "EXECUTED") {
      const [latest] = await tx
        .select()
        .from(taskProposals)
        .where(eq(taskProposals.missionId, id))
        .orderBy(desc(taskProposals.createdAt))
        .limit(1);
      const [approved] = await tx
        .select({ proposal: taskProposals, decision: taskDecisions })
        .from(taskProposals)
        .innerJoin(taskDecisions, eq(taskDecisions.proposalId, taskProposals.id))
        .where(
          and(
            eq(taskProposals.id, data.proposalId!),
            eq(taskProposals.missionId, id),
            eq(taskDecisions.decision, "APPROVE"),
          ),
        );
      if (
        !approved ||
        latest?.id !== approved.proposal.id ||
        !externalKinds.includes(approved.proposal.kind)
      )
        throw new TaskError(
          "Human approval of the latest exact external-action proposal is required.",
          409,
        );
      const [executed] = await tx
        .select({ id: taskUpdates.id })
        .from(taskUpdates)
        .where(eq(taskUpdates.proposalId, approved.proposal.id));
      if (executed)
        throw new TaskError("Execution has already been reported for this proposal.", 409);
      const applicationId = approved.decision.effects.applicationId;
      if (typeof applicationId === "string") {
        const payload = proposalSchema.shape.payload.parse(approved.proposal.payload);
        const [application] = await tx
          .select()
          .from(applications)
          .where(eq(applications.id, applicationId))
          .for("update");
        if (
          !application ||
          payload.kind !== "APPLICATION" ||
          application.jobId !== payload.jobId ||
          application.resumeVersionId !== payload.resumeVersionId ||
          application.applicationUrl !== payload.targetUrl
        )
          throw new TaskError(
            "The application changed after approval. Review its resume and destination before recording execution.",
            409,
          );
        if (["REJECTED", "WITHDRAWN", "CLOSED"].includes(application.status))
          throw new TaskError(
            "This application is closed. Review its history before recording execution.",
            409,
          );
        const status = ["DRAFT", "PREPARING", "READY_FOR_REVIEW"].includes(application.status)
          ? "APPLIED"
          : application.status;
        await tx
          .update(applications)
          .set({ status, appliedAt: application.appliedAt ?? new Date(), updatedAt: new Date() })
          .where(eq(applications.id, applicationId));
        const [job] = await tx
          .select()
          .from(jobs)
          .where(eq(jobs.id, application.jobId))
          .for("update");
        if (job && job.status !== "CLOSED")
          await tx
            .update(jobs)
            .set({ status: jobStateForApplication(status, job.status), updatedAt: new Date() })
            .where(eq(jobs.id, job.id));
        await tx.insert(applicationEvents).values({
          applicationId,
          eventType: "APPLICATION_SUBMITTED",
          source: "OPERATOR_REPORT",
          summary: data.summary,
          payload: {
            proposalId: data.proposalId,
            evidenceUrl: data.evidenceUrl,
            humanDecisionId: approved.decision.id,
          },
        });
      }
      if (approved.proposal.kind === "PROFILE" && typeof task.input.profileId === "string") {
        const p = proposalSchema.shape.payload.parse(approved.proposal.payload);
        const [profile] = await tx
          .select()
          .from(profiles)
          .where(eq(profiles.id, task.input.profileId))
          .for("update");
        await validatePayload(tx, task, p);
        if (profile && p.kind === "PROFILE")
          await tx
            .update(profiles)
            .set({
              knownState: {
                ...profile.knownState,
                ...Object.fromEntries(p.changes.map((change) => [change.field, change.after])),
              },
              lastUpdatedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(profiles.id, profile.id));
      }
    }
    const [update] = await tx
      .insert(taskUpdates)
      .values({ ...data, missionId: id, digest })
      .returning();
    // Progress must not bury an outstanding review request.
    const nextStatus =
      data.status === "EXECUTED"
        ? "COMPLETED"
        : task.status === "READY_FOR_REVIEW"
          ? "READY_FOR_REVIEW"
          : data.status;
    await tx
      .update(missions)
      .set({
        status: nextStatus,
        updatedAt: new Date(),
        ...(data.status === "EXECUTED"
          ? { completedAt: new Date() }
          : { startedAt: task.startedAt ?? new Date() }),
      })
      .where(eq(missions.id, id));
    await tx.insert(activityLogs).values({
      action: "TASK_UPDATE",
      entityType: "MISSION",
      entityId: id,
      summary: data.summary,
      metadata: { status: data.status, proposalId: data.proposalId ?? null },
    });
    return update;
  });
}
export async function decideTask(id: string, value: unknown) {
  const data = z
    .object({
      proposalId: z.uuid(),
      decision: z.enum(["APPROVE", "CHANGES", "DECLINE"]),
      feedback: z.string().trim().max(10000),
    })
    .parse(value);
  if (data.decision === "CHANGES" && !data.feedback)
    throw new TaskError("Describe what you would like changed.");
  return db.transaction(async (tx) => {
    const task = await lockedTask(tx, id);
    if (["COMPLETED", "CANCELLED"].includes(task.status))
      throw new TaskError("This task is closed. Create a new task for further work.", 409);
    const [proposal] = await tx
      .select()
      .from(taskProposals)
      .where(and(eq(taskProposals.id, data.proposalId), eq(taskProposals.missionId, id)));
    const [latest] = await tx
      .select()
      .from(taskProposals)
      .where(eq(taskProposals.missionId, id))
      .orderBy(desc(taskProposals.createdAt))
      .limit(1);
    if (!proposal || latest?.id !== proposal.id)
      throw new TaskError("A newer proposal is available. Review it first.", 409);
    const [previous] = await tx
      .select()
      .from(taskDecisions)
      .where(eq(taskDecisions.proposalId, proposal.id));
    if (previous)
      throw new TaskError(
        "This proposal already has a decision. Ask your assistant for a new revision.",
        409,
      );
    const effects: Record<string, unknown> = {};
    if (data.decision === "APPROVE") {
      const p = proposalSchema.shape.payload.parse(proposal.payload);
      await validatePayload(tx, task, p);
      if (p.kind === "OPENINGS") effects.import = await importJobRows(p.jobs, "skip", tx);
      if (p.kind === "PREFERENCES")
        await tx
          .insert(settings)
          .values({ key: "workingPreferences", value: { context: p.context } })
          .onConflictDoUpdate({
            target: settings.key,
            set: { value: { context: p.context }, updatedAt: new Date() },
          });
      if (p.kind === "RESUME") {
        const [version] = await tx
          .select()
          .from(resumeVersions)
          .where(eq(resumeVersions.id, p.versionId));
        if (!version) throw new TaskError("The proposed resume is unavailable.");
        await tx.select().from(resumes).where(eq(resumes.id, version.resumeId)).for("update");
        await tx
          .update(resumeVersions)
          .set({ isCurrent: false })
          .where(eq(resumeVersions.resumeId, version.resumeId));
        await tx
          .update(resumeVersions)
          .set({ isCurrent: true })
          .where(eq(resumeVersions.id, version.id));
        effects.resumeVersionId = version.id;
      }
      if (p.kind === "APPLICATION") {
        if (
          p.questions.length ||
          Object.values(p.answers).some((v) => !v.trim() || v.trim().toUpperCase() === "UNKNOWN")
        )
          throw new TaskError("Resolve the unanswered application questions before approving.");
        const previousApprovals = await tx
          .select({ effects: taskDecisions.effects })
          .from(taskDecisions)
          .innerJoin(taskProposals, eq(taskProposals.id, taskDecisions.proposalId))
          .where(
            and(
              eq(taskProposals.missionId, id),
              eq(taskProposals.kind, "APPLICATION"),
              eq(taskDecisions.decision, "APPROVE"),
            ),
          )
          .orderBy(desc(taskDecisions.createdAt));
        const previousId = previousApprovals.find(
          (a) => typeof a.effects.applicationId === "string",
        )?.effects.applicationId;
        if (typeof previousId === "string") {
          const [existing] = await tx
            .select()
            .from(applications)
            .where(eq(applications.id, previousId))
            .for("update");
          if (!existing || !["DRAFT", "PREPARING", "READY_FOR_REVIEW"].includes(existing.status))
            throw new TaskError(
              "This application has moved beyond preparation. Review its history before starting further work.",
              409,
            );
        }
        const values = {
          jobId: p.jobId,
          resumeVersionId: p.resumeVersionId,
          status: "READY_FOR_REVIEW" as const,
          applicationUrl: p.targetUrl,
          source: "SUPERVISED_TASK",
        };
        const [application] =
          typeof previousId === "string"
            ? await tx
                .update(applications)
                .set({ ...values, updatedAt: new Date() })
                .where(eq(applications.id, previousId))
                .returning()
            : await tx.insert(applications).values(values).returning();
        if (!application)
          throw new TaskError(
            "The task's application is unavailable. Refresh before approving.",
            409,
          );
        effects.applicationId = application.id;
        const [job] = await tx.select().from(jobs).where(eq(jobs.id, p.jobId)).for("update");
        if (job && job.status !== "CLOSED")
          await tx
            .update(jobs)
            .set({
              status: jobStateForApplication(application.status, job.status),
              updatedAt: new Date(),
            })
            .where(eq(jobs.id, job.id));
        await tx.insert(applicationEvents).values({
          applicationId: application.id,
          eventType: previousId ? "APPLICATION_PREPARATION_REVISED" : "APPLICATION_CREATED",
          source: "HUMAN_REVIEW",
          summary: "Application prepared and approved for external submission",
          payload: { proposalId: proposal.id },
        });
      }
    }
    const [decision] = await tx
      .insert(taskDecisions)
      .values({ ...data, effects })
      .returning();
    const complete =
      data.decision === "DECLINE" ||
      (data.decision === "APPROVE" && !externalKinds.includes(proposal.kind));
    await tx
      .update(missions)
      .set({
        status: complete ? "COMPLETED" : "READY",
        updatedAt: new Date(),
        completedAt: complete ? new Date() : null,
      })
      .where(eq(missions.id, id));
    await tx.insert(activityLogs).values({
      action: "TASK_HUMAN_DECISION",
      entityType: "MISSION",
      entityId: id,
      summary: `${data.decision}: ${proposal.summary}`,
      metadata: { proposalId: proposal.id, decisionId: decision.id },
    });
    return decision;
  });
}
export function browserRequestId() {
  return randomUUID();
}
