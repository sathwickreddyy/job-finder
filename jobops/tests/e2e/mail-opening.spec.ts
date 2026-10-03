import { randomUUID } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { expect, test } from "@playwright/test";
import { db, closeDatabase } from "../../src/db";
import {
  jobs,
  jobSnapshots,
  mailMessages,
  mailEvents,
  activityLogs,
  applications,
  applicationEvents,
  settings,
} from "../../src/db/schema";
import { jobInputSchema } from "../../src/features/jobs/import";
import { saveMailOpening } from "../../src/features/mail/handled";
import { importJobRows } from "../../src/features/jobs/service";
const ids = { jobs: [] as string[], mail: [] as string[], apps: [] as string[] };
async function guard() {
  if (!process.env.DATABASE_URL || new URL(process.env.DATABASE_URL).pathname !== "/jobops_e2e")
    throw new Error("Opening fixtures require jobops_e2e.");
  const [marker] = await db.select().from(settings).where(eq(settings.key, "__jobops_e2e"));
  if (marker?.value.ownedBy !== "jobops-browser-tests")
    throw new Error("Opening fixtures require ownership marker.");
}
test.beforeEach(guard);
test.afterEach(async () => {
  await guard();
  const entities = [...ids.jobs, ...ids.mail, ...ids.apps];
  if (entities.length)
    await db.delete(activityLogs).where(inArray(activityLogs.entityId, entities));
  if (ids.mail.length) await db.delete(mailMessages).where(inArray(mailMessages.id, ids.mail));
  if (ids.apps.length) await db.delete(applications).where(inArray(applications.id, ids.apps));
  if (ids.jobs.length) await db.delete(jobs).where(inArray(jobs.id, ids.jobs));
  Object.values(ids).forEach((list) => (list.length = 0));
});
test.afterAll(closeDatabase);
function input() {
  const token = randomUUID();
  return jobInputSchema.parse({
    company: `Opening ${token}`,
    title: "SDE II",
    url: `https://example.invalid/${token}`,
    description: "Confirmed engineering role",
    notes: "My original notes",
    source: "COMPANY_CAREERS",
  });
}
async function mail(values: Partial<typeof mailMessages.$inferInsert> = {}, details = {}) {
  await guard();
  const id = randomUUID();
  ids.mail.push(id);
  const [message] = await db
    .insert(mailMessages)
    .values({
      id,
      externalId: id,
      sender: "recruiter@example.invalid",
      senderName: "Recruiter Name",
      subject: `Role ${id}`,
      receivedAt: new Date(),
      classification: "RECRUITER_OUTREACH",
      bodyText: "Full role description from email",
      ...values,
    })
    .returning();
  await guard();
  await db
    .insert(mailEvents)
    .values({ mailMessageId: id, type: message.classification, confidence: 1, details });
  return message;
}
async function snapshot(mailId: string, jobId?: string) {
  return {
    mail: await db.select().from(mailMessages).where(eq(mailMessages.id, mailId)),
    events: await db.select().from(mailEvents).where(eq(mailEvents.mailMessageId, mailId)),
    activity: await db
      .select()
      .from(activityLogs)
      .where(inArray(activityLogs.entityId, [mailId, ...(jobId ? [jobId] : [])])),
    job: jobId ? await db.select().from(jobs).where(eq(jobs.id, jobId)) : [],
    descriptions: jobId
      ? await db.select().from(jobSnapshots).where(eq(jobSnapshots.jobId, jobId))
      : [],
  };
}
test("forced rollback after successful opening and mail handling preserves all source state", async () => {
  const message = await mail();
  const data = input();
  const before = await snapshot(message.id);
  await guard();
  await expect(
    db.transaction(async (tx) => {
      const saved = await saveMailOpening(tx, message.id, data);
      ids.jobs.push(saved.jobId);
      const [created] = await tx.select().from(jobs).where(eq(jobs.id, saved.jobId));
      expect(created.notes).toContain(`/mail/${message.id}`);
      throw new Error("forced opening rollback");
    }),
  ).rejects.toThrow("forced opening rollback");
  expect(await snapshot(message.id)).toEqual(before);
  expect(await db.select().from(jobs).where(eq(jobs.canonicalUrl, data.url))).toHaveLength(0);
});
test("missing and stale sources roll back imports; forged non-role and matched-role saves fail", async () => {
  const stale = await mail({ attentionState: "DONE" });
  const noise = await mail({ sender: "jobs@naukri.com" });
  const update = await mail({ classification: "INTERVIEW" });
  const existing = await importJobRows([input()], "skip");
  ids.jobs.push(existing.ids[0]);
  await guard();
  const appId = randomUUID();
  ids.apps.push(appId);
  await db.insert(applications).values({ id: appId, jobId: existing.ids[0], status: "APPLIED" });
  const matched = await mail({}, { suggestedApplicationId: appId });
  for (const id of [randomUUID(), stale.id, noise.id, update.id, matched.id]) {
    const data = input();
    const before = await snapshot(id);
    await guard();
    await expect(db.transaction((tx) => saveMailOpening(tx, id, data))).rejects.toThrow(
      /exists|handled|New roles/,
    );
    expect(await snapshot(id)).toEqual(before);
    expect(await db.select().from(jobs).where(eq(jobs.canonicalUrl, data.url))).toHaveLength(0);
  }
});
test("duplicate opening reuses exact identity and retains source provenance; repeated saves append nothing", async () => {
  const data = input();
  const imported = await importJobRows([data], "skip");
  const jobId = imported.ids[0];
  ids.jobs.push(jobId);
  await guard();
  const appId = randomUUID();
  ids.apps.push(appId);
  const [existingApplication] = await db
    .insert(applications)
    .values({
      id: appId,
      jobId,
      status: "TECHNICAL_INTERVIEW",
      appliedAt: new Date("2026-10-01T05:00:00Z"),
    })
    .returning();
  await guard();
  const [existingEvent] = await db
    .insert(applicationEvents)
    .values({
      applicationId: appId,
      eventType: "APPLICATION_SUBMITTED",
      summary: "Existing application history",
      occurredAt: new Date("2026-10-01T05:00:00Z"),
    })
    .returning();
  const before = await snapshot(randomUUID(), jobId);
  const message = await mail();
  await guard();
  const saved = await db.transaction((tx) =>
    saveMailOpening(tx, message.id, {
      ...data,
      company: "Changed label",
      title: "Changed title",
      url: `${data.url}?utm_source=email`,
      notes: "Forged replacement notes",
    }),
  );
  expect(saved).toMatchObject({ jobId, created: false, handled: true });
  const after = await snapshot(message.id, jobId);
  expect(after.job[0]).toMatchObject({
    company: data.company,
    title: data.title,
    canonicalUrl: data.url,
    dedupeKey: before.job[0].dedupeKey,
  });
  expect(after.job[0].notes).toContain("My original notes");
  expect(after.job[0].notes).toContain(`Source email: /mail/${message.id}`);
  expect(after.job[0].notes).toContain(message.senderName);
  expect(after.job[0].notes).toContain(message.subject);
  expect(after.descriptions).toEqual(before.descriptions);
  expect(after.events[0]).toMatchObject({
    status: "REVIEWED",
    details: { savedOpeningId: jobId, sourceLink: `/mail/${message.id}` },
  });
  expect(after.mail[0].attentionState).toBe("DONE");
  expect(after.activity.filter((row) => row.action === "MAIL_SAVED_AS_OPENING")).toHaveLength(1);
  await guard();
  expect(await db.transaction((tx) => saveMailOpening(tx, message.id, data))).toMatchObject({
    jobId,
    handled: false,
  });
  expect(await snapshot(message.id, jobId)).toEqual(after);
  expect(await db.select().from(applications).where(eq(applications.id, appId))).toEqual([
    existingApplication,
  ]);
  expect(
    await db.select().from(applicationEvents).where(eq(applicationEvents.applicationId, appId)),
  ).toEqual([existingEvent]);
});
test("competing saves handle a source once and roll back the losing opening", async () => {
  const message = await mail();
  const inputs = [input(), input()];
  await guard();
  let release!: () => void;
  let acquired!: () => void;
  let holderPid = 0;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const locked = new Promise<void>((resolve) => {
    acquired = resolve;
  });
  const holder = db.transaction(async (tx) => {
    holderPid = Number((await tx.execute(sql`select pg_backend_pid() as pid`)).rows[0].pid);
    const result = await saveMailOpening(tx, message.id, inputs[0]);
    acquired();
    await held;
    return result;
  });
  await locked;
  const tag = `jobops-mail-opening-${message.id}`;
  const waiter = db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('application_name', ${tag}, true)`);
    return saveMailOpening(tx, message.id, inputs[1]);
  });
  const settled = Promise.allSettled([holder, waiter]);
  try {
    await expect
      .poll(async () => {
        const result = await db.execute(sql`select count(*)::int as waiting from pg_stat_activity
        where application_name = ${tag} and wait_event_type = 'Lock' and wait_event = 'advisory'
        and ${holderPid} = any(pg_blocking_pids(pid))`);
        return result.rows[0].waiting;
      })
      .toBe(1);
  } finally {
    release();
  }
  const results = await settled;
  const rejected = results.find((result) => result.status === "rejected");
  expect(rejected?.status === "rejected" ? rejected.reason.message : "").toMatch(
    /already been handled/,
  );
  const fulfilled = results.filter((result) => result.status === "fulfilled");
  expect(fulfilled).toHaveLength(1);
  for (const result of fulfilled)
    if (result.status === "fulfilled") ids.jobs.push(result.value.jobId);
  const found = await db
    .select()
    .from(jobs)
    .where(
      inArray(
        jobs.canonicalUrl,
        inputs.map((data) => data.url),
      ),
    );
  expect(found).toHaveLength(1);
  expect((await snapshot(message.id)).activity).toHaveLength(1);
});
test("mail form confirms company and role, saves to opening with durable confirmation and attribution at 390px", async ({
  page,
}) => {
  const message = await mail();
  const data = input();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/jobs/new?fromMail=${message.id}`);
  await expect(page.getByLabel("Company", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Role / title", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Job description", { exact: true })).toHaveValue(message.bodyText!);
  await expect(page.getByRole("link", { name: "Read source email" })).toHaveAttribute(
    "href",
    `/mail/${message.id}`,
  );
  await expect(
    page.getByText(`Saving a role from mail: ${message.subject}`, { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Company", { exact: true }).fill(data.company);
  await page.getByLabel("Role / title", { exact: true }).fill(data.title);
  await page.getByLabel("Original job URL", { exact: true }).fill(data.url);
  await page.getByRole("button", { name: "Save job", exact: true }).click();
  await expect(page).toHaveURL(/\/jobs\/[\da-f-]+\?savedFromMail=1$/);
  const jobId = new URL(page.url()).pathname.split("/").at(-1)!;
  expect(new URL(page.url()).pathname + new URL(page.url()).search).toBe(
    `/jobs/${jobId}?savedFromMail=1`,
  );
  ids.jobs.push(jobId);
  await expect(page.getByRole("status").filter({ hasText: "Opening saved." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Direct application" })).toBeVisible();
  await page.getByText("Notes and saved description history", { exact: true }).click();
  await expect(page.getByLabel("My notes", { exact: true })).toHaveValue(
    new RegExp(`/mail/${message.id}`),
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto(`/jobs/new?fromMail=${message.id}`);
  await expect(page.getByRole("alert").filter({ hasText: "already been handled" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save job", exact: true })).toHaveCount(0);
  await page.goto("/jobs/new?fromMail=invalid");
  await expect(
    page.getByRole("alert").filter({ hasText: "source message link is invalid" }),
  ).toBeVisible();
});
