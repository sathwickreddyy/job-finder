import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { eq, inArray, sql } from "drizzle-orm";
import { expect, test } from "@playwright/test";
import { closeDatabase, db } from "../../src/db";
import {
  activityLogs,
  applicationEvents,
  applicationRounds,
  applications,
  jobs,
  mailMessages,
  resumes,
  resumeVersions,
  settings,
} from "../../src/db/schema";
import {
  applyOutcome,
  markRecordSent,
  updateRecordDetails,
  updateRecordRound,
} from "../../src/features/applications/outcome-service";
import type { OutcomeDetail } from "../../src/features/applications/phase";
import { tsImport } from "tsx/esm/api";

// Next captures AsyncLocalStorage on first import; bootstrap before any server-action load.
Object.assign(globalThis, { AsyncLocalStorage });

// Server actions import Next entrypoints; resolve them with the application TS loader.
const actionLoader = { parentURL: import.meta.url, namespace: "retained-record-action-data" };
const { recordAction } = (await tsImport(
  "../../src/features/applications/tracking-actions.ts",
  actionLoader,
)) as typeof import("../../src/features/applications/tracking-actions");
const { closeDatabase: closeActionDatabase } = (await tsImport(
  "../../src/db/index.ts",
  actionLoader,
)) as typeof import("../../src/db");

const fixtures = { jobs: [] as string[], applications: [] as string[], resumes: [] as string[] };
let mayMutate = false;

async function requireOwnedDatabase() {
  const url = process.env.DATABASE_URL;
  if (!url || new URL(url).pathname !== "/jobops_e2e")
    throw new Error("Data tests require the isolated jobops_e2e database.");
  const [marker] = await db.select().from(settings).where(eq(settings.key, "__jobops_e2e"));
  if (marker?.value.ownedBy !== "jobops-browser-tests")
    throw new Error("Data tests require the JobOps browser-test ownership marker.");
}

test.beforeEach(async () => {
  mayMutate = false;
  await requireOwnedDatabase();
  mayMutate = true;
});
test.afterEach(async () => {
  if (!mayMutate) return;
  await requireOwnedDatabase();
  if (fixtures.applications.length) {
    await db
      .delete(mailMessages)
      .where(inArray(mailMessages.linkedApplicationId, fixtures.applications));
    await db.delete(activityLogs).where(inArray(activityLogs.entityId, fixtures.applications));
    await db.delete(applications).where(inArray(applications.id, fixtures.applications));
  }
  if (fixtures.jobs.length) await db.delete(jobs).where(inArray(jobs.id, fixtures.jobs));
  if (fixtures.resumes.length) {
    await db.delete(resumeVersions).where(inArray(resumeVersions.resumeId, fixtures.resumes));
    await db.delete(resumes).where(inArray(resumes.id, fixtures.resumes));
  }
  for (const list of Object.values(fixtures)) list.length = 0;
});
test.afterAll(async () => {
  await closeActionDatabase();
  await closeDatabase();
});

async function seedRecord(values: Partial<typeof applications.$inferInsert> = {}, jobId?: string) {
  if (!mayMutate) throw new Error("Fixture writes require the guarded test hook.");
  if (!jobId) {
    const id = randomUUID();
    const [job] = await db
      .insert(jobs)
      .values({
        id,
        company: `Application data ${id}`,
        title: "Software Engineer II",
        canonicalUrl: `https://example.invalid/data/${id}`,
        dedupeKey: id,
        source: "E2E",
        location: "Bengaluru",
        status: "PREPARING",
      })
      .returning();
    jobId = job.id;
    fixtures.jobs.push(job.id);
  }
  const [app] = await db
    .insert(applications)
    .values({
      jobId,
      source: "DIRECT",
      status: "APPLIED",
      ...values,
    })
    .returning();
  fixtures.applications.push(app.id);
  return app;
}

