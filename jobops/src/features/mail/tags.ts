import type { mailClassifications } from "@/db/schema";

export type MailClassification = (typeof mailClassifications)[number];
export const mailTags = [
  "application",
  "referral",
  "interviewCall",
  "interviewProcess",
  "offer",
  "rejection",
  "backgroundCheck",
  "joining",
  "opportunity",
  "other",
] as const;
export type MailTag = (typeof mailTags)[number];

/** Tags are derived from `classification`; they are never stored. */
const tagClassifications: Record<MailTag, MailClassification[]> = {
  application: ["APPLICATION_ACKNOWLEDGEMENT", "FOLLOW_UP"],
  referral: ["REFERRAL"],
  interviewCall: ["INTERVIEW", "ASSESSMENT"],
  interviewProcess: ["INTERVIEW_UPDATE"],
  offer: ["OFFER"],
  rejection: ["REJECTION"],
  backgroundCheck: ["BACKGROUND_CHECK"],
  joining: ["ONBOARDING"],
  opportunity: ["RECRUITER_OUTREACH"],
  other: ["UNKNOWN"],
};
export const tagLabel: Record<MailTag, string> = {
  application: "Application",
  referral: "Referral",
  interviewCall: "Interview call",
  interviewProcess: "Interview process",
  offer: "Offer",
  rejection: "Rejection",
  backgroundCheck: "Background verification",
  joining: "Joining",
  opportunity: "Opportunity",
  other: "Other",
};

/** Tags are coloured by the stage of the search they belong to. */
export type TagStage =
  "before" | "applied" | "interviewing" | "offerJoining" | "rejected" | "other";
export const tagStage: Record<MailTag, TagStage> = {
  referral: "before",
  opportunity: "before",
  application: "applied",
  interviewCall: "interviewing",
  interviewProcess: "interviewing",
  offer: "offerJoining",
  backgroundCheck: "offerJoining",
  joining: "offerJoining",
  rejection: "rejected",
  other: "other",
};

/** The five tags links used before 2026-10-31, read as the tags they became. */
export const legacyTags: Record<
  "opportunity" | "process" | "offer" | "rejected" | "other",
  MailTag[]
> = {
  opportunity: ["opportunity"],
  process: ["application", "interviewCall", "interviewProcess"],
  offer: ["offer"],
  rejected: ["rejection"],
  other: ["other"],
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
  REFERRAL: "Referral",
  INTERVIEW_UPDATE: "Interview update",
  BACKGROUND_CHECK: "Background verification",
  ONBOARDING: "Joining",
};

const isTag = (value: string): value is MailTag => (mailTags as readonly string[]).includes(value);

/** A tag filter from a link: a new tag id, or a legacy id that covers several. */
export function parseTagParam(value: string): MailTag[] | null {
  if (isTag(value)) return [value];
  return Object.hasOwn(legacyTags, value) ? legacyTags[value as keyof typeof legacyTags] : null;
}
/** A single tag for a retag request; a legacy id becomes its first tag. */
export function tagFromParam(value: string): MailTag | null {
  return parseTagParam(value)?.[0] ?? null;
}

export function tagOf(classification: MailClassification): MailTag {
  return mailTags.find((tag) => tagClassifications[tag].includes(classification)) ?? "other";
}
export function classificationsFor(tag: MailTag): MailClassification[] {
  return tagClassifications[tag];
}
/** Retagging keeps a kind that already belongs to the tag; otherwise the tag's main kind. */
export function classificationForTag(
  tag: MailTag,
  current: MailClassification,
): MailClassification {
  if (tagOf(current) === tag) return current;
  if (tag === "application") return "FOLLOW_UP";
  return tagClassifications[tag][0];
}
