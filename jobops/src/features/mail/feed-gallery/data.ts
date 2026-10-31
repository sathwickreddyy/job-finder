/** Sample job mail pinned to Sat 31 Oct 2026, 10:30 am IST. Fictional companies and people only. */
export const NOW = new Date("2026-10-31T10:30:00+05:30");

export const feedTags = [
  "application",
  "referral",
  "call",
  "process",
  "offer",
  "rejection",
  "bgv",
  "joining",
  "opportunity",
  "other",
] as const;
export type FeedTag = (typeof feedTags)[number];

export type Inbox = "Gmail" | "Outlook (outlook.in)" | "Outlook (outlook.com)";
export const inboxes: Inbox[] = ["Gmail", "Outlook (outlook.in)", "Outlook (outlook.com)"];

export type FeedMail = {
  id: string;
  at: string;
  company: string;
  appId?: string;
  /** Matched to an application but not linked yet; shows a one-click Link. */
  suggestedApp?: string;
  tag: FeedTag;
  senderName: string;
  sender: string;
  inbox: Inbox;
  folder: string;
  subject: string;
  text: string;
  open: boolean;
  /** What it asks of you and by when, for the needs-you highlight. */
  due?: { at: string; label: string };
};

const ist = (value: string) => `${value}+05:30`;

export const feed: FeedMail[] = [
  {
    id: "m1",
    at: ist("2026-10-31T09:42"),
    company: "tessellate",
    appId: "a-tes",
    tag: "offer",
    senderName: "Kavya Iyer",
    sender: "kavya.iyer@tessellate.example",
    inbox: "Gmail",
    folder: "Inbox",
    subject: "Your offer: SDE 2, Payments",
    text: "We're delighted to offer you the SDE 2 role on Payments. Annual fixed pay is ₹33 LPA with a ₹4 LPA joining bonus. Please confirm by Wed 4 Nov.",
    open: true,
    due: { at: ist("2026-11-04T18:00"), label: "Reply by Wed" },
  },
  {
    id: "m2",
    at: ist("2026-10-31T08:15"),
    company: "northstar",
    appId: "a-ns1",
    tag: "call",
    senderName: "Northstar Talent",
    sender: "talent@northstar.example",
    inbox: "Outlook (outlook.in)",
    folder: "Inbox",
    subject: "Interview invitation: system design round",
    text: "You've cleared the DSA round. Pick a 60-minute slot for system design with Ritika before Mon 2 Nov.",
    open: true,
    due: { at: ist("2026-11-02T12:00"), label: "Book a slot by Mon" },
  },
  {
    id: "m3",
    at: ist("2026-10-30T18:20"),
    company: "orbit",
    appId: "a-orb",
    tag: "call",
    senderName: "HackerRank for Orbit",
    sender: "noreply@hackerrank.example",
    inbox: "Gmail",
    folder: "Inbox",
    subject: "Complete your Orbit online assessment",
    text: "Your 90-minute assessment link is ready. It expires on Sun 1 Nov at 11:59 pm IST.",
    open: true,
    due: { at: ist("2026-11-01T23:59"), label: "OA due Sun" },
  },
  {
    id: "m4",
    at: ist("2026-10-30T14:03"),
    company: "northstar",
    appId: "a-ns1",
    tag: "referral",
    senderName: "Priya Menon",
    sender: "priya.menon@northstar.example",
    inbox: "Gmail",
    folder: "Inbox",
    subject: "I've referred you for Backend Engineer II",
    text: "Done! You should get an email from the portal. Ping me if the recruiter doesn't reach out this week.",
    open: false,
  },
  {
    id: "m5",
    at: ist("2026-10-30T11:10"),
    company: "lumen",
    appId: "a-lum",
    tag: "application",
    senderName: "Lumen Careers",
    sender: "noreply@lumen.example",
    inbox: "Outlook (outlook.in)",
    folder: "Junk",
    subject: "Thank you for your application to Lumen",
    text: "We've received your application for SDE 2, Data Platform. Our team reviews every application within two weeks.",
    open: false,
  },
  {
    id: "m6",
    at: ist("2026-10-29T16:45"),
    company: "halcyon",
    appId: "a-hal",
    tag: "rejection",
    senderName: "Halcyon Recruiting",
    sender: "jobs@halcyon.example",
    inbox: "Gmail",
    folder: "Inbox",
    subject: "Update on your application",
    text: "Thank you for your time. We've decided not to move forward with your application for Backend Engineer.",
    open: false,
  },
  {
    id: "m7",
    at: ist("2026-10-29T10:05"),
    company: "northstar",
    appId: "a-ns1",
    tag: "process",
    senderName: "Northstar Talent",
    sender: "talent@northstar.example",
    inbox: "Outlook (outlook.in)",
    folder: "Inbox",
    subject: "Feedback and next steps after your DSA round",
    text: "The panel was positive. Next is system design; we'll send an invitation shortly.",
    open: false,
  },
  {
    id: "m8",
    at: ist("2026-10-28T12:30"),
    company: "quill",
    tag: "opportunity",
    senderName: "Arjun at Quill",
    sender: "arjun@quill.example",
    inbox: "Gmail",
    folder: "Inbox",
    subject: "Senior Backend role at Quill, open to a chat?",
    text: "We're hiring a senior backend engineer in Hyderabad, ₹35–42 LPA. Would you be open to a 20-minute call?",
    open: true,
  },
  {
    id: "m9",
    at: ist("2026-10-27T09:00"),
    company: "fernwood",
    suggestedApp: "a-fer",
    tag: "application",
    senderName: "Fernwood Hiring Team",
    sender: "no-reply@ashbyhq.example",
    inbox: "Gmail",
    folder: "Inbox",
    subject: "Thanks for applying to Fernwood",
    text: "Your application for Senior Backend Engineer has been submitted.",
    open: false,
  },
  {
    id: "m10",
    at: ist("2026-10-24T17:40"),
    company: "tessellate",
    appId: "a-tes",
    tag: "other",
    senderName: "Tessellate Hiring",
    sender: "hiring@tessellate.example",
    inbox: "Gmail",
    folder: "Inbox",
    subject: "Tell us about your interview experience",
    text: "A two-minute survey about your loop. It doesn't affect your candidacy.",
    open: false,
  },
  {
    id: "m11",
    at: ist("2022-03-14T10:20"),
    company: "kestrel",
    appId: "a-kes",
    tag: "joining",
    senderName: "Kestrel People Team",
    sender: "people@kestrel.example",
    inbox: "Outlook (outlook.com)",
    folder: "Inbox",
    subject: "Your joining details for Mon 4 April",
    text: "Welcome aboard! Report to the Bengaluru office at 9:30 am. Bring your ID and signed documents.",
    open: false,
  },
  {
    id: "m12",
    at: ist("2022-03-04T08:05"),
    company: "kestrel",
    appId: "a-kes",
    tag: "bgv",
    senderName: "First Advantage",
    sender: "noreply@fadv.example",
    inbox: "Outlook (outlook.com)",
    folder: "Inbox",
    subject: "Reminder: complete your background screen for Kestrel",
    text: "Kestrel has asked First Advantage to verify your employment and education. Please finish the form.",
    open: false,
  },
  {
    id: "m13",
    at: ist("2022-02-15T19:30"),
    company: "kestrel",
    appId: "a-kes",
    tag: "offer",
    senderName: "Kestrel Talent",
    sender: "talent@kestrel.example",
    inbox: "Outlook (outlook.com)",
    folder: "Inbox",
    subject: "Offer letter: Software Engineer",
    text: "We're pleased to offer you the Software Engineer role starting Mon 4 April 2022.",
    open: false,
  },
];

