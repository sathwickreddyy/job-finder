"use server";

import { revalidatePath } from "next/cache";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  mailConnections,
  mailTracking,
  mailMessages,
  mailEvents,
  settings,
  applicationEvents,
  activityLogs,
} from "@/db/schema";
import { actionError, formString, type ActionState } from "@/lib/actions";
import { loadMailContext, ruleKey, ruleSchema } from "./context";
import {
  scanConnection,
  ScanFailure,
  scanKey,
  scanRuleRevision,
  retainDisposition,
  type ScanScope,
} from "./scan-service";
import { reconcileLegacyMail } from "./workspace-read";
import { matchMail } from "./matching";

function invalidate() {
  for (const path of ["/mail", "/applications", "/companies", "/settings", "/"])
    revalidatePath(path);
}
const scopeSchema = z.object({
  company: z.string().max(300).optional(),
  application: z.uuid().optional(),
  account: z.email().optional(),
});
export async function checkWorkspaceMail(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const mode = z
      .enum(["latest", "history"])
      .parse(formString(form, "mode") || "latest");
    const scope: ScanScope = scopeSchema.parse(
      Object.fromEntries(
        ["company", "application", "account"].flatMap((key) =>
          formString(form, key) ? [[key, formString(form, key)]] : [],
        ),
      ),
    );
    const context = await loadMailContext();
    if (
      scope.company &&
      !context.companies.some((company) => company.id === scope.company)
    )
      throw new Error("Choose an existing company.");
    if (
      scope.application &&
      !context.applications.some((app) => app.id === scope.application)
    )
      throw new Error("Choose an existing application.");
    await reconcileLegacyMail(context);
    const connections = await db
      .select()
      .from(mailConnections)
      .where(
        scope.account ? eq(mailConnections.email, scope.account) : undefined,
      );
    if (!connections.length)
      throw new Error("Connect an inbox before checking mail.");
    const saved = await db
      .select()
      .from(settings)
      .where(
        inArray(
          settings.key,
          connections.map((connection) => scanKey(connection.id, mode, scope)),
        ),
      );
    const revision = scanRuleRevision(context);
    const stateOf = (id: string) =>
      saved.find(
        (row) =>
          row.key === scanKey(id, mode, scope) &&
          row.value.rulesRevision === revision,
      )?.value;
    const continuing = connections.some(
      (connection) => stateOf(connection.id)?.complete === false,
    );
    const active = continuing
      ? connections.filter(
          (connection) => stateOf(connection.id)?.complete !== true,
        )
      : connections;
    const results = await Promise.allSettled(
      active.map((connection) =>
        scanConnection(connection, mode, scope, context),
      ),
    );
    const done = results.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : [],
    );
    const failures = results.flatMap((result, index) =>
      result.status === "rejected"
        ? [`${active[index].email}: ${actionError(result.reason).error}`]
        : [],
    );
    const committed = results.flatMap((result) =>
      result.status === "fulfilled"
        ? [result.value]
        : result.reason instanceof ScanFailure
          ? [result.reason.result]
          : [],
    );
    const arrived = committed.reduce((sum, result) => sum + result.arrived, 0);
    const historical = committed.reduce(
      (sum, result) => sum + result.historical,
      0,
    );
    const more = committed.some((result) => result.more);
    const matches = `${historical} older ${historical === 1 ? "match" : "matches"}`;
    const summary = `${done.length + connections.length - active.length} of ${connections.length} accounts checked. ${mode === "history" ? `${matches} saved to History` : `${arrived} new ${arrived === 1 ? "update" : "updates"}; ${matches} kept in History`}.${more ? " More mail remains; continue the check to resume saved pages." : ""}${failures.length ? ` Needs attention: ${failures.join(" ")}` : ""}`;
    invalidate();
    return {
      ...(done.length ? { success: summary } : { error: summary }),
      mailRefresh: { arrived, completedAt: new Date().toISOString() },
      mailScan: {
        more,
        scanned: committed.reduce((sum, row) => sum + row.scanned, 0),
        historical,
        failed: failures.length > 0,
      },
    };
  } catch (error) {
    invalidate();
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
        updated,
        { historical: true, seen: true },
      );
      if (
        !tracking.companyKeys.includes(key) &&
        !decision.companyKeys.includes(key)
      )
        continue;
      await db
        .update(mailTracking)
        .set({
          ...decision,
          disposition: retainDisposition(tracking, decision),
          updatedAt: new Date(),
        })
        .where(eq(mailTracking.id, tracking.id));
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
      await tx
        .update(mailTracking)
        .set({ disposition: "history", updatedAt: new Date() })
        .where(eq(mailTracking.id, id));
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
          disposition: "history",
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
