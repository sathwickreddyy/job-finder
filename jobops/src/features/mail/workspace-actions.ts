"use server";

import { revalidatePath } from "next/cache";
import { outcomeDetail, type OutcomeId } from "@/features/applications/phase";
import { actionError, formString, type ActionState } from "@/lib/actions";
import type { RoundKind } from "@/lib/round-kinds";
import { checkMailStep, type CheckResult } from "./check-service";
import { companySearchStep, type SearchLane, type SearchRun } from "./company-search";
import { handleMail, updateMail } from "./handle-service";
import { includeMail } from "./include";
import type { MailItem } from "./mail-item";
import { storeCompanyRule } from "./rule-store";

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

/** One company search step; the panel loops while `search.more`, sending options only first. */
export async function searchCompanyMail(
  key: string,
  options: { lastDays?: number; accounts?: string[]; restart?: boolean } = {},
): Promise<ActionState & { search?: { more: boolean; run: SearchRun; lanes: SearchLane[] } }> {
  try {
    const search = await companySearchStep(key, options);
    invalidate();
    return { search };
  } catch (error) {
    return actionError(error);
  }
}

/** Save a company's rule from the panel; a refused keyword comes back as `error`. */
export async function saveCompanyRule(key: string, rule: unknown): Promise<ActionState> {
  try {
    await storeCompanyRule(key, rule);
    invalidate();
    return { success: "Saved. Fetches and searches use it from now on." };
  } catch (error) {
    return actionError(error);
  }
}

/** Include this on a dropped email, for one company. */
export async function includeDroppedMail(
  trackingId: string,
  company: string,
): Promise<
  ActionState & {
    included?: {
      item: MailItem;
      addedSender: string | null;
      skippedShared: string | null;
      suggestedKeyword: string | null;
    };
  }
> {
  try {
    const included = await includeMail(trackingId, company);
    invalidate();
    return { included };
  } catch (error) {
    return actionError(error);
  }
}

export async function saveWorkspaceRule(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const { placed, company } = await storeCompanyRule(
      formString(form, "company"),
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
    invalidate();
    return {
      success: `Company pattern saved.${placed ? ` ${placed} unplaced ${placed === 1 ? "email" : "emails"} now ${placed === 1 ? "belongs" : "belong"} to ${company}.` : ""} New mail uses this pattern from the next check.`,
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
