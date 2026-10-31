"use client";

import {
  Award,
  CalendarPlus,
  CircleX,
  DoorOpen,
  Handshake,
  Mail,
  Megaphone,
  MessagesSquare,
  Send,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { FeedTag } from "./data";

export const tagMeta: Record<FeedTag, { label: string; icon: LucideIcon; stage: string }> = {
  application: { label: "Application", icon: Send, stage: "Applied" },
  referral: { label: "Referral", icon: Handshake, stage: "Before applying" },
  call: { label: "Interview call", icon: CalendarPlus, stage: "Interviewing" },
  process: { label: "Interview process", icon: MessagesSquare, stage: "Interviewing" },
  offer: { label: "Offer", icon: Award, stage: "Offer and joining" },
  rejection: { label: "Rejection", icon: CircleX, stage: "Rejected" },
  bgv: { label: "Background verification", icon: ShieldCheck, stage: "Offer and joining" },
  joining: { label: "Joining", icon: DoorOpen, stage: "Offer and joining" },
  opportunity: { label: "Opportunity", icon: Megaphone, stage: "Before applying" },
  other: { label: "Other", icon: Mail, stage: "Other" },
};

/**
 * Candidate tag tokens for the two palettes. They live here only while the gallery decides;
 * the chosen set moves into globals.css as --tag-* pairs.
 */
const hue = {
  dark: {
    application: ["#8ab4f8", "#233652"],
    referral: ["#d7aefb", "#3b2b4f"],
    call: ["#fdd663", "#41331c"],
    process: ["#fcad70", "#48301a"],
    offer: ["#81c995", "#173e26"],
    rejection: ["#f28b82", "#442725"],
    bgv: ["#ff8bcb", "#4a2238"],
    joining: ["#78d9c8", "#123a35"],
    opportunity: ["#b0bec5", "#2f3a40"],
  },
  light: {
    application: ["#1967d2", "#e8f0fe"],
    referral: ["#8430ce", "#f3e8fd"],
    call: ["#8a5000", "#fef7e0"],
    process: ["#b54d00", "#feefe3"],
    offer: ["#188038", "#e6f4ea"],
    rejection: ["#c5221f", "#fce8e6"],
    bgv: ["#b80672", "#fde7f3"],
    joining: ["#00796b", "#e0f2f1"],
    opportunity: ["#455a64", "#eceff1"],
  },
};
const stageOf: Record<Exclude<FeedTag, "other">, keyof (typeof hue)["dark"]> = {
  application: "application",
  referral: "referral",
  opportunity: "referral",
  call: "call",
  process: "call",
  offer: "offer",
  bgv: "offer",
  joining: "offer",
  rejection: "rejection",
};
function vars(scheme: "hue" | "stage", mode: "dark" | "light") {
  return (Object.keys(stageOf) as Exclude<FeedTag, "other">[])
    .map((tag) => {
      const [fg, bg] = hue[mode][scheme === "hue" ? tag : stageOf[tag]];
      return `--ft-${tag}:${fg};--ft-${tag}-c:${bg};`;
    })
    .join("");
}
export const tagStyles = `
[data-tags="hue"]{${vars("hue", "dark")}}
:root[data-theme="light"] [data-tags="hue"]{${vars("hue", "light")}}
[data-tags="stage"]{${vars("stage", "dark")}}
:root[data-theme="light"] [data-tags="stage"]{${vars("stage", "light")}}
`;

/** Literal class names so Tailwind keeps every pair. "Other" is an outline, never a fill. */
export const tagClass: Record<FeedTag, { tonal: string; dot: string; text: string; edge: string }> =
  {
    application: {
      tonal: "bg-(--ft-application-c) text-(--ft-application)",
      dot: "bg-(--ft-application)",
      text: "text-(--ft-application)",
      edge: "border-l-(--ft-application)",
    },
    referral: {
      tonal: "bg-(--ft-referral-c) text-(--ft-referral)",
      dot: "bg-(--ft-referral)",
      text: "text-(--ft-referral)",
      edge: "border-l-(--ft-referral)",
    },
    call: {
      tonal: "bg-(--ft-call-c) text-(--ft-call)",
      dot: "bg-(--ft-call)",
      text: "text-(--ft-call)",
      edge: "border-l-(--ft-call)",
    },
    process: {
      tonal: "bg-(--ft-process-c) text-(--ft-process)",
      dot: "bg-(--ft-process)",
      text: "text-(--ft-process)",
      edge: "border-l-(--ft-process)",
    },
    offer: {
      tonal: "bg-(--ft-offer-c) text-(--ft-offer)",
      dot: "bg-(--ft-offer)",
      text: "text-(--ft-offer)",
      edge: "border-l-(--ft-offer)",
    },
    rejection: {
      tonal: "bg-(--ft-rejection-c) text-(--ft-rejection)",
      dot: "bg-(--ft-rejection)",
      text: "text-(--ft-rejection)",
      edge: "border-l-(--ft-rejection)",
    },
    bgv: {
      tonal: "bg-(--ft-bgv-c) text-(--ft-bgv)",
      dot: "bg-(--ft-bgv)",
      text: "text-(--ft-bgv)",
      edge: "border-l-(--ft-bgv)",
    },
    joining: {
      tonal: "bg-(--ft-joining-c) text-(--ft-joining)",
      dot: "bg-(--ft-joining)",
      text: "text-(--ft-joining)",
      edge: "border-l-(--ft-joining)",
    },
    opportunity: {
      tonal: "bg-(--ft-opportunity-c) text-(--ft-opportunity)",
      dot: "bg-(--ft-opportunity)",
      text: "text-(--ft-opportunity)",
      edge: "border-l-(--ft-opportunity)",
    },
    other: {
      tonal: "text-muted-foreground ring-1 ring-inset ring-border",
      dot: "bg-muted-foreground",
      text: "text-muted-foreground",
      edge: "border-l-border",
    },
  };

export function TagPill({
  tag,
  short,
  className,
}: {
  tag: FeedTag;
  /** Icon only on narrow rows; the label stays available to screen readers. */
  short?: boolean;
  className?: string;
}) {
  const { label, icon: Icon } = tagMeta[tag];
  return (
    <span
      title={short ? label : undefined}
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full text-xs font-medium",
        short ? "w-6 justify-center" : "px-2.5",
        tagClass[tag].tonal,
        className,
      )}
    >
      <Icon aria-hidden size={13} strokeWidth={2.2} />
      {short ? <span className="sr-only">{label}</span> : label}
    </span>
  );
}

export function TagDot({ tag, className }: { tag: FeedTag; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2 shrink-0 rounded-full", tagClass[tag].dot, className)}
    />
  );
}
