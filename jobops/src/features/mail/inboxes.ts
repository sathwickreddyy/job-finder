import { like } from "drizzle-orm";
import { db } from "@/db";
import { mailConnections, settings } from "@/db/schema";
import { providers } from "@/services/mail/providers";
import { coverageKey, type CheckProgress } from "./check-service";

export type Inboxes = {
  connections: {
    id: string;
    provider: string;
    email: string;
    lastChecked: string | null;
    lastError: string | null;
  }[];
  configs: { slug: string; label: string; configured: boolean; missing: string[] }[];
  coverage: { account: string; checkedAt: string | null; folders: CheckProgress["folders"] }[];
};

/** Connected accounts, provider setup and the folders each account's last check covered. */
export async function readInboxes(): Promise<Inboxes> {
  const [connections, coverage] = await Promise.all([
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