/** Booked rounds and deadlines that are not emails, for the needs-you highlight. */
export const upcoming = [
  {
    id: "u1",
    at: ist("2026-11-03T15:00"),
    company: "northstar",
    title: "HLD round with Ritika",
    label: "Tue, 3:00 pm",
  },
];

export type CompanyStatus =
  "offer" | "interviewing" | "applied" | "quiet" | "rejected" | "mailOnly" | "none";
export type SampleCompany = {
  key: string;
  name: string;
  city: string;
  status: CompanyStatus;
  /** One line under the status: what is happening and when. */
  detail: string;
  stage: 0 | 1 | 2 | 3;
  previous?: { role: string; joined: string; left?: string };
};

export const companies: SampleCompany[] = [
  {
    key: "tessellate",
    name: "Tessellate",
    city: "Bengaluru",
    status: "offer",
    detail: "Reply by Wed 4 Nov",
    stage: 2,
  },
  {
    key: "northstar",
    name: "Northstar",
    city: "Bengaluru",
    status: "interviewing",
    detail: "HLD round Tue, 3:00 pm",
    stage: 1,
  },
  {
    key: "orbit",
    name: "Orbit",
    city: "Hyderabad",
    status: "interviewing",
    detail: "OA due Sun 1 Nov",
    stage: 1,
  },
  {
    key: "lumen",
    name: "Lumen",
    city: "Bengaluru",
    status: "applied",
    detail: "Applied 29 Oct, acknowledged",
    stage: 0,
  },
  {
    key: "fernwood",
    name: "Fernwood",
    city: "Hyderabad",
    status: "quiet",
    detail: "8 days without a reply",
    stage: 0,
  },
  {
    key: "halcyon",
    name: "Halcyon",
    city: "Bengaluru",
    status: "rejected",
    detail: "Not moving forward, 29 Oct",
    stage: 0,
  },
  {
    key: "quill",
    name: "Quill",
    city: "Hyderabad",
    status: "mailOnly",
    detail: "Recruiter wrote on 28 Oct",
    stage: 0,
  },
  {
    key: "kestrel",
    name: "Kestrel",
    city: "Bengaluru",
    status: "none",
    detail: "Software Engineer, Apr 2022 to Sep 2024",
    stage: 3,
    previous: { role: "Software Engineer", joined: "Apr 2022", left: "Sep 2024" },
  },
];
export const companyName = (key: string) => companies.find((c) => c.key === key)?.name ?? key;

