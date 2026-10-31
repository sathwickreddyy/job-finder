import {
  Award,
  CalendarPlus,
  DoorOpen,
  FileX,
  Handshake,
  Mail,
  Megaphone,
  MessagesSquare,
  MessageSquareX,
  Send,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { tagLabel, type MailTag } from "./tags";

export const tagIcon: Record<MailTag, LucideIcon> = {
  application: Send,
  referral: Handshake,
  interviewCall: CalendarPlus,
  interviewProcess: MessagesSquare,
  offer: Award,
  applicationRejected: FileX,
  interviewRejected: MessageSquareX,
  backgroundCheck: ShieldCheck,
  joining: DoorOpen,
  opportunity: Megaphone,
  other: Mail,
};

/** Literal class names so Tailwind keeps every pair. "Other" is an outline, never a fill. */
export const tagClass: Record<MailTag, { tonal: string; dot: string; text: string }> = {
  application: {
    tonal: "bg-tag-application-container text-tag-application",
    dot: "bg-tag-application",
    text: "text-tag-application",
  },
  referral: {
    tonal: "bg-tag-referral-container text-tag-referral",
    dot: "bg-tag-referral",
    text: "text-tag-referral",
  },
  interviewCall: {
    tonal: "bg-tag-interview-call-container text-tag-interview-call",
    dot: "bg-tag-interview-call",
    text: "text-tag-interview-call",
  },
  interviewProcess: {
    tonal: "bg-tag-interview-process-container text-tag-interview-process",
    dot: "bg-tag-interview-process",
    text: "text-tag-interview-process",
  },
  offer: {
    tonal: "bg-tag-offer-container text-tag-offer",
    dot: "bg-tag-offer",
    text: "text-tag-offer",
  },
  applicationRejected: {
    tonal: "bg-tag-rejection-container text-tag-rejection",
    dot: "bg-tag-rejection",
    text: "text-tag-rejection",
  },
  interviewRejected: {
    tonal: "bg-tag-rejection-container text-tag-rejection",
    dot: "bg-tag-rejection",
    text: "text-tag-rejection",
  },
  backgroundCheck: {
    tonal: "bg-tag-background-check-container text-tag-background-check",
    dot: "bg-tag-background-check",
    text: "text-tag-background-check",
  },
  joining: {
    tonal: "bg-tag-joining-container text-tag-joining",
    dot: "bg-tag-joining",
    text: "text-tag-joining",
  },
  opportunity: {
    tonal: "bg-tag-opportunity-container text-tag-opportunity",
    dot: "bg-tag-opportunity",
    text: "text-tag-opportunity",
  },
  other: {
    tonal: "text-tag-other ring-1 ring-inset ring-border",
    dot: "bg-tag-other",
    text: "text-tag-other",
  },
};

export function TagPill({
  tag,
  short,
  className,
}: {
  tag: MailTag;
  /** Icon only on narrow rows; the label stays available to screen readers. */
  short?: boolean;
  className?: string;
}) {
  const Icon = tagIcon[tag];
  return (
    <span
      title={short ? tagLabel[tag] : undefined}
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full text-xs font-medium",
        short ? "w-6 justify-center" : "px-2.5",
        tagClass[tag].tonal,
        className,
      )}
    >
      <Icon aria-hidden size={13} strokeWidth={2.2} />
      {short ? <span className="sr-only">{tagLabel[tag]}</span> : tagLabel[tag]}
    </span>
  );
}
