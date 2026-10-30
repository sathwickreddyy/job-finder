import type { mailClassifications } from "@/db/schema";

export type MailClassification = (typeof mailClassifications)[number];
export const mailTags = ["opportunity", "process", "offer", "rejected", "other"] as const;
export type MailTag = (typeof mailTags)[number];

/** Tags are derived from `classification`; they are never stored. */
const tagClassifications: Record<MailTag, MailClassification[]> = {
  opportunity: ["RECRUITER_OUTREACH"],
  process: ["APPLICATION_ACKNOWLEDGEMENT", "FOLLOW_UP", "ASSESSMENT", "INTERVIEW"],
  offer: ["OFFER"],
  rejected: ["REJECTION"],
  other: ["UNKNOWN"],
};
export const tagLabel: Record<MailTag, string> = {
  opportunity: "Job opportunity",
  process: "Application / interview",
  offer: "Offer",
  rejected: "Rejected",
  other: "Other",
};
export const kindLabel: Record<MailClassification, string> = {
  INTERVIEW: "Interview",
  ASSESSMENT: "Assessment",
  OFFER: "Offer",
  REJECTION: "Application outcome",
  FOLLOW_UP: "Application update",
  RECRUITER_OUTREACH: "Hiring conversation",
  APPLICATION_ACKNOWLEDGEMENT: "Application received",
  UNKNOWN: "Message",
};

export function tagOf(classification: MailClassification): MailTag {
  return mailTags.find((tag) => tagClassifications[tag].includes(classification)) ?? "other";
}
export function classificationsFor(tag: MailTag): MailClassification[] {
  return tagClassifications[tag];
}
/** Retagging to process keeps a finer process kind; every other tag has one classification. */
export function classificationForTag(
  tag: MailTag,
  current: MailClassification,
): MailClassification {
  if (tag === "process") return tagOf(current) === "process" ? current : "FOLLOW_UP";
  return tagClassifications[tag][0];
}
