import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { closeDatabase, db } from "@/db";
import { activityLogs, applicationEvents, applications, jobs } from "@/db/schema";
import { closeUnsentRecord } from "@/features/applications/outcome-service";
import { assertE2eDatabase, dbTests } from "./helpers/e2e-db";

const prefix = `app-close-${randomUUID()}`;
const ids = { jobs: [] as string[], apps: [] as string[] };
const NOW = new Date("2026-11-01T10:30:00+05:30");
let counter = 0;

async function saved(patch: Partial<typeof applications.$inferInsert> = {}) {
  counter++;
  const [job] = await db
    .insert(jobs)
    .values({
      company: `Close ${prefix}`,
      title: "Backend Engineer",
      canonicalUrl: `https://fixture.invalid/${prefix}/${counter}`,
      dedupeKey: `${prefix}-${counter}`,
      source: "MANUAL",
      status: "PREPARING",
    })
    .returning();
  ids.jobs.push(job.id);
  const [app] = await db
    .insert(applications)
    .values({ jobId: job.id, source: "DIRECT", status: "PREPARING", ...patch })
    .returning();
  ids.apps.push(app.id);
  return app;
}

describe.skipIf(!dbTests)("Not applying", () => {
  beforeAll(assertE2eDatabase);
  afterAll(async () => {
    await assertE2eDatabase();
    if (ids.apps.length)
      await db.delete(activityLogs).where(inArray(activityLogs.entityId, ids.apps));
    if (ids.jobs.length) {
      await db.delete(applications).where(inArray(applications.jobId, ids.jobs));
      await db.delete(jobs).where(inArray(jobs.id, ids.jobs));
    }
    await closeDatabase();
  });

  it("closes an unsent record as Not applying", async () => {
    const app = await saved();
    await db.transaction((tx) => closeUnsentRecord(tx, { id: app.id }, NOW));
    const [stored] = await db.select().from(applications).where(eq(applications.id, app.id));
    expect(stored).toMatchObject({ status: "CLOSED", closedReason: "WITHDREW" });
    const events = await db
      .select()
      .from(applicationEvents)
      .where(eq(applicationEvents.applicationId, app.id));
    expect(events).toEqual([
      expect.objectContaining({ eventType: "WITHDRAWN", summary: "Not applying", occurredAt: NOW }),
    ]);
    expect(
      await db
        .select()
        .from(activityLogs)
        .where(
          and(
            eq(activityLogs.entityId, app.id),
            eq(activityLogs.action, "APPLICATION_NOT_APPLYING"),
          ),
        ),
    ).toHaveLength(1);
  });

  it("refuses Not applying once sent", async () => {
    const app = await saved({ status: "APPLIED", appliedAt: new Date("2026-10-20T05:00:00Z") });
    await expect(
      db.transaction((tx) => closeUnsentRecord(tx, { id: app.id }, NOW)),
    ).rejects.toThrow("This record has already been sent or closed. Refresh the page.");
    const [stored] = await db.select().from(applications).where(eq(applications.id, app.id));
    expect(stored.status).toBe("APPLIED");
  });
});