export type SampleApplication = {
  id: string;
  company: string;
  role: string;
  method: string;
  status: CompanyStatus;
  statusText: string;
  next: string;
  due?: { label: string; tone: "now" | "late" | "calm" };
  appliedAt: string;
  previous?: boolean;
};
export const applications: SampleApplication[] = [
  {
    id: "a-tes",
    company: "tessellate",
    role: "SDE 2, Payments",
    method: "Applied directly",
    status: "offer",
    statusText: "Offer",
    next: "Reply to Kavya's offer",
    due: { label: "Wed", tone: "now" },
    appliedAt: ist("2026-10-02T19:05"),
  },
  {
    id: "a-ns1",
    company: "northstar",
    role: "Backend Engineer II",
    method: "Referral from Priya",
    status: "interviewing",
    statusText: "Interviewing",
    next: "Book the system design slot",
    due: { label: "Mon", tone: "now" },
    appliedAt: ist("2026-10-20T10:00"),
  },
  {
    id: "a-orb",
    company: "orbit",
    role: "Backend SDE",
    method: "Applied directly",
    status: "interviewing",
    statusText: "OA sent",
    next: "Finish the online assessment",
    due: { label: "Sun", tone: "now" },
    appliedAt: ist("2026-10-22T09:30"),
  },
  {
    id: "a-ns2",
    company: "northstar",
    role: "Platform Engineer",
    method: "Applied directly",
    status: "quiet",
    statusText: "Quiet",
    next: "Follow up, 12 days without a reply",
    due: { label: "5 days late", tone: "late" },
    appliedAt: ist("2026-10-19T12:00"),
  },
  {
    id: "a-lum",
    company: "lumen",
    role: "SDE 2, Data Platform",
    method: "Applied directly",
    status: "applied",
    statusText: "Applied",
    next: "Wait until Thu 5 Nov",
    due: { label: "Thu", tone: "calm" },
    appliedAt: ist("2026-10-29T21:00"),
  },
  {
    id: "a-fer",
    company: "fernwood",
    role: "Senior Backend Engineer",
    method: "Applied directly",
    status: "quiet",
    statusText: "Quiet",
    next: "Follow up, 8 days without a reply",
    due: { label: "1 day late", tone: "late" },
    appliedAt: ist("2026-10-23T08:40"),
  },
  {
    id: "a-hal",
    company: "halcyon",
    role: "Backend Engineer",
    method: "Applied directly",
    status: "rejected",
    statusText: "Rejected",
    next: "Closed on 29 Oct",
    appliedAt: ist("2026-10-12T11:00"),
  },
  {
    id: "a-kes",
    company: "kestrel",
    role: "Software Engineer",
    method: "Previous job",
    status: "none",
    statusText: "Joined Apr 2022",
    next: "Left Sep 2024",
    appliedAt: ist("2022-02-01T10:00"),
    previous: true,
  },
];

/* ---------- Company search ---------- */

export type SearchRule = {
  addresses: string[];
  domains: string[];
  keywords: string[];
  aliases: string[];
  never: string[];
};
export const northstarRule: SearchRule = {
  addresses: ["talent@northstar.example", "priya.menon@northstar.example"],
  domains: ["northstar.example"],
  aliases: [],
  keywords: ["Northstar Labs", "Northstar Talent Acquisition"],
  never: ["Northstar newsletter"],
};
/** Phrases that would claim every company's mail. */
export const genericWords = [
  "application",
  "interview",
  "job",
  "jobs",
  "hiring",
  "recruiter",
  "careers",
  "offer",
  "assessment",
];
/** Senders shared by many companies, never added by Include this. */
export const sharedDomains = [
  "gmail.example",
  "ashbyhq.example",
  "myworkday.example",
  "greenhouse.example",
  "hackerrank.example",
  "fadv.example",
];

export type RunItem = {
  id: string;
  at: string;
  senderName: string;
  sender: string;
  folder: string;
  subject: string;
  kept: boolean;
  tag?: FeedTag;
  /** For dropped mail: the step that dropped it, in plain words. */
  reason?: string;
};
export type RunPage = {
  fetched: number;
  alreadyTracked: number;
  items: RunItem[];
};
export type InboxRun = {
  inbox: Inbox;
  pages: RunPage[];
  failure?: string;
};

