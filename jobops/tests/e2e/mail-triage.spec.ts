import { randomUUID } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { expect, test } from "@playwright/test";
import { closeDatabase, db } from "../../src/db";
import {
  activityLogs,
  applicationEvents,
  applicationRounds,
  applications,
  jobs,
  mailEvents,
  mailMessages,
  resumes,
  resumeVersions,
  settings,
} from "../../src/db/schema";
import { applyOutcome } from "../../src/features/applications/outcome-service";
import {
  dismissMessages,
  linkMailToRecord,
  restoreDismissal,
  unlinkMailFromRecord,
} from "../../src/features/mail/handling-service";
import { readMailTriage } from "../../src/features/mail/read";
import { availableOutcomes, recordStateFrom } from "../../src/features/applications/phase";
import { silenceClock } from "../../src/features/applications/queue";

const ids = {
  jobs: [] as string[],
  apps: [] as string[],
  mail: [] as string[],
  families: [] as string[],
};
async function guard() {
  if (!process.env.DATABASE_URL || new URL(process.env.DATABASE_URL).pathname !== "/jobops_e2e")
    throw new Error("Mail fixtures require jobops_e2e.");
  const [marker] = await db.select().from(settings).where(eq(settings.key, "__jobops_e2e"));
  if (marker?.value.ownedBy !== "jobops-browser-tests")
    throw new Error("Mail fixtures require the ownership marker.");
}
test.beforeEach(guard);
test.afterEach(async () => {
  await guard();
  if (ids.mail.length) {
    await db.delete(activityLogs).where(inArray(activityLogs.entityId, ids.mail));
    await db.delete(mailMessages).where(inArray(mailMessages.id, ids.mail));
  }
  if (ids.apps.length) {
    await db.delete(activityLogs).where(inArray(activityLogs.entityId, ids.apps));
    await db.delete(applications).where(inArray(applications.id, ids.apps));
  }
  if (ids.jobs.length) await db.delete(jobs).where(inArray(jobs.id, ids.jobs));
  if (ids.families.length) {
    await db.delete(resumeVersions).where(inArray(resumeVersions.resumeId, ids.families));
    await db.delete(resumes).where(inArray(resumes.id, ids.families));
  }
  Object.values(ids).forEach((list) => (list.length = 0));
});
test.afterAll(closeDatabase);
async function record(source: "DIRECT" | "REFERRAL" = "DIRECT") {
  await guard();
  const jobId = randomUUID();
  ids.jobs.push(jobId);
  await db.insert(jobs).values({
    id: jobId,
    company: `Mail fixture ${jobId}`,
    title: "SDE II",
    canonicalUrl: `https://example.invalid/${jobId}`,
    dedupeKey: jobId,
    source: "E2E",
  });
  await guard();
  const appId = randomUUID();
  ids.apps.push(appId);
  const [app] = await db
    .insert(applications)
    .values({
      id: appId,
      jobId,
      source,
      status: "APPLIED",
      appliedAt: new Date(Date.now() - 10 * 86400000),
    })
    .returning();
  return app;
}
async function message(values: Partial<typeof mailMessages.$inferInsert> = {}, suggested?: string) {
  await guard();
  const id = randomUUID();
  ids.mail.push(id);
  const [mail] = await db
    .insert(mailMessages)
    .values({
      id,
      externalId: id,
      sender: "recruiter@example.invalid",
      subject: `Mail ${id}`,
      receivedAt: new Date(),
      classification: "INTERVIEW",
      ...values,
    })
    .returning();
  await guard();
  await db.insert(mailEvents).values({
    mailMessageId: id,
    type: mail.classification,
    confidence: 1,
    details: suggested ? { suggestedApplicationId: suggested } : {},
  });
  return mail;
}
async function state(appId: string, mailId: string) {
  const [app] = await db.select().from(applications).where(eq(applications.id, appId));
  const [job] = await db.select().from(jobs).where(eq(jobs.id, app.jobId));
  const [mail] = await db.select().from(mailMessages).where(eq(mailMessages.id, mailId));
  return {
    app,
    job,
    mail,
    events: await db
      .select()
      .from(applicationEvents)
      .where(eq(applicationEvents.applicationId, appId)),
    rounds: await db
      .select()
      .from(applicationRounds)
      .where(eq(applicationRounds.applicationId, appId)),
    mailEvents: await db.select().from(mailEvents).where(eq(mailEvents.mailMessageId, mailId)),
    activity: await db
      .select()
      .from(activityLogs)
      .where(inArray(activityLogs.entityId, [appId, mailId])),
  };
}
const outcome = (applicationId: string, mailMessageId: string) => ({
  applicationId,
  mailMessageId,
  outcome: "scheduled" as const,
  detail: {
    kind: "DSA" as const,
    at: new Date(Date.now() + 86400000),
    happenedAt: new Date(),
    name: "Interview",
    note: "Confirmed",
  },
});

