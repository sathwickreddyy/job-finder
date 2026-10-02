import type { RoundKind } from "@/features/companies/metrics";

/* Sample records for the options gallery only. The clock is pinned so the sample stays stable. */
export const NOW = new Date("2026-10-03T10:30:00+05:30");
export const SILENCE_DAYS = { DIRECT: 7, OUTREACH: 5 } as const;

export const accounts = ["gmail.com", "outlook.in", "outlook.com"] as const;
export type Account = (typeof accounts)[number];
export type Method = "DIRECT" | "REFERRAL" | "COLD_EMAIL" | "LINKEDIN_MESSAGE";
export const phases = ["Preparing", "Applied", "Interviewing", "Decision", "Closed"] as const;
export type Phase = (typeof phases)[number];
export type RoundOutcome = "PASSED" | "FAILED" | "SCHEDULED";
export type Round = { kind: RoundKind; name: string; at: string; outcome: RoundOutcome };
export type TimelineEntry = { at: string; text: string; tone: "good" | "bad" | "neutral" | "mail" };

export type SampleRecord = {
  id: string;
  company: string;
  role: string;
  city: string;
  method: Method;
  phase: Phase;
  sentAt: string | null;
  lastHeardAt: string | null;
  rounds: Round[];
  expectedRounds?: number;
  linkedTo?: string;
  contact?: string;
  resume: string;
  closed?: "Rejected" | "Withdrew" | "No reply" | "Accepted";
  latest: string;
  timeline: TimelineEntry[];
};

export const methodLabel: Record<Method, string> = {
  DIRECT: "Applied directly",
  REFERRAL: "Referral ask",
  COLD_EMAIL: "Cold email",
  LINKEDIN_MESSAGE: "LinkedIn message",
};

