import type { mailMessages } from "@/db/schema";
import { outcomeIds, type OutcomeId } from "@/features/applications/phase";
import type { MailContext } from "./context";
import { kindLabel, tagOf, type MailTag } from "./tags";

/** One email shape for the Mail page, company and application views and the agent API. */
export type MailItem = {
  id: string;
  account: string;
  provider: string;
  folders: string[];
  receivedAt: string;
  sender: string;
  senderName: string;
  subject: string;
  text: string;
  company: { key: string; name: string } | null;
  application: { id: string; role: string } | null;
  tag: MailTag;
  kind: string;
  attention: "open" | "handled";
  handledAt: string | null;
  outcome: OutcomeId | null;
  /** The mail rule recorded this email's outcome; Undo shows while nothing newer was recorded. */
  autoOutcome?: { undoable: boolean; undone?: true } | null;
};
export type MailLookup = {
  companies: Map<string, string>;
  applications: Map<string, { company: string; role: string }>;
};

export function mailLookup(context: MailContext): MailLookup {
  return {
    companies: new Map(context.companies.map((company) => [company.id, company.name])),
    applications: new Map(
      context.applications.map((app) => [app.id, { company: app.company, role: app.role }]),
    ),
  };
}

export function toMailItem(
  row: typeof mailMessages.$inferSelect & {
    outcome: string | null;
    autoUndoable?: boolean | null;
    autoUndone?: boolean | null;
  },
  lookup: MailLookup,
): MailItem {
  const app = row.linkedApplicationId
    ? lookup.applications.get(row.linkedApplicationId)
    : undefined;
  const companyKey = app?.company ?? row.companyKey;
  return {
    id: row.id,
    account: row.accountEmail ?? "",
    provider: row.provider,
    folders: row.folders,
    receivedAt: row.receivedAt.toISOString(),
    sender: row.sender,
    senderName: row.senderName,
    subject: row.subject,
    text: row.bodyText || row.snippet,
    company: companyKey
      ? { key: companyKey, name: lookup.companies.get(companyKey) ?? companyKey }
      : null,
    application:
      app && row.linkedApplicationId ? { id: row.linkedApplicationId, role: app.role } : null,
    tag: tagOf(row.classification),
    kind: kindLabel[row.classification],
    attention: row.attentionState === "DONE" ? "handled" : "open",
    handledAt: row.attentionState === "DONE" ? (row.processedAt?.toISOString() ?? null) : null,
    outcome: outcomeIds.includes(row.outcome as OutcomeId) ? (row.outcome as OutcomeId) : null,
    autoOutcome:
      row.autoUndoable !== null && row.autoUndoable !== undefined
        ? { undoable: row.autoUndoable }
        : row.autoUndone
          ? { undoable: false, undone: true }
          : null,
  };
}
