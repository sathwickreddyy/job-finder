"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { activityLogs, applicationEvents, applications, jobs, resumeVersions } from "@/db/schema";
import { actionError, formString, type ActionState } from "@/lib/actions";
import { indiaDayBoundary } from "@/features/mail/attention";
import { methodNames, recordIntent, recordMethods } from "./domain";
export async function recordAction(_state: ActionState, form: FormData): Promise<ActionState> {
  try {
    const data = z
      .object({
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
    const sentAt =
      data.state === "sent" ? (data.date ? indiaDayBoundary(data.date) : new Date()) : null;
    if (data.date && !indiaDayBoundary(data.date))
      throw new Error("Use a valid sent date in India time.");
    if (sentAt && sentAt.valueOf() > Date.now())
      throw new Error("A sent date cannot be in the future.");
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
      const [record] = await tx
        .insert(applications)
        .values({
          jobId: data.jobId,
          resumeVersionId: data.versionId,
          source: data.method,
          status: intent.status,
          appliedAt: intent.applied ? sentAt : null,
          applicationUrl: data.url || null,
          notes: data.notes,
        })
        .returning();
      await tx.insert(applicationEvents).values({
        applicationId: record.id,
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
        entityId: record.id,
        summary: `Recorded ${methodNames[data.method]} for ${job.company}`,
      });
      return record.id;
    });
    revalidatePath("/", "layout");
    return { redirect: `/applications/${id}` };
  } catch (error) {
    return actionError(error);
  }
}
