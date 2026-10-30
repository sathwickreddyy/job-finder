import type { CompanyMailRule, MailEvidence } from "../company-rules";

export const companies = [
  { id: "northstar", name: "Northstar", initial: "N", domain: "northstar.example" },
  { id: "cedar", name: "Cedar", initial: "C", domain: "cedar.example" },
  { id: "orbit", name: "Orbit", initial: "O", domain: "orbit.example" },
];
export const applications = [
  { id: "northstar-sde", company: "northstar", role: "Software Engineer II" },
  { id: "northstar-backend", company: "northstar", role: "Backend Engineer" },
  { id: "cedar-fullstack", company: "cedar", role: "Full Stack Engineer" },
  { id: "orbit-backend", company: "orbit", role: "Backend Engineer II" },
];
export const accountNames = ["Gmail", "Outlook 1", "Outlook 2"];
export const baseline = "2026-10-29T18:30:00Z";
export type ExampleMail = MailEvidence & {
  id: string;
  company: string;
  application: string | null;
  account: string;
  name: string;
  time: string;
  group: string;
  kind: string;
  action: string;
};
export const exampleRules: Record<string, CompanyMailRule> = Object.fromEntries(
  companies.map((company) => [
    company.id,
    {
      company: company.name,
      aliases: [],
      domains: [company.domain],
      senders: [],
      subjectTerms: [],
      excludedTerms: [],
    },
  ]),
);
const common = { seen: false, sourceFolder: "Inbox", historical: false };
export const exampleMail: ExampleMail[] = [
  {
    ...common,
    id: "interview",
    company: "northstar",
    application: "northstar-sde",
    account: "Gmail",
    name: "Ananya Rao",
    sender: "talent@northstar.example",
    subject: "Let’s schedule your technical interview",
    bodyText:
      "Hi Sathwick,\n\nThank you for speaking with us about the Software Engineer II role. We’d like to invite you to a technical interview with our engineering team.\n\nCould you share two or three time slots that work for you next week? The conversation will take around 60 minutes.\n\nBest,\nAnanya\nTalent Acquisition, Northstar",
    receivedAt: "2026-10-30T04:12:00Z",
    time: "9:42 am",
    group: "Today",
    sourceFolder: "Spam",
    kind: "Interview",
    action: "Share your availability",
  },
  {
    ...common,
    id: "assessment",
    company: "cedar",
    application: "cedar-fullstack",
    account: "Outlook 1",
    name: "Cedar Hiring",
    sender: "hiring@cedar.example",
    subject: "Your online assessment is ready",
    bodyText:
      "Hi Sathwick,\n\nThanks for applying to our Full Stack Engineer opening. Please complete the online assessment as the next step.\n\nThe invitation includes the assessment details and completion window.\n\nCedar Hiring Team",
    receivedAt: "2026-10-30T03:48:00Z",
    time: "9:18 am",
    group: "Today",
    sourceFolder: "Careers / Assessments",
    kind: "Assessment",
    action: "Review assessment details",
  },
  {
    ...common,
    id: "outreach",
    company: "northstar",
    application: null,
    account: "Outlook 2",
    name: "Priya Sharma",
    sender: "messages-noreply@linkedin.com",
    subject: "Priya replied to your message",
    bodyText:
      "Hi Sathwick,\n\nThanks for reaching out. Please send your CV and the job ID you’re interested in. I can share them with our hiring team.\n\nPriya",
    receivedAt: "2026-10-30T03:00:00Z",
    time: "8:30 am",
    group: "Today",
    sourceFolder: "LinkedIn / Messages",
    contactedPersonReply: true,
    kind: "Outreach reply",
    action: "Share your CV and job ID",
  },
  {
    ...common,
    id: "backend",
    company: "northstar",
    application: "northstar-backend",
    account: "Gmail",
    name: "Northstar Careers",
    sender: "careers@northstar.example",
    subject: "We received your application",
    bodyText:
      "Hi Sathwick,\n\nWe received your application for the Backend Engineer role. Our recruiting team will review your profile and contact you about next steps.\n\nNorthstar Careers",
    receivedAt: "2026-10-30T02:10:00Z",
    time: "7:40 am",
    group: "Today",
    kind: "Application received",
    action: "No reply needed",
  },
  {
    ...common,
    id: "orbit",
    company: "orbit",
    application: "orbit-backend",
    account: "Outlook 1",
    name: "Orbit Talent",
    sender: "talent@orbit.example",
    subject: "Next steps for your application",
    bodyText:
      "Hi Sathwick,\n\nFollowing up on your application for Backend Engineer II. Could you confirm your current notice period and preferred work location?\n\nOrbit Talent",
    receivedAt: "2026-10-30T01:00:00Z",
    time: "6:30 am",
    group: "Today",
    kind: "Application update",
    action: "Confirm notice period and location",
  },
  {
    ...common,
    id: "northstar-old",
    company: "northstar",
    application: "northstar-sde",
    account: "Gmail",
    name: "Northstar Careers",
    sender: "careers@northstar.example",
    subject: "Thank you for applying to Northstar",
    bodyText:
      "Hi Sathwick,\n\nThank you for applying for the Software Engineer II role. We’ve received your application.\n\nNorthstar Careers",
    receivedAt: "2026-10-20T05:00:00Z",
    time: "20 Oct",
    group: "Earlier",
    sourceFolder: "Archive / Applications",
    seen: true,
    historical: true,
    kind: "Application received",
    action: "History only",
  },
  {
    ...common,
    id: "cedar-old",
    company: "cedar",
    application: "cedar-fullstack",
    account: "Outlook 1",
    name: "Cedar Hiring",
    sender: "hiring@cedar.example",
    subject: "Your application to Cedar",
    bodyText:
      "Hi Sathwick,\n\nThank you for applying for the Full Stack Engineer role. Your application was received.\n\nCedar Hiring",
    receivedAt: "2026-09-15T05:00:00Z",
    time: "15 Sept",
    group: "Earlier",
    sourceFolder: "Junk Email",
    seen: false,
    historical: true,
    kind: "Application received",
    action: "History only",
  },
  {
    ...common,
    id: "linkedin-invite",
    company: "northstar",
    application: null,
    account: "Outlook 2",
    name: "LinkedIn",
    sender: "invitations@linkedin.com",
    subject: "Someone at Northstar you may know",
    bodyText: "A recruiter wants to connect. Explore career opportunities on LinkedIn.",
    receivedAt: "2026-10-30T02:00:00Z",
    time: "7:30 am",
    group: "Today",
    kind: "Connection request",
    action: "Excluded from your job search",
  },
  {
    ...common,
    id: "referral",
    company: "cedar",
    application: null,
    account: "Gmail",
    name: "An untracked contact",
    sender: "person@example.net",
    subject: "Cedar referral request",
    bodyText: "Hi, can you refer me for a software role at Cedar?",
    receivedAt: "2026-10-30T01:30:00Z",
    time: "7:00 am",
    group: "Today",
    kind: "Incoming referral request",
    action: "Excluded from your job search",
  },
];
