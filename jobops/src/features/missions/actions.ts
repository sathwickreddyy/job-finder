"use server";

import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import {
  activityLogs,
  applicationEvents,
  applications,
  contacts,
  jobs,
  missionEvidence,
  missionExecutions,
  missions,
  missionSteps,
  profiles,
  resumeVersions,
} from "@/db/schema";
import { actionError, formJson, formString, type ActionState } from "@/lib/actions";
import { putBuffer, removeFile } from "@/services/storage";
import {
  applyExplicitProfileResult,
  assertMissionEditable,
  discoverySchema,
  jsonRecord,
  linesFromText,
  listFromText,
  MISSION_TYPES,
  OPERATORS,
  PROFILE_FIELDS,
  profileDiff,
  resultSchema,
  terminalStatuses,
  validateResult,
  type JsonRecord,
} from "./domain";
import { missionTemplate } from "./templates";

const entityTypes = ["NONE", "JOB", "APPLICATION", "PROFILE", "CONTACT"] as const;
const stepSchema = z
  .array(
    z.object({
      title: z.string().trim().min(1).max(500),
      instruction: z.string().trim().min(1).max(20000),
      requiresApproval: z.boolean().default(false),
    }),
  )
  .min(1)
  .max(100);
const createSchema = z.object({
  type: z.enum(MISSION_TYPES),
  title: z.string().trim().min(1).max(500),
  goal: z.string().trim().min(1).max(30000),
  entityType: z.enum(entityTypes),
  entityId: z.union([z.literal(""), z.uuid()]),
  resumeVersionId: z.union([z.literal(""), z.uuid()]),
  priority: z.number().int().min(1).max(3),
  status: z.enum(["DRAFT", "READY"]),
  constraints: jsonRecord,
  input: jsonRecord,
  expectedResult: jsonRecord,
  steps: stepSchema,
});
const numberOrUndefined = (value: string) => (value ? Number(value) : undefined);
function revalidateMission(id: string) {
  for (const path of [
    "/",
    "/missions",
    `/missions/${id}`,
    `/missions/${id}/agent`,
    `/missions/${id}/result`,
    "/applications",
    "/profiles",
    "/contacts",
  ])
    revalidatePath(path);
}

