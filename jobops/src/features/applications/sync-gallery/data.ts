import type { MailTag } from "@/features/mail/tags";

/** Pinned so the gallery reads the same every day: Sat 31 Oct 2026, 10:30 am in India. */
export const NOW = "2026-10-31T10:30:00+05:30";

export type Tone =
  "preparing" | "applied" | "quiet" | "interviewing" | "offer" | "rejected" | "closed";
export type Group = "needs" | "waiting" | "closed";

export type SampleMail = {
  id: string;
  type: "mail";
  at: string;
  tag: MailTag;
  subject: string;
  from: string;
  inbox: "gmail.com" | "outlook.in" | "outlook.com";
  /** Found by a company search for mail older than the inbox's last fetch. */
  history?: boolean;
};
export type SampleStep = {
  id: string;
  type: "step";
  at: string;
  kind: "saved" | "sent" | "note" | "round" | "outcome";
  label: string;
};
export type StoryItem = SampleMail | SampleStep;

/** How far the application got: Sent, Acknowledged, Interviewing, Offer. -1 is not sent. */
export type Reach = -1 | 0 | 1 | 2 | 3;

export type SampleApp = {
  id: string;
  company: string;
  role: string;
  city: string;
  postedAt: string | null;
  appliedAt: string | null;
  resume: string | null;
  source: string;
  status: { tone: Tone; label: string };
  group: Group;
  reach: Reach;
  /** Where it ended when it closed: the step it reached and how. */
  ended?: "rejected" | "withdrawn";
  next: { label: string; due: string | null; overdue?: boolean; action: string | null };
  story: StoryItem[];
};

const ist = (value: string) => `${value}+05:30`;

/**
 * Fictional companies in your real situations: a rejection that arrived last night, one that
 * company search found as history, quiet applications, an acknowledgement, one not sent yet,
 * plus one assessment so the interview stage shows.
 */
