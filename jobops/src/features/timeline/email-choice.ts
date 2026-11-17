import { outcomeMeta, type OutcomeId } from "@/features/applications/phase";
import type { MailItem } from "@/features/mail/mail-item";
import { matchingRoles } from "./role-match";
import { suggestionFor, type Handling } from "./suggest";

/** Where a new email belongs: the one question its handling bar asks. */
export type EmailChoice =
  { kind: "role"; id: string } | { kind: "info" } | { kind: "opening" } | { kind: "company" };

export type ChoiceOption = { value: string; label: string; choice: EmailChoice };

/** What the bar's one button does for a choice, and the sentence that says so. */
export type ChoicePlan =
  | { action: "none"; button: string; what: string }
  | { action: "outcome"; outcome: OutcomeId; button: string; what: string }
  | { action: "link"; button: string; what: string }
  | { action: "info"; button: string; what: string }
  | { action: "opening"; button: string; what: string }
  | { action: "company"; button: string; what: string };

export const choiceValue = (choice: EmailChoice | null) =>
  !choice ? "" : choice.kind === "role" ? `role:${choice.id}` : choice.kind;

/**
 * The menu: roles the email names first (marked), then the other open roles, then a new
 * opening for a recruiter's job email, just info, and moving it to another company.
 * An email already on an application offers only that application.
 */
export function choiceOptions(
  item: MailItem,
  handling: Handling,
  { canPlace }: { canPlace: boolean },
): ChoiceOption[] {
  const linked = item.application?.id;
  const apps = linked
    ? handling.applications.filter((app) => app.id === linked)
    : handling.applications;
  const named = matchingRoles(item, apps);
  const roles = [
    ...apps.filter((app) => named.has(app.id)),
    ...apps.filter((app) => !named.has(app.id)),
  ].map((app) => {
    const choice: EmailChoice = { kind: "role", id: app.id };
    return {
      value: choiceValue(choice),
      label: named.has(app.id) ? `${app.role} · named in email` : app.role,
      choice,
    };
  });
  const extra: ChoiceOption[] = [];
  if (item.tag === "opportunity" && !linked)
    extra.push({ value: "opening", label: "A new job to consider", choice: { kind: "opening" } });
  extra.push({ value: "info", label: "Nothing, just info", choice: { kind: "info" } });
  if (canPlace)
    extra.push({ value: "company", label: "A different company…", choice: { kind: "company" } });
  return [...roles, ...extra];
}

/**
 * Preselected answer, so most emails need one click: the role already decided, the only
 * role the email names, or just info when there is no role to choose. Several roles and no
 * clue leave it unanswered, and nothing is saved until the button is pressed.
 */
export function defaultChoice(item: MailItem, handling: Handling): EmailChoice | null {
  if (handling.chosen) return { kind: "role", id: handling.chosen };
  if (!handling.applications.length) return { kind: "info" };
  const named = [...matchingRoles(item, handling.applications)];
  return named.length === 1 ? { kind: "role", id: named[0] } : null;
}

/**
 * The button and sentence for a choice. For a role, the suggested (or chosen) outcome is
 * saved on the application; with no outcome the email is added to it, or only cleared when it
 * is already on that application.
 */
export function planFor(
  choice: EmailChoice | null,
  handling: Handling,
  options: { outcome?: OutcomeId | null; infoLabel: string; linked?: string | null },
): ChoicePlan {
  if (!choice)
    return {
      action: "none",
      button: "Choose where it belongs",
      what: "Nothing is saved until you choose.",
    };
  switch (choice.kind) {
    case "info":
      return {
        action: "info",
        button: options.infoLabel,
        what: "Clears it from Needs you everywhere. It is not added to any application, and you can undo it.",
      };
    case "opening":
      return {
        action: "opening",
        button: "Save as an opening",
        what: "Opens the new-opening form filled from this email, so you can decide whether to apply.",
      };
    case "company":
      return {
        action: "company",
        button: "Move it",
        what: "Moves the email to the company or application you choose. It shows there on Mail and on that company's page.",
      };
    case "role": {
      const app = handling.applications.find((option) => option.id === choice.id);
      const role = app?.role ?? "this application";
      const outcome =
        options.outcome === undefined
          ? suggestionFor(handling, choice.id).suggested
          : options.outcome && app?.outcomes.includes(options.outcome)
            ? options.outcome
            : null;
      if (outcome)
        return {
          action: "outcome",
          outcome,
          button: `Save ${outcomeMeta[outcome].label.toLowerCase()} for ${role}`,
          what: `Records ${outcomeMeta[outcome].label.toLowerCase()} on ${role}, with this email as its source. Its stage and current step update on the application and company pages.`,
        };
      // Already on this application: nothing to add, only clear it.
      if (options.linked === choice.id)
        return {
          action: "info",
          button: options.infoLabel,
          what: `It's already on ${role}. This clears it from Needs you; nothing else changes.`,
        };
      return {
        action: "link",
        button: `Add to ${role}`,
        what: `Adds this email to ${role}'s history and clears it from Needs you. It shows on the application page and that role's row on the company page.`,
      };
    }
  }
}
