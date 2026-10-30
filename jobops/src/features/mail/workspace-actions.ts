"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { mailMessages, settings } from "@/db/schema";
import { actionError, formString, type ActionState } from "@/lib/actions";
import { loadMailContext, ruleKey, ruleSchema } from "./context";
import { checkMailStep, type CheckResult } from "./check-service";
import { handleMail, updateMail } from "./handle-service";
import { notExcluded } from "./mail-list";
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
      if (decision.companyKeys.length !== 1 || decision.companyKeys[0] !== key) continue;
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

/** Just info (`justInfo=1`) or an outcome (`outcome`, optional `applicationId`) from the Mail page. */
export async function handleMailAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const id = formString(form, "id");
    const outcome = formString(form, "outcome");
    await handleMail(
      id,
      formString(form, "justInfo") === "1"
        ? { justInfo: true }
        : {
            outcome,
            ...(formString(form, "applicationId")
              ? { applicationId: formString(form, "applicationId") }
              : {}),
          },
    );
    invalidate();
    return { success: outcome ? "Outcome recorded from this email." : "Marked as just info." };
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