test("mail outcome and all related writes roll back together; stale mail cannot schedule", async () => {
  const app = await record();
  const mail = await message();
  const before = await state(app.id, mail.id);
  await guard();
  await expect(
    db.transaction(async (tx) => {
      await applyOutcome(tx, outcome(app.id, mail.id), new Date());
      throw new Error("forced rollback after mail resolution");
    }),
  ).rejects.toThrow("forced rollback");
  expect(await state(app.id, mail.id)).toEqual(before);
  await guard();
  await db.transaction((tx) => dismissMessages(tx, { ids: [mail.id] }, new Date()));
  const dismissed = await state(app.id, mail.id);
  await guard();
  await expect(
    db.transaction((tx) => applyOutcome(tx, outcome(app.id, mail.id), new Date())),
  ).rejects.toThrow(/handled/);
  expect(await state(app.id, mail.id)).toEqual(dismissed);
});

test("competing mail outcomes link only one record and create only one round", async () => {
  const a = await record();
  const b = await record();
  const mail = await message();
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
    const result = await applyOutcome(tx, outcome(a.id, mail.id), new Date());
    acquired();
    await held;
    return result;
  });
  await locked;
  const tag = `jobops-mail-outcome-${mail.id}`;
  const waiter = db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('application_name', ${tag}, true)`);
    return applyOutcome(tx, outcome(b.id, mail.id), new Date());
  });
  const settled = Promise.allSettled([holder, waiter]);
  try {
    await expect
      .poll(async () => {
        const result = await db.execute(sql`select count(*)::int as waiting from pg_stat_activity
        where application_name = ${tag} and wait_event_type = 'Lock'
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
    /already linked|already been handled/,
  );
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  const states = await Promise.all([a, b].map((app) => state(app.id, mail.id)));
  expect(states.flatMap((row) => row.rounds)).toHaveLength(1);
  expect(states.flatMap((row) => row.events)).toHaveLength(1);
  const winner = states.find((row) => row.rounds.length)!;
  const loser = states.find((row) => !row.rounds.length)!;
  expect(winner.mail.linkedApplicationId).toBe(winner.app.id);
  expect(winner.mailEvents[0].linkedApplicationId).toBe(winner.app.id);
  expect(loser.app.status).toBe("APPLIED");
});

test("acknowledgements preserve the silence clock, exact resume and advanced status", async () => {
  const app = await record();
  const ack = await message({ classification: "APPLICATION_ACKNOWLEDGEMENT" }, app.id);
  await guard();
  const familyId = randomUUID();
  ids.families.push(familyId);
  await db.insert(resumes).values({ id: familyId, name: "Exact file", slug: familyId });
  await guard();
  const [file] = await db
    .insert(resumeVersions)
    .values({
      resumeId: familyId,
      versionLabel: "v1",
      originalFilename: "submitted.pdf",
      storagePath: "e2e-placeholder",
      fileSize: 1,
      sha256: "fixture",
    })
    .returning();
  await guard();
  await db
    .update(applications)
    .set({ resumeVersionId: file.id })
    .where(eq(applications.id, app.id));
  await guard();
  await db.transaction((tx) => linkMailToRecord(tx, ack.id, app.id, new Date()));
  const saved = await state(app.id, ack.id);
  expect(saved.app).toMatchObject({
    status: "ACKNOWLEDGED",
    resumeVersionId: file.id,
    appliedAt: app.appliedAt,
  });
  expect(saved.events.map((event) => event.eventType)).toEqual(["ACKNOWLEDGEMENT_RECEIVED"]);
  const queueRecord = {
    ...saved.app,
    company: "Fixture",
    role: "SDE",
    contact: null,
    sentAt: app.appliedAt,
    rounds: [],
    events: saved.events,
    linkedMail: [saved.mail],
  };
  expect(silenceClock(queueRecord, new Date())?.since).toEqual(app.appliedAt);
  await guard();
  expect(await db.transaction((tx) => linkMailToRecord(tx, ack.id, app.id, new Date()))).toBe(
    false,
  );
  expect((await state(app.id, ack.id)).events).toHaveLength(1);
  await guard();
  await db
    .update(applications)
    .set({ status: "TECHNICAL_INTERVIEW" })
    .where(eq(applications.id, app.id));
  const ack2 = await message({ classification: "APPLICATION_ACKNOWLEDGEMENT" }, app.id);
  await guard();
  await db.transaction((tx) => linkMailToRecord(tx, ack2.id, app.id, new Date()));
  expect((await state(app.id, ack2.id)).app.status).toBe("TECHNICAL_INTERVIEW");
});