export const northstarRun: InboxRun[] = [
  {
    inbox: "Gmail",
    pages: [
      {
        fetched: 25,
        alreadyTracked: 20,
        items: [
          {
            id: "r1",
            at: ist("2026-10-30T14:03"),
            senderName: "Priya Menon",
            sender: "priya.menon@northstar.example",
            folder: "Inbox",
            subject: "I've referred you for Backend Engineer II",
            kept: true,
            tag: "referral",
          },
          {
            id: "r2",
            at: ist("2026-10-26T09:12"),
            senderName: "Northstar Careers",
            sender: "careers@northstar.example",
            folder: "Promotions",
            subject: "Northstar is hiring: 12 new roles near you",
            kept: false,
            reason: "Job digest or promotion",
          },
          {
            id: "r3",
            at: ist("2026-10-21T18:44"),
            senderName: "Meera (Northstar)",
            sender: "meera.k@gmail.example",
            folder: "Inbox",
            subject: "Northstar Labs: quick question about your notice period",
            kept: false,
            reason: "Matched Northstar Labs in the subject; no job event recognised",
          },
          {
            id: "r4",
            at: ist("2026-10-20T10:02"),
            senderName: "Northstar Talent",
            sender: "talent@northstar.example",
            folder: "Inbox",
            subject: "We've received your application",
            kept: true,
            tag: "application",
          },
        ],
      },
      {
        fetched: 9,
        alreadyTracked: 6,
        items: [
          {
            id: "r5",
            at: ist("2026-09-12T08:30"),
            senderName: "Northstar Labs",
            sender: "news@northstar.example",
            folder: "Inbox",
            subject: "The Northstar newsletter, September",
            kept: false,
            reason: "Contains a Never include phrase: Northstar newsletter",
          },
          {
            id: "r6",
            at: ist("2026-08-28T16:15"),
            senderName: "Northstar Engineering",
            sender: "eng-hiring@northstar.example",
            folder: "Inbox",
            subject: "Hello from the Northstar platform team",
            kept: false,
            reason: "Matched northstar.example; no job event recognised",
          },
        ],
      },
    ],
  },
  {
    inbox: "Outlook (outlook.in)",
    pages: [
      {
        fetched: 14,
        alreadyTracked: 11,
        items: [
          {
            id: "r7",
            at: ist("2026-10-29T10:05"),
            senderName: "Northstar Talent",
            sender: "talent@northstar.example",
            folder: "Junk",
            subject: "Feedback and next steps after your DSA round",
            kept: true,
            tag: "process",
          },
          {
            id: "r8",
            at: ist("2026-10-23T12:00"),
            senderName: "Northstar via Workday",
            sender: "northstar@myworkday.example",
            folder: "Inbox",
            subject: "Your Northstar candidate account is ready",
            kept: false,
            reason: "Account notification without an application update",
          },
          {
            id: "r9",
            at: ist("2026-10-31T08:15"),
            senderName: "Northstar Talent",
            sender: "talent@northstar.example",
            folder: "Inbox",
            subject: "Interview invitation: system design round",
            kept: true,
            tag: "call",
          },
        ],
      },
    ],
  },
  {
    inbox: "Outlook (outlook.com)",
    pages: [],
    failure: "Sign-in expired. Reconnect this inbox from Inboxes, then search again.",
  },
];

/** The exact query each provider receives for a rule and window. */
export function providerQuery(inbox: Inbox, rule: SearchRule, days: number) {
  const until = Math.floor(NOW.getTime() / 1000);
  const since = until - days * 86_400;
  const q = (value: string) => JSON.stringify(value);
  const names = ["Northstar", ...rule.aliases, ...rule.keywords];
  if (inbox === "Gmail") {
    const any = [
      ...rule.addresses.map((v) => `from:${q(v)}`),
      ...rule.domains.map((v) => `from:${q(v)}`),
      ...names.flatMap((v) => [`subject:${q(v)}`, `from:${q(v)}`]),
    ];
    const never = rule.never.map((v) => `-${q(v)}`);
    return `-in:sent -in:drafts after:${since} before:${until} {${any.join(" ")}} ${never.join(" ")}`.trim();
  }
  const day = (seconds: number) => new Date(seconds * 1000).toISOString().slice(0, 10);
  const any = [
    ...rule.addresses.map((v) => `from:${q(v)}`),
    ...rule.domains.map((v) => `from:${q(v)}`),
    ...names.flatMap((v) => [`subject:${q(v)}`, `from:${q(v)}`]),
  ];
  return `(${any.join(" OR ")}) AND received>=${day(since - 86_400)} AND received<=${day(until + 86_400)}`;
}
