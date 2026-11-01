import { eq } from "drizzle-orm";
import type { db } from "@/db";
import {
  applications,
  companyRecords,
  jobs,
  type mailEvents,
  type mailMessages,
} from "@/db/schema";
import { ApiError } from "@/features/agent-api/http";
import { normalizeCompany } from "@/features/applications/lanes";
import { companyKeyFor } from "./context";
import type { MailTx } from "./handling-service";

/**
 * Any email may be linked or used as an outcome source, except an acknowledgement as an
 * outcome, or an email already placed at a different company than the record.
 */
export async function requireRecordMail(
  executor: typeof db | MailTx,
  message: typeof mailMessages.$inferSelect,
  _events: (typeof mailEvents.$inferSelect)[],
  recordId: string,
  mode: "link" | "outcome",
) {
  if (mode === "outcome" && message.classification === "APPLICATION_ACKNOWLEDGEMENT")
    throw new Error("Link this acknowledgement without recording an outcome.");
  if (!message.companyKey) return;
  const [record] = await executor
    .select({ company: jobs.company })
    .from(applications)
    .innerJoin(jobs, eq(jobs.id, applications.jobId))
    .where(eq(applications.id, recordId));
  const companies = await executor
    .select({ name: companyRecords.name, aliases: companyRecords.aliases })
    .from(companyRecords)
    .where(eq(companyRecords.status, "ACTIVE"));
  if (record && companyKeyFor(record.company, companies) !== message.companyKey)
    throw new ApiError(
      `This email is placed at ${
        companies.find((company) => normalizeCompany(company.name) === message.companyKey)?.name ??
        message.companyKey
      }. Move it before recording this outcome.`,
      409,
    );
}
