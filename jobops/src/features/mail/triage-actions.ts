"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import {
  safePageReturnTo,
  safeReturnTo,
  safeRowReturnTo,
  withNotice,
} from "@/features/applications/return-to";
import { actionError, formString, type ActionState } from "@/lib/actions";
import { unlinkMailWithUndo } from "./auto-apply";
import { dismissMessages, linkMailToRecord } from "./handling-service";

function refresh(recordId?: string) {
  for (const path of [
    "/applications",
    "/companies",
    "/mail",
    "/",
    ...(recordId ? [`/applications/${recordId}`] : []),
  ])
    revalidatePath(path);
}
const emailsNotice = (notice: string) => `/mail?notice=${encodeURIComponent(notice)}`;

export async function dismissMail(_state: ActionState, form: FormData): Promise<ActionState> {
  let destination: string;
  try {
    const noise = formString(form, "bucket") === "noise";
    const ids = noise
      ? undefined
      : z.array(z.uuid()).min(1).parse(form.getAll("mailId").map(String));
    const count = await db.transaction((tx) => dismissMessages(tx, { ids, noise }, new Date()));
    refresh();
    const notice = count
      ? `Dismissed ${count} ${count === 1 ? "message" : "messages"}.`
      : "These messages have already been handled.";
    const back = safeReturnTo(formString(form, "returnTo"));
    destination = back ? withNotice(back, notice) : emailsNotice(notice);
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
    const returnTo = formString(form, "returnTo");
    const row = safeRowReturnTo(returnTo);
    const back = safeReturnTo(returnTo) ?? safePageReturnTo(returnTo);
    destination =
      returnTo === "record"
        ? `/applications/${recordId}?notice=${encodeURIComponent(notice)}`
        : row
          ? withNotice(row, notice)
          : back
            ? withNotice(back, notice)
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
      unlinkMailWithUndo(tx, mailId, recordId, new Date()),
    );
    refresh(recordId);
    const notice = unlinked
      ? "Mail unlinked and returned to Emails. Recorded outcomes and history were kept."
      : "Mail already unlinked.";
    const row = safeRowReturnTo(formString(form, "returnTo"));
    destination = row
      ? withNotice(row, notice)
      : `/applications/${recordId}?notice=${encodeURIComponent(notice)}`;
  } catch (error) {
    return actionError(error);
  }
  redirect(destination);
}
