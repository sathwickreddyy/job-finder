import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray, like } from "drizzle-orm";
import { closeDatabase, db } from "@/db";
import {
  activityLogs,
  applications,
  companyRecords,
  jobs,
  mailEvents,
  mailMessages,
  mailTracking,
  settings,
} from "@/db/schema";
import { CATCH_UP_KEY, catchUpMailSync } from "@/features/mail/catch-up";
import { assertE2eDatabase, dbTests } from "./helpers/e2e-db";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

/** Emails received at these instants fail the rule, standing in for any email it cannot apply. */
const failing = new Set<number>();
vi.mock("@/features/mail/auto-apply-rule", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/mail/auto-apply-rule")>();
  return {
    ...actual,
    decideMailEffect: (...args: Parameters<typeof actual.decideMailEffect>) => {
      if (failing.has(args[0].receivedAt.getTime())) throw new Error("Rule failed on purpose");
      return actual.decideMailEffect(...args);
    },
  };
});

const prefix = `mail-catch-up-retry-${randomUUID()}`;
const account = `${prefix}@fixture.invalid`;
const ids = { jobs: [] as string[], companies: [] as string[], apps: [] as string[] };
const NOW = new Date("2026-11-01T10:30:00+05:30");
let counter = 0;

/** A company with one sent application and one stored rejection for it. */
async function rejected(receivedAt: string) {
  counter++;
  const name = `Retry ${counter} ${prefix}`;
  const [company] = await db
    .insert(companyRecords)
    .values({ slug: `${prefix}-${counter}`, name })
    .returning();
  ids.companies.push(company.id);
  const [job] = await db
    .insert(jobs)
    .values({
      company: name,
      title: "Backend Engineer",
      canonicalUrl: `https://fixture.invalid/${prefix}/${counter}`,
      dedupeKey: `${prefix}-${counter}`,
      source: "MANUAL",
      status: "APPLIED",
    })
    .returning();
  ids.jobs.push(job.id);
  const [app] = await db
    .insert(applications)
    .values({
      jobId: job.id,
      source: "MANUAL",
      status: "APPLIED",
      appliedAt: new Date("2026-10-02T10:00:00+05:30"),
    })
    .returning();
  ids.apps.push(app.id);
  const [mail] = await db
    .insert(mailMessages)
    .values({
      externalId: `${prefix}-${counter}`,
      provider: "GMAIL",
      accountEmail: account,
      sender: "talent@fixture.invalid",
      subject: `Retry ${counter}`,
      receivedAt: new Date(receivedAt),
      classification: "REJECTION",
      companyKey: name.toLowerCase(),
      attentionState: "OPEN",
    })
    .returning();
  await db
    .insert(mailEvents)
    .values({ mailMessageId: mail.id, type: "REJECTION", confidence: 0.9 });
  return { app, mail };
}
const status = async (id: string) =>
  (await db.select().from(applications).where(eq(applications.id, id)))[0].status;
const marker = async () =>
  (await db.select().from(settings).where(eq(settings.key, CATCH_UP_KEY)))[0].value;
const forget = () => db.delete(settings).where(eq(settings.key, CATCH_UP_KEY));

describe.skipIf(!dbTests)("mail catch-up retries", () => {
  beforeAll(assertE2eDatabase);
  beforeEach(async () => {
    failing.clear();
    await forget();
  });
  afterAll(async () => {
    await assertE2eDatabase();
    await forget();
    const mail = await db
      .select({ id: mailMessages.id })
      .from(mailMessages)
      .where(like(mailMessages.accountEmail, `${prefix}%`));
    const entities = [...mail.map((row) => row.id), ...ids.apps];
    if (entities.length)
      await db.delete(activityLogs).where(inArray(activityLogs.entityId, entities));
    await db.delete(mailTracking).where(like(mailTracking.accountEmail, `${prefix}%`));
    await db.delete(mailMessages).where(like(mailMessages.accountEmail, `${prefix}%`));
    if (ids.jobs.length) {
      await db.delete(applications).where(inArray(applications.jobId, ids.jobs));
      await db.delete(jobs).where(inArray(jobs.id, ids.jobs));
    }
    if (ids.companies.length)
      await db.delete(companyRecords).where(inArray(companyRecords.id, ids.companies));
    await closeDatabase();
  });

  it("retries an email that failed at the next start", async () => {
    const at = "2026-10-07T14:01:00+05:30";
    const { app, mail } = await rejected(at);
    failing.add(new Date(at).getTime());
    expect(await catchUpMailSync(NOW)).toMatchObject({ skipped: false, failed: 1 });
    expect(await status(app.id)).toBe("APPLIED");
    expect(await marker()).toMatchObject({ version: 1, retry: [{ id: mail.id, attempts: 1 }] });

    failing.clear();
    expect(await catchUpMailSync(NOW)).toEqual({ skipped: false, applied: 1, asked: 0, failed: 0 });
    expect(await status(app.id)).toBe("REJECTED");
    expect(await marker()).toMatchObject({ version: 1, retry: [] });
    expect(await catchUpMailSync(NOW)).toEqual({ skipped: true, applied: 0, asked: 0, failed: 0 });
  });

  it("gives up on an email after three tries", async () => {
    const at = "2026-10-07T14:02:00+05:30";
    const { app, mail } = await rejected(at);
    failing.add(new Date(at).getTime());
    await catchUpMailSync(NOW);
    await catchUpMailSync(NOW);
    expect(await catchUpMailSync(NOW)).toMatchObject({ skipped: false, failed: 1 });
    expect(await marker()).toMatchObject({ retry: [], gaveUp: [mail.id] });
    expect(await catchUpMailSync(NOW)).toMatchObject({ skipped: true });
    expect(await status(app.id)).toBe("APPLIED");
  });
});
