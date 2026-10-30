import type { OutcomeId } from "@/features/applications/phase";
import type { MailTag } from "@/features/mail/tags";

/** Sample companies pinned to Sat 31 Oct 2026, 10:30 am IST. Fictional names only. */
export const NOW = new Date("2026-10-31T10:30:00+05:30");

export type Role = { id: string; title: string; method: string; status: string };
export type MailEntry = {
  type: "mail";
  id: string;
  at: string;
  roleId?: string;
  tag: MailTag;
  kind: string;
  senderName: string;
  sender: string;
  account: "Gmail" | "Outlook";
  folder: string;
  subject: string;
  text: string;
  open: boolean;
  /** The chip the email itself points to; "info" suggests Just info. */
  suggested?: OutcomeId | "info";
  /** Why that chip is suggested, in the words the email uses. */
  why?: string;
  outcomes?: OutcomeId[];
  /** What handling recorded, shown once the email no longer needs you. */
  handled?: string;
};
export type StepIcon = "applied" | "outreach" | "round" | "closed" | "submitted";
export type StepEntry = {
  type: "step";
  id: string;
  at: string;
  roleId?: string;
  by: "you" | "them";
  icon: StepIcon;
  text: string;
};
export type Entry = MailEntry | StepEntry;
export type Group = "needs" | "waiting" | "closed";
export type Company = {
  key: string;
  name: string;
  city: string;
  group: Group;
  signal: string;
  due?: { label: string; tone: "now" | "late" | "calm" };
  next?: string;
  roles: Role[];
  facts: { pay: string; payNote: string; rounds: string[]; reports: number };
  entries: Entry[];
};

const ist = (value: string) => `${value}+05:30`;
const applied = ["heard", "oa", "scheduled", "followup", "rejected", "withdrew"] as OutcomeId[];
const interviewing = ["scheduled", "offer", "followup", "rejected", "withdrew"] as OutcomeId[];