export async function createMission(_previous: ActionState, form: FormData): Promise<ActionState> {
  try {
    const type = z.enum(MISSION_TYPES).parse(formString(form, "type"));
    const template = missionTemplate(type);
    const parsed = createSchema.parse({
      type,
      title: formString(form, "title"),
      goal: formString(form, "goal"),
      entityType: formString(form, "entityType") || "NONE",
      entityId: formString(form, "entityId"),
      resumeVersionId: formString(form, "resumeVersionId"),
      priority: Number(formString(form, "priority") || 2),
      status: formString(form, "status") || "READY",
      constraints: formJson(form, "constraints", template.constraints),
      input: formJson(form, "input"),
      expectedResult: formJson(form, "expectedResult", template.expectedResult),
      steps: formJson(form, "steps", template.steps),
    });
    let input = { ...parsed.input };
    // Entity references and profile baselines are resolved from database records.
    // Custom input cannot redirect an entity mutation to an unrelated record.
    for (const key of [
      "applicationId",
      "selectedResumeVersionId",
      "profileKnownState",
      "profileTargetState",
      "profileDiff",
    ])
      delete input[key];
    if (type === "DISCOVER_JOBS")
      input = {
        ...input,
        ...discoverySchema.parse({
          roles: listFromText(formString(form, "roles")),
          locations: listFromText(formString(form, "locations")),
          experienceMin: numberOrUndefined(formString(form, "experienceMin")),
          experienceMax: numberOrUndefined(formString(form, "experienceMax")),
          sources: form.getAll("sources").map(String),
          freshnessDays: Number(formString(form, "freshnessDays")),
          maxResults: Number(formString(form, "maxResults")),
          requiredKeywords: listFromText(formString(form, "requiredKeywords")),
          excludedKeywords: listFromText(formString(form, "excludedKeywords")),
          companies: listFromText(formString(form, "companies")),
          notes: formString(form, "discoveryNotes"),
        }),
      };
    if (
      ["APPLY_JOB", "PREPARE_APPLICATION", "COMPARE_RESUME"].includes(type) &&
      !parsed.resumeVersionId
    )
      throw new Error(
        "Select a resume version for this mission. Upload a resume first if the vault is empty.",
      );
    if (
      ["APPLY_JOB", "PREPARE_APPLICATION", "INSPECT_JOB", "COMPARE_RESUME"].includes(type) &&
      !["JOB", "APPLICATION"].includes(parsed.entityType)
    )
      throw new Error("Select a job or application for this mission.");
    if (["INSPECT_PROFILE", "UPDATE_PROFILE"].includes(type) && parsed.entityType !== "PROFILE")
      throw new Error("Select a portal profile for this mission.");
    if (type === "VERIFY_CONTACT" && parsed.entityType !== "CONTACT")
      throw new Error("Select the contact to verify.");
    if (parsed.entityType !== "NONE" && !parsed.entityId)
      throw new Error("Select a target entity.");
    const id = await db.transaction(async (tx) => {
      if (parsed.resumeVersionId && type !== "DISCOVER_JOBS") {
        const [version] = await tx
          .select()
          .from(resumeVersions)
          .where(eq(resumeVersions.id, parsed.resumeVersionId));
        if (!version) throw new Error("The selected resume version no longer exists.");
        input.selectedResumeVersionId = version.id;
      }
      let jobId: string | undefined;
      if (parsed.entityType === "JOB") {
        const [job] = await tx
          .select()
          .from(jobs)
          .where(eq(jobs.id, parsed.entityId))
          .for("update");
        if (!job) throw new Error("Job not found.");
        jobId = job.id;
      }
      if (parsed.entityType === "APPLICATION") {
        const [application] = await tx
          .select()
          .from(applications)
          .where(eq(applications.id, parsed.entityId));
        if (!application) throw new Error("Application not found.");
        if (
          ["APPLY_JOB", "PREPARE_APPLICATION"].includes(type) &&
          !["DRAFT", "PREPARING", "READY_FOR_REVIEW"].includes(application.status)
        )
          throw new Error(
            "This application was already submitted or closed. Use a follow-up review mission.",
          );
        jobId = application.jobId;
        input.applicationId = application.id;
      }
      if (parsed.entityType === "PROFILE") {
        const [profile] = await tx.select().from(profiles).where(eq(profiles.id, parsed.entityId));
        if (!profile) throw new Error("Profile not found.");
        input.profileKnownState = Object.fromEntries(
          Object.entries(profile.knownState).filter(([field]) =>
            (PROFILE_FIELDS as readonly string[]).includes(field),
          ),
        );
        input.profileTargetState = Object.fromEntries(
          Object.entries(profile.targetState).filter(([field]) =>
            (PROFILE_FIELDS as readonly string[]).includes(field),
          ),
        );
        input.profileDiff = profileDiff(profile.knownState, profile.targetState);
      }
      if (parsed.entityType === "CONTACT") {
        const [contact] = await tx.select().from(contacts).where(eq(contacts.id, parsed.entityId));
        if (!contact) throw new Error("Contact not found.");
      }
      if (["APPLY_JOB", "PREPARE_APPLICATION"].includes(type) && jobId && !input.applicationId) {
        const [existing] = await tx
          .select()
          .from(applications)
          .where(eq(applications.jobId, jobId))
          .orderBy(desc(applications.createdAt))
          .limit(1);
        if (existing) {
          if (!["DRAFT", "PREPARING", "READY_FOR_REVIEW"].includes(existing.status))
            throw new Error(
              "This job already has a submitted or closed application. Use its application page to review next steps.",
            );
          input.applicationId = existing.id;
        } else {
          const [application] = await tx
            .insert(applications)
            .values({
              jobId,
              resumeVersionId: parsed.resumeVersionId || null,
              status: "PREPARING",
              source: "MISSION",
            })
            .returning();
          input.applicationId = application.id;
          await tx.insert(applicationEvents).values({
            applicationId: application.id,
            eventType: "APPLICATION_CREATED",
            source: "MISSION",
            summary: "Application created from a preparation mission",
            payload: { resumeVersionId: parsed.resumeVersionId },
          });
          await tx.insert(activityLogs).values({
            action: "APPLICATION_CREATED",
            entityType: "APPLICATION",
            entityId: application.id,
            summary: "Application created from a mission",
          });
        }
      }
      if (["APPLY_JOB", "PREPARE_APPLICATION"].includes(type) && jobId) {
        const [job] = await tx.select().from(jobs).where(eq(jobs.id, jobId)).for("update");
        if (job && ["NEW", "REVIEWING", "SHORTLISTED"].includes(job.status)) {
          await tx
            .update(jobs)
            .set({ status: "PREPARING", updatedAt: new Date() })
            .where(eq(jobs.id, jobId));
          await tx.insert(activityLogs).values({
            action: "JOB_STATUS_CHANGED",
            entityType: "JOB",
            entityId: jobId,
            summary: `${job.status} → PREPARING`,
            metadata: { previousStatus: job.status, status: "PREPARING", source: "MISSION" },
          });
        }
      }
      const [mission] = await tx
        .insert(missions)
        .values({
          type,
          title: parsed.title,
          goal: parsed.goal,
          entityType: parsed.entityType,
          entityId: parsed.entityId || null,
          priority: parsed.priority,
          status: parsed.status,
          constraints: parsed.constraints,
          input,
          expectedResult: parsed.expectedResult,
        })
        .returning();
      await tx.insert(missionSteps).values(
        parsed.steps.map((step, index) => ({
          ...step,
          missionId: mission.id,
          sequence: index + 1,
        })),
      );
      await tx.insert(activityLogs).values({
        action: "MISSION_CREATED",
        entityType: "MISSION",
        entityId: mission.id,
        summary: `Created ${mission.title}`,
        metadata: { type, entityType: parsed.entityType, entityId: parsed.entityId },
      });
      return mission.id;
    });
    revalidateMission(id);
    return { redirect: `/missions/${id}` };
  } catch (error) {
    return actionError(error);
  }
}

