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

export const ruleSchema = z.object({
  aliases: z.array(z.string().trim().min(1).max(150)).max(20),
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
  subjectTerms: z.array(z.string().trim().min(1).max(150)).max(20),
  excludedTerms: z.array(z.string().trim().min(1).max(150)).max(20),
});
/** The lane key for a company name, joining listed names and aliases to their company record. */
export function companyKeyFor(companyName: string, companies: { name: string; aliases: string[] }[]) {
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
const blockedDefaults = [
  "gmail.com",
  "outlook.com",
  "outlook.in",
  "linkedin.com",
  "greenhouse.io",
  "ashbyhq.com",
  "lever.co",
  "workday.com",
];
function websiteDomain(website: string | null) {
  try {
    const domain = new URL(website ?? "").hostname.replace(/^www\./, "").toLowerCase();
    return blockedDefaults.some((name) => domain === name || domain.endsWith(`.${name}`))
      ? []
      : [domain];
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
    const parsed = ruleSchema.safeParse(saved?.value.rule);
    allCompanies.set(id, {
      id,
      name: company.name,
      slug: company.slug,
      rule: {
        company: company.name,
        ...(parsed.success
          ? parsed.data
          : {
              aliases: company.aliases.filter((alias) => alias.trim().length >= 5),
              domains: [...new Set([...websiteDomain(company.websiteUrl), ...websiteDomain(company.careersUrl)])],
              senders: [],
              subjectTerms: [],
              excludedTerms: [],
            }),
      },
      baselineAt,
      ruleSource: parsed.success
        ? "Your saved pattern"
        : "Company name, aliases and recorded website/careers domains",
    });
  }
  const apps: WorkspaceApplication[] = rows.map((row) => {
    const resolved = resolve(row.company);
    if (!allCompanies.has(resolved.companyKey)) {
      const saved = storedRules.find((row) => row.key === ruleKey(resolved.companyKey));
      const parsed = ruleSchema.safeParse(saved?.value.rule);
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
          subjectTerms: [],
          excludedTerms: [],
          ...(parsed.success ? parsed.data : {}),
        },
        ruleSource: parsed.success ? "Your saved pattern" : "Recorded application company",
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