export const companies: Company[] = [
  {
    key: "tessellate",
    name: "Tessellate",
    city: "Bengaluru",
    group: "needs",
    signal: "Offer letter for SDE 2",
    due: { label: "Reply by Wed", tone: "now" },
    next: "Read Kavya's offer and record it",
    roles: [
      { id: "t1", title: "SDE 2, Payments", method: "Applied directly", status: "Final round" },
    ],
    facts: {
      pay: "₹30–36 LPA",
      payNote: "Fixed, SDE 2, from 4 reports",
      rounds: ["OA", "DSA", "HLD", "HM"],
      reports: 6,
    },
    entries: [
      step("t-1", "2026-10-02T19:05", "you", "applied", "You applied directly", "t1"),
      mail("t-2", {
        at: "2026-10-02T19:06",
        roleId: "t1",
        tag: "process",
        kind: "Application received",
        senderName: "Tessellate Careers",
        sender: "careers@tessellate.example",
        subject: "Thanks for applying to Tessellate",
        text: "We have your application for SDE 2, Payments and will be in touch within two weeks.",
        handled: "Just info",
      }),
      mail("t-3", {
        at: "2026-10-08T11:20",
        roleId: "t1",
        tag: "process",
        kind: "Assessment",
        senderName: "Tessellate Hiring",
        sender: "hiring@tessellate.example",
        subject: "Your Tessellate coding assessment",
        text: "Please complete the 90-minute assessment by Sun 11 Oct, 11:59 PM IST.",
        handled: "Got an OA",
      }),
      step("t-4", "2026-10-14T16:00", "them", "round", "Cleared the OA", "t1"),
      step("t-5", "2026-10-27T15:00", "them", "round", "Cleared the system design round", "t1"),
      mail("t-6", {
        at: "2026-10-31T09:12",
        roleId: "t1",
        tag: "offer",
        kind: "Offer",
        senderName: "Kavya Iyer",
        sender: "kavya.iyer@tessellate.example",
        subject: "Your offer: SDE 2, Payments",
        text: "Hi, we're delighted to offer you the SDE 2 role on the Payments team. Annual fixed pay is ₹33 LPA with a ₹4 LPA joining bonus. The letter is attached; please confirm by Wed 4 Nov.",
        open: true,
        suggested: "offer",
        why: "Kavya sent an offer letter.",
        outcomes: interviewing,
      }),
    ],
  },
  {
    key: "northstar",
    name: "Northstar",
    city: "Bengaluru",
    group: "needs",
    signal: "Interview request",
    due: { label: "Today", tone: "now" },
    next: "Confirm Ritika's interview slot",
    roles: [
      {
        id: "n1",
        title: "Senior Backend Engineer",
        method: "Applied directly",
        status: "Applied",
      },
      { id: "n2", title: "Platform Engineer", method: "Referral ask", status: "Referred" },
    ],
    facts: {
      pay: "₹28–34 LPA",
      payNote: "Fixed, SDE 2, from 3 reports",
      rounds: ["DSA", "LLD", "HLD", "HM"],
      reports: 4,
    },
    entries: [
      step(
        "n-1",
        "2026-10-18T09:10",
        "you",
        "outreach",
        "You asked Priya Menon for a referral",
        "n2",
      ),
      mail("n-2", {
        at: "2026-10-19T14:02",
        roleId: "n2",
        tag: "process",
        kind: "Application update",
        senderName: "Priya Menon",
        sender: "priya.menon@northstar.example",
        subject: "Re: Referral for Platform Engineer",
        text: "Done! I've referred you. The recruiter usually reaches out within a week.",
        handled: "Referral submitted",
      }),
      step("n-3", "2026-10-21T11:40", "you", "applied", "You applied directly", "n1"),
      mail("n-4", {
        at: "2026-10-21T11:42",
        roleId: "n1",
        tag: "process",
        kind: "Application received",
        senderName: "Northstar Careers",
        sender: "careers@northstar.example",
        subject: "We received your application",
        text: "Thanks for applying for Senior Backend Engineer. Our team reviews every application.",
        handled: "Just info",
      }),
      mail("n-5", {
        at: "2026-10-31T10:05",
        roleId: "n1",
        tag: "process",
        kind: "Interview",
        senderName: "Ritika Sharma",
        sender: "ritika.sharma@northstar.example",
        account: "Outlook",
        subject: "Let's schedule your backend interview",
        text: "Hi! Thanks for applying for the Senior Backend Engineer role. Would Tue 3 Nov at 3:00 PM IST work for a 60-minute technical round with the platform team? If not, share two slots that suit you this week.",
        open: true,
        suggested: "scheduled",
        why: "Ritika proposes Tue 3 Nov, 3:00 PM.",
        outcomes: applied,
      }),
    ],
  },
  {
    key: "orbit",
    name: "Orbit",
    city: "Hyderabad",
    group: "needs",
    signal: "Assessment reminder",
    due: { label: "OA due Sun", tone: "now" },
    next: "Finish the OA before Sunday",
    roles: [{ id: "o1", title: "SWE II", method: "Referral ask", status: "OA" }],
    facts: {
      pay: "₹24–29 LPA",
      payNote: "Fixed, SWE II, from 5 reports",
      rounds: ["OA", "DSA", "DSA", "HM"],
      reports: 9,
    },
    entries: [
      step(
        "o-1",
        "2026-10-23T20:15",
        "you",
        "outreach",
        "You asked Arjun Rao for a referral",
        "o1",
      ),
      mail("o-2", {
        at: "2026-10-24T09:30",
        roleId: "o1",
        tag: "process",
        kind: "Application update",
        senderName: "Arjun Rao",
        sender: "arjun.rao@orbit.example",
        subject: "Referred you for SWE II",
        text: "Referred! Ping me if the recruiter doesn't reach out.",
        handled: "Referral submitted",
      }),
      mail("o-3", {
        at: "2026-10-27T12:00",
        roleId: "o1",
        tag: "process",
        kind: "Assessment",
        senderName: "Orbit Hiring",
        sender: "hiring@orbit.example",
        subject: "Complete your Orbit online assessment",
        text: "Your HackerRank assessment is open until Sun 1 Nov, 11:59 PM IST.",
        handled: "Got an OA",
      }),
      mail("o-4", {
        at: "2026-10-30T18:20",
        roleId: "o1",
        tag: "process",
        kind: "Assessment",
        senderName: "Orbit Hiring",
        sender: "hiring@orbit.example",
        subject: "Reminder: your assessment closes Sunday",
        text: "This is a reminder that your assessment link expires on Sun 1 Nov at 11:59 PM IST.",
        open: true,
        suggested: "info",
        why: "A reminder about the OA you already recorded.",
        outcomes: ["oa", "scheduled", "followup", "rejected", "withdrew"],
      }),
    ],
  },
  {
    key: "lumen",
    name: "Lumen",
    city: "Bengaluru",
    group: "waiting",
    signal: "No reply in 9 days",
    due: { label: "9 days", tone: "late" },
    next: "Send a follow-up",
    roles: [
      { id: "l1", title: "Platform Engineer", method: "Applied directly", status: "Applied" },
    ],
    facts: {
      pay: "₹22–27 LPA",
      payNote: "Fixed, SDE 2, from 2 reports",
      rounds: ["DSA", "HLD", "HM"],
      reports: 3,
    },
    entries: [
      step("l-1", "2026-10-22T10:00", "you", "applied", "You applied directly", "l1"),
      mail("l-2", {
        at: "2026-10-22T10:03",
        roleId: "l1",
        tag: "process",
        kind: "Application received",
        senderName: "Lumen Talent",
        sender: "talent@lumen.example",
        subject: "Application received: Platform Engineer",
        text: "We've received your application and will get back to you.",
        handled: "Just info",
      }),
    ],
  },
  {
    key: "vela",
    name: "Vela",
    city: "Bengaluru",
    group: "waiting",
    signal: "Messaged Meera 3 days ago",
    due: { label: "3 days", tone: "calm" },
    roles: [{ id: "v1", title: "Backend Engineer", method: "LinkedIn message", status: "Sent" }],
    facts: {
      pay: "₹20–25 LPA",
      payNote: "Fixed, SDE 2, from 2 reports",
      rounds: ["DSA", "LLD", "HM"],
      reports: 2,
    },
    entries: [
      step(
        "v-1",
        "2026-10-28T21:30",
        "you",
        "outreach",
        "You messaged Meera Nair on LinkedIn",
        "v1",
      ),
    ],
  },
  {
    key: "juniper",
    name: "Juniper Pay",
    city: "Hyderabad",
    group: "waiting",
    signal: "OA submitted 5 days ago",
    due: { label: "5 days", tone: "calm" },
    roles: [
      { id: "j1", title: "Senior Software Engineer", method: "Applied directly", status: "OA" },
    ],
    facts: {
      pay: "₹26–31 LPA",
      payNote: "Fixed, Senior, from 3 reports",
      rounds: ["OA", "DSA", "HLD", "HM"],
      reports: 5,
    },
    entries: [
      step("j-1", "2026-10-14T13:00", "you", "applied", "You applied directly", "j1"),
      mail("j-2", {
        at: "2026-10-16T17:45",
        roleId: "j1",
        tag: "process",
        kind: "Assessment",
        senderName: "Juniper Pay Hiring",
        sender: "hiring@juniperpay.example",
        subject: "Next step: online assessment",
        text: "Please complete the CodeSignal assessment within 10 days.",
        handled: "Got an OA",
      }),
      step("j-3", "2026-10-26T22:10", "you", "submitted", "You submitted the OA", "j1"),
    ],
  },
  {
    key: "halcyon",
    name: "Halcyon",
    city: "Bengaluru",
    group: "closed",
    signal: "Rejected on 25 Oct",
    roles: [{ id: "h1", title: "SDE 2", method: "Applied directly", status: "Rejected" }],
    facts: {
      pay: "₹25–30 LPA",
      payNote: "Fixed, SDE 2, from 3 reports",
      rounds: ["OA", "DSA", "HM"],
      reports: 4,
    },
    entries: [
      step("h-1", "2026-10-08T12:30", "you", "applied", "You applied directly", "h1"),
      mail("h-2", {
        at: "2026-10-25T16:40",
        roleId: "h1",
        tag: "rejected",
        kind: "Application outcome",
        senderName: "Halcyon Recruiting",
        sender: "recruiting@halcyon.example",
        subject: "An update on your application",
        text: "Thank you for your interest. We've decided to move forward with other candidates for SDE 2.",
        handled: "Rejected",
      }),
    ],
  },
  {
    key: "brightline",
    name: "Brightline",
    city: "Pune",
    group: "closed",
    signal: "You withdrew on 20 Oct",
    roles: [{ id: "b1", title: "Backend Engineer", method: "Cold email", status: "Withdrew" }],
    facts: {
      pay: "₹18–22 LPA",
      payNote: "Fixed, SDE 2, from 1 report",
      rounds: ["DSA", "HM"],
      reports: 1,
    },
    entries: [
      step("b-1", "2026-10-05T10:15", "you", "outreach", "You emailed Rohan Gupta", "b1"),
      mail("b-2", {
        at: "2026-10-09T15:05",
        roleId: "b1",
        tag: "process",
        kind: "Application update",
        senderName: "Rohan Gupta",
        sender: "rohan@brightline.example",
        subject: "Re: Backend roles at Brightline",
        text: "Thanks for reaching out. Could you share your notice period?",
        handled: "Replied",
      }),
      step("b-3", "2026-10-20T09:00", "you", "closed", "You withdrew", "b1"),
    ],
  },
];