export const records: SampleRecord[] = [
  {
    id: "razorpay",
    company: "Razorpay",
    role: "SDE-2, Payments Backend",
    city: "Bengaluru",
    method: "DIRECT",
    phase: "Interviewing",
    sentAt: "2026-09-18T11:00:00+05:30",
    lastHeardAt: "2026-10-03T09:12:00+05:30",
    rounds: [
      {
        kind: "ONLINE_ASSESSMENT",
        name: "HackerRank OA",
        at: "2026-09-22T19:00:00+05:30",
        outcome: "PASSED",
      },
      {
        kind: "DSA",
        name: "Problem solving",
        at: "2026-10-03T16:00:00+05:30",
        outcome: "SCHEDULED",
      },
    ],
    expectedRounds: 4,
    linkedTo: "razorpay-ref",
    resume: "Backend v4 · payments.pdf",
    latest: "Round 2 confirmed for today, 4:00 PM",
    timeline: [
      { at: "2026-10-03T09:12:00+05:30", text: "Recruiter confirmed round 2 · DSA", tone: "mail" },
      { at: "2026-09-25T14:00:00+05:30", text: "Passed the HackerRank OA", tone: "good" },
      { at: "2026-09-20T10:00:00+05:30", text: "OA invite received", tone: "mail" },
      {
        at: "2026-09-18T11:00:00+05:30",
        text: "Applied on careers site with Backend v4",
        tone: "neutral",
      },
    ],
  },
  {
    id: "razorpay-ref",
    company: "Razorpay",
    role: "SDE-2, Payments Backend",
    city: "Bengaluru",
    method: "REFERRAL",
    phase: "Applied",
    sentAt: "2026-09-16T20:00:00+05:30",
    lastHeardAt: "2026-09-17T09:30:00+05:30",
    rounds: [],
    linkedTo: "razorpay",
    contact: "Ananya Iyer",
    resume: "Backend v4 · payments.pdf",
    latest: "Ananya submitted the referral",
    timeline: [
      { at: "2026-09-17T09:30:00+05:30", text: "Ananya replied: referral submitted", tone: "good" },
      { at: "2026-09-16T20:00:00+05:30", text: "Asked Ananya Iyer on LinkedIn", tone: "neutral" },
    ],
  },
  {
    id: "microsoft-ref",
    company: "Microsoft",
    role: "SDE II, Azure Storage",
    city: "Hyderabad",
    method: "REFERRAL",
    phase: "Applied",
    sentAt: "2026-09-26T21:00:00+05:30",
    lastHeardAt: null,
    rounds: [],
    contact: "Rahul Mehta",
    resume: "Distributed systems v2.pdf",
    latest: "No reply from Rahul yet",
    timeline: [
      { at: "2026-09-26T21:00:00+05:30", text: "Asked Rahul Mehta by email", tone: "neutral" },
    ],
  },
  {
    id: "flipkart",
    company: "Flipkart",
    role: "SDE 2, Supply Chain",
    city: "Bengaluru",
    method: "DIRECT",
    phase: "Applied",
    sentAt: "2026-09-20T12:00:00+05:30",
    lastHeardAt: null,
    rounds: [],
    resume: "Backend v4 · payments.pdf",
    latest: "Auto-acknowledgement only",
    timeline: [
      { at: "2026-09-20T12:05:00+05:30", text: "Application received (automatic)", tone: "mail" },
      { at: "2026-09-20T12:00:00+05:30", text: "Applied on careers site", tone: "neutral" },
    ],
  },
  {
    id: "uber",
    company: "Uber",
    role: "Software Engineer II",
    city: "Hyderabad",
    method: "DIRECT",
    phase: "Interviewing",
    sentAt: "2026-09-08T10:00:00+05:30",
    lastHeardAt: "2026-09-30T17:00:00+05:30",
    rounds: [
      {
        kind: "ONLINE_ASSESSMENT",
        name: "CodeSignal OA",
        at: "2026-09-15T18:00:00+05:30",
        outcome: "PASSED",
      },
      { kind: "DSA", name: "Coding", at: "2026-09-24T15:00:00+05:30", outcome: "PASSED" },
      {
        kind: "LLD",
        name: "Low-level design",
        at: "2026-10-06T11:00:00+05:30",
        outcome: "SCHEDULED",
      },
    ],
    expectedRounds: 5,
    resume: "Distributed systems v2.pdf",
    latest: "LLD round on Monday",
    timeline: [
      { at: "2026-09-30T17:00:00+05:30", text: "LLD round scheduled for 6 Oct", tone: "mail" },
      { at: "2026-09-26T12:00:00+05:30", text: "Passed the coding round", tone: "good" },
      { at: "2026-09-16T10:00:00+05:30", text: "Passed the OA", tone: "good" },
      { at: "2026-09-08T10:00:00+05:30", text: "Applied on careers site", tone: "neutral" },
    ],
  },
  {
    id: "zscaler",
    company: "Zscaler",
    role: "Senior Software Engineer, Data Path",
    city: "Bengaluru",
    method: "DIRECT",
    phase: "Applied",
    sentAt: "2026-09-24T09:00:00+05:30",
    lastHeardAt: "2026-10-02T18:40:00+05:30",
    rounds: [],
    resume: "Distributed systems v2.pdf",
    latest: "Assessment invite waiting in mail",
    timeline: [
      {
        at: "2026-10-02T18:40:00+05:30",
        text: "HackerRank invite arrived (not linked yet)",
        tone: "mail",
      },
      { at: "2026-09-24T09:00:00+05:30", text: "Applied on careers site", tone: "neutral" },
    ],
  },
  {
    id: "myntra",
    company: "Myntra",
    role: "SDE-2, Platform",
    city: "Bengaluru",
    method: "DIRECT",
    phase: "Decision",
    sentAt: "2026-08-28T10:00:00+05:30",
    lastHeardAt: "2026-10-01T15:20:00+05:30",
    rounds: [
      { kind: "ONLINE_ASSESSMENT", name: "OA", at: "2026-09-02T18:00:00+05:30", outcome: "PASSED" },
      { kind: "DSA", name: "DSA", at: "2026-09-10T11:00:00+05:30", outcome: "PASSED" },
      { kind: "LLD", name: "Machine coding", at: "2026-09-17T11:00:00+05:30", outcome: "PASSED" },
      {
        kind: "HIRING_MANAGER",
        name: "Hiring manager",
        at: "2026-09-25T16:00:00+05:30",
        outcome: "PASSED",
      },
    ],
    expectedRounds: 4,
    resume: "Backend v4 · payments.pdf",
    latest: "Offer received · decide by 8 Oct",
    timeline: [
      { at: "2026-10-01T15:20:00+05:30", text: "Offer letter received", tone: "good" },
      { at: "2026-09-25T16:00:00+05:30", text: "Hiring manager round done", tone: "good" },
    ],
  },
  {
    id: "tekion",
    company: "Tekion",
    role: "Senior Backend Engineer",
    city: "Bengaluru",
    method: "COLD_EMAIL",
    phase: "Applied",
    sentAt: "2026-09-30T10:00:00+05:30",
    lastHeardAt: null,
    rounds: [],
    contact: "Vikram Rao",
    resume: "Backend v4 · payments.pdf",
    latest: "Emailed the engineering manager",
    timeline: [
      { at: "2026-09-30T10:00:00+05:30", text: "Emailed Vikram Rao (EM)", tone: "neutral" },
    ],
  },
  {
    id: "oracle",
    company: "Oracle",
    role: "Senior Core Infrastructure Engineer",
    city: "Hyderabad",
    method: "DIRECT",
    phase: "Applied",
    sentAt: "2026-10-02T18:30:00+05:30",
    lastHeardAt: null,
    rounds: [],
    resume: "Distributed systems v2.pdf",
    latest: "Applied yesterday",
    timeline: [
      { at: "2026-10-02T18:30:00+05:30", text: "Applied on careers site", tone: "neutral" },
    ],
  },
  {
    id: "quizizz",
    company: "Quizizz",
    role: "SDE-2, Backend",
    city: "Bengaluru",
    method: "DIRECT",
    phase: "Preparing",
    sentAt: null,
    lastHeardAt: null,
    rounds: [],
    resume: "Backend v4 · payments.pdf",
    latest: "Resume tailoring in progress",
    timeline: [
      {
        at: "2026-09-29T20:00:00+05:30",
        text: "Saved the opening, follow-up set for 1 Oct",
        tone: "neutral",
      },
    ],
  },
  {
    id: "nutanix",
    company: "Nutanix",
    role: "MTS 3, Storage",
    city: "Bengaluru",
    method: "DIRECT",
    phase: "Closed",
    closed: "Rejected",
    sentAt: "2026-09-05T10:00:00+05:30",
    lastHeardAt: "2026-09-29T11:00:00+05:30",
    rounds: [
      { kind: "ONLINE_ASSESSMENT", name: "OA", at: "2026-09-12T18:00:00+05:30", outcome: "PASSED" },
      { kind: "DSA", name: "DSA", at: "2026-09-26T11:00:00+05:30", outcome: "FAILED" },
    ],
    resume: "Distributed systems v2.pdf",
    latest: "Not moving forward after DSA",
    timeline: [
      { at: "2026-09-29T11:00:00+05:30", text: "Rejection received", tone: "bad" },
      { at: "2026-09-26T11:00:00+05:30", text: "DSA round done", tone: "neutral" },
    ],
  },
];

