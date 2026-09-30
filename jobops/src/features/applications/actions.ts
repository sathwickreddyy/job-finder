"use server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  applications,
  applicationEvents,
  applicationStages,
  jobs,
  activityLogs,
  resumeVersions,
} from "@/db/schema";
import { type ActionState, actionError, formString } from "@/lib/actions";
import { applicationTransition, jobStateForApplication } from "./domain";
const inputSchema = z.object({
  jobId: z.uuid(),
  resumeVersionId: z.uuid().nullable(),
  status: z.enum(applicationStages),
  applicationUrl: z.union([
    z.literal(""),
    z.url().refine((v) => ["http:", "https:"].includes(new URL(v).protocol), "Use an http(s) URL"),
  ]),
  notes: z.string().max(20000),
  nextActionAt: z
    .string()
    .refine((v) => !v || !Number.isNaN(new Date(v).valueOf()), "Use a valid follow-up date"),
  humanConfirmed: z.boolean(),
});
function input(form: FormData) {
  return inputSchema.parse({
    jobId: formString(form, "jobId"),
    resumeVersionId: formString(form, "resumeVersionId") || null,
    status: formString(form, "status"),
    applicationUrl: formString(form, "applicationUrl"),
    notes: formString(form, "notes"),
    nextActionAt: formString(form, "nextActionAt"),
    humanConfirmed: formString(form, "humanConfirmed") === "on",
  });
}
export async function createApplication(_state: ActionState, form: FormData): Promise<ActionState> {
  try {
    const data = input(form);
    if (data.status === "APPLIED") applicationTransition("DRAFT", data.status, data.humanConfirmed);
    const id = await db.transaction(async (tx) => {
      const [job] = await tx.select().from(jobs).where(eq(jobs.id, data.jobId)).limit(1);
      if (!job) throw new Error("Choose an existing job.");
      if (data.resumeVersionId) {
        const [version] = await tx
          .select({ id: resumeVersions.id })
          .from(resumeVersions)
          .where(eq(resumeVersions.id, data.resumeVersionId));
        if (!version) throw new Error("Selected resume no longer exists.");
      }
      const [app] = await tx
        .insert(applications)
        .values({
          jobId: data.jobId,
          resumeVersionId: data.resumeVersionId,
          status: data.status,
          notes: data.notes,
          applicationUrl: data.applicationUrl || null,
          nextActionAt: data.nextActionAt ? new Date(data.nextActionAt) : null,
          appliedAt: data.status === "APPLIED" ? new Date() : null,
        })
        .returning();
      await tx.insert(applicationEvents).values({
        applicationId: app.id,
        eventType: "APPLICATION_CREATED",
        summary: `Created application for ${job.company} — ${job.title}`,
        payload: { stage: data.status, resumeVersionId: data.resumeVersionId },
      });
      if (data.status === "APPLIED")
        await tx.insert(applicationEvents).values({
          applicationId: app.id,
          eventType: "APPLICATION_SUBMITTED",
          summary: "Human confirmed final submission",
          payload: { humanConfirmed: true },
        });
      await tx
        .update(jobs)
        .set({ status: jobStateForApplication(data.status, job.status), updatedAt: new Date() })
        .where(eq(jobs.id, job.id));
      await tx.insert(activityLogs).values({
        action: "APPLICATION_CREATED",
        entityType: "APPLICATION",
        entityId: app.id,
        summary: `Created ${job.company} application`,
      });
      return app.id;
    });
    revalidatePath("/applications");
    revalidatePath("/jobs");
    revalidatePath("/");
    return { redirect: `/applications/${id}` };
  } catch (e) {
    return actionError(e);
  }
}
export async function updateApplication(_state: ActionState, form: FormData): Promise<ActionState> {
  try {
    const id = z.uuid().parse(formString(form, "id"));
    const data = input(form);
    await db.transaction(async (tx) => {
      const [previous] = await tx
        .select()
        .from(applications)
        .where(eq(applications.id, id))
        .for("update");
      if (!previous) throw new Error("Application no longer exists.");
      if (previous.jobId !== data.jobId)
        throw new Error("The application's job cannot be changed.");
      if (previous.appliedAt && previous.resumeVersionId !== data.resumeVersionId)
        throw new Error(
          "The resume used for a submitted application stays fixed. Record a separate action for another file.",
        );
      if (
        ["REFERRAL", "COLD_EMAIL", "LINKEDIN_MESSAGE"].includes(previous.source) &&
        data.status === "APPLIED"
      )
        throw new Error("Record a direct application separately from outreach.");
      const event = applicationTransition(previous.status, data.status, data.humanConfirmed);
      await tx
        .update(applications)
        .set({
          status: data.status,
          resumeVersionId: data.resumeVersionId,
          applicationUrl: data.applicationUrl || null,
          notes: data.notes,
          nextActionAt: data.nextActionAt ? new Date(data.nextActionAt) : null,
          appliedAt:
            data.status === "APPLIED" ? (previous.appliedAt ?? new Date()) : previous.appliedAt,
          updatedAt: new Date(),
        })
        .where(eq(applications.id, id));
      await tx.insert(applicationEvents).values({
        applicationId: id,
        eventType: event.eventType,
        summary: event.summary,
        payload: {
          ...event.payload,
          previousResumeVersionId: previous.resumeVersionId,
          resumeVersionId: data.resumeVersionId,
          previousNextActionAt: previous.nextActionAt,
          nextActionAt: data.nextActionAt,
          previousNotes: previous.notes,
          notes: data.notes,
        },
      });
      if (data.status === "APPLIED")
        await tx
          .update(jobs)
          .set({ status: "APPLIED", updatedAt: new Date() })
          .where(eq(jobs.id, previous.jobId));
      await tx.insert(activityLogs).values({
        action: "APPLICATION_UPDATED",
        entityType: "APPLICATION",
        entityId: id,
        summary: event.summary,
      });
    });
    revalidatePath(`/applications/${id}`);
    revalidatePath("/applications");
    revalidatePath("/");
    return { success: "Application saved and event appended." };
  } catch (e) {
    return actionError(e);
  }
}
export async function addApplicationNote(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const data = z
      .object({ id: z.uuid(), summary: z.string().trim().min(1).max(20000) })
      .parse({ id: formString(form, "id"), summary: formString(form, "summary") });
    await db.transaction(async (tx) => {
      await tx
        .insert(applicationEvents)
        .values({ applicationId: data.id, eventType: "MANUAL_NOTE", summary: data.summary });
      await tx.insert(activityLogs).values({
        action: "APPLICATION_NOTE",
        entityType: "APPLICATION",
        entityId: data.id,
        summary: "Added application timeline note",
      });
    });
    revalidatePath(`/applications/${data.id}`);
    return { success: "Timeline note added." };
  } catch (e) {
    return actionError(e);
  }
}