export async function startMission(_previous: ActionState, form: FormData): Promise<ActionState> {
  try {
    const id = z.uuid().parse(formString(form, "id"));
    const operator = z.enum(OPERATORS).parse(formString(form, "operator"));
    await db.transaction(async (tx) => {
      const [mission] = await tx.select().from(missions).where(eq(missions.id, id)).for("update");
      if (!mission) throw new Error("Mission not found.");
      assertMissionEditable(mission.status);
      if (mission.status === "DRAFT") throw new Error("Make the draft READY before starting.");
      const [active] = await tx
        .select()
        .from(missionExecutions)
        .where(
          and(eq(missionExecutions.missionId, id), eq(missionExecutions.status, "IN_PROGRESS")),
        );
      if (active)
        throw new Error(
          "An execution is already in progress. Record its result before starting another attempt.",
        );
      await tx
        .insert(missionExecutions)
        .values({ missionId: id, operator, notes: formString(form, "notes") });
      await tx
        .update(missions)
        .set({
          status: "IN_PROGRESS",
          startedAt: mission.startedAt ?? new Date(),
          updatedAt: new Date(),
        })
        .where(eq(missions.id, id));
      await tx.insert(activityLogs).values({
        action: "MISSION_STARTED",
        entityType: "MISSION",
        entityId: id,
        summary: `Started ${mission.title}`,
        metadata: { operator },
      });
    });
    revalidateMission(id);
    return { success: "Execution started. Operator is recorded as metadata only." };
  } catch (error) {
    return actionError(error);
  }
}

