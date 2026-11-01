import {
  availableOutcomes,
  phaseOf,
  type OutcomeId,
  type RecordState,
} from "@/features/applications/phase";
import type { MailItem } from "@/features/mail/mail-item";
import { kindLabel, type MailClassification } from "@/features/mail/tags";
import { suggestedOutcome } from "@/features/mail/triage";

export type Handling = {
  applications: { id: string; role: string; outcomes: OutcomeId[] }[];
  /** The application an outcome goes to; null asks "Which role?" first. */
  chosen: string | null;
  suggested: OutcomeId | "info";
  reason: string;
};

const nothingToRecord = "Nothing to record from this email.";
// Kind labels are one per classification, so the shared email shape needs no extra field.
const classificationOf = new Map(
  Object.entries(kindLabel).map(([classification, label]) => [
    label,
    classification as MailClassification,
  ]),
);

/**
 * The one suggested outcome for an email: its classification's outcome when the
 * application it belongs to allows it, otherwise Just info. Nothing reads the email itself.
 */
export function suggestHandling(
  item: MailItem,
  roles: { id: string; role: string; state: RecordState }[],
): Handling {
  const linked = item.application?.id;
  const applications = roles
    .filter((role) => role.id === linked || phaseOf(role.state) !== "Closed")
    .map((role) => ({ id: role.id, role: role.role, outcomes: availableOutcomes(role.state) }));
  const chosen =
    (linked && applications.some((app) => app.id === linked) ? linked : null) ??
    (applications.length === 1 ? applications[0].id : null);
  const classification = classificationOf.get(item.kind);
  const outcome = classification ? suggestedOutcome[classification] : null;
  const allowed = applications
    .filter((app) => !chosen || app.id === chosen)
    .some((app) => outcome && app.outcomes.includes(outcome));
  const kind = item.kind.toLowerCase();
  return {
    applications,
    chosen,
    suggested: outcome && allowed ? outcome : "info",
    reason:
      outcome && allowed
        ? `Suggested for ${/^[aeiou]/.test(kind) ? "an" : "a"} ${kind} email.`
        : nothingToRecord,
  };
}

/** The suggestion once a role is chosen, so the button and its reason always agree. */
export function suggestionFor(
  handling: Handling,
  applicationId: string | null,
): { suggested: OutcomeId | null; reason: string } {
  const app = handling.applications.find((option) => option.id === applicationId);
  const suggested =
    handling.suggested !== "info" && app?.outcomes.includes(handling.suggested)
      ? handling.suggested
      : null;
  return { suggested, reason: suggested ? handling.reason : nothingToRecord };
}
