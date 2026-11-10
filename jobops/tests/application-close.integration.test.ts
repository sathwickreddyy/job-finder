import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { closeDatabase, db } from "@/db";
import { activityLogs, applicationEvents, applications, jobs } from "@/db/schema";
import { closeUnsentRecord, reopenUnsentRecord } from "@/features/applications/outcome-service";
import { GET, POST } from "@/app/api/v1/applications/[id]/transitions/route";
import { assertE2eDatabase, dbTests } from "./helpers/e2e-db";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

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

  it("reopens a record closed as Not applying, as it was before", async () => {
    const app = await saved();
    await db.transaction((tx) => closeUnsentRecord(tx, { id: app.id }, NOW));
    await db.transaction((tx) => reopenUnsentRecord(tx, { id: app.id }, NOW));
    const [stored] = await db.select().from(applications).where(eq(applications.id, app.id));
    expect(stored).toMatchObject({ status: "PREPARING", closedReason: null });
    const [job] = await db.select().from(jobs).where(eq(jobs.id, app.jobId));
    expect(job.status).toBe("PREPARING");
    expect(
      await db.select().from(applicationEvents).where(eq(applicationEvents.applicationId, app.id)),
    ).toEqual([]);
    expect(
      await db
        .select()
        .from(activityLogs)
        .where(
          and(eq(activityLogs.entityId, app.id), eq(activityLogs.action, "APPLICATION_REOPENED")),
        ),
    ).toHaveLength(1);
  });

  it("refuses to reopen a record that was not closed as Not applying", async () => {
    const open = await saved();
    await expect(
      db.transaction((tx) => reopenUnsentRecord(tx, { id: open.id }, NOW)),
    ).rejects.toThrow("Only a record closed as Not applying can be reopened. Refresh the page.");
    const sent = await saved({
      status: "WITHDRAWN",
      closedReason: "WITHDREW",
      appliedAt: new Date("2026-10-20T05:00:00Z"),
    });
    await expect(
      db.transaction((tx) => reopenUnsentRecord(tx, { id: sent.id }, NOW)),
    ).rejects.toThrow("Only a record closed as Not applying can be reopened. Refresh the page.");
  });

  it("exposes the available actions and records lifecycle transitions through the API", async () => {
    const app = await saved();
    const params = { params: Promise.resolve({ id: app.id }) };
    const url = `http://localhost/api/v1/applications/${app.id}/transitions`;
    const post = (command: object, requestId = randomUUID()) =>
      POST(
        new Request(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...command, requestId }),
        }),
        params,
      );
    const get = () => GET(new Request(url), params);

    expect(await (await get()).json()).toMatchObject({
      application: { status: "PREPARING", availableActions: ["recordSent", "notApplying"] },
    });
    const closeId = randomUUID();
    expect(await (await post({ action: "notApplying" }, closeId)).json()).toMatchObject({
      application: { status: "CLOSED", availableActions: ["reopen"] },
    });
    expect((await post({ action: "reopen" })).status).toBe(200);
    expect(await (await post({ action: "notApplying" }, closeId)).json()).toMatchObject({
      replayed: true,
      application: { status: "PREPARING" },
    });
    expect((await post({ action: "recordSent", sentDate: "2026-10-20" })).status).toBe(400);
    expect(
      (await post({ action: "recordSent", sentDate: "2026-10-20", humanConfirmed: true })).status,
    ).toBe(200);
    expect((await post({ action: "recordOutcome", outcome: "accepted" })).status).toBe(409);
    const followUp = { action: "recordOutcome", outcome: "followup" };
    const followUpId = randomUUID();
    const responses = await Promise.all([post(followUp, followUpId), post(followUp, followUpId)]);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect((await post({ ...followUp, outcome: "offer" }, followUpId)).status).toBe(409);
    const schedule = { action: "recordOutcome", outcome: "scheduled" };
    expect((await post(schedule)).status).toBe(409);
    expect(
      await (
        await post({
          ...schedule,
          details: { kind: "HLD", at: "2026-11-20T14:30:00+05:30" },
        })
      ).json(),
    ).toMatchObject({
      application: { status: "TECHNICAL_INTERVIEW" },
    });
    expect((await post({ action: "recordOutcome", outcome: "passed" })).status).toBe(200);
    expect((await post({ action: "recordOutcome", outcome: "offer" })).status).toBe(200);
    expect(await (await get()).json()).toMatchObject({
      application: {
        status: "OFFER",
        availableOutcomes: [
          expect.objectContaining({ id: "accepted" }),
          expect.objectContaining({ id: "declined" }),
        ],
      },
    });
    expect(
      await (await post({ action: "recordOutcome", outcome: "accepted" })).json(),
    ).toMatchObject({
      application: { status: "CLOSED", closedReason: "ACCEPTED", availableActions: [] },
    });
    const events = await db
      .select()
      .from(applicationEvents)
      .where(eq(applicationEvents.applicationId, app.id));
    expect(events.filter((event) => event.eventType === "FOLLOW_UP_SENT")).toHaveLength(1);
  });
});