test("linked inbound drives outreach state and unlink preserves later outcomes", async () => {
  const app = await record("REFERRAL");
  const mail = await message({ classification: "FOLLOW_UP" });
  await guard();
  await db.transaction((tx) => linkMailToRecord(tx, mail.id, app.id, new Date()));
  let saved = await state(app.id, mail.id);
  expect(
    availableOutcomes(
      recordStateFrom({ ...saved.app, events: saved.events, linkedMail: [saved.mail] }, [], []),
    ),
  ).toContain("referred");
  await guard();
  await db.transaction((tx) =>
    applyOutcome(
      tx,
      {
        applicationId: app.id,
        outcome: "referred",
        detail: { happenedAt: new Date(), name: "", note: "" },
      },
      new Date(),
    ),
  );
  await guard();
  await db.transaction((tx) => unlinkMailFromRecord(tx, mail.id, app.id, new Date()));
  saved = await state(app.id, mail.id);
  expect(saved.mail).toMatchObject({ linkedApplicationId: null, attentionState: "OPEN" });
  expect(saved.mailEvents[0]).toMatchObject({ status: "NEEDS_REVIEW", linkedApplicationId: null });
  expect(saved.events.map((event) => event.eventType)).toEqual(
    expect.arrayContaining(["REFERRAL_SUBMITTED", "MAIL_UNLINKED"]),
  );
});

test("legacy DONE stays handled; dismiss skips linked mail and undo cannot resurrect it", async () => {
  const app = await record();
  const legacy = await message({ attentionState: "DONE" });
  const linked = await message();
  const open = await message({ classification: "FOLLOW_UP" });
  await guard();
  await db.transaction((tx) => linkMailToRecord(tx, linked.id, app.id, new Date()));
  await guard();
  expect(
    await db.transaction((tx) =>
      dismissMessages(tx, { ids: [legacy.id, linked.id, open.id] }, new Date()),
    ),
  ).toBe(1);
  const triage = await readMailTriage([]);
  expect(triage.messages.some((row) => [legacy.id, linked.id, open.id].includes(row.id))).toBe(
    false,
  );
  const dismissed = (await state(app.id, open.id)).mailEvents[0];
  const token = String(dismissed.details.triageDismissal);
  await guard();
  expect(await db.transaction((tx) => restoreDismissal(tx, open.id, token))).toBe(1);
  await guard();
  await db.transaction((tx) => linkMailToRecord(tx, open.id, app.id, new Date()));
  await guard();
  await expect(db.transaction((tx) => restoreDismissal(tx, open.id, token))).rejects.toThrow(
    /no longer/,
  );
  expect((await state(app.id, open.id)).mail.linkedApplicationId).toBe(app.id);
  await guard();
  await expect(
    db.transaction((tx) => linkMailToRecord(tx, legacy.id, app.id, new Date())),
  ).rejects.toThrow(/handled/);
});

