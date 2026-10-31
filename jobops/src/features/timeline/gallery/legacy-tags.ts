/** The five tags this gallery was approved with on 2026-10-31, frozen so it keeps rendering. */
export const mailTags = ["opportunity", "process", "offer", "rejected", "other"] as const;
export type MailTag = (typeof mailTags)[number];
export const tagLabel: Record<MailTag, string> = {
  opportunity: "Job opportunity",
  process: "Application / interview",
  offer: "Offer",
  rejected: "Rejected",
  other: "Other",
};
