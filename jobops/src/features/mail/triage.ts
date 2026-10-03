import { laneHref } from "@/features/applications/navigation";
import type { OutcomeId } from "@/features/applications/phase";
import type { QueueMail } from "@/features/applications/queue";
import type { MailClassification } from "@/services/mail/classifier";

export type Bucket = "updates" | "roles" | "noise";

const alertDomains = ["naukri.com", "instahyre.com", "foundit.in"];
const alertAddresses = ["jobs-noreply@linkedin.com", "jobalerts-noreply@linkedin.com"];

export function isJobAlert(sender: string): boolean {
  const address = sender.trim().toLowerCase();
  const at = address.indexOf("@");
  if (at <= 0 || at !== address.lastIndexOf("@")) return false;

  const domain = address.slice(at + 1);
  return (
    alertAddresses.includes(address) ||
    alertDomains.some((name) => domain === name || domain.endsWith(`.${name}`))
  );
}

const updateKinds: MailClassification[] = [
  "INTERVIEW",
  "ASSESSMENT",
  "OFFER",
  "REJECTION",
  "FOLLOW_UP",
];

export function bucketOf(message: {
  sender: string;
  classification: MailClassification;
  recordId: string | null;
}): Bucket {
  if (isJobAlert(message.sender)) return "noise";
  if (updateKinds.includes(message.classification)) return "updates";
  if (message.classification === "RECRUITER_OUTREACH")
    return message.recordId ? "updates" : "roles";
  return "noise";
}

/** Acknowledgements are linked without an outcome; they are not a reply (spec §5.1). */
export const suggestedOutcome: Record<MailClassification, OutcomeId | null> = {
  ASSESSMENT: "oa",
  INTERVIEW: "scheduled",
  OFFER: "offer",
  REJECTION: "rejected",
  FOLLOW_UP: "heard",
  RECRUITER_OUTREACH: "heard",
  APPLICATION_ACKNOWLEDGEMENT: null,
  UNKNOWN: null,
};

export function linkHref(
  message: { id: string; classification: MailClassification },
  recordId: string,
): string {
  return laneHref(recordId, {
    mail: message.id,
    outcome: suggestedOutcome[message.classification],
  });
}

export type TriageInput = {
  id: string;
  subject: string;
  sender: string;
  senderName: string;
  receivedAt: Date;
  classification: MailClassification;
  bucket: Bucket;
  record: { id: string; company: string } | null;
};

export function queueMailFrom(messages: TriageInput[]): QueueMail[] {
  return messages
    .filter(
      (message) =>
        message.bucket !== "noise" && message.classification !== "APPLICATION_ACKNOWLEDGEMENT",
    )
    .map((message) => ({
      id: message.id,
      title: message.subject,
      detail: message.record
        ? `${message.senderName || message.sender} · ${message.record.company}`
        : message.senderName || message.sender,
      receivedAt: message.receivedAt,
      primary:
        message.bucket === "roles"
          ? { label: "Save as opening", href: `/jobs/new?fromMail=${message.id}` }
          : message.record
            ? { label: "Link and update", href: linkHref(message, message.record.id) }
            : { label: "Choose record", href: `/mail/${message.id}` },
    }));
}