export async function editMission(_previous: ActionState, form: FormData): Promise<ActionState> {
  try {
    const id = z.uuid().parse(formString(form, "id"));
    const parsed = z
      .object({
        title: z.string().trim().min(1).max(500),
        goal: z.string().trim().min(1).max(30000),
        priority: z.number().int().min(1).max(3),
        status: z.enum([
          "DRAFT",
          "READY",
          "IN_PROGRESS",
          "WAITING_FOR_USER",
          "READY_FOR_REVIEW",
          "CANCELLED",
        ]),
        constraints: jsonRecord,
        expectedResult: jsonRecord,
      })
      .parse({
        title: formString(form, "title"),
        goal: formString(form, "goal"),
        priority: Number(formString(form, "priority")),
        status: formString(form, "status"),
        constraints: formJson(form, "constraints"),
        expectedResult: formJson(form, "expectedResult"),
      });
    const steps = stepSchema.parse(formJson(form, "steps"));
    await db.transaction(async (tx) => {
      const [mission] = await tx.select().from(missions).where(eq(missions.id, id)).for("update");
      if (!mission) throw new Error("Mission not found.");
      assertMissionEditable(mission.status);
      const [execution] = await tx
        .select()
        .from(missionExecutions)
        .where(
          and(eq(missionExecutions.missionId, id), eq(missionExecutions.status, "IN_PROGRESS")),
        );
      if (execution && parsed.status !== "IN_PROGRESS" && parsed.status !== "CANCELLED")
        throw new Error(
          "Record a result to finish the active execution before changing its lifecycle.",
        );
      if (parsed.status === "IN_PROGRESS" && !execution)
        throw new Error("Use Start execution to record the operator before moving to IN_PROGRESS.");
      await tx
        .update(missions)
        .set({
          ...parsed,
          updatedAt: new Date(),
          ...(parsed.status === "CANCELLED" ? { completedAt: new Date() } : {}),
        })
        .where(eq(missions.id, id));
      if (parsed.status === "CANCELLED")
        await tx
          .update(missionExecutions)
          .set({ status: "CANCELLED", completedAt: new Date() })
          .where(
            and(eq(missionExecutions.missionId, id), eq(missionExecutions.status, "IN_PROGRESS")),
          );
      const previousSteps = await tx
        .select()
        .from(missionSteps)
        .where(eq(missionSteps.missionId, id));
      await tx.delete(missionSteps).where(eq(missionSteps.missionId, id));
      await tx.insert(missionSteps).values(
        steps.map((step, index) => ({
          ...step,
          missionId: id,
          sequence: index + 1,
          status:
            previousSteps.find(
              (old) =>
                old.sequence === index + 1 &&
                old.title === step.title &&
                old.instruction === step.instruction,
            )?.status ?? "PENDING",
        })),
      );
      await tx.insert(activityLogs).values({
        action: "MISSION_UPDATED",
        entityType: "MISSION",
        entityId: id,
        summary: `Updated ${parsed.title}`,
        metadata: {
          previous: {
            title: mission.title,
            goal: mission.goal,
            status: mission.status,
            constraints: mission.constraints,
          },
          next: parsed,
          previousSteps,
          nextSteps: steps,
        },
      });
    });
    revalidateMission(id);
    return { redirect: `/missions/${id}` };
  } catch (error) {
    return actionError(error);
  }
}

export async function updateMissionStep(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const id = z.uuid().parse(formString(form, "id"));
    const stepId = z.uuid().parse(formString(form, "stepId"));
    const status = z
      .enum(["PENDING", "IN_PROGRESS", "COMPLETED", "BLOCKED", "SKIPPED"])
      .parse(formString(form, "status"));
    await db.transaction(async (tx) => {
      const [mission] = await tx.select().from(missions).where(eq(missions.id, id)).for("update");
      if (!mission) throw new Error("Mission not found.");
      assertMissionEditable(mission.status);
      const [step] = await tx
        .select()
        .from(missionSteps)
        .where(and(eq(missionSteps.id, stepId), eq(missionSteps.missionId, id)));
      if (!step) throw new Error("Step not found.");
      if (step.requiresApproval && status === "COMPLETED" && form.get("approved") !== "on")
        throw new Error("Confirm human approval before completing this step.");
      await tx
        .update(missionSteps)
        .set({
          status,
          updatedAt: new Date(),
          metadata: {
            ...step.metadata,
            ...(step.requiresApproval && status === "COMPLETED"
              ? { humanApprovedAt: new Date().toISOString() }
              : {}),
          },
        })
        .where(eq(missionSteps.id, stepId));
      await tx.insert(activityLogs).values({
        action: "MISSION_STEP_UPDATED",
        entityType: "MISSION",
        entityId: id,
        summary: `${step.title}: ${status}`,
        metadata: {
          stepId,
          previousStatus: step.status,
          status,
          humanApproved: form.get("approved") === "on",
        },
      });
    });
    revalidateMission(id);
    return { success: "Step updated." };
  } catch (error) {
    return actionError(error);
  }
}

