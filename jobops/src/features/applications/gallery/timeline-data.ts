import { NOW, type Account, type Due } from "./data";

/* Sample company timelines for the timeline gallery only, pinned to the same clock as data.ts. */

export type StatusTone = "interviewing" | "offer" | "quiet" | "applied" | "preparing" | "closed";
export type NodeTone = "sent" | "mail" | "good" | "bad" | "note" | "upcoming" | "pending";
export type TimelineNode = {
  at: string;
  label: string;
  detail?: string;
  tone: NodeTone;
  /** Set when the entry belongs to a linked outreach record, e.g. "Referral". */
  via?: string;
};
export type NextStep = {
  due: Due;
  /** Short date phrase shown with the due tone, e.g. "Today, 4:00 PM" or "2 days late". */
  when: string;
  label: string;
  action: string;
  secondary?: string;
};
export type CompanyTimeline = {
  id: string;
  company: string;
  role: string;
  city: string;
  how: string;
  status: { tone: StatusTone; label: string };
  /** Oldest first; includes upcoming entries after NOW. */
  nodes: TimelineNode[];
  next: NextStep | null;
};
export type StrayMail = {
  id: string;
  account: Account;
  from: string;
  subject: string;
  receivedAt: string;
  pile: "role" | "noise";
};

export const companies: CompanyTimeline[] = [
  {
    id: "razorpay",
    company: "Razorpay",
    role: "SDE-2, Payments Backend",
    city: "Bengaluru",
    how: "Careers site + referral from Ananya Iyer",
    status: { tone: "interviewing", label: "Interviewing · round 2 of 4" },
    nodes: [
      {
        at: "2026-09-16T20:00:00+05:30",
        label: "Asked Ananya Iyer for a referral",
        tone: "sent",
        via: "Referral",
      },
      {
        at: "2026-09-17T09:30:00+05:30",
        label: "Ananya submitted the referral",
        tone: "good",
        via: "Referral",
      },
      {
        at: "2026-09-18T11:00:00+05:30",
        label: "Applied on careers site",
        detail: "Resume: Backend v4 · payments.pdf",
        tone: "sent",
      },
      {
        at: "2026-09-20T10:00:00+05:30",
        label: "OA invite",
        detail: "HackerRank · gmail.com",
        tone: "mail",
      },
      { at: "2026-09-25T14:00:00+05:30", label: "Cleared the OA", tone: "good" },
      {
        at: "2026-10-03T09:12:00+05:30",
        label: "Round 2 confirmed",
        detail: "Recruiter mail · gmail.com",
        tone: "mail",
      },
      {
        at: "2026-10-03T16:00:00+05:30",
        label: "Round 2 · DSA",
        detail: "Problem solving, 60 min",
        tone: "upcoming",
      },
    ],
    next: {
      due: "today",
      when: "Today, 4:00 PM",
      label: "DSA round. Record how it went afterwards.",
      action: "Record result",
    },
  },
  {
    id: "zscaler",
    company: "Zscaler",
    role: "Senior Software Engineer, Data Path",
    city: "Bengaluru",
    how: "Careers site",
    status: { tone: "applied", label: "Applied · new email" },
    nodes: [
      { at: "2026-09-24T09:00:00+05:30", label: "Applied on careers site", tone: "sent" },
      {
        at: "2026-10-02T18:40:00+05:30",
        label: "Assessment invite arrived",
        detail: "HackerRank · outlook.in · not added yet",
        tone: "pending",
      },
      { at: "2026-10-07T23:59:00+05:30", label: "OA closes", tone: "upcoming" },
    ],
    next: {
      due: "today",
      when: "New email",
      label: "HackerRank invite. Add the OA so the deadline is tracked.",
      action: "Add the OA",
      secondary: "Read email",
    },
  },
  {
    id: "flipkart",
    company: "Flipkart",
    role: "SDE 2, Supply Chain",
    city: "Bengaluru",
    how: "Careers site",
    status: { tone: "quiet", label: "Quiet for 13 days" },
    nodes: [
      { at: "2026-09-20T12:00:00+05:30", label: "Applied on careers site", tone: "sent" },
      {
        at: "2026-09-20T12:05:00+05:30",
        label: "Automatic “we received it”",
        detail: "outlook.com",
        tone: "mail",
      },
    ],
    next: {
      due: "overdue",
      when: "6 days late",
      label: "No human reply since you applied. Follow up or close it.",
      action: "I followed up",
      secondary: "Close, no reply",
    },
  },
  {
    id: "microsoft",
    company: "Microsoft",
    role: "SDE II, Azure Storage",
    city: "Hyderabad",
    how: "Referral ask to Rahul Mehta",
    status: { tone: "quiet", label: "Referral ask · 7 days quiet" },
    nodes: [
      {
        at: "2026-09-26T21:00:00+05:30",
        label: "Emailed Rahul Mehta for a referral",
        tone: "sent",
        via: "Referral",
      },
    ],
    next: {
      due: "overdue",
      when: "2 days late",
      label: "Nudge Rahul. Referral asks get a nudge after 5 quiet days.",
      action: "I nudged him",
      secondary: "Close, no reply",
    },
  },
  {
    id: "quizizz",
    company: "Quizizz",
    role: "SDE-2, Backend",
    city: "Bengaluru",
    how: "Not sent yet",
    status: { tone: "preparing", label: "Not sent yet" },
    nodes: [
      {
        at: "2026-09-29T20:00:00+05:30",
        label: "Saved the opening",
        detail: "Follow-up set for 1 Oct",
        tone: "note",
      },
    ],
    next: {
      due: "overdue",
      when: "2 days late",
      label: "Finish and send the application. Your date was 1 Oct.",
      action: "Open",
    },
  },
  {
    id: "uber",
    company: "Uber",
    role: "Software Engineer II",
    city: "Hyderabad",
    how: "Careers site",
    status: { tone: "interviewing", label: "Interviewing · round 3 of 5" },
    nodes: [
      { at: "2026-09-08T10:00:00+05:30", label: "Applied on careers site", tone: "sent" },
      { at: "2026-09-12T11:00:00+05:30", label: "OA invite", detail: "CodeSignal", tone: "mail" },
      { at: "2026-09-16T10:00:00+05:30", label: "Cleared the OA", tone: "good" },
      { at: "2026-09-26T12:00:00+05:30", label: "Cleared the coding round", tone: "good" },
      {
        at: "2026-09-30T17:00:00+05:30",
        label: "LLD round booked",
        detail: "Recruiter mail · outlook.in",
        tone: "mail",
      },
      {
        at: "2026-10-06T11:00:00+05:30",
        label: "Round 3 · LLD",
        detail: "Low-level design",
        tone: "upcoming",
      },
    ],
    next: {
      due: "week",
      when: "Mon 6 Oct, 11:00 AM",
      label: "Low-level design round.",
      action: "Open",
    },
  },
  {
    id: "myntra",
    company: "Myntra",
    role: "SDE-2, Platform",
    city: "Bengaluru",
    how: "Careers site",
    status: { tone: "offer", label: "Offer · decide by 8 Oct" },
    nodes: [
      { at: "2026-08-28T10:00:00+05:30", label: "Applied on careers site", tone: "sent" },
      { at: "2026-09-03T12:00:00+05:30", label: "Cleared the OA", tone: "good" },
      { at: "2026-09-10T11:00:00+05:30", label: "Cleared DSA", tone: "good" },
      { at: "2026-09-17T11:00:00+05:30", label: "Cleared machine coding", tone: "good" },
      { at: "2026-09-25T16:00:00+05:30", label: "Cleared hiring manager", tone: "good" },
      {
        at: "2026-10-01T15:20:00+05:30",
        label: "Offer letter received",
        detail: "gmail.com",
        tone: "good",
      },
      { at: "2026-10-08T18:00:00+05:30", label: "Decide on the offer", tone: "upcoming" },
    ],
    next: {
      due: "week",
      when: "Wed 8 Oct",
      label: "Accept or decline the offer.",
      action: "Record decision",
    },
  },
  {
    id: "tekion",
    company: "Tekion",
    role: "Senior Backend Engineer",
    city: "Bengaluru",
    how: "Cold email to Vikram Rao",
    status: { tone: "applied", label: "Emailed · 3 of 5 days" },
    nodes: [
      {
        at: "2026-09-30T10:00:00+05:30",
        label: "Emailed Vikram Rao (EM)",
        tone: "sent",
        via: "Cold email",
      },
    ],
    next: {
      due: "week",
      when: "Sun 5 Oct",
      label: "Nudge Vikram if he hasn't replied.",
      action: "Open",
    },
  },
  {
    id: "oracle",
    company: "Oracle",
    role: "Senior Core Infrastructure Engineer",
    city: "Hyderabad",
    how: "Careers site",
    status: { tone: "applied", label: "Applied · yesterday" },
    nodes: [{ at: "2026-10-02T18:30:00+05:30", label: "Applied on careers site", tone: "sent" }],
    next: {
      due: "week",
      when: "Fri 9 Oct",
      label: "Follow up if there's no reply by then.",
      action: "Open",
    },
  },
  {
    id: "nutanix",
    company: "Nutanix",
    role: "MTS 3, Storage",
    city: "Bengaluru",
    how: "Careers site",
    status: { tone: "closed", label: "Rejected after DSA" },
    nodes: [
      { at: "2026-09-05T10:00:00+05:30", label: "Applied on careers site", tone: "sent" },
      { at: "2026-09-13T12:00:00+05:30", label: "Cleared the OA", tone: "good" },
      { at: "2026-09-26T11:00:00+05:30", label: "DSA round", tone: "note" },
      {
        at: "2026-09-29T11:00:00+05:30",
        label: "Rejection email",
        detail: "Not moving forward",
        tone: "bad",
      },
    ],
    next: null,
  },
];

