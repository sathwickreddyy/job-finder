"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { activityLogs, mailMessages } from "@/db/schema";
import { actionError, formString, type ActionState } from "@/lib/actions";
export async function setMailAttention(_state: ActionState, form: FormData): Promise<ActionState> {
  try {
    const id = z.uuid().parse(formString(form, "id"));
    const state = z.enum(["OPEN", "DONE"]).parse(formString(form, "state"));
    await db.transaction(async (tx) => {
      const [message] = await tx
        .update(mailMessages)
        .set({ attentionState: state })
        .where(eq(mailMessages.id, id))
        .returning();
      if (!message) throw new Error("Message not found.");
      await tx.insert(activityLogs).values({
        action: "MAIL_ATTENTION_UPDATED",
        entityType: "MAIL",
        entityId: id,
        summary: state === "DONE" ? "Mail action marked done" : "Mail action reopened",
      });
    });
    revalidatePath("/", "layout");
    return {
      success:
        state === "DONE" ? "Marked done. The original message is retained." : "Message reopened.",
    };
  } catch (error) {
    return actionError(error);
  }
}
