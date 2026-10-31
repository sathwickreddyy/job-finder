import { istDaysBetween } from "@/features/applications/dates";
import { isOutreach, type OutcomeId, type Phase } from "@/features/applications/phase";
import type { MailClassification } from "./tags";

/** One of the company's applications, as the rule sees it. */
export type RuleApplication = {
  id: string;
  source: string;
  previousJob: boolean;
  sentAt: Date | null;
  phase: Phase;
  /** availableOutcomes(state) */
  outcomes: OutcomeId[];
  bookedRound: boolean;
};
export type RuleMail = {
  classification: MailClassification;
  receivedAt: Date;
  companyKey: string | null;
  /** Stored link, suggestedApplicationId and mail_tracking.applicationIds. */
  namedApplicationIds: string[];
  /** The user or another rule acted on it, or the rule already applied or was undone. */
  blocked: boolean;
};
export type MailEffect =
  | { kind: "acknowledge"; applicationId: string }
  | { kind: "outcome"; applicationId: string; outcome: "rejected" | "offer" }
  | { kind: "ask"; applicationId: string | null }
  | { kind: "none" };

const clearOutcomes: Partial<Record<MailClassification, "rejected" | "offer">> = {
  REJECTION: "rejected",
  INTERVIEW_REJECTION: "rejected",
  OFFER: "offer",
};
const asking = new Set<MailClassification>(["INTERVIEW", "ASSESSMENT", "INTERVIEW_UPDATE"]);

/** A sent direct application that is still open (spec §1, condition 2). */
const isLive = (app: RuleApplication) =>
  !app.previousJob &&
  !isOutreach(app.source) &&
  app.sentAt !== null &&
  app.phase !== "Closed" &&
  app.phase !== "Preparing";

/**
 * What an email does to its company's applications (spec §1). Acknowledgements, rejections and
 * offers apply by themselves to the one live application; anything that needs a date, a round or
 * a choice of role asks instead.
 */
export function decideMailEffect(mail: RuleMail, applications: RuleApplication[]): MailEffect {
  const acknowledgement = mail.classification === "APPLICATION_ACKNOWLEDGEMENT";
  const outcome = clearOutcomes[mail.classification];
  if (!acknowledgement && !outcome && !asking.has(mail.classification)) return { kind: "none" };
  if (mail.blocked || !mail.companyKey) return { kind: "none" };

  const live = applications.filter(isLive);
  if (!live.length) return { kind: "none" };
  const earliest = Math.min(...live.map((app) => app.sentAt!.getTime()));
  if (istDaysBetween(new Date(earliest), mail.receivedAt) < 0) return { kind: "none" };

  const single = live.length === 1 ? live[0] : null;
  if (!single) return { kind: "ask", applicationId: null };
  const eligible = mail.namedApplicationIds.every((id) => id === single.id);
  if (eligible && acknowledgement) return { kind: "acknowledge", applicationId: single.id };
  if (eligible && outcome && single.outcomes.includes(outcome) && !single.bookedRound)
    return { kind: "outcome", applicationId: single.id, outcome };
  return { kind: "ask", applicationId: single.id };
}
