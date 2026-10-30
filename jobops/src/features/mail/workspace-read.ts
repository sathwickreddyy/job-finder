import { like } from "drizzle-orm";
import { db } from "@/db";
import { mailConnections, settings } from "@/db/schema";
import { providers } from "@/services/mail/providers";
import { coverageKey, type CheckProgress } from "./check-service";
import { loadMailContext } from "./context";
import { listMail, mailListSchema } from "./mail-list";
import type { MailWorkspaceData, WorkspaceQuery } from "./workspace-data";

/** The /mail page reads the same list as GET /api/v1/mail; only the scope comes from the URL. */
export async function readMailWorkspace(query: WorkspaceQuery): Promise<MailWorkspaceData> {
  const attention = query.view === "all" ? "all" : "open";
  const filters = mailListSchema.safeParse({
    attention,
    company: query.company || undefined,
    application: query.application || undefined,
    q: query.q?.trim() || undefined,
    cursor: query.cursor || undefined,
  });
  const [context, list, connections, coverage] = await Promise.all([
    loadMailContext(),
    listMail(filters.success ? filters.data : { attention }),
    db
      .select({
        id: mailConnections.id,
        provider: mailConnections.provider,
        email: mailConnections.email,
        lastChecked: mailConnections.lastSyncedAt,
        lastError: mailConnections.lastError,
      })
      .from(mailConnections)
      .orderBy(mailConnections.createdAt),
    db.select().from(settings).where(like(settings.key, "mailCoverage:%")),
  ]);
  return {
    companies: context.companies,
    applications: context.applications,
    ...list,
    connections: connections.map((row) => ({
      ...row,
      lastChecked: row.lastChecked?.toISOString() ?? null,
    })),
    configs: providers.map((provider) => {
      const { configured, missing } = provider.configuration();
      return { slug: provider.slug, label: provider.label, configured, missing };
    }),
    coverage: connections.map((account) => {
      const value = coverage.find((row) => row.key === coverageKey(account.id))?.value;
      return {
        account: account.email,
        checkedAt: typeof value?.checkedAt === "string" ? value.checkedAt : null,
        folders: Array.isArray(value?.folders) ? (value.folders as CheckProgress["folders"]) : [],
      };
    }),
  };
}
