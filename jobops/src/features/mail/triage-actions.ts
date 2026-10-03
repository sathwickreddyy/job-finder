"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { actionError, formString, type ActionState } from "@/lib/actions";
import {
  dismissMessages,
  linkMailToRecord,
  restoreDismissal,
  unlinkMailFromRecord,
} from "./handling-service";

function refresh(recordId?: string) {
  for (const path of [
    "/applications",
    "/companies",
    "/",
    ...(recordId ? [`/applications/${recordId}`] : []),
  ])
    revalidatePath(path);
}
const emailsNotice = (notice: string) =>
  `/applications?tab=emails&notice=${encodeURIComponent(notice)}`;

export async function dismissMail(_state: ActionState, form: FormData): Promise<ActionState> {
  let destination: string;
  try {
    const noise = formString(form, "bucket") === "noise";
    const ids = noise
      ? undefined
      : z.array(z.uuid()).min(1).parse(form.getAll("mailId").map(String));
    const count = await db.transaction((tx) => dismissMessages(tx, { ids, noise }, new Date()));
    refresh();
    destination = emailsNotice(
      count
        ? `Dismissed ${count} ${count === 1 ? "message" : "messages"}.`
        : "These messages have already been handled.",
    );
  } catch (error) {
    return actionError(error);
  }
  redirect(destination);
}

export async function undoDismiss(_state: ActionState, form: FormData): Promise<ActionState> {
  let destination: string;
  try {
    const id = z.uuid().parse(formString(form, "mailId"));
    const token = z.uuid().parse(formString(form, "dismissal"));
    const count = await db.transaction((tx) => restoreDismissal(tx, id, token));
    refresh();
    destination = emailsNotice(
      count
        ? `Restored ${count} ${count === 1 ? "message" : "messages"}.`
        : "This dismissal has already been handled.",
    );
  } catch (error) {
    return actionError(error);
  }
  redirect(destination);
}

export async function linkMailOnly(_state: ActionState, form: FormData): Promise<ActionState> {
  let destination: string;
  try {
    const mailId = z.uuid().parse(formString(form, "mailId"));
    const recordId = z.uuid().parse(formString(form, "recordId"));
    const linked = await db.transaction((tx) => linkMailToRecord(tx, mailId, recordId, new Date()));
    refresh(recordId);
    const notice = linked
      ? "Message linked to your record."
      : "Message already linked to this record.";
    destination =
      formString(form, "returnTo") === "record"
        ? `/applications/${recordId}?notice=${encodeURIComponent(notice)}`
        : emailsNotice(notice);
  } catch (error) {
    return actionError(error);
  }
  redirect(destination);
}

export async function unlinkMail(_state: ActionState, form: FormData): Promise<ActionState> {
  let destination: string;
  try {
    const mailId = z.uuid().parse(formString(form, "mailId"));
    const recordId = z.uuid().parse(formString(form, "recordId"));
    const unlinked = await db.transaction((tx) =>
      unlinkMailFromRecord(tx, mailId, recordId, new Date()),
    );
    refresh(recordId);
    destination = `/applications/${recordId}?notice=${encodeURIComponent(unlinked ? "Mail unlinked and returned to Emails. Recorded outcomes and history were kept." : "Mail already unlinked.")}`;
  } catch (error) {
    return actionError(error);
  }
  redirect(destination);
}
