"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { mailMessages, settings } from "@/db/schema";
import { outcomeDetail, type OutcomeId } from "@/features/applications/phase";
import { actionError, formString, type ActionState } from "@/lib/actions";
import type { RoundKind } from "@/lib/round-kinds";
import { companyRuleSchema, loadMailContext, ruleKey } from "./context";
import { checkMailStep, type CheckResult } from "./check-service";
import { handleMail, updateMail } from "./handle-service";
import { notExcluded } from "./mail-list";
import { matchMail } from "./matching";

function invalidate() {
  for (const path of ["/mail", "/applications", "/companies", "/settings", "/"])
    revalidatePath(path);
  // Company pages show the same timeline and handle mail in place.
  revalidatePath("/companies/[slug]", "page");
}
/**
 * One Fetch new mail step across all accounts; the page loops while `mailCheck.more`.
 * `lastDays` starts a new window on the first step only.
 */
export async function checkMail(
  lastDays?: number,
): Promise<ActionState & { mailCheck?: CheckResult }> {
  try {
    const mailCheck = await checkMailStep({ lastDays });
    invalidate();
    return { mailCheck };
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
    const parsed = companyRuleSchema(company.name).safeParse(
      Object.fromEntries(
        ["aliases", "domains", "senders", "keywords", "excludedTerms"].map((field) => [
          field,
          formString(form, field)
            .split(",")
            .map((entry) => entry.trim())
            .filter(Boolean),
        ]),
      ),
    );
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    const rule = parsed.data;
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
    // Place kept, unlinked, unplaced mail the new pattern matches. Attention never changes.
    const unplaced = await db
      .select()
      .from(mailMessages)
      .where(
        and(isNull(mailMessages.companyKey), isNull(mailMessages.linkedApplicationId), notExcluded),
      );
    let placed = 0;
    for (const message of unplaced) {
      const decision = matchMail(
        {
          ...message,
          externalId: message.externalId,
          threadId: message.threadId ?? undefined,
          folders: message.folders,
          bodyText: message.bodyText ?? "",
          receivedAt: message.receivedAt.toISOString(),
        },
        scoped,
        { historical: true, seen: true },
      );
      // Dropped decisions name the company they nearly matched; only kept ones place mail.
      if (
        decision.disposition === "excluded" ||
        decision.companyKeys.length !== 1 ||
        decision.companyKeys[0] !== key
      )
        continue;
      await db.update(mailMessages).set({ companyKey: key }).where(eq(mailMessages.id, message.id));
      placed++;
    }
    invalidate();
    return {
      success: `Company pattern saved.${placed ? ` ${placed} unplaced ${placed === 1 ? "email" : "emails"} now ${placed === 1 ? "belongs" : "belong"} to ${savedCompany.name}.` : ""} New mail uses this pattern from the next check.`,
    };
  } catch (error) {
    return actionError(error);
  }
}

/**
 * Just info (`justInfo=1`) or an outcome (`outcome`, optional `applicationId`) from the Mail
 * page. Outcomes that need a round or deadline send `day`, `time` and `kind` in India time.
 */
export async function handleMailAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const id = formString(form, "id");
    if (formString(form, "justInfo") === "1") {
      await handleMail(id, { justInfo: true });
      invalidate();
      return { success: "Marked as just info." };
    }
    const optional = (name: string) => formString(form, name) || undefined;
    const happenedOn = optional("happenedOn");
    const { id: outcome, detail } = outcomeDetail(
      {
        outcome: formString(form, "outcome") as OutcomeId,
        kind: optional("kind") as RoundKind | undefined,
        day: optional("day"),
        time: optional("time"),
        name: formString(form, "name"),
        note: formString(form, "note"),
        happenedOn,
      },
      new Date(),
    );
    await handleMail(id, {
      outcome,
      ...(optional("applicationId") ? { applicationId: optional("applicationId") } : {}),
      details: {
        ...(detail.kind ? { kind: detail.kind } : {}),
        ...(detail.at ? { at: detail.at.toISOString() } : {}),
        ...(detail.name ? { name: detail.name } : {}),
        ...(detail.note ? { note: detail.note } : {}),
        // Without a chosen day the outcome is dated by the email, not by this click.
        ...(happenedOn ? { happenedAt: detail.happenedAt.toISOString() } : {}),
      },
    });
    invalidate();
    return { success: "Outcome recorded from this email." };
  } catch (error) {
    return actionError(error);
  }
}

/** Undo Just info: the email needs attention again. */
export async function reopenMailAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    await updateMail(formString(form, "id"), { attention: "open" });
    invalidate();
    return { success: "Back in Needs you." };
  } catch (error) {
    return actionError(error);
  }
}

/** Place an email at an application or company; an empty value clears it. */
export async function placeMailAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const id = formString(form, "id");
    const change = form.has("application")
      ? { application: formString(form, "application") || null }
      : { company: formString(form, "company") || null };
    await updateMail(id, change);
    invalidate();
    return { success: "Email placed. It still needs your attention until you handle it." };
  } catch (error) {
    return actionError(error);
  }
}
