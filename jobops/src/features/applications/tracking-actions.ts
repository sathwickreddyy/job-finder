"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { actionError, formString, type ActionState } from "@/lib/actions";
import { recordMethods, recordSentAt } from "./domain";
import { recordApplication } from "./record-service";
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
    const sentAt = data.state === "sent" ? recordSentAt(data.date) : null;
    const id = await db.transaction((tx) =>
      recordApplication(tx, {
        recordId: data.recordId,
        jobId: data.jobId,
        versionId: data.versionId,
        method: data.method,
        state: data.state,
        notes: data.notes,
        recipient: data.recipient,
        url: data.url,
        sentAt,
      }),
    );
    revalidatePath("/", "layout");
    destination = `/applications/${id}`;
  } catch (error) {
    return actionError(error);
  }
  // Navigate in the action: revalidation can remove a completed plan form before its client effect runs.
  redirect(destination);
}