type StoredEvidence = {
  value: string;
  storagePath: string;
  type: "SCREENSHOT" | "FILE";
  metadata: JsonRecord;
};
async function evidenceUploads(form: FormData): Promise<StoredEvidence[]> {
  const files = form
    .getAll("files")
    .filter((value): value is File => value instanceof File && value.size > 0);
  if (files.length > 10) throw new Error("Upload at most 10 evidence files at once.");
  if (files.reduce((size, file) => size + file.size, 0) > 10 * 1024 * 1024)
    throw new Error(
      "Evidence files must total at most 10 MB per result. Record additional files in a separate result.",
    );
  const staged: { file: File; buffer: Buffer; extension: string; mimeType: string }[] = [];
  for (const file of files) {
    if (file.size > 10 * 1024 * 1024)
      throw new Error(`${file.name}: maximum evidence size is 10 MB.`);
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    const mime = (
      {
        png: "image/png",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        pdf: "application/pdf",
        txt: "text/plain",
        json: "application/json",
      } as Record<string, string>
    )[extension];
    if (!mime) throw new Error(`${file.name}: evidence supports PNG, JPG, PDF, TXT or JSON.`);
    const buffer = Buffer.from(await file.arrayBuffer());
    if (
      (extension === "pdf" && buffer.subarray(0, 5).toString() !== "%PDF-") ||
      (extension === "png" &&
        !buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
      (["jpg", "jpeg"].includes(extension) &&
        !(buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255))
    )
      throw new Error(`${file.name}: file content does not match its extension.`);
    if (extension === "json") {
      try {
        JSON.parse(buffer.toString("utf8"));
      } catch {
        throw new Error(`${file.name}: evidence JSON is invalid.`);
      }
    }
    staged.push({ file, buffer, extension, mimeType: mime });
  }
  const saved: StoredEvidence[] = [];
  try {
    for (const item of staged) {
      const stored = await putBuffer(item.buffer, {
        namespace: "evidence",
        extension: item.extension,
      });
      saved.push({
        value: item.file.name.slice(0, 255),
        storagePath: stored.storagePath,
        type: item.mimeType.startsWith("image/") ? "SCREENSHOT" : "FILE",
        metadata: { mimeType: item.mimeType, fileSize: stored.fileSize, sha256: stored.sha256 },
      });
    }
    return saved;
  } catch (error) {
    await Promise.all(saved.map((item) => removeFile(item.storagePath)));
    throw error;
  }
}

export async function recordMissionResult(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  let uploaded: StoredEvidence[] = [];
  let savedId: string;
  try {
    const id = z.uuid().parse(formString(form, "id"));
    const contactName = formString(form, "contactName");
    const operator = z.enum(OPERATORS).parse(formString(form, "operator") || "HUMAN");
    const input = resultSchema.parse({
      status: formString(form, "status"),
      summary: formString(form, "summary"),
      resultUrl: formString(form, "resultUrl"),
      resumeVersionId: formString(form, "resumeVersionId"),
      unknownQuestions: linesFromText(formString(form, "unknownQuestions")),
      notes: formString(form, "notes"),
      evidenceUrls: linesFromText(formString(form, "evidenceUrls")),
      applicationStage: formString(form, "applicationStage"),
      humanConfirmed: form.get("humanConfirmed") === "on",
      structuredResult: formJson(form, "structuredResult"),
      profileState: formJson(form, "profileState"),
      approvedProfileFields: form.getAll("approvedProfileFields").map(String),
      ...(contactName
        ? {
            contact: {
              name: contactName,
              title: formString(form, "contactTitle"),
              company: formString(form, "contactCompany"),
              email: formString(form, "contactEmail"),
              linkedinUrl: formString(form, "contactLinkedinUrl"),
              source: formString(form, "contactSource"),
              verificationStatus: formString(form, "contactVerificationStatus") || "UNKNOWN",
              notes: formString(form, "contactNotes"),
            },
          }
        : {}),
    });
    const [initialMission] = await db.select().from(missions).where(eq(missions.id, id));
    if (!initialMission) throw new Error("Mission not found.");
    validateResult(initialMission.status, input);
    uploaded = await evidenceUploads(form);
    await db.transaction(async (tx) => {
      const [mission] = await tx.select().from(missions).where(eq(missions.id, id)).for("update");
      if (!mission) throw new Error("Mission not found.");
      const result = validateResult(mission.status, input);
      if (
        result.applicationStage &&
        !["APPLY_JOB", "PREPARE_APPLICATION", "FOLLOW_UP_REVIEW"].includes(mission.type)
      )
        throw new Error(
          "Application updates are only available in application or follow-up missions.",
        );
      if (
        Object.keys(result.profileState).length &&
        !["INSPECT_PROFILE", "UPDATE_PROFILE"].includes(mission.type)
      )
        throw new Error("Profile state is only accepted for profile missions.");
      if (result.contact && !["FIND_CONTACT", "VERIFY_CONTACT"].includes(mission.type))
        throw new Error("Contact results are only accepted for contact missions.");
      if (result.resumeVersionId) {
        const [version] = await tx
          .select()
          .from(resumeVersions)
          .where(eq(resumeVersions.id, result.resumeVersionId));
        if (!version) throw new Error("Selected resume no longer exists.");
      }
      const [active] = await tx
        .select()
        .from(missionExecutions)
        .where(
          and(eq(missionExecutions.missionId, id), eq(missionExecutions.status, "IN_PROGRESS")),
        )
        .orderBy(desc(missionExecutions.startedAt))
        .limit(1);
      const finishedAt = new Date();
      const execution =
        active ??
        (
          await tx
            .insert(missionExecutions)
            .values({
              missionId: id,
              operator,
              status: result.status,
              completedAt: finishedAt,
              notes: "Result recorded without a previously started execution",
            })
            .returning()
        )[0];
      if (active)
        await tx
          .update(missionExecutions)
          .set({ status: result.status, completedAt: finishedAt, notes: result.summary })
          .where(eq(missionExecutions.id, active.id));
      const nextInput = {
        ...mission.input,
        ...(result.resumeVersionId ? { selectedResumeVersionId: result.resumeVersionId } : {}),
        unknownQuestions: result.unknownQuestions,
      };
      await tx
        .update(missions)
        .set({
          status: result.status,
          input: nextInput,
          completedAt: terminalStatuses.has(result.status) ? finishedAt : null,
          updatedAt: finishedAt,
        })
        .where(eq(missions.id, id));
      const evidenceMetadata: JsonRecord = {
        summary: result.summary,
        unknownQuestions: result.unknownQuestions,
        notes: result.notes,
        structuredResult: result.structuredResult,
        applicationStage: result.applicationStage || null,
        humanConfirmed: result.humanConfirmed,
        profileState: result.profileState,
        approvedProfileFields: result.approvedProfileFields,
      };
      await tx.insert(missionEvidence).values([
        {
          missionId: id,
          executionId: execution.id,
          type: "TEXT",
          value: result.summary,
          metadata: evidenceMetadata,
        },
        ...(result.resultUrl
          ? [
              {
                missionId: id,
                executionId: execution.id,
                type: "URL",
                value: result.resultUrl,
                metadata: { purpose: "result" },
              },
            ]
          : []),
        ...result.evidenceUrls.map((value) => ({
          missionId: id,
          executionId: execution.id,
          type: "URL",
          value,
          metadata: {},
        })),
        ...uploaded.map((file) => ({ ...file, missionId: id, executionId: execution.id })),
      ]);
      if (result.applicationStage) {
        const applicationId =
          mission.entityType === "APPLICATION"
            ? mission.entityId
            : typeof mission.input.applicationId === "string"
              ? mission.input.applicationId
              : null;
        if (!applicationId) throw new Error("This mission has no linked application.");
        const [application] = await tx
          .select()
          .from(applications)
          .where(eq(applications.id, applicationId))
          .for("update");
        if (!application) throw new Error("Linked application not found.");
        if (
          !["DRAFT", "PREPARING", "READY_FOR_REVIEW"].includes(application.status) &&
          ["DRAFT", "PREPARING", "READY_FOR_REVIEW", "APPLIED"].includes(result.applicationStage) &&
          result.applicationStage !== application.status
        )
          throw new Error(
            "A preparation result cannot move an already submitted application backwards. Use the application tracker for intentional corrections.",
          );
        await tx
          .update(applications)
          .set({
            status: result.applicationStage,
            ...(result.resumeVersionId ? { resumeVersionId: result.resumeVersionId } : {}),
            ...(result.resultUrl ? { applicationUrl: result.resultUrl } : {}),
            ...(result.applicationStage === "APPLIED" && !application.appliedAt
              ? { appliedAt: finishedAt }
              : {}),
            updatedAt: finishedAt,
          })
          .where(eq(applications.id, application.id));
        await tx.insert(applicationEvents).values({
          applicationId: application.id,
          eventType:
            result.applicationStage === "APPLIED" ? "APPLICATION_SUBMITTED" : "MISSION_RESULT",
          source: "MISSION",
          summary: result.summary,
          payload: {
            missionId: id,
            executionId: execution.id,
            previousStatus: application.status,
            status: result.applicationStage,
            humanConfirmed: result.humanConfirmed,
            unknownQuestions: result.unknownQuestions,
            previousResumeVersionId: application.resumeVersionId,
            resumeVersionId: result.resumeVersionId || application.resumeVersionId,
            previousApplicationUrl: application.applicationUrl,
            applicationUrl: result.resultUrl || application.applicationUrl,
          },
        });
        await tx.insert(activityLogs).values({
          action: "APPLICATION_STATUS_CHANGED",
          entityType: "APPLICATION",
          entityId: application.id,
          summary: `${application.status} → ${result.applicationStage}`,
          metadata: {
            missionId: id,
            previous: application.status,
            next: result.applicationStage,
          },
        });
        if (result.applicationStage === "APPLIED")
          await tx
            .update(jobs)
            .set({ status: "APPLIED", updatedAt: finishedAt })
            .where(eq(jobs.id, application.jobId));
      }
      if (Object.keys(result.profileState).length) {
        if (mission.entityType !== "PROFILE" || !mission.entityId)
          throw new Error("Profile mission has no linked profile.");
        const [profile] = await tx
          .select()
          .from(profiles)
          .where(eq(profiles.id, mission.entityId))
          .for("update");
        if (!profile) throw new Error("Profile not found.");
        let knownState: JsonRecord;
        let changes: ReturnType<typeof profileDiff>;
        if (mission.type === "UPDATE_PROFILE") {
          const target = jsonRecord.parse(mission.input.profileTargetState ?? profile.targetState);
          const original = jsonRecord.parse(mission.input.profileKnownState ?? {});
          for (const field of Object.keys(result.profileState)) {
            if (
              JSON.stringify(profile.knownState[field]) !== JSON.stringify(original[field]) &&
              JSON.stringify(profile.knownState[field]) !==
                JSON.stringify(result.profileState[field])
            )
              throw new Error(
                `${field} changed since this mission was created. Inspect the profile and create a new update mission.`,
              );
          }
          const updated = applyExplicitProfileResult(
            profile.knownState,
            target,
            result.profileState,
            result.approvedProfileFields,
          );
          knownState = updated.state;
          changes = updated.changes;
        } else {
          if (
            Object.keys(result.profileState).some(
              (key) => !(PROFILE_FIELDS as readonly string[]).includes(key),
            )
          )
            throw new Error("Profile inspection includes an unsupported field.");
          knownState = { ...profile.knownState, ...result.profileState };
          changes = Object.entries(result.profileState)
            .filter(
              ([field, value]) =>
                JSON.stringify(profile.knownState[field]) !== JSON.stringify(value),
            )
            .map(([field, target]) => ({
              field,
              current: profile.knownState[field] ?? "UNKNOWN",
              target,
            }));
        }
        await tx
          .update(profiles)
          .set({
            knownState,
            lastInspectedAt: finishedAt,
            ...(mission.type === "UPDATE_PROFILE" ? { lastUpdatedAt: finishedAt } : {}),
            updatedAt: finishedAt,
          })
          .where(eq(profiles.id, profile.id));
        await tx.insert(missionEvidence).values({
          missionId: id,
          executionId: execution.id,
          type: "CONFIRMATION",
          value: "Profile state recorded",
          metadata: {
            changes,
            previousState: profile.knownState,
            observedState: result.profileState,
          },
        });
        await tx.insert(activityLogs).values({
          action: mission.type === "UPDATE_PROFILE" ? "PROFILE_UPDATED" : "PROFILE_INSPECTED",
          entityType: "PROFILE",
          entityId: profile.id,
          summary: result.summary,
          metadata: { missionId: id, changes },
        });
      }
      if (result.contact) {
        if (!result.contact.company) throw new Error("Contact result requires a company.");
        const values = {
          ...result.contact,
          email: result.contact.email || null,
          linkedinUrl: result.contact.linkedinUrl || null,
          verificationSource: result.contact.source || null,
          updatedAt: finishedAt,
        };
        let contactId: string;
        let previousState: typeof contacts.$inferSelect | null = null;
        if (
          mission.type === "VERIFY_CONTACT" &&
          mission.entityType === "CONTACT" &&
          mission.entityId
        ) {
          const [contact] = await tx
            .select()
            .from(contacts)
            .where(eq(contacts.id, mission.entityId))
            .for("update");
          if (!contact) throw new Error("Contact not found.");
          previousState = contact;
          await tx.update(contacts).set(values).where(eq(contacts.id, contact.id));
          contactId = contact.id;
        } else {
          const [contact] = await tx.insert(contacts).values(values).returning();
          contactId = contact.id;
        }
        await tx.insert(activityLogs).values({
          action: mission.type === "VERIFY_CONTACT" ? "CONTACT_VERIFIED" : "CONTACT_ADDED",
          entityType: "CONTACT",
          entityId: contactId,
          summary: `Recorded ${result.contact.name}`,
          metadata: {
            missionId: id,
            previousState,
            nextState: values,
            verificationStatus: result.contact.verificationStatus,
            source: result.contact.source,
          },
        });
        await tx.insert(missionEvidence).values({
          missionId: id,
          executionId: execution.id,
          type: "CONFIRMATION",
          value: "Contact result recorded",
          metadata: { contactId, previousState, contact: result.contact },
        });
      }
      await tx.insert(activityLogs).values({
        action: terminalStatuses.has(result.status)
          ? "MISSION_COMPLETED"
          : "MISSION_RESULT_RECORDED",
        entityType: "MISSION",
        entityId: id,
        summary: `${mission.title}: ${result.summary}`,
        metadata: {
          status: result.status,
          executionId: execution.id,
          unknownQuestions: result.unknownQuestions,
        },
      });
    });
    uploaded = [];
    revalidateMission(id);
    savedId = id;
  } catch (error) {
    await Promise.all(uploaded.map((item) => removeFile(item.storagePath)));
    return actionError(error);
  }
  // Revalidation may immediately remove the result form after a terminal result.
  // Redirect on the server so navigation does not depend on that form surviving.
  redirect(`/missions/${savedId}`);
}
