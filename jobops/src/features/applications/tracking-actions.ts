"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { activityLogs, applicationEvents, applications, jobs, resumeVersions } from "@/db/schema";
import { actionError, formString, type ActionState } from "@/lib/actions";
import { methodNames, recordIntent, recordMethods, recordSentAt } from "./domain";
export async function recordAction(_state: ActionState, form: FormData): Promise<ActionState> {
  let destination: string;
  try {
    const data = z
      .object({
        recordId: z.uuid().nullable(),
        jobId: z.uuid(),
        versionId: z.uuid().nullable(),
        method: z.enum(recordMethods),
        state: z.enum(["planned", "sent"]),
        notes: z.string().max(20000),
        recipient: z.string().max(1000),
        url: z.union([
          z.literal(""),
          z.url().refine((value) => ["http:", "https:"].includes(new URL(value).protocol)),
        ]),
        date: z.string(),
      })
      .parse({
        recordId: formString(form, "recordId") || null,
        jobId: formString(form, "jobId"),
        versionId: formString(form, "resumeVersionId") || null,
        method: formString(form, "method"),
        state: formString(form, "recordState"),
        notes: formString(form, "notes"),
        recipient: formString(form, "recipient"),
        url: formString(form, "applicationUrl"),
        date: formString(form, "sentDate"),
      });
    const intent = recordIntent(data.method, data.state === "sent");
    const sentAt = data.state === "sent" ? recordSentAt(data.date) : null;
    const id = await db.transaction(async (tx) => {
      const [job] = await tx.select().from(jobs).where(eq(jobs.id, data.jobId));
      if (!job) throw new Error("Choose an existing opening.");
      if (data.versionId) {
        const [version] = await tx
          .select()
          .from(resumeVersions)
          .where(eq(resumeVersions.id, data.versionId));
        if (!version) throw new Error("Choose an existing resume file.");
      }
      const values = {
        jobId: data.jobId,
        resumeVersionId: data.versionId,
        source: data.method,
        status: intent.status,
        appliedAt: intent.applied ? sentAt : null,
        applicationUrl: data.url || null,
        notes: data.notes,
      };
      let recordId: string;
      if (data.recordId) {
        const [previous] = await tx
          .select()
          .from(applications)
          .where(eq(applications.id, data.recordId))
          .for("update");
        if (!previous || previous.jobId !== data.jobId || previous.source !== data.method)
          throw new Error("This record does not match the selected opening and method.");
        const history = await tx
          .select({ type: applicationEvents.eventType })
          .from(applicationEvents)
          .where(eq(applicationEvents.applicationId, previous.id));
        if (previous.appliedAt || history.some((event) => event.type === "OUTREACH_SENT"))
          throw new Error(
            "This action is already recorded as sent. Add a timeline note for a follow-up.",
          );
        await tx
          .update(applications)
          .set({
            ...values,
            status: ["DRAFT", "PREPARING", "READY_FOR_REVIEW"].includes(previous.status)
              ? values.status
              : previous.status,
            updatedAt: new Date(),
          })
          .where(eq(applications.id, previous.id));
        recordId = previous.id;
      } else {
        const [record] = await tx
          .insert(applications)
          .values(values)
          .returning({ id: applications.id });
        recordId = record.id;
      }
      await tx.insert(applicationEvents).values({
        applicationId: recordId,
        eventType: intent.eventType,
        occurredAt: sentAt ?? new Date(),
        summary: `${methodNames[data.method]} ${data.state === "sent" ? "recorded as sent" : "planned"} for ${job.company} — ${job.title}`,
        payload: {
          method: data.method,
          sentAt: sentAt?.toISOString() ?? null,
          recipient: data.recipient,
          resumeVersionId: data.versionId,
          humanConfirmed: data.state === "sent",
        },
      });
      if (intent.applied)
        await tx
          .update(jobs)
          .set({ status: "APPLIED", updatedAt: new Date() })
          .where(eq(jobs.id, data.jobId));
      await tx.insert(activityLogs).values({
        action: "JOB_ACTION_RECORDED",
        entityType: "APPLICATION",
        entityId: recordId,
        summary: `Recorded ${methodNames[data.method]} for ${job.company}`,
      });
      return recordId;
    });
    revalidatePath("/", "layout");
    destination = `/applications/${id}`;
  } catch (error) {
    return actionError(error);
  }
  // Navigate in the action: revalidation can remove a completed plan form before its client effect runs.
  redirect(destination);
}