test("bulk dismiss covers more than 200 messages and undo restores that operation only", async () => {
  const mailIds: string[] = Array.from({ length: 205 }, () => randomUUID());
  ids.mail.push(...mailIds);
  await guard();
  await db.insert(mailMessages).values(
    mailIds.map((id) => ({
      id,
      externalId: id,
      sender: "jobs@naukri.com",
      subject: `Bulk ${id}`,
      receivedAt: new Date(),
      classification: "UNKNOWN" as const,
    })),
  );
  await guard();
  await db
    .insert(mailEvents)
    .values(mailIds.map((id) => ({ mailMessageId: id, type: "UNKNOWN" as const, confidence: 1 })));
  const role = await message({ classification: "RECRUITER_OUTREACH" });
  await guard();
  // The entire bucket may include other fictional seed mail. Roll back this test's
  // outer transaction after assertions so it cannot alter those rows or their logs.
  await expect(
    db.transaction(async (tx) => {
      expect(await dismissMessages(tx, { noise: true }, new Date())).toBeGreaterThanOrEqual(205);
      const dismissed = await tx
        .select()
        .from(mailMessages)
        .where(inArray(mailMessages.id, mailIds));
      expect(dismissed).toHaveLength(205);
      expect(dismissed.every((row) => row.attentionState === "DONE")).toBe(true);
      const [untouched] = await tx.select().from(mailMessages).where(eq(mailMessages.id, role.id));
      expect(untouched.attentionState).toBe("OPEN");
      const [event] = await tx
        .select()
        .from(mailEvents)
        .where(eq(mailEvents.mailMessageId, mailIds[0]));
      expect(
        await restoreDismissal(tx, mailIds[0], String(event.details.triageDismissal)),
      ).toBeGreaterThanOrEqual(205);
      const restored = await tx
        .select()
        .from(mailMessages)
        .where(inArray(mailMessages.id, mailIds));
      expect(restored.every((row) => row.attentionState === "OPEN")).toBe(true);
      throw new Error("rollback whole-bucket test");
    }),
  ).rejects.toThrow("rollback whole-bucket test");
});