/** Mail that matched no company yet: it waits under Needs a home. */
export const unplaced: MailEntry[] = [
  mail("u-1", {
    at: "2026-10-30T13:10",
    tag: "opportunity",
    kind: "Hiring conversation",
    senderName: "Sneha Kapoor",
    sender: "sneha@talentbridge.example",
    subject: "Backend roles in Bengaluru, 30–40 LPA",
    text: "Hi, I'm hiring for two product companies in Bengaluru. Open to a quick call this week?",
    open: true,
    suggested: "info",
  }),
  mail("u-2", {
    at: "2026-10-29T08:00",
    tag: "other",
    kind: "Message",
    senderName: "Jobs Portal",
    sender: "no-reply@jobs-portal.example",
    subject: "Your application status has changed",
    text: "Log in to view the latest status of your application.",
    account: "Outlook",
    folder: "Junk",
    open: true,
    suggested: "info",
  }),
];

export const allMail = [
  ...companies.flatMap((company) =>
    company.entries
      .filter((entry): entry is MailEntry => entry.type === "mail")
      .map((entry) => ({ ...entry, company: company.name })),
  ),
  ...unplaced.map((entry) => ({ ...entry, company: null })),
].sort((a, b) => b.at.localeCompare(a.at));

export const groupLabel: Record<Group | "home", string> = {
  needs: "Needs you",
  waiting: "Waiting on them",
  closed: "Closed",
  home: "Needs a home",
};

function step(
  id: string,
  at: string,
  by: StepEntry["by"],
  icon: StepIcon,
  text: string,
  roleId?: string,
): StepEntry {
  return { type: "step", id, at: ist(at), by, icon, text, roleId };
}
function mail(
  id: string,
  entry: Omit<MailEntry, "type" | "id" | "account" | "folder" | "open"> &
    Partial<Pick<MailEntry, "account" | "folder" | "open">>,
): MailEntry {
  return {
    type: "mail",
    id,
    account: "Gmail",
    folder: "Inbox",
    open: false,
    ...entry,
    at: ist(entry.at),
  };
}
