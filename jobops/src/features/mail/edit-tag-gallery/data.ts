import { FileX, MessageSquareX, type LucideIcon } from "lucide-react";
import { tagClass, tagIcon } from "@/features/mail/tag-pill";
import { tagLabel, type MailTag } from "@/features/mail/tags";

/** The tags with Rejection split in two, as this gallery previewed them. */
export type PreviewTag = MailTag;
export type TagInfo = {
  label: string;
  meaning: string;
  icon: LucideIcon;
  tone: { tonal: string; dot: string; text: string };
};

const existing = (tag: MailTag, meaning: string): TagInfo => ({
  label: tagLabel[tag],
  meaning,
  icon: tagIcon[tag],
  tone: tagClass[tag],
});

export const previewTags: Record<PreviewTag, TagInfo> = {
  referral: existing("referral", "Someone offering or confirming a referral."),
  opportunity: existing("opportunity", "A recruiter or company reaching out about a role."),
  application: existing("application", "Your application was received or updated."),
  applicationRejected: {
    label: "Application rejected",
    meaning: "Turned down before any interview.",
    icon: FileX,
    tone: tagClass.applicationRejected,
  },
  interviewCall: existing("interviewCall", "An invite to book a round or take an assessment."),
  interviewProcess: existing("interviewProcess", "Updates while rounds are under way."),
  interviewRejected: {
    label: "Rejected after interview",
    meaning: "Turned down after one or more rounds.",
    icon: MessageSquareX,
    tone: tagClass.interviewRejected,
  },
  offer: existing("offer", "An offer or a conversation about one."),
  backgroundCheck: existing("backgroundCheck", "Documents and checks after an offer."),
  joining: existing("joining", "Onboarding and first-day details."),
  other: existing("other", "Job mail that fits none of these."),
};

/** Grouped by the stage of the search, the order the tag colours already follow. */
export const tagGroups: { label: string; tags: PreviewTag[] }[] = [
  { label: "Before applying", tags: ["referral", "opportunity"] },
  { label: "Applied", tags: ["application", "applicationRejected"] },
  { label: "Interviewing", tags: ["interviewCall", "interviewProcess", "interviewRejected"] },
  { label: "Offer and joining", tags: ["offer", "backgroundCheck", "joining"] },
  { label: "Anything else", tags: ["other"] },
];
export const tagOrder = tagGroups.flatMap((group) => group.tags);

/** A fictional rejection that arrived tagged Application, like the one that started this. */
export const sample = {
  company: "Halcyon Labs",
  sender: "Halcyon Talent Acquisition",
  address: "careers@halcyonlabs.example",
  subject: "Update on your application for Senior Software Engineer",
  preview: "After careful review, we have decided not to move forward with your application.",
  body: "Thank you for your interest in Halcyon Labs. After careful review, we have decided not to move forward with your application for Senior Software Engineer at this time.\n\nWe will keep your profile on file for future roles.",
  time: "9:42 am",
  inbox: "gmail.com",
  wrongTag: "application" as PreviewTag,
};