const detail = (now: Date, values: Partial<OutcomeDetail> = {}): OutcomeDetail => ({
  happenedAt: now,
  name: "",
  note: "",
  ...values,
});
async function snapshot(id: string) {
  const [app] = await db.select().from(applications).where(eq(applications.id, id));
  const [job] = await db.select().from(jobs).where(eq(jobs.id, app.jobId));
  return {
    app,
    job,
    events: await db
      .select()
      .from(applicationEvents)
      .where(eq(applicationEvents.applicationId, id)),
    rounds: await db
      .select()
      .from(applicationRounds)
      .where(eq(applicationRounds.applicationId, id)),
    activity: await db.select().from(activityLogs).where(eq(activityLogs.entityId, id)),
  };
}

test("outcome writes include complete detail and append after the greatest round position", async () => {
  const app = await seedRecord({ status: "TECHNICAL_INTERVIEW" });
  await db.insert(applicationRounds).values({
    applicationId: app.id,
    kind: "DSA",
    position: 5,
    outcome: "PASSED",
  });
  const now = new Date();
  const at = new Date(now.getTime() + 86_400_000);
  const result = await db.transaction((tx) =>
    applyOutcome(
      tx,
      {
        applicationId: app.id,
        outcome: "scheduled",
        detail: detail(now, { kind: "HLD", at, name: "Architecture", note: "Recruiter confirmed" }),
      },
      now,
    ),
  );
  const saved = await snapshot(app.id);
  expect(saved.rounds.find((round) => round.id === result.roundId)).toMatchObject({
    position: 6,
    kind: "HLD",
    name: "Architecture",
    scheduledAt: at,
    outcome: "SCHEDULED",
  });
  expect(saved.events).toHaveLength(1);
  expect(saved.events[0].payload).toMatchObject({
    outcome: "scheduled",
    previousStatus: "TECHNICAL_INTERVIEW",
    nextStatus: "TECHNICAL_INTERVIEW",
    roundId: result.roundId,
    detail: {
      kind: "HLD",
      name: "Architecture",
      at: at.toISOString(),
      happenedAt: now.toISOString(),
      note: "Recruiter confirmed",
    },
    mailMessageId: null,
  });
  expect(saved.activity).toHaveLength(1);
  expect(saved.job.status).toBe("APPLIED");
});

test("invalid service inputs and transaction failure leave every outcome write rolled back", async () => {
  const app = await seedRecord();
  const now = new Date();
  const before = await snapshot(app.id);
  const invalid: { outcome: "scheduled" | "passed" | "heard"; detail: OutcomeDetail }[] = [
    { outcome: "scheduled", detail: detail(now, { kind: "DSA" }) },
    { outcome: "passed", detail: detail(now) },
    { outcome: "heard", detail: detail(new Date(now.getTime() + 60_000)) },
    { outcome: "heard", detail: detail(now, { note: "x".repeat(2001) }) },
    { outcome: "heard", detail: detail(now, { at: new Date("invalid") }) },
  ];
  for (const input of invalid) {
    await expect(
      db.transaction((tx) => applyOutcome(tx, { applicationId: app.id, ...input }, now)),
    ).rejects.toThrow();
    expect(await snapshot(app.id)).toEqual(before);
  }
  await expect(
    db.transaction(async (tx) => {
      await applyOutcome(
        tx,
        {
          applicationId: app.id,
          outcome: "scheduled",
          detail: detail(now, { kind: "DSA", at: new Date(now.getTime() + 86_400_000) }),
        },
        now,
      );
      throw new Error("Simulated dependent write failure");
    }),
  ).rejects.toThrow("Simulated dependent write failure");
  expect(await snapshot(app.id)).toEqual(before);
});

test("concurrent scheduling records one booked round, outcome event and activity", async () => {
  const app = await seedRecord();
  const now = new Date();
  const input = {
    applicationId: app.id,
    outcome: "scheduled" as const,
    detail: detail(now, { kind: "DSA", at: new Date(now.getTime() + 86_400_000) }),
  };
  const results = await Promise.allSettled([
    db.transaction((tx) => applyOutcome(tx, input, now)),
    db.transaction((tx) => applyOutcome(tx, input, now)),
  ]);
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
  const saved = await snapshot(app.id);
  expect(saved.rounds).toHaveLength(1);
  expect(saved.rounds[0].outcome).toBe("SCHEDULED");
  expect(saved.events).toHaveLength(1);
  expect(saved.activity).toHaveLength(1);
});

