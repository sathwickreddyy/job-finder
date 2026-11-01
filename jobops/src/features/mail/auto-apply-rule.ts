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
  /** The latest reply or round from the company that the user recorded by hand. */
  lastHeardAt: Date | null;
  /** When the outcome that closed it happened; null while it is open. */
  closedAt: Date | null;
  /** An acknowledgement is already on its journey. */
  acknowledged: boolean;
};
export type RuleMail = {
  classification: MailClassification;
  receivedAt: Date;
  companyKey: string | null;
  /** Stored link, suggestedApplicationId and mail_tracking.applicationIds. */
  namedApplicationIds: string[];
  /** The user or another rule acted on it, or the rule already applied or was undone. */
  blocked: boolean;
  /** The same email stored earlier from another inbox, which carries the decision. */
  copyOf: string | null;
  /** Outcomes the user undid after the rule recorded them from this email. */
  undoneOutcomes: string[];
};
export type MailEffect =
  | { kind: "acknowledge"; applicationId: string }
  | { kind: "outcome"; applicationId: string; outcome: "rejected" | "offer" }
  | { kind: "ask"; applicationId: string | null }
  | { kind: "copy"; of: string }
  /** The user undid this outcome before: the email stays on the application as information. */
  | { kind: "info"; applicationId: string }
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

/** Closed by an outcome that came after the email, so an acknowledgement still belongs to it. */
const closedAfter = (app: RuleApplication, at: Date) =>
  !app.previousJob &&
  !isOutreach(app.source) &&
  app.sentAt !== null &&
  app.phase === "Closed" &&
  !app.acknowledged &&
  app.closedAt !== null &&
  app.closedAt >= at;

/**
 * What an email does to its company's applications (spec §1). Acknowledgements, rejections and
 * offers apply by themselves to the one live application; anything that needs a date, a round or
 * a choice of role asks instead. An acknowledgement read after the rejection that followed it
 * still joins that application's journey, so the order mail is read in never drops a step, and
 * a second inbox's copy of an email follows the first.
 */
export function decideMailEffect(mail: RuleMail, applications: RuleApplication[]): MailEffect {
  const acknowledgement = mail.classification === "APPLICATION_ACKNOWLEDGEMENT";
  const outcome = clearOutcomes[mail.classification];
  if (!acknowledgement && !outcome && !asking.has(mail.classification)) return { kind: "none" };
  if (mail.blocked) return { kind: "none" };
  if (mail.copyOf) return { kind: "copy", of: mail.copyOf };
  if (!mail.companyKey) return { kind: "none" };

  const candidates = [
    ...applications.filter(isLive),
    ...(acknowledgement ? applications.filter((app) => closedAfter(app, mail.receivedAt)) : []),
  ];
  if (!candidates.length) return { kind: "none" };
  const earliest = Math.min(...candidates.map((app) => app.sentAt!.getTime()));
  if (istDaysBetween(new Date(earliest), mail.receivedAt) < 0) return { kind: "none" };

  const single = candidates.length === 1 ? candidates[0] : null;
  if (!single) return { kind: "ask", applicationId: null };
  // Another application is named (a referral contact's reply, an older role): ask, and keep
  // whichever application matching suggested.
  if (mail.namedApplicationIds.some((id) => id !== single.id))
    return { kind: "ask", applicationId: null };
  if (acknowledgement) return { kind: "acknowledge", applicationId: single.id };
  if (outcome && mail.undoneOutcomes.includes(outcome))
    return { kind: "info", applicationId: single.id };
  // The company answered after this email, so it is older news than what the user recorded.
  const answeredLater = single.lastHeardAt !== null && single.lastHeardAt > mail.receivedAt;
  if (outcome && single.outcomes.includes(outcome) && !single.bookedRound && !answeredLater)
    return { kind: "outcome", applicationId: single.id, outcome };
  return { kind: "ask", applicationId: single.id };
}
