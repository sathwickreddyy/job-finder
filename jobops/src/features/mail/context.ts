import { createHash } from "node:crypto";
import { eq, like } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  applications,
  applicationEvents,
  companyRecords,
  contacts,
  jobs,
  settings,
} from "@/db/schema";
import { normalizeCompany, companyResolver } from "@/features/applications/lanes";
import type { CompanyMailRule } from "./company-rules";

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

const term = z.string().trim().min(1).max(150);
const ruleFields = {
  aliases: z.array(term).max(20),
  domains: z
    .array(
      z
        .string()
        .trim()
        .toLowerCase()
        .regex(/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/),
    )
    .max(20),
  senders: z.array(z.email().max(254)).max(30),
  keywords: z.array(term).max(20),
  excludedTerms: z.array(term).max(20),
};
/** Rules saved before 2026-10-31 called keywords `subjectTerms`. */
const withKeywords = (value: unknown) => {
  if (!value || typeof value !== "object" || "keywords" in value) return value;
  const { subjectTerms, ...rest } = value as Record<string, unknown>;
  return { ...rest, keywords: subjectTerms ?? [] };
};
/** A rule edit for a company; a generic keyword is refused with the company's name in the copy. */
export function companyRuleSchema(company?: string) {
  return z.preprocess(
    withKeywords,
    z.object({
      ...ruleFields,
      keywords: ruleFields.keywords.superRefine((keywords, ctx) => {
        for (const keyword of keywords) {
          const problem = keywordProblem(keyword, company);
          if (problem) ctx.addIssue({ code: "custom", message: problem });
        }
      }),
    }),
  );
}
export const ruleSchema = companyRuleSchema();
/** A saved rule; keywords refused since it was saved are dropped so its addresses still apply. */
export function storedRule(value: unknown) {
  const parsed = z.preprocess(withKeywords, z.object(ruleFields)).safeParse(value);
  if (!parsed.success) return null;
  return {
    ...parsed.data,
    keywords: parsed.data.keywords.filter((keyword) => !keywordProblem(keyword)),
  };
}
/** The lane key for a company name, joining listed names and aliases to their company record. */
export function companyKeyFor(
  companyName: string,
  companies: { name: string; aliases: string[] }[],
) {
  return companyResolver(companies)(companyName).companyKey;
}
export const ruleKey = (key: string) =>
  `mailRule:${createHash("sha256").update(key).digest("hex")}`;
export type WorkspaceCompany = {
  id: string;
  name: string;
  slug: string | null;
  rule: CompanyMailRule;
  baselineAt: string;
  ruleSource: string;
};
export type WorkspaceApplication = {
  id: string;
  company: string;
  role: string;
  recipient: string | null;
  sentAt: string | null;
};
export type OutboundContact = {
  applicationId: string;
  company: string;
  email: string | null;
  name: string | null;
};
export type MailContext = {
  companies: WorkspaceCompany[];
  applications: WorkspaceApplication[];
  outbound: OutboundContact[];
  baselineAt: string;
};
function websiteDomain(website: string | null) {
  try {
    const domain = new URL(website ?? "").hostname.replace(/^www\./, "").toLowerCase();
    return isSharedSender(domain) ? [] : [domain];
  } catch {
    return [];
  }
}
const identity = (value: string) => value.trim().toLowerCase().replace(/\/$/, "").split(/[?#]/)[0];

export async function loadMailContext(): Promise<MailContext> {
  const [companies, rows, events, people, storedRules, marker] = await Promise.all([
    db.select().from(companyRecords).where(eq(companyRecords.status, "ACTIVE")),
    db
      .select({ id: applications.id, company: jobs.company, role: jobs.title })
      .from(applications)
      .innerJoin(jobs, eq(jobs.id, applications.jobId)),
    db.select().from(applicationEvents).where(eq(applicationEvents.eventType, "OUTREACH_SENT")),
    db.select().from(contacts),
    db.select().from(settings).where(like(settings.key, "mailRule:%")),
    db.select().from(settings).where(eq(settings.key, "mailMonitorStartedAt")),
  ]);
  const rawBaseline = marker[0]?.value.at;
  const baselineAt =
    typeof rawBaseline === "string" && Number.isFinite(Date.parse(rawBaseline))
      ? new Date(rawBaseline).toISOString()
      : new Date().toISOString();
  const resolve = companyResolver(companies);
  const allCompanies = new Map<string, WorkspaceCompany>();
  for (const company of companies) {
    const id = normalizeCompany(company.name);
    const saved = storedRules.find((row) => row.key === ruleKey(id));
    const parsed = storedRule(saved?.value.rule);
    allCompanies.set(id, {
      id,
      name: company.name,
      slug: company.slug,
      rule: {
        company: company.name,
        ...(parsed ?? {
          aliases: company.aliases.filter((alias) => alias.trim().length >= 5),
          domains: [
            ...new Set([
              ...websiteDomain(company.websiteUrl),
              ...websiteDomain(company.careersUrl),
            ]),
          ],
          senders: [],
          keywords: [],
          excludedTerms: [],
        }),
      },
      baselineAt,
      ruleSource: parsed
        ? "Your saved pattern"
        : "Company name, aliases and recorded website/careers domains",
    });
  }
  const apps: WorkspaceApplication[] = rows.map((row) => {
    const resolved = resolve(row.company);
    if (!allCompanies.has(resolved.companyKey)) {
      const saved = storedRules.find((row) => row.key === ruleKey(resolved.companyKey));
      const parsed = storedRule(saved?.value.rule);
      allCompanies.set(resolved.companyKey, {
        id: resolved.companyKey,
        name: resolved.companyName,
        slug: null,
        baselineAt,
        rule: {
          company: resolved.companyName,
          aliases: [],
          domains: [],
          senders: [],
          keywords: [],
          excludedTerms: [],
          ...parsed,
        },
        ruleSource: parsed ? "Your saved pattern" : "Recorded application company",
      });
    }
    const sent = events.find(
      (event) => event.applicationId === row.id && event.payload.humanConfirmed !== false,
    );
    return {
      id: row.id,
      company: resolved.companyKey,
      role: row.role,
      recipient: typeof sent?.payload.recipient === "string" ? sent.payload.recipient : null,
      sentAt: sent?.occurredAt.toISOString() ?? null,
    };
  });
  const outbound: OutboundContact[] = [];
  for (const app of apps) {
    if (!app.recipient || !app.sentAt) continue;
    const key = identity(app.recipient);
    const ownContacts = people.filter(
      (person) =>
        resolve(person.company).companyKey === app.company &&
        [person.email, person.linkedinUrl, person.name].some(
          (value) => value && identity(value) === key,
        ),
    );
    const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(app.recipient)
      ? app.recipient.toLowerCase()
      : ownContacts.length === 1
        ? (ownContacts[0].email?.toLowerCase() ?? null)
        : null;
    const name =
      ownContacts.length === 1
        ? ownContacts[0].name
        : !email && !key.includes("://") && key.split(/\s+/).length >= 2
          ? app.recipient
          : null;
    if (email || name) outbound.push({ applicationId: app.id, company: app.company, email, name });
  }
  return {
    companies: [...allCompanies.values()].sort((a, b) => a.name.localeCompare(b.name)),
    applications: apps,
    outbound,
    baselineAt,
  };
}