test("outreach derives shared job state after the current job writer commits", async () => {
  const app = await seedRecord({ source: "REFERRAL", status: "PREPARING" });
  const now = new Date();
  await db.insert(applicationEvents).values({
    applicationId: app.id,
    eventType: "OUTREACH_SENT",
    summary: "Sent",
    occurredAt: now,
  });
  let release!: () => void;
  let acquired!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const locked = new Promise<void>((resolve) => {
    acquired = resolve;
  });
  const holder = db.transaction(async (tx) => {
    await tx.select().from(jobs).where(eq(jobs.id, app.jobId)).for("update");
    acquired();
    await held;
    await tx.update(jobs).set({ status: "APPLIED" }).where(eq(jobs.id, app.jobId));
  });
  await locked;
  const tag = `jobops-outcome-${app.id}`;
  const recording = db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('application_name', ${tag}, true)`);
    return applyOutcome(
      tx,
      { applicationId: app.id, outcome: "followup", detail: detail(now) },
      now,
    );
  });
  try {
    await expect
      .poll(async () => {
        const result = await db.execute(sql`select count(*)::int as waiting from pg_stat_activity
        where application_name = ${tag} and wait_event_type = 'Lock'`);
        return result.rows[0].waiting;
      })
      .toBe(1);
  } finally {
    release();
    await holder;
    await recording;
  }
  expect((await snapshot(app.id)).job.status).toBe("APPLIED");
});

test("round correction waits for its parent lock and requires a real interview time", async () => {
  const app = await seedRecord();
  const [round] = await db
    .insert(applicationRounds)
    .values({
      applicationId: app.id,
      kind: "DSA",
      position: 1,
      name: "Before",
    })
    .returning();
  let release!: () => void;
  let acquired!: () => void;
  const locked = new Promise<void>((resolve) => {
    acquired = resolve;
  });
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const holder = db.transaction(async (tx) => {
    await tx.select().from(applications).where(eq(applications.id, app.id)).for("update");
    acquired();
    await held;
  });
  const edit = {
    id: round.id,
    name: "After",
    day: "2026-10-10",
    time: "10:30",
    notes: "Confirmed",
  };
  try {
    await locked;
    const result = await db
      .transaction(async (tx) => {
        await tx.execute(sql`set local lock_timeout = '150ms'`);
        await updateRecordRound(tx, edit, new Date());
      })
      .then(
        () => null,
        (error: { cause?: { code?: string } }) => error.cause?.code,
      );
    expect(result).toBe("55P03");
    expect((await snapshot(app.id)).rounds[0].name).toBe("Before");
  } finally {
    release();
    await holder;
  }
  await expect(
    db.transaction((tx) => updateRecordRound(tx, { ...edit, time: "" }, new Date())),
  ).rejects.toThrow(/time/);
  await db.transaction((tx) => updateRecordRound(tx, edit, new Date()));
  expect((await snapshot(app.id)).rounds[0]).toMatchObject({
    name: "After",
    notes: "Confirmed",
    scheduledAt: new Date("2026-10-10T05:00:00Z"),
  });
});

test("linked inbound evidence validates outreach chips consistently with history", async () => {
  const app = await seedRecord({ source: "REFERRAL", status: "PREPARING" });
  const now = new Date();
  await db.insert(applicationEvents).values({
    applicationId: app.id,
    eventType: "OUTREACH_SENT",
    occurredAt: new Date(now.getTime() - 86_400_000),
    summary: "Sent",
  });
  await db.insert(mailMessages).values({
    externalId: randomUUID(),
    provider: "IMPORT",
    sender: "recruiter@example.invalid",
    subject: "Can refer you",
    classification: "RECRUITER_OUTREACH",
    receivedAt: now,
    linkedApplicationId: app.id,
  });
  const before = await snapshot(app.id);
  await expect(
    db.transaction((tx) =>
      applyOutcome(
        tx,
        {
          applicationId: app.id,
          outcome: "replied",
          detail: detail(now),
        },
        now,
      ),
    ),
  ).rejects.toThrow(/does not apply/);
  expect(await snapshot(app.id)).toEqual(before);
  await db.transaction((tx) =>
    applyOutcome(
      tx,
      {
        applicationId: app.id,
        outcome: "referred",
        detail: detail(now),
      },
      now,
    ),
  );
  expect((await snapshot(app.id)).events.map((event) => event.eventType)).toContain(
    "REFERRAL_SUBMITTED",
  );
});

test("legacy sent records preserve their exact resume without manufacturing sent dates", async () => {
  const id = randomUUID();
  const [family] = await db
    .insert(resumes)
    .values({ name: "Data test resume", slug: id })
    .returning();
  fixtures.resumes.push(family.id);
  const versions = await db
    .insert(resumeVersions)
    .values(
      [1, 2].map((version) => ({
        resumeId: family.id,
        versionLabel: `v${version}`,
        originalFilename: `v${version}.pdf`,
        storagePath: `/unused/e2e/${id}-${version}.pdf`,
        fileSize: 1,
        sha256: `${id}-${version}`,
      })),
    )
    .returning();
  for (const status of ["APPLIED", "TECHNICAL_INTERVIEW", "OFFER", "CLOSED"] as const) {
    const app = await seedRecord({ status, resumeVersionId: versions[0].id, appliedAt: null });
    const before = await snapshot(app.id);
    await expect(
      db.transaction((tx) =>
        updateRecordDetails(
          tx,
          {
            id: app.id,
            applicationUrl: "",
            resumeVersionId: versions[1].id,
            notes: "Must roll back",
          },
          new Date(),
        ),
      ),
    ).rejects.toThrow(/stays fixed/);
    expect(await snapshot(app.id)).toEqual(before);
    await db.transaction((tx) =>
      updateRecordDetails(
        tx,
        {
          id: app.id,
          applicationUrl: "",
          resumeVersionId: versions[0].id,
          notes: "Allowed note",
        },
        new Date(),
      ),
    );
    expect((await snapshot(app.id)).app).toMatchObject({
      resumeVersionId: versions[0].id,
      appliedAt: null,
      notes: "Allowed note",
    });
  }
  const preparing = await seedRecord({ status: "PREPARING", resumeVersionId: versions[0].id });
  await db.transaction((tx) =>
    updateRecordDetails(
      tx,
      {
        id: preparing.id,
        applicationUrl: "",
        resumeVersionId: versions[1].id,
        notes: "Changed before sending",
      },
      new Date(),
    ),
  );
  expect((await snapshot(preparing.id)).app.resumeVersionId).toBe(versions[1].id);
});

test("preparing direct and outreach records can be explicitly sent once on their shared job", async () => {
  const direct = await seedRecord({ status: "PREPARING" });
  const outreach = await seedRecord({ status: "PREPARING", source: "REFERRAL" }, direct.jobId);
  const now = new Date();
  const before = await snapshot(direct.id);
  await expect(
    db.transaction((tx) =>
      markRecordSent(
        tx,
        {
          id: direct.id,
          sentDate: "",
          humanConfirmed: false,
        },
        now,
      ),
    ),
  ).rejects.toThrow(/Confirm/);
  expect(await snapshot(direct.id)).toEqual(before);
  await Promise.all(
    [direct, outreach].map((app) =>
      db.transaction((tx) =>
        markRecordSent(
          tx,
          {
            id: app.id,
            sentDate: "2026-09-01",
            humanConfirmed: true,
          },
          now,
        ),
      ),
    ),
  );
  const sentDirect = await snapshot(direct.id);
  const sentOutreach = await snapshot(outreach.id);
  const sentAt = new Date("2026-08-31T18:30:00Z");
  expect(sentDirect.app).toMatchObject({ status: "APPLIED", appliedAt: sentAt });
  expect(sentDirect.events[0]).toMatchObject({
    eventType: "APPLICATION_SUBMITTED",
    occurredAt: sentAt,
  });
  expect(sentOutreach.app).toMatchObject({ status: "PREPARING", appliedAt: null });
  expect(sentOutreach.events[0]).toMatchObject({ eventType: "OUTREACH_SENT", occurredAt: sentAt });
  expect(sentOutreach.job.status).toBe("APPLIED");
  await expect(
    db.transaction((tx) =>
      markRecordSent(
        tx,
        {
          id: outreach.id,
          sentDate: "",
          humanConfirmed: true,
        },
        now,
      ),
    ),
  ).rejects.toThrow(/already/);
  expect(await snapshot(outreach.id)).toEqual(sentOutreach);
});

for (const scenario of ["legacy applied", "linked inbound", "advanced", "closed"] as const) {
  test(`retained recordAction refuses ${scenario} outreach rewrites without altering historical data`, async () => {
    const id = randomUUID();
    const [family] = await db
      .insert(resumes)
      .values({ name: "Retained action resume", slug: id })
      .returning();
    fixtures.resumes.push(family.id);
    const versions = await db
      .insert(resumeVersions)
      .values(
        [1, 2].map((version) => ({
          resumeId: family.id,
          versionLabel: `v${version}`,
          originalFilename: `v${version}.pdf`,
          storagePath: `/unused/e2e/${id}-${version}.pdf`,
          fileSize: 1,
          sha256: `${id}-${version}`,
        })),
      )
      .returning();
    const app = await seedRecord({
      source: "REFERRAL",
      status:
        scenario === "legacy applied"
          ? "APPLIED"
          : scenario === "advanced"
            ? "TECHNICAL_INTERVIEW"
            : scenario === "closed"
              ? "CLOSED"
              : "PREPARING",
      appliedAt: null,
      resumeVersionId: versions[0].id,
    });
    if (scenario === "linked inbound")
      await db.insert(mailMessages).values({
        externalId: randomUUID(),
        provider: "IMPORT",
        sender: "recruiter@example.invalid",
        subject: "Can refer you",
        classification: "RECRUITER_OUTREACH",
        receivedAt: new Date(),
        linkedApplicationId: app.id,
      });
    const before = await snapshot(app.id);
    for (const recordState of ["planned", "sent"]) {
      const form = new FormData();
      for (const [key, value] of Object.entries({
        recordId: app.id,
        jobId: app.jobId,
        method: "REFERRAL",
        recordState,
        resumeVersionId: versions[1].id,
        notes: "Must not overwrite",
        recipient: "New recipient",
        applicationUrl: "https://example.invalid/changed",
        sentDate: "2026-09-01",
      }))
        form.set(key, value);
      const result = await recordAction({}, form);
      expect(await snapshot(app.id)).toEqual(before);
      expect(result.error).toMatch(/already.*sent|sent or closed/i);
    }
  });
}

test("a sent referral can be replied to, submitted and withdrawn with exact terminal values", async () => {
  const app = await seedRecord({ source: "REFERRAL", status: "PREPARING", appliedAt: null });
  const now = new Date();
  await db.insert(applicationEvents).values({
    applicationId: app.id,
    eventType: "OUTREACH_SENT",
    occurredAt: new Date(now.getTime() - 86400000),
    summary: "Sent",
  });
  for (const outcome of ["replied", "referred", "withdrew"] as const) {
    await db.transaction((tx) =>
      applyOutcome(tx, { applicationId: app.id, outcome, detail: detail(now) }, now),
    );
    const saved = await snapshot(app.id);
    expect(saved.app).toMatchObject(
      outcome === "withdrew"
        ? { status: "WITHDRAWN", closedReason: "WITHDREW", appliedAt: null }
        : { status: "PREPARING", closedReason: null, appliedAt: null },
    );
  }
  const saved = await snapshot(app.id);
  expect(saved.events.map((event) => event.eventType).sort()).toEqual([
    "OUTREACH_SENT",
    "REFERRAL_SUBMITTED",
    "REPLY_RECEIVED",
    "WITHDRAWN",
  ]);
  expect(saved.events.find((event) => event.eventType === "WITHDRAWN")?.payload).toMatchObject({
    outcome: "withdrew",
    previousStatus: "PREPARING",
    nextStatus: "WITHDRAWN",
  });
  expect(saved.activity).toHaveLength(3);
  expect(saved.job.status).toBe("PREPARING");
});
