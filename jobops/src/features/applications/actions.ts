"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { applicationEvents, activityLogs } from "@/db/schema";
import { type ActionState, actionError, formString } from "@/lib/actions";
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
