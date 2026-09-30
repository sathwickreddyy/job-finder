"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { missions, taskCredentials } from "@/db/schema";
import { actionError, formString, type ActionState } from "@/lib/actions";
import { createTask, decideTask, proposeTask, reportTask } from "./mutations";
import { issueTaskCredential } from "./credentials";
import { uploadTaskResume } from "./uploads";

function refresh(id?: string) {
  revalidatePath("/", "layout");
  if (id) revalidatePath(`/tasks/${id}`);
}
export async function createTaskAction(_state: ActionState, form: FormData): Promise<ActionState> {
  try {
    const task = await createTask({
      kind: formString(form, "kind"),
      title: formString(form, "title"),
      goal: formString(form, "goal"),
      assistant: formString(form, "assistant"),
      context: formString(form, "context"),
      jobId: formString(form, "jobId") || undefined,
      profileId: formString(form, "profileId") || undefined,
      resumeVersionId: formString(form, "resumeVersionId") || undefined,
    });
    refresh();
    return { redirect: `/tasks/${task.id}` };
  } catch (e) {
    return actionError(e);
  }
}
export async function decisionAction(_state: ActionState, form: FormData): Promise<ActionState> {
  try {
    const id = z.uuid().parse(formString(form, "taskId"));
    await decideTask(id, {
      proposalId: formString(form, "proposalId"),
      decision: formString(form, "decision"),
      feedback: formString(form, "feedback"),
    });
    refresh(id);
    return { success: "Your decision is saved. The task history shows the next step." };
  } catch (e) {
    return actionError(e);
  }
}
export async function generateHandoff(taskId: string) {
  try {
    return { credential: await issueTaskCredential(z.uuid().parse(taskId)) };
  } catch (e) {
    return { error: actionError(e).error };
  }
}
export async function revokeHandoff(_state: ActionState, form: FormData): Promise<ActionState> {
  try {
    const id = z.uuid().parse(formString(form, "taskId"));
    await db.transaction(async (tx) => {
      await tx.select({ id: missions.id }).from(missions).where(eq(missions.id, id)).for("update");
      await tx
        .update(taskCredentials)
        .set({ revokedAt: new Date() })
        .where(eq(taskCredentials.missionId, id));
    });
    refresh(id);
    return { success: "Agent access revoked for this task." };
  } catch (e) {
    return actionError(e);
  }
}
export async function manualProposal(_state: ActionState, form: FormData): Promise<ActionState> {
  try {
    const id = z.uuid().parse(formString(form, "taskId"));
    await proposeTask(id, {
      requestId: crypto.randomUUID(),
      summary: formString(form, "summary"),
      payload: JSON.parse(formString(form, "payload")),
    });
    refresh(id);
    return { success: "Proposal added for your review." };
  } catch (e) {
    return actionError(e);
  }
}
export async function manualUpdate(_state: ActionState, form: FormData): Promise<ActionState> {
  try {
    const id = z.uuid().parse(formString(form, "taskId"));
    await reportTask(id, {
      requestId: crypto.randomUUID(),
      status: formString(form, "status"),
      summary: formString(form, "summary"),
      proposalId:
        formString(form, "status") === "EXECUTED"
          ? formString(form, "approvedProposalId") || undefined
          : undefined,
      evidenceUrl: formString(form, "evidenceUrl") || undefined,
    });
    refresh(id);
    return { success: "Progress recorded." };
  } catch (e) {
    return actionError(e);
  }
}
export async function resumeProposal(_state: ActionState, form: FormData): Promise<ActionState> {
  try {
    const id = z.uuid().parse(formString(form, "taskId"));
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("Choose a PDF.");
    const changes = z.string().trim().min(3).max(5000).parse(formString(form, "changes"));
    const version = await uploadTaskResume(
      id,
      file,
      formString(form, "label"),
      formString(form, "requestId"),
    );
    await proposeTask(id, {
      requestId: crypto.randomUUID(),
      summary: "Proposed resume revision",
      payload: { kind: "RESUME", versionId: version.versionId, changes },
    });
    refresh(id);
    return { success: "Revision uploaded for review. Your current resume is unchanged." };
  } catch (e) {
    return actionError(e);
  }
}