/** Where the user is today: two fresh applications, no replies, no inboxes connected. */
export const startingOut: CompanyTimeline[] = [
  {
    id: "s-zscaler",
    company: "Zscaler",
    role: "Senior Software Engineer, Data Path",
    city: "Bengaluru",
    how: "Careers site",
    status: { tone: "applied", label: "Applied · today" },
    nodes: [
      {
        at: "2026-10-03T09:00:00+05:30",
        label: "Applied on careers site",
        detail: "Resume: Distributed systems v2.pdf",
        tone: "sent",
      },
    ],
    next: {
      due: "week",
      when: "Sat 10 Oct",
      label: "Follow up if there's no reply by then.",
      action: "Open",
    },
  },
  {
    id: "s-oracle",
    company: "Oracle",
    role: "Senior Core Infrastructure Engineer",
    city: "Hyderabad",
    how: "Careers site",
    status: { tone: "applied", label: "Applied · yesterday" },
    nodes: [{ at: "2026-10-02T18:30:00+05:30", label: "Applied on careers site", tone: "sent" }],
    next: {
      due: "week",
      when: "Fri 9 Oct",
      label: "Follow up if there's no reply by then.",
      action: "Open",
    },
  },
];

export const strayMail: StrayMail[] = [
  {
    id: "m-im",
    account: "outlook.com",
    from: "Neha Kapoor · InMobi",
    subject: "SDE-3 Backend at InMobi, Bengaluru. Open to a chat?",
    receivedAt: "2026-10-02T11:05:00+05:30",
    pile: "role",
  },
  {
    id: "m-nk",
    account: "gmail.com",
    from: "Naukri",
    subject: "12 new jobs for Backend Developer in Bengaluru",
    receivedAt: "2026-10-02T07:00:00+05:30",
    pile: "noise",
  },
  {
    id: "m-li",
    account: "outlook.in",
    from: "LinkedIn Job Alerts",
    subject: "Senior Backend Engineer at 8 companies in Hyderabad",
    receivedAt: "2026-10-03T08:00:00+05:30",
    pile: "noise",
  },
];

export type Dataset = "full" | "starting";
export const datasets: Record<
  Dataset,
  { companies: CompanyTimeline[]; mail: StrayMail[]; inboxes: number }
> = {
  full: { companies, mail: strayMail, inboxes: 3 },
  starting: { companies: startingOut, mail: [], inboxes: 0 },
};

export const isUpcoming = (node: TimelineNode) => Date.parse(node.at) > NOW.getTime();

const dueRank: Record<Due, number> = { overdue: 0, today: 1, week: 2 };
/** Needs you (overdue or today) first, then active by next date, closed last. */
export function grouped(list: CompanyTimeline[]) {
  const needs = list
    .filter((row) => row.next && row.next.due !== "week")
    .sort((a, b) => dueRank[a.next!.due] - dueRank[b.next!.due]);
  const closed = list.filter((row) => row.status.tone === "closed");
  const active = list.filter((row) => !needs.includes(row) && !closed.includes(row));
  return { needs, active, closed };
}
