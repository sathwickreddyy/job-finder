// Rule checks shared by the server and the company search panel; no database imports here.

/** Words in every company's mail; a keyword made of one of these would claim all of it. */
export const genericJobWords = [
  "application",
  "applications",
  "interview",
  "interviews",
  "job",
  "jobs",
  "hiring",
  "recruiter",
  "recruiters",
  "recruiting",
  "recruitment",
  "careers",
  "career",
  "offer",
  "offers",
  "assessment",
  "role",
  "roles",
  "position",
  "positions",
  "opening",
  "openings",
  "talent",
  "team",
  "hr",
];
/** Words that only pad a phrase: "The Hiring Team" says nothing more than "Hiring". */
const fillerWords = [
  "the",
  "a",
  "an",
  "and",
  "of",
  "for",
  "at",
  "in",
  "to",
  "from",
  "with",
  "our",
  "your",
  "my",
  "acquisition",
  "people",
  "staffing",
  "notification",
  "notifications",
  "noreply",
  "no",
  "reply",
  "do",
  "not",
  "mail",
  "email",
  "alert",
  "alerts",
  "update",
  "updates",
  "support",
  "services",
  "india",
  "global",
  "inc",
  "ltd",
  "pvt",
  "private",
  "limited",
  "llc",
  "group",
  "teams",
];
/** Tools and portals many companies send through; their names identify none of them. */
const toolWords = [
  "workday",
  "greenhouse",
  "lever",
  "ashby",
  "smartrecruiters",
  "icims",
  "taleo",
  "jobvite",
  "successfactors",
  "darwinbox",
  "keka",
  "zoho",
  "workable",
  "naukri",
  "linkedin",
  "instahyre",
  "cutshort",
  "hirist",
  "indeed",
  "foundit",
  "wellfound",
  "iimjobs",
  "unstop",
  "hackerrank",
  "hackerearth",
  "mettl",
  "codility",
  "gmail",
  "outlook",
];
const unidentifying = new Set([...genericJobWords, ...fillerWords, ...toolWords]);

/** Why a keyword can't identify a company, or `null` when it can. */
export function keywordProblem(value: string, company?: string): string | null {
  const term = value.trim();
  const words = term
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  // A phrase made only of job words, filler and tool names would claim every company's mail.
  if (!words.length || !words.every((word) => unidentifying.has(word))) return null;
  return company
    ? `"${term}" appears in every company's mail, so it can't identify ${company}. Try a phrase like "${company} Talent".`
    : `"${term}" appears in every company's mail, so it can't identify one company. Try a phrase with the company's name.`;
}

/** Senders many companies share: personal mail, applicant tracking systems, job portals and BGV vendors. */
export const sharedSenderDomains = [
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "outlook.in",
  "hotmail.com",
  "yahoo.com",
  "icloud.com",
  "greenhouse.io",
  "lever.co",
  "ashbyhq.com",
  "myworkday.com",
  "workday.com",
  "smartrecruiters.com",
  "icims.com",
  "hackerrank.com",
  "hackerearth.com",
  "naukri.com",
  "instahyre.com",
  "cutshort.io",
  "hirist.tech",
  "linkedin.com",
  "fadv.com",
  "hireright.com",
  "authbridge.com",
  // More personal mail, tracking systems, assessments and portals seen in Indian job mail.
  "yahoo.co.in",
  "rediffmail.com",
  "live.com",
  "msn.com",
  "aol.com",
  "me.com",
  "proton.me",
  "protonmail.com",
  "greenhouse-mail.io",
  "workablemail.com",
  "workable.com",
  "taleo.net",
  "jobvite.com",
  "successfactors.com",
  "darwinbox.in",
  "keka.com",
  "zohorecruit.com",
  "mettl.com",
  "codility.com",
  "foundit.in",
  "indeed.com",
  "wellfound.com",
  "iimjobs.com",
  "unstop.com",
];
/** An address (or bare domain) on a shared domain or one of its subdomains. */
export function isSharedSender(address: string): boolean {
  const domain = address.trim().toLowerCase().split("@").at(-1) ?? "";
  return sharedSenderDomains.some((shared) => domain === shared || domain.endsWith(`.${shared}`));
}

/** Why a domain can't identify a company, or `null` when it can. */
export function domainProblem(value: string, company?: string): string | null {
  const domain = value.trim().toLowerCase().replace(/^@/, "");
  if (!isSharedSender(domain)) return null;
  return `${domain} is shared by many companies, so it can't identify ${company ?? "one company"}. Add the recruiter's exact address instead.`;
}
