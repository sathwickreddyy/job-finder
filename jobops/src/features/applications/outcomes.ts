"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { actionError, formString, type ActionState } from "@/lib/actions";
import { applyOutcome } from "./outcome-service";
import { outcomeDetail, outcomeMeta } from "./phase";

export async function recordOutcome(_state: ActionState, form: FormData): Promise<ActionState> {
  try {
    const applicationId = z.uuid().parse(formString(form, "id"));
    const mailId = formString(form, "mailId");
    if (formString(form, "mailIntent") === "link" && !mailId)
      throw new Error(
        "The source message is missing. Return to Emails or explicitly record an outcome manually.",
      );
    const mailMessageId = mailId ? z.uuid().parse(mailId) : undefined;
    const now = new Date();
    const optional = (key: string) => formString(form, key) || undefined;
    const { id, detail } = outcomeDetail(
      {
        outcome: formString(form, "outcome") as never,
        kind: optional("kind") as never,
        day: optional("day"),
        time: optional("time"),
        name: formString(form, "name"),
        note: formString(form, "note"),
        happenedOn: optional("happenedOn"),
      },
      now,
    );
    await db.transaction((tx) =>
      applyOutcome(
        tx,
        { applicationId, outcome: id, detail, ...(mailMessageId ? { mailMessageId } : {}) },
        now,
      ),
    );
    for (const path of ["/applications", `/applications/${applicationId}`, "/companies", "/"])
      revalidatePath(path);
    return {
      success: `Saved: ${outcomeMeta[id].label}.`,
      redirect: `/applications/${applicationId}`,
    };
  } catch (error) {
    return actionError(error);
  }
}
