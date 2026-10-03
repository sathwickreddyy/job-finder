"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { applications } from "@/db/schema";
import { actionError, formString, type ActionState } from "@/lib/actions";
import { istDateTime } from "./dates";
import { markRecordSent, updateRecordDetails, updateRecordRound } from "./outcome-service";
import { safeReturnTo } from "./return-to";

const httpUrl = z.union([
  z.literal(""),
  z
    .url()
    .refine((value) => ["http:", "https:"].includes(new URL(value).protocol), "Use an http(s) URL"),
]);
const day = z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]);
function refresh(id?: string) {
  revalidatePath("/applications");
  if (id) revalidatePath(`/applications/${id}`);
  revalidatePath("/companies");
  revalidatePath("/");
}

export async function setFollowUp(_state: ActionState, form: FormData): Promise<ActionState> {
  try {
    const clear = formString(form, "clear") === "1";
    const data = z.object({ id: z.uuid(), day, note: z.string().trim().max(300) }).parse({
      id: formString(form, "id"),
      day: clear ? "" : formString(form, "day"),
      note: formString(form, "note"),
    });
    const at = data.day ? istDateTime(data.day, "09:00") : null;
    if (data.day && !at) throw new Error("Use a valid follow-up date.");
    const [row] = await db
      .update(applications)
      .set({
        nextActionAt: at,
        nextActionNote: at ? data.note : "",
        updatedAt: new Date(),
      })
      .where(eq(applications.id, data.id))
      .returning({ id: applications.id });
    if (!row) throw new Error("This record no longer exists.");
    refresh(data.id);
    return { success: at ? "Follow-up saved." : "Follow-up cleared." };
  } catch (error) {
    return actionError(error);
  }
}

export async function updateApplicationDetails(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const data = z
      .object({
        id: z.uuid(),
        applicationUrl: httpUrl,
        resumeVersionId: z.union([z.literal(""), z.uuid()]),
        notes: z.string().max(20000),
      })
      .parse({
        id: formString(form, "id"),
        applicationUrl: formString(form, "applicationUrl"),
        resumeVersionId: formString(form, "resumeVersionId"),
        notes: formString(form, "notes"),
      });
    await db.transaction((tx) => updateRecordDetails(tx, data, new Date()));
    refresh(data.id);
    return { success: "Details saved." };
  } catch (error) {
    return actionError(error);
  }
}

export async function updateRound(_state: ActionState, form: FormData): Promise<ActionState> {
  try {
    const data = z
      .object({
        id: z.uuid(),
        name: z.string().trim().max(200),
        day,
        time: z.union([z.literal(""), z.string().regex(/^\d{2}:\d{2}$/)]),
        notes: z.string().trim().max(5000),
      })
      .parse({
        id: formString(form, "id"),
        name: formString(form, "name"),
        day: formString(form, "day"),
        time: formString(form, "time"),
        notes: formString(form, "notes"),
      });
    const id = await db.transaction((tx) => updateRecordRound(tx, data, new Date()));
    refresh(id);
    return { success: "Round updated." };
  } catch (error) {
    return actionError(error);
  }
}

export async function recordAsSent(_state: ActionState, form: FormData): Promise<ActionState> {
  try {
    const data = z.object({ id: z.uuid(), sentDate: day, humanConfirmed: z.boolean() }).parse({
      id: formString(form, "id"),
      sentDate: formString(form, "sentDate"),
      humanConfirmed: ["on", "1"].includes(formString(form, "humanConfirmed")),
    });
    await db.transaction((tx) => markRecordSent(tx, data, new Date()));
    refresh(data.id);
    return {
      success: "Recorded as sent.",
      redirect: safeReturnTo(formString(form, "returnTo")) ?? `/applications/${data.id}`,
    };
  } catch (error) {
    return actionError(error);
  }
}
