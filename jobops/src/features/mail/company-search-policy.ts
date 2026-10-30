import { createHash } from "node:crypto";
import type { MailContext, WorkspaceCompany } from "./context";
import type { ResolvedMailSearch } from "./search-contract";
export type CompanyProgress = {
  runId: string;
  revision: string;
  since?: string;
  until: string;
  next?: string;
  complete: boolean;
  limited: boolean;
  fetched: number;
  pages: number;
  coveredSince?: string;
  coveredUntil?: string;
};
const lower = (since?: string) => (since ? Date.parse(since) : -Infinity);
export function companyRevision(company: WorkspaceCompany, context: MailContext) {
  const normalized = (values: string[]) => [...new Set(values.map((v) => v.trim().toLowerCase()))].sort();
  return createHash("sha256").update(JSON.stringify({
    rule: { company: company.rule.company.trim().toLowerCase(),
      aliases: normalized(company.rule.aliases), domains: normalized(company.rule.domains),
      senders: normalized(company.rule.senders), subjectTerms: normalized(company.rule.subjectTerms), excludedTerms: normalized(company.rule.excludedTerms) },
    outbound: context.outbound.filter((r) => r.company === company.id).map((r) => ({ applicationId: r.applicationId, email: r.email, name: r.name })).sort((a, b) => a.applicationId.localeCompare(b.applicationId)),
    apps: context.applications.filter((r) => r.company === company.id).map((r) => ({ id: r.id, role: r.role, recipient: r.recipient, sentAt: r.sentAt })).sort((a, b) => a.id.localeCompare(b.id)),
  })).digest("hex");
}
export function companyWindow(
  previous: CompanyProgress | undefined,
  requested: ResolvedMailSearch,
  revision: string,
) {
  if (
    previous &&
    previous.revision === revision &&
    !previous.complete &&
    !previous.limited &&
    Date.parse(requested.until) >= Date.parse(previous.until) &&
    lower(requested.since) >= lower(previous.coveredSince)
  )
    return { ...previous, resumed: true, cacheHit: false };
  const covered =
    previous?.revision === revision &&
    previous.coveredUntil &&
    lower(requested.since) >= lower(previous.coveredSince);
  const cacheHit = Boolean(
    covered && Date.parse(requested.until) <= Date.parse(previous!.coveredUntil!),
  );
  // One hour protects against delayed indexing. Previously seen IDs/bodies are not re-imported.
  const since =
    covered && !cacheHit
      ? new Date(
          Math.max(lower(requested.since), Date.parse(previous!.coveredUntil!) - 3600000),
        ).toISOString()
      : requested.since;
  return {
    since,
    until: requested.until,
    resumed: false,
    cacheHit,
    coveredSince: covered ? previous!.coveredSince : requested.since,
    coveredUntil: covered ? previous!.coveredUntil : undefined,
  };
}
export function companyIdentity(company: WorkspaceCompany, context: MailContext) {
  const outbound = context.outbound.filter((row) => row.company === company.id);
  // Never search company aliases anywhere in bodies. Sender/subject identity comes first.
  return {
    names: [
      ...new Set([
        company.name,
        ...company.rule.aliases,
        ...outbound.flatMap((p) => (p.name ? [p.name] : [])),
      ]),
    ],
    domains: company.rule.domains,
    senders: [
      ...new Set([...company.rule.senders, ...outbound.flatMap((p) => (p.email ? [p.email] : []))]),
    ],
  };
}
export const companyProgressKey = (company: string, account: string, mode: string) =>
  `companyMailScan:v1:${createHash("sha256").update(company).digest("hex")}:${account}:${mode}`;
