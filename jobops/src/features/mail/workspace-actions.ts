"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  mailTracking,
  mailMessages,
  mailEvents,
  settings,
  applicationEvents,
  activityLogs,
} from "@/db/schema";
import { actionError, formString, type ActionState } from "@/lib/actions";
import { loadMailContext, ruleKey, ruleSchema } from "./context";
import { checkMailStep, type CheckResult } from "./check-service";
import { matchMail } from "./matching";

function invalidate() {
  for (const path of ["/mail", "/applications", "/companies", "/settings", "/"])
    revalidatePath(path);
}
/** One Check mail step across all accounts; the page loops while `mailCheck.more`. */
export async function checkMail(): Promise<ActionState & { mailCheck?: CheckResult }> {
  try {
    const mailCheck = await checkMailStep();
    invalidate();
    return {
      mailCheck,
      mailRefresh: { arrived: mailCheck.newAttention, completedAt: new Date().toISOString() },
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function saveWorkspaceRule(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const key = formString(form, "company");
    const context = await loadMailContext();
    const company = context.companies.find((row) => row.id === key);
    if (!company) throw new Error("Choose an existing company.");
    const rule = ruleSchema.parse(
      Object.fromEntries(
        ["aliases", "domains", "senders", "subjectTerms", "excludedTerms"].map(
          (field) => [
            field,
            formString(form, field)
              .split(",")
              .map((entry) => entry.trim())
              .filter(Boolean),
          ],
        ),
      ),
    );
    await db
      .insert(settings)
      .values({
        key: ruleKey(key),
        value: { rule, revisedAt: new Date().toISOString() },
      })
      .onConflictDoUpdate({
        target: settings.key,
        set: {
          value: { rule, revisedAt: new Date().toISOString() },
          updatedAt: new Date(),
        },
      });
    const updated = await loadMailContext();
    const savedCompany = updated.companies.find((item) => item.id === key)!;
    const scoped = { ...updated, companies: [savedCompany] };
    // Re-evaluate retained content without deleting anything or promoting history.
    const rows = await db
      .select({ tracking: mailTracking, message: mailMessages })
      .from(mailTracking)
      .innerJoin(mailMessages, eq(mailTracking.messageId, mailMessages.id));
    for (const { tracking, message } of rows) {
      if (message.linkedApplicationId) continue;
      const decision = matchMail(
        {
          ...message,
          externalId: tracking.providerMessageId,
          threadId: message.threadId ?? undefined,
          folders: tracking.folders,
          bodyText: message.bodyText ?? "",
          receivedAt: message.receivedAt.toISOString(),
        },
        scoped,
        { historical: true, seen: true, threadApplications: tracking.threadId ? tracking.applicationIds : [] },
      );
      if (
        !tracking.companyKeys.includes(key) &&
        !decision.companyKeys.includes(key)
      )
        continue;
      const otherKeys = tracking.companyKeys.filter((company) => company !== key);
      const keep = decision.disposition !== "excluded" && decision.companyKeys.includes(key);
      await db.update(mailTracking).set({
        companyKeys: [...new Set([...otherKeys, ...(keep ? [key] : [])])],
        applicationIds: [...new Set([...tracking.applicationIds.filter((id) => !updated.applications.some((app) => app.id === id && app.company === key)), ...(keep ? decision.applicationIds : [])])],
        reason: otherKeys.length ? tracking.reason : decision.reason,
        evidence: otherKeys.length ? tracking.evidence : decision.evidence,
        updatedAt: new Date(),
      }).where(eq(mailTracking.id, tracking.id));
    }
    invalidate();
    return {
      success:
        "Company pattern saved. Tracked mail will not become new again. Run a mail check or history scan to use this pattern.",
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function reviewWorkspaceMail(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const id = z.uuid().parse(formString(form, "id"));
    await db.transaction(async (tx) => {
      const [tracking] = await tx
        .select()
        .from(mailTracking)
        .where(eq(mailTracking.id, id))
        .for("update");
      if (!tracking) throw new Error("This message no longer exists.");
      if (tracking.disposition === "excluded") return;
      if (tracking.messageId) {
        await tx
          .update(mailMessages)
          .set({ attentionState: "DONE", processedAt: new Date() })
          .where(eq(mailMessages.id, tracking.messageId));
        await tx
          .update(mailEvents)
          .set({ status: "REVIEWED" })
          .where(eq(mailEvents.mailMessageId, tracking.messageId));
      }
      await tx.insert(activityLogs).values({
        action: "MAIL_REVIEWED",
        entityType: "MAIL",
        entityId: tracking.messageId,
        summary: "Reviewed mail and retained it in history",
      });
    });
    invalidate();
    return {
      success: "Reviewed and kept in History. It will not appear as new again.",
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function associateWorkspaceMail(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const id = z.uuid().parse(formString(form, "id"));
    const applicationId = z.uuid().parse(formString(form, "application"));
    const context = await loadMailContext();
    const app = context.applications.find((row) => row.id === applicationId);
    if (!app) throw new Error("Choose an existing application.");
    await db.transaction(async (tx) => {
      const [tracking] = await tx
        .select()
        .from(mailTracking)
        .where(eq(mailTracking.id, id))
        .for("update");
      if (
        !tracking?.messageId ||
        tracking.disposition === "excluded" ||
        (tracking.companyKeys.length > 0 &&
          !tracking.companyKeys.includes(app.company))
      )
        throw new Error(
          "Only a matched company message can be linked to this application.",
        );
      const [message] = await tx
        .select()
        .from(mailMessages)
        .where(eq(mailMessages.id, tracking.messageId))
        .for("update");
      if (
        message.linkedApplicationId &&
        message.linkedApplicationId !== applicationId
      )
        throw new Error(
          "This message is already linked to another application. Unlink it from that record first.",
        );
      await tx
        .update(mailTracking)
        .set({
          applicationIds: [applicationId],
          companyKeys: [app.company],
          updatedAt: new Date(),
        })
        .where(eq(mailTracking.id, id));
      if (message.linkedApplicationId === applicationId) return;
      await tx
        .update(mailMessages)
        .set({
          linkedApplicationId: applicationId,
          attentionState: "DONE",
          processedAt: new Date(),
        })
        .where(eq(mailMessages.id, message.id));
      await tx
        .update(mailEvents)
        .set({ linkedApplicationId: applicationId, status: "REVIEWED" })
        .where(eq(mailEvents.mailMessageId, message.id));
      await tx.insert(applicationEvents).values({
        applicationId,
        eventType: "MAIL_LINKED",
        occurredAt: message.receivedAt,
        summary: `Mail linked: ${message.subject}`,
        payload: { mailMessageId: message.id },
      });
    });
    invalidate();
    revalidatePath(`/applications/${applicationId}`);
    return {
      success:
        "Message linked to the application and kept in History. Application outcomes are unchanged.",
    };
  } catch (error) {
    return actionError(error);
  }
}