test("Emails buckets dismiss with durable confirmation and Undo at 390px", async ({ page }) => {
  const app = await record();
  const ack = await message(
    { classification: "APPLICATION_ACKNOWLEDGEMENT", subject: `Acknowledged ${randomUUID()}` },
    app.id,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/applications?emails=1");
  const card = page
    .getByRole("listitem")
    .filter({ has: page.getByRole("link", { name: ack.subject, exact: true }) });
  await expect(card.getByRole("button", { name: "Link", exact: true })).toBeVisible();
  await card.getByRole("button", { name: "Dismiss", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Dismissed 1 message." })).toBeVisible();
  await expect(page.getByRole("link", { name: ack.subject, exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Undo last dismiss" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Restored 1 message." })).toBeVisible();
  await expect(page.getByRole("link", { name: ack.subject, exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("mail outcome keeps success and focus after resolution; unlink reopens mail", async ({
  page,
}) => {
  const app = await record("REFERRAL");
  const mail = await message({ classification: "FOLLOW_UP" }, app.id);
  await page.goto(`/applications/${app.id}?mail=${mail.id}&outcome=heard#what-happened`);
  await expect(page.locator('#what-happened input[name="outcome"]')).toHaveValue("replied");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  // Assert after the successful operation's actual cleanup navigation, not transient feedback.
  await expect(page).toHaveURL(new RegExp(`/applications/${app.id}$`));
  await expect(page.locator('#what-happened input[name="mailId"]')).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: "Saved: Replied." })).toBeVisible();
  await expect(page.getByRole("region", { name: "Progress", exact: true })).toBeFocused();
  await expect(page.getByText(`Linking mail: ${mail.subject}`, { exact: true })).toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL(
    new RegExp(`/applications/${app.id}\\?mail=${mail.id}&outcome=heard#what-happened$`),
  );
  await expect(
    page.getByRole("alert").filter({ hasText: "source message has already been handled" }),
  ).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Saved: Replied." })).toHaveCount(0);
  await expect(page.locator('#what-happened input[name="outcome"]')).toHaveCount(0);
  await page.goForward();
  await expect(page).toHaveURL(new RegExp(`/applications/${app.id}$`));
  await expect(page.getByRole("status").filter({ hasText: "Saved: Replied." })).toHaveCount(0);
  await page.getByRole("button", { name: "Unlink mail" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Recorded outcomes and history were kept." }),
  ).toBeVisible();
  expect((await state(app.id, mail.id)).mail.attentionState).toBe("OPEN");
});

for (const source of [
  { classification: "INTERVIEW" as const, sender: "jobs@naukri.com" },
  { classification: "ASSESSMENT" as const, sender: "alerts@instahyre.com" },
  { classification: "UNKNOWN" as const },
  { classification: "RECRUITER_OUTREACH" as const },
]) {
  test(`actual ${source.classification} ${source.sender ?? "unmatched"} cannot become record progress`, async ({
    page,
  }) => {
    const app = await record();
    const mail = await message(source);
    const before = await state(app.id, mail.id);
    await guard();
    await expect(
      db.transaction((tx) => linkMailToRecord(tx, mail.id, app.id, new Date())),
    ).rejects.toThrow(/Updates|New roles|noise/);
    expect(await state(app.id, mail.id)).toEqual(before);
    await guard();
    await expect(
      db.transaction((tx) => applyOutcome(tx, outcome(app.id, mail.id), new Date())),
    ).rejects.toThrow(/Updates|New roles|noise/);
    expect(await state(app.id, mail.id)).toEqual(before);
    await page.goto(`/applications/${app.id}?mail=${mail.id}&outcome=scheduled#what-happened`);
    expect(await page.locator('#what-happened input[name="outcome"]').count()).toBe(0);
    await expect(
      page.getByRole("alert").filter({ hasText: /Updates|New roles|noise/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Record an outcome manually", exact: true }),
    ).toHaveAttribute("href", `/applications/${app.id}#what-happened`);
    expect(await state(app.id, mail.id)).toEqual(before);
  });
}

for (const kind of ["malformed", "missing", "dismissed", "linked elsewhere"] as const) {
  test(`explicit ${kind} mail URL cannot silently record a manual outcome`, async ({ page }) => {
    const app = await record();
    const other = await record();
    const mail = await message();
    let requestedMail = mail.id;
    if (kind === "malformed") requestedMail = "not-a-message-id";
    if (kind === "missing") requestedMail = randomUUID();
    if (kind === "dismissed") {
      await guard();
      await db.transaction((tx) => dismissMessages(tx, { ids: [mail.id] }, new Date()));
    }
    if (kind === "linked elsewhere") {
      await guard();
      await db.transaction((tx) => linkMailToRecord(tx, mail.id, other.id, new Date()));
    }
    const before = await state(app.id, mail.id);
    const otherBefore = await state(other.id, mail.id);
    await page.goto(
      `/applications/${app.id}?mail=${requestedMail}&outcome=scheduled#what-happened`,
    );
    expect(await page.locator('#what-happened input[name="outcome"]').count()).toBe(0);
    await expect(page.getByRole("alert").filter({ hasText: /source|message/ })).toBeVisible();
    await page.getByRole("link", { name: "Record an outcome manually", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/applications/${app.id}#what-happened$`));
    await expect(page.getByRole("button", { name: "Round scheduled", exact: true })).toBeVisible();
    expect(await state(app.id, mail.id)).toEqual(before);
    expect(await state(other.id, mail.id)).toEqual(otherBefore);
  });
}

test("mail handled while its outcome form is open keeps source and rejects all writes", async ({
  page,
}) => {
  const app = await record();
  const mail = await message({ classification: "FOLLOW_UP" });
  await page.goto(`/applications/${app.id}?mail=${mail.id}&outcome=heard#what-happened`);
  await expect(page.locator('#what-happened input[name="mailId"]')).toHaveValue(mail.id);
  await guard();
  await db.transaction((tx) => dismissMessages(tx, { ids: [mail.id] }, new Date()));
  const before = await state(app.id, mail.id);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: /already been handled/ })).toBeVisible();
  await expect(page.locator('#what-happened input[name="mailId"]')).toHaveValue(mail.id);
  expect(await state(app.id, mail.id)).toEqual(before);
});

test("Undo isolates independent operations and rejects an old token after restore and re-dismiss", async () => {
  const app = await record();
  const first = await message({ classification: "UNKNOWN" });
  const second = await message({ classification: "UNKNOWN" });
  await guard();
  await db.transaction((tx) => dismissMessages(tx, { ids: [first.id] }, new Date()));
  const oldToken = String((await state(app.id, first.id)).mailEvents[0].details.triageDismissal);
  await guard();
  await db.transaction((tx) => dismissMessages(tx, { ids: [second.id] }, new Date()));
  const independent = await state(app.id, second.id);
  expect(independent.mailEvents[0].details.triageDismissal).not.toBe(oldToken);
  await guard();
  expect(await db.transaction((tx) => restoreDismissal(tx, first.id, oldToken))).toBe(1);
  expect((await state(app.id, first.id)).mail.attentionState).toBe("OPEN");
  expect(await state(app.id, second.id)).toEqual(independent);
  await guard();
  await db.transaction((tx) => dismissMessages(tx, { ids: [first.id] }, new Date()));
  const redismissed = await state(app.id, first.id);
  expect(redismissed.mailEvents[0].details.triageDismissal).not.toBe(oldToken);
  await guard();
  await expect(db.transaction((tx) => restoreDismissal(tx, first.id, oldToken))).rejects.toThrow(
    /no longer/,
  );
  expect(await state(app.id, first.id)).toEqual(redismissed);
  expect(await state(app.id, second.id)).toEqual(independent);
});

for (const status of ["PREPARING", "CLOSED", "APPLIED"] as const) {
  test(`legitimate Updates can link to a chosen ${status} record without changing its status`, async ({
    page,
  }) => {
    const app = await record();
    const suggested = await record();
    await guard();
    await db
      .update(applications)
      .set({ status, appliedAt: status === "PREPARING" ? null : app.appliedAt })
      .where(eq(applications.id, app.id));
    // A real update without a suggestion supports manual selection; a different suggestion is also just a suggestion.
    const mail = await message(
      { classification: "FOLLOW_UP" },
      status === "APPLIED" ? suggested.id : undefined,
    );
    const before = await state(app.id, mail.id);
    await page.goto(`/applications/${app.id}?mail=${mail.id}`);
    await expect(
      page.getByRole("button", { name: "Link without recording an outcome", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Link without recording an outcome", exact: true })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "Message linked to your record." }),
    ).toBeVisible();
    const after = await state(app.id, mail.id);
    expect(after.app).toEqual(before.app);
    expect(after.job).toEqual(before.job);
    expect(after.rounds).toEqual(before.rounds);
    expect(after.mail.linkedApplicationId).toBe(app.id);
    expect(after.events.map((event) => event.eventType)).toEqual(["MAIL_LINKED"]);
    await guard();
    expect(await db.transaction((tx) => linkMailToRecord(tx, mail.id, app.id, new Date()))).toBe(
      false,
    );
    expect(await state(app.id, mail.id)).toEqual(after);
  });
}

test("only the current matched acknowledgement record may link, and acknowledgements never record outcomes", async () => {
  const app = await record();
  const other = await record();
  const ack = await message({ classification: "APPLICATION_ACKNOWLEDGEMENT" }, app.id);
  const before = await state(other.id, ack.id);
  await guard();
  await expect(
    db.transaction((tx) => linkMailToRecord(tx, ack.id, other.id, new Date())),
  ).rejects.toThrow(/noise|matched acknowledgement/);
  expect(await state(other.id, ack.id)).toEqual(before);
  const matchedBefore = await state(app.id, ack.id);
  await guard();
  await expect(
    db.transaction((tx) => applyOutcome(tx, outcome(app.id, ack.id), new Date())),
  ).rejects.toThrow(/without recording an outcome/);
  expect(await state(app.id, ack.id)).toEqual(matchedBefore);
});

test("manual query outcome keeps confirmation and focus after cleanup navigation", async ({
  page,
}) => {
  const app = await record();
  await page.goto(`/applications/${app.id}?outcome=followup#what-happened`);
  await expect(page.locator('#what-happened input[name="outcome"]')).toHaveValue("followup");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/applications/${app.id}$`));
  await expect(page.locator('#what-happened input[name="outcome"]')).toHaveCount(0);
  await expect(
    page.getByRole("status").filter({ hasText: "Saved: Sent a follow-up." }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Sent a follow-up", exact: true })).toBeFocused();
  await page.goBack();
  await expect(page).toHaveURL(
    new RegExp(`/applications/${app.id}\\?outcome=followup#what-happened$`),
  );
  await expect(page.locator('#what-happened input[name="outcome"]')).toHaveValue("followup");
  await expect(
    page.getByRole("status").filter({ hasText: "Saved: Sent a follow-up." }),
  ).toHaveCount(0);
});