export const byId = Object.fromEntries(records.map((row) => [row.id, row])) as Record<
  string,
  SampleRecord
>;

export type Reason = "followup" | "silence" | "round" | "mail" | "deadline";
export type Due = "overdue" | "today" | "week";
export type QueueItem = {
  id: string;
  recordId: string;
  due: Due;
  dueAt: string;
  reason: Reason;
  title: string;
  detail: string;
  primary: string;
  secondary?: string;
};

export const queue: QueueItem[] = [
  {
    id: "q-ms",
    recordId: "microsoft-ref",
    due: "overdue",
    dueAt: "2026-10-01T21:00:00+05:30",
    reason: "silence",
    title: "No reply from Rahul Mehta",
    detail: "Microsoft referral ask · 7 days quiet, nudge after 5",
    primary: "Record a nudge",
    secondary: "Mark no reply",
  },
  {
    id: "q-fk",
    recordId: "flipkart",
    due: "overdue",
    dueAt: "2026-09-27T12:00:00+05:30",
    reason: "silence",
    title: "Flipkart has been quiet",
    detail: "Applied 20 Sep · 13 days with only an auto-reply",
    primary: "Record follow-up",
    secondary: "Mark ghosted",
  },
  {
    id: "q-qz",
    recordId: "quizizz",
    due: "overdue",
    dueAt: "2026-10-01T09:00:00+05:30",
    reason: "followup",
    title: "Finish the Quizizz application",
    detail: "Your follow-up date was 1 Oct",
    primary: "Open record",
    secondary: "Move date",
  },
  {
    id: "q-rz",
    recordId: "razorpay",
    due: "today",
    dueAt: "2026-10-03T16:00:00+05:30",
    reason: "round",
    title: "Razorpay round 2 · DSA at 4:00 PM",
    detail: "Problem solving, 60 min · confirmed by mail this morning",
    primary: "Record result",
    secondary: "Open record",
  },
  {
    id: "q-zs",
    recordId: "zscaler",
    due: "today",
    dueAt: "2026-10-02T18:40:00+05:30",
    reason: "mail",
    title: "Zscaler sent an assessment invite",
    detail: "HackerRank · complete by 7 Oct · arrived at outlook.in",
    primary: "Link and add OA",
    secondary: "Open mail",
  },
  {
    id: "q-ub",
    recordId: "uber",
    due: "week",
    dueAt: "2026-10-06T11:00:00+05:30",
    reason: "round",
    title: "Uber round 3 · LLD",
    detail: "Mon 6 Oct, 11:00 AM",
    primary: "Open record",
  },
  {
    id: "q-zs-oa",
    recordId: "zscaler",
    due: "week",
    dueAt: "2026-10-07T23:59:00+05:30",
    reason: "deadline",
    title: "Zscaler OA closes",
    detail: "Tue 7 Oct, 11:59 PM",
    primary: "Open record",
  },
  {
    id: "q-my",
    recordId: "myntra",
    due: "week",
    dueAt: "2026-10-08T18:00:00+05:30",
    reason: "followup",
    title: "Decide on the Myntra offer",
    detail: "Wed 8 Oct · the date you set",
    primary: "Record decision",
  },
];

