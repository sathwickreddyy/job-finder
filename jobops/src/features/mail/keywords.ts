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
/** Why a keyword can't identify a company, or `null` when it can. */
export function keywordProblem(value: string, company?: string): string | null {
  const term = value.trim();
  if (!genericJobWords.includes(term.toLowerCase())) return null;
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
];
/** An address (or bare domain) on a shared domain or one of its subdomains. */
export function isSharedSender(address: string): boolean {
  const domain = address.trim().toLowerCase().split("@").at(-1) ?? "";
  return sharedSenderDomains.some((shared) => domain === shared || domain.endsWith(`.${shared}`));
}