export const sampleApps: SampleApp[] = [
  {
    id: "tessaract",
    company: "Tessaract Cloud",
    role: "Senior Infrastructure Engineer",
    city: "Bengaluru",
    postedAt: ist("2026-09-30T00:00:00"),
    appliedAt: ist("2026-10-02T11:20:00"),
    resume: "Backend 2026 v3.pdf",
    source: "Careers site",
    status: { tone: "applied", label: "Applied" },
    group: "needs",
    reach: 0,
    next: { label: "A rejection email arrived", due: null, action: "Mark rejected" },
    story: [
      {
        id: "t-m1",
        type: "mail",
        at: ist("2026-10-31T01:30:00"),
        tag: "applicationRejected",
        subject: "Thank you for your application to Tessaract Cloud",
        from: "Tessaract Talent Acquisition",
        inbox: "gmail.com",
      },
      {
        id: "t-s1",
        type: "step",
        at: ist("2026-10-02T11:20:00"),
        kind: "sent",
        label: "Applied on the careers site",
      },
      {
        id: "t-s0",
        type: "step",
        at: ist("2026-10-01T18:05:00"),
        kind: "saved",
        label: "Saved the opening",
      },
    ],
  },
  {
    id: "arcadia",
    company: "Arcadia Health",
    role: "SDE 2, Platform",
    city: "Hyderabad",
    postedAt: ist("2026-10-16T00:00:00"),
    appliedAt: ist("2026-10-20T09:40:00"),
    resume: "Backend 2026 v3.pdf",
    source: "Referral",
    status: { tone: "interviewing", label: "Online assessment" },
    group: "needs",
    reach: 2,
    next: { label: "Take the assessment", due: ist("2026-11-03T23:59:00"), action: "Open invite" },
    story: [
      {
        id: "a-m2",
        type: "mail",
        at: ist("2026-10-29T16:12:00"),
        tag: "interviewCall",
        subject: "Your Arcadia Health coding assessment: complete by Tue 3 Nov",
        from: "Arcadia Hiring via HackerRank",
        inbox: "gmail.com",
      },
      {
        id: "a-m1",
        type: "mail",
        at: ist("2026-10-20T09:42:00"),
        tag: "application",
        subject: "We received your application for SDE 2, Platform",
        from: "Arcadia Careers",
        inbox: "gmail.com",
      },
      {
        id: "a-s1",
        type: "step",
        at: ist("2026-10-20T09:40:00"),
        kind: "sent",
        label: "Referred by Kavya Menon",
      },
    ],
  },
  {
    id: "lumen",
    company: "Lumen Analytics",
    role: "Senior Backend Engineer, Analytics",
    city: "Noida",
    postedAt: ist("2026-09-29T00:00:00"),
    appliedAt: ist("2026-10-02T10:05:00"),
    resume: "Backend 2026 v2.pdf",
    source: "LinkedIn",
    status: { tone: "quiet", label: "Quiet 29 days" },
    group: "needs",
    reach: 0,
    next: {
      label: "Follow up or close it",
      due: ist("2026-10-09T10:00:00"),
      overdue: true,
      action: "I followed up",
    },
    story: [
      {
        id: "l-s2",
        type: "step",
        at: ist("2026-10-05T12:00:00"),
        kind: "note",
        label: "Hiring manager is Rohit S. on LinkedIn",
      },
      {
        id: "l-s1",
        type: "step",
        at: ist("2026-10-02T10:05:00"),
        kind: "sent",
        label: "Applied through LinkedIn",
      },
    ],
  },
  {
    id: "kestrel",
    company: "Kestrel Pay",
    role: "Senior Backend Engineer, Payments",
    city: "Bengaluru",
    postedAt: ist("2026-09-27T00:00:00"),
    appliedAt: ist("2026-10-02T15:30:00"),
    resume: "Backend 2026 v2.pdf",
    source: "Careers site",
    status: { tone: "quiet", label: "Quiet 17 days" },
    group: "needs",
    reach: 1,
    next: {
      label: "Follow up",
      due: ist("2026-10-21T10:00:00"),
      overdue: true,
      action: "I followed up",
    },
    story: [
      {
        id: "k-m1",
        type: "mail",
        at: ist("2026-10-14T19:02:00"),
        tag: "application",
        subject: "Kestrel - Thank you for your application!",
        from: "Kestrel Pay Recruiting",
        inbox: "outlook.in",
      },
      {
        id: "k-s1",
        type: "step",
        at: ist("2026-10-02T15:30:00"),
        kind: "sent",
        label: "Applied on the careers site",
      },
    ],
  },
  {
    id: "corvid",
    company: "Corvid Systems",
    role: "Backend Engineer II",
    city: "Bengaluru",
    postedAt: ist("2026-10-21T00:00:00"),
    appliedAt: null,
    resume: null,
    source: "Careers site",
    status: { tone: "preparing", label: "Not sent" },
    group: "needs",
    reach: -1,
    next: {
      label: "Apply while it's fresh",
      due: ist("2026-11-04T23:59:00"),
      action: "Record application",
    },
    story: [
      {
        id: "c-s1",
        type: "step",
        at: ist("2026-10-22T20:15:00"),
        kind: "saved",
        label: "Saved the opening",
      },
    ],
  },
  {
    id: "brightline",
    company: "Brightline",
    role: "Senior Software Engineer",
    city: "Hyderabad",
    postedAt: ist("2026-10-24T00:00:00"),
    appliedAt: ist("2026-10-27T21:10:00"),
    resume: "Backend 2026 v3.pdf",
    source: "Careers site",
    status: { tone: "applied", label: "Applied 4 days ago" },
    group: "waiting",
    reach: 1,
    next: { label: "Follow up", due: ist("2026-11-03T10:00:00"), action: null },
    story: [
      {
        id: "b-m1",
        type: "mail",
        at: ist("2026-10-28T08:44:00"),
        tag: "application",
        subject: "Thank You for Applying to Brightline!",
        from: "Brightline Talent",
        inbox: "outlook.in",
      },
      {
        id: "b-s1",
        type: "step",
        at: ist("2026-10-27T21:10:00"),
        kind: "sent",
        label: "Applied on the careers site",
      },
    ],
  },
  {
    id: "northwind",
    company: "Northwind Labs",
    role: "Senior Backend Engineer, Users Infrastructure",
    city: "Bengaluru",
    postedAt: ist("2026-09-30T00:00:00"),
    appliedAt: ist("2026-10-02T13:00:00"),
    resume: "Backend 2026 v2.pdf",
    source: "Careers site",
    status: { tone: "rejected", label: "Rejected" },
    group: "closed",
    reach: 1,
    ended: "rejected",
    next: { label: "Nothing to do", due: null, action: null },
    story: [
      {
        id: "n-s2",
        type: "step",
        at: ist("2026-10-07T17:40:00"),
        kind: "outcome",
        label: "Rejected, from the email",
      },
      {
        id: "n-m2",
        type: "mail",
        at: ist("2026-10-07T17:40:00"),
        tag: "applicationRejected",
        subject: "Update on Position Status: Northwind",
        from: "Northwind Recruiting",
        inbox: "outlook.in",
        history: true,
      },
      {
        id: "n-m1",
        type: "mail",
        at: ist("2026-10-03T06:15:00"),
        tag: "application",
        subject: "Thank you for applying to Northwind, Sathwick!",
        from: "Northwind Recruiting",
        inbox: "outlook.in",
        history: true,
      },
      {
        id: "n-s1",
        type: "step",
        at: ist("2026-10-02T13:00:00"),
        kind: "sent",
        label: "Applied on the careers site",
      },
    ],
  },
  {
    id: "halcyon",
    company: "Halcyon AI",
    role: "Platform Engineer",
    city: "Bengaluru",
    postedAt: ist("2026-09-18T00:00:00"),
    appliedAt: null,
    resume: null,
    source: "Instahyre",
    status: { tone: "closed", label: "Closed" },
    group: "closed",
    reach: -1,
    ended: "withdrawn",
    next: { label: "Nothing to do", due: null, action: null },
    story: [
      {
        id: "h-s2",
        type: "step",
        at: ist("2026-10-12T11:00:00"),
        kind: "outcome",
        label: "Closed before applying: posting older than 14 days",
      },
      {
        id: "h-s1",
        type: "step",
        at: ist("2026-10-01T09:30:00"),
        kind: "saved",
        label: "Saved the opening",
      },
    ],
  },
];

export const groupLabel: Record<Group, string> = {
  needs: "Needs you",
  waiting: "Waiting on them",
  closed: "Closed",
};

export const reachSteps = ["Sent", "Acknowledged", "Interviewing", "Offer"] as const;

/** The newest email or step, which is what "last heard" shows. */
export const lastOf = (app: SampleApp) =>
  [...app.story].sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0];
export const lastMail = (app: SampleApp) =>
  app.story
    .filter((item): item is SampleMail => item.type === "mail")
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0];