export type MailKind =
  | "Interview"
  | "Assessment"
  | "Recruiter outreach"
  | "Offer"
  | "Rejection"
  | "Acknowledgement"
  | "Job alert";
export type SampleMail = {
  id: string;
  account: Account;
  fromName: string;
  from: string;
  subject: string;
  snippet: string;
  receivedAt: string;
  kind: MailKind;
  match?: { recordId: string; strength: "Strong" | "Possible" };
  handled?: "Linked" | "Saved" | "Dismissed";
};

export const mail: SampleMail[] = [
  {
    id: "m-rz",
    account: "gmail.com",
    fromName: "Razorpay Talent",
    from: "talent@razorpay.com",
    subject: "Interview confirmed: Problem Solving, Sat 3 Oct 4:00 PM",
    snippet:
      "Hi, your second round is confirmed. The Google Meet link is below. Please keep an IDE ready…",
    receivedAt: "2026-10-03T09:12:00+05:30",
    kind: "Interview",
    match: { recordId: "razorpay", strength: "Strong" },
    handled: "Linked",
  },
  {
    id: "m-zs",
    account: "outlook.in",
    fromName: "HackerRank for Zscaler",
    from: "no-reply@hackerrank.com",
    subject: "Zscaler has invited you to an online assessment",
    snippet:
      "You have been invited to the Senior SWE assessment. The test closes on 7 Oct, 11:59 PM IST.",
    receivedAt: "2026-10-02T18:40:00+05:30",
    kind: "Assessment",
    match: { recordId: "zscaler", strength: "Strong" },
  },
  {
    id: "m-im",
    account: "outlook.com",
    fromName: "Neha Kapoor · InMobi",
    from: "neha.kapoor@inmobi.com",
    subject: "SDE-3 Backend at InMobi, Bengaluru. Open to a chat?",
    snippet:
      "I came across your profile and think you'd be a strong fit for our ads platform team…",
    receivedAt: "2026-10-02T11:05:00+05:30",
    kind: "Recruiter outreach",
  },
  {
    id: "m-nk",
    account: "gmail.com",
    fromName: "Naukri",
    from: "jobalerts@naukri.com",
    subject: "12 new jobs for Backend Developer in Bengaluru",
    snippet: "Recommended jobs based on your profile…",
    receivedAt: "2026-10-02T07:00:00+05:30",
    kind: "Job alert",
  },
  {
    id: "m-my",
    account: "gmail.com",
    fromName: "Myntra People Team",
    from: "offers@myntra.com",
    subject: "Your offer from Myntra",
    snippet: "Congratulations! Please find your offer letter attached. Kindly respond by 8 Oct.",
    receivedAt: "2026-10-01T15:20:00+05:30",
    kind: "Offer",
    match: { recordId: "myntra", strength: "Strong" },
    handled: "Linked",
  },
  {
    id: "m-ub",
    account: "outlook.in",
    fromName: "Uber Recruiting",
    from: "recruiting@uber.com",
    subject: "Scheduling: Low-level design interview",
    snippet: "Your LLD interview is confirmed for Monday, 6 Oct at 11:00 AM IST.",
    receivedAt: "2026-09-30T17:00:00+05:30",
    kind: "Interview",
    match: { recordId: "uber", strength: "Strong" },
    handled: "Linked",
  },
  {
    id: "m-fk",
    account: "outlook.com",
    fromName: "Flipkart Careers",
    from: "careers@flipkart.com",
    subject: "We received your application",
    snippet: "Thank you for applying to SDE 2. Our team will review your profile…",
    receivedAt: "2026-09-20T12:05:00+05:30",
    kind: "Acknowledgement",
    match: { recordId: "flipkart", strength: "Possible" },
  },
];

const day = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(iso));
export function daysSince(iso: string, now = NOW) {
  return Math.round((Date.parse(day(now.toISOString())) - Date.parse(day(iso))) / 86_400_000);
}
export function shortDate(iso: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(iso));
}
export function timeOf(iso: string) {
  return new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  }).format(new Date(iso));
}
export function mailGroup(iso: string) {
  const days = daysSince(iso);
  return days <= 0 ? "Today" : days === 1 ? "Yesterday" : days <= 7 ? "This week" : "Earlier";
}
