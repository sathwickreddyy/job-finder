import type { MailTag } from "@/features/mail/tags";

/** Pinned so the gallery reads the same every day: Sat 31 Oct 2026, 10:30 am in India. */
export const NOW = "2026-10-31T10:30:00+05:30";

export type PolishMail = {
  id: string;
  at: string;
  company: string;
  senderName: string;
  sender: string;
  /** Short inbox label: the address's domain when that tells the inboxes apart. */
  inbox: "gmail.com" | "outlook.in" | "outlook.com";
  folder: string;
  tag: MailTag;
  subject: string;
  /** The body as stored; the preview skips greetings and invisible spacer characters. */
  text: string;
  open: boolean;
};

const ist = (value: string) => `${value}+05:30`;

/** Fictional companies spread over three years, so year labels and long gaps show. */
export const polishFeed: PolishMail[] = [
  {
    id: "p1",
    at: ist("2026-10-31T09:12:00"),
    company: "Northstar",
    senderName: "Priya Raman",
    sender: "priya.raman@northstar.example",
    inbox: "gmail.com",
    folder: "Inbox",
    tag: "interviewProcess",
    subject: "Confirmed: platform round on Tue 3 Nov, 4:00 pm",
    text: "Hi Sathwick,\n\nYour 60-minute platform design round is confirmed for Tue 3 Nov at 4:00 pm IST with Arjun and Mei.\nThe Meet link is in the calendar invite.\n\nThanks,\nPriya",
    open: true,
  },
  {
    id: "p2",
    at: ist("2026-10-31T08:05:00"),
    company: "Fernwood",
    senderName: "Fernwood Careers",
    sender: "no-reply@ashbyhq.com",
    inbox: "outlook.com",
    folder: "Inbox",
    tag: "application",
    subject: "Thanks for applying: Backend Engineer II",
    text: "Dear Sathwick Reddy,\n\nWe received your application for Backend Engineer II (Bengaluru). Our team reviews every application and will reach out within two weeks.\n\nFernwood Talent",
    open: false,
  },
  {
    id: "p3",
    at: ist("2026-10-30T13:50:00"),
    company: "Lumen Labs",
    senderName: "Karthik S",
    sender: "karthik@lumenlabs.example",
    inbox: "outlook.in",
    folder: "Junk Email",
    tag: "opportunity",
    subject: "SDE-2, Payments platform: open to a chat?",
    text: "Hello,\n‌ ‌ ‌ \nI lead hiring for our payments platform in Hyderabad. Your Kafka and Spring work stood out; the band is 38 to 46 LPA fixed.\nWould Monday work for a 20-minute call?",
    open: true,
  },
  {
    id: "p4",
    at: ist("2026-10-29T18:20:00"),
    company: "Quillpay",
    senderName: "Quillpay Hiring",
    sender: "hiring@quillpay.example",
    inbox: "gmail.com",
    folder: "Inbox",
    tag: "interviewCall",
    subject: "Your online assessment: complete by Mon 2 Nov",
    text: "Hi there,\n\nPlease complete the 90-minute HackerRank assessment by Mon 2 Nov, 11:59 pm IST. It has two coding questions and one SQL task.",
    open: true,
  },
  {
    id: "p5",
    at: ist("2026-10-26T11:02:00"),
    company: "Arcadia Systems",
    senderName: "Arcadia Recruiting",
    sender: "recruiting@arcadia.example",
    inbox: "outlook.com",
    folder: "Inbox",
    tag: "interviewRejected",
    subject: "Update on your Senior Engineer application",
    text: "Dear Sathwick,\n\nThank you for your time with the team. We have decided to move forward with other candidates for this role.",
    open: false,
  },
  {
    id: "p6",
    at: ist("2026-02-23T14:10:00"),
    company: "Northstar",
    senderName: "Abish R",
    sender: "abish.r@northstar.example",
    inbox: "outlook.in",
    folder: "Inbox",
    tag: "referral",
    subject: "Help your network join Northstar: SDE-II roles in Pune and Bengaluru",
    text: "Dear Ex Northstar folks,\n\nWe're hiring SDE-IIs across Pune and Bengaluru. Reply with your resume and I'll refer you this week.",
    open: false,
  },
  {
    id: "p7",
    at: ist("2025-08-21T16:45:00"),
    company: "Brightwave",
    senderName: "Brightwave People",
    sender: "people@brightwave.example",
    inbox: "outlook.in",
    folder: "Inbox",
    tag: "offer",
    subject: "Your offer letter: Software Engineer II",
    text: "Hi Sathwick,\n\nCongratulations! Your offer letter is attached: 28 LPA fixed plus joining bonus. Please sign by 28 Aug.",
    open: false,
  },
  {
    id: "p8",
    at: ist("2025-08-21T10:15:00"),
    company: "Brightwave",
    senderName: "VerifyFirst",
    sender: "bgv@verifyfirst.example",
    inbox: "outlook.in",
    folder: "Inbox",
    tag: "backgroundCheck",
    subject: "Background verification started",
    text: "Dear Candidate,\n\nBrightwave has started your background verification. Upload your relieving letter and last three payslips.",
    open: false,
  },
  {
    id: "p9",
    at: ist("2025-03-13T18:17:00"),
    company: "Fernwood",
    senderName: "Krishnendu Mohapatra",
    sender: "krishnendu@fernwood.example",
    inbox: "outlook.in",
    folder: "Inbox",
    tag: "application",
    subject: "Your application for SDE-2",
    text: "Dear Sathwick Reddy,\n\nI've shared your profile with the hiring manager for SDE-2 on the search team.",
    open: false,
  },
  {
    id: "p10",
    at: ist("2024-05-03T14:47:00"),
    company: "Arcadia Systems",
    senderName: "Pooja Sundaramurthy",
    sender: "pooja.s@arcadia.example",
    inbox: "outlook.com",
    folder: "Inbox",
    tag: "joining",
    subject: "Welcome aboard: your first day on Mon 13 May",
    text: "Hi Sathwick,\n\nWelcome to Arcadia! Report to the Whitefield office at 9:30 am on Mon 13 May. Bring your ID and signed offer.",
    open: false,
  },
];
