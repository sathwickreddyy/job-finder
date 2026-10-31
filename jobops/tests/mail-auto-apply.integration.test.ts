import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, inArray, like, sql } from "drizzle-orm";
import { closeDatabase, db } from "@/db";
import {
  activityLogs,
  applicationEvents,
  applications,
  companyRecords,
  jobs,
  mailConnections,
  mailEvents,
  mailMessages,
  mailTracking,
} from "@/db/schema";
import { applyOutcome } from "@/features/applications/outcome-service";
import {
  applyMailEffect,
  autoApplyMail,
  autoOutcomeEvent,
  resetAutoEffect,
  undoAutoOutcome,
} from "@/features/mail/auto-apply";
import { loadMailContext, type MailContext } from "@/features/mail/context";
import { updateMail } from "@/features/mail/handle-service";
import { ingestPage } from "@/features/mail/ingest";
import { readMailItem } from "@/features/mail/mail-list";
import { unlinkMail } from "@/features/mail/triage-actions";
import {
  placeMailAction,
  retagMail,
  undoAutoOutcomeAction,
} from "@/features/mail/workspace-actions";
import type { ScannedMessage } from "@/services/mail/providers/types";
import { assertE2eDatabase, dbTests } from "./helpers/e2e-db";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const prefix = `mail-auto-${randomUUID()}`;
const account = `${prefix}@fixture.invalid`;
const ids = { jobs: [] as string[], companies: [] as string[], apps: [] as string[] };
const NOW = new Date("2026-11-01T10:30:00+05:30");
let counter = 0;

/** A company with one sent application, and one email placed at it. */
async function fixture(
  classification: typeof mailMessages.$inferInsert.classification = "REJECTION",
  patch: Partial<typeof mailMessages.$inferInsert> = {},
) {
  counter++;
  const name = `Auto ${counter} ${prefix}`;
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
      appliedAt: new Date("2026-10-20T05:00:00Z"),
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
      subject: `Update ${counter}`,
      receivedAt: new Date("2026-10-29T05:00:00Z"),
      classification,
      companyKey: name.toLowerCase(),
      attentionState: "DONE",
      processedAt: new Date("2026-10-31T10:00:00Z"),
      ...patch,
    })
    .returning();
  await db
    .insert(mailEvents)
    .values({ mailMessageId: mail.id, type: mail.classification, confidence: 0.9 });
  return { app, job, mail };
}
const message = async (id: string) =>
  (await db.select().from(mailMessages).where(eq(mailMessages.id, id)))[0];
const record = async (id: string) =>
  (await db.select().from(applications).where(eq(applications.id, id)))[0];
const details = async (id: string) =>
  (await db.select().from(mailEvents).where(eq(mailEvents.mailMessageId, id))).map(
    (event) => event.details,
  );
const eventsFor = (id: string) =>
  db
    .select()
    .from(applicationEvents)
    .where(sql`${applicationEvents.payload}->>'mailMessageId' = ${id}`);
const run = <T>(work: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>) =>
  db.transaction(work);

describe.skipIf(!dbTests)("auto-applying mail", () => {
  beforeAll(assertE2eDatabase);
  afterAll(async () => {
    await assertE2eDatabase();
    const mail = await db
      .select({ id: mailMessages.id })
      .from(mailMessages)
      .where(like(mailMessages.accountEmail, `${prefix}%`));
    const entities = [...mail.map((row) => row.id), ...ids.apps];
    if (entities.length)
      await db.delete(activityLogs).where(inArray(activityLogs.entityId, entities));
    await db.delete(mailTracking).where(like(mailTracking.accountEmail, `${prefix}%`));
    await db.delete(mailMessages).where(like(mailMessages.accountEmail, `${prefix}%`));
    await db.delete(mailConnections).where(like(mailConnections.email, `${prefix}%`));
    if (ids.jobs.length) {
      await db.delete(applications).where(inArray(applications.jobId, ids.jobs));
      await db.delete(jobs).where(inArray(jobs.id, ids.jobs));
    }
    if (ids.companies.length)
      await db.delete(companyRecords).where(inArray(companyRecords.id, ids.companies));
    await closeDatabase();
  });

  it("acknowledge links the email and moves Applied to Acknowledged", async () => {
    const { app, mail } = await fixture("APPLICATION_ACKNOWLEDGEMENT");
    await run((tx) =>
      applyMailEffect(tx, mail.id, { kind: "acknowledge", applicationId: app.id }, NOW),
    );
    expect((await record(app.id)).status).toBe("ACKNOWLEDGED");
    expect(await message(mail.id)).toMatchObject({
      attentionState: "DONE",
      linkedApplicationId: app.id,
    });
    expect(await details(mail.id)).toEqual([
      expect.objectContaining({ autoApplied: "acknowledge" }),
    ]);
    const [event] = await eventsFor(mail.id);
    expect(event).toMatchObject({ eventType: "ACKNOWLEDGEMENT_RECEIVED", payload: { auto: true } });
  });

  it("outcome records Rejected with auto payload and links the email", async () => {
    const { app, mail } = await fixture("REJECTION");
    await run((tx) =>
      applyMailEffect(
        tx,
        mail.id,
        { kind: "outcome", applicationId: app.id, outcome: "rejected" },
        NOW,
      ),
    );
    expect(await record(app.id)).toMatchObject({ status: "REJECTED", closedReason: "REJECTED" });
    const [event] = await eventsFor(mail.id);
    expect(event).toMatchObject({
      eventType: "REJECTION_RECEIVED",
      occurredAt: mail.receivedAt,
      payload: {
        auto: true,
        outcome: "rejected",
        previousStatus: "APPLIED",
        previousClosedReason: null,
        previousJobStatus: "APPLIED",
      },
    });
    expect(await message(mail.id)).toMatchObject({
      attentionState: "DONE",
      linkedApplicationId: app.id,
    });
    expect(await details(mail.id)).toEqual([expect.objectContaining({ autoApplied: "rejected" })]);
  });

  it("ask reopens recovered mail and suggests the application", async () => {
    const { app, mail } = await fixture("ASSESSMENT");
    await run((tx) => applyMailEffect(tx, mail.id, { kind: "ask", applicationId: app.id }, NOW));
    expect(await message(mail.id)).toMatchObject({
      attentionState: "OPEN",
      linkedApplicationId: null,
    });
    expect(await details(mail.id)).toEqual([
      expect.objectContaining({ suggestedApplicationId: app.id }),
    ]);
    expect((await record(app.id)).status).toBe("APPLIED");
  });

  it("undo restores status, closed reason and job status and keeps the email linked", async () => {
    const { app, job, mail } = await fixture("REJECTION");
    await run((tx) =>
      applyMailEffect(
        tx,
        mail.id,
        { kind: "outcome", applicationId: app.id, outcome: "rejected" },
        NOW,
      ),
    );
    expect(await run((tx) => autoOutcomeEvent(tx, mail.id))).toMatchObject({
      applicationId: app.id,
      undoable: true,
    });
    await run((tx) => undoAutoOutcome(tx, mail.id, NOW));
    expect(await record(app.id)).toMatchObject({ status: "APPLIED", closedReason: null });
    expect((await db.select().from(jobs).where(eq(jobs.id, job.id)))[0].status).toBe("APPLIED");
    expect(await eventsFor(mail.id)).toHaveLength(0);
    expect(await message(mail.id)).toMatchObject({
      attentionState: "DONE",
      linkedApplicationId: app.id,
    });
    expect(await details(mail.id)).toEqual([
      expect.objectContaining({ autoApplied: "rejected", autoUndone: true }),
    ]);
    expect(
      await db.select().from(activityLogs).where(eq(activityLogs.action, "MAIL_OUTCOME_UNDONE")),
    ).toContainEqual(expect.objectContaining({ entityId: mail.id }));
    expect(await run((tx) => autoOutcomeEvent(tx, mail.id))).toBeNull();
  });

  it("refuses undo once a newer outcome exists", async () => {
    const { app, mail } = await fixture("OFFER");
    await run((tx) =>
      applyMailEffect(
        tx,
        mail.id,
        { kind: "outcome", applicationId: app.id, outcome: "offer" },
        NOW,
      ),
    );
    expect((await record(app.id)).status).toBe("OFFER");
    await run((tx) =>
      applyOutcome(
        tx,
        {
          applicationId: app.id,
          outcome: "accepted",
          detail: { name: "", note: "", happenedAt: NOW },
        },
        NOW,
      ),
    );
    const after = (await record(app.id)).status;
    expect(await run((tx) => autoOutcomeEvent(tx, mail.id))).toMatchObject({ undoable: false });
    await expect(run((tx) => undoAutoOutcome(tx, mail.id, NOW))).rejects.toMatchObject({
      status: 409,
      message: "This outcome can no longer be undone. Correct it on the application.",
    });
    expect((await record(app.id)).status).toBe(after);
  });

  const auto = async (id: string) => {
    const context = await loadMailContext();
    return run((tx) => autoApplyMail(tx, id, context, NOW));
  };
  const retag = async (
    id: string,
    classification: typeof mailMessages.$inferInsert.classification,
  ) => {
    await run(async (tx) => {
      await resetAutoEffect(tx, id, NOW);
      await tx.update(mailMessages).set({ classification }).where(eq(mailMessages.id, id));
    });
    return auto(id);
  };

  it("autoApplyMail rejects recovered history for a single-application company", async () => {
    const { app, mail } = await fixture("REJECTION");
    expect(await auto(mail.id)).toEqual({
      kind: "outcome",
      applicationId: app.id,
      outcome: "rejected",
    });
    expect((await record(app.id)).status).toBe("REJECTED");
  });

  it("autoApplyMail keeps an assessment open with a suggestion", async () => {
    const { app, mail } = await fixture("ASSESSMENT");
    expect(await auto(mail.id)).toEqual({ kind: "ask", applicationId: app.id });
    expect((await message(mail.id)).attentionState).toBe("OPEN");
    expect((await record(app.id)).status).toBe("APPLIED");
  });

  it("does not apply an email twice", async () => {
    const { mail } = await fixture("REJECTION");
    await auto(mail.id);
    expect(await auto(mail.id)).toEqual({ kind: "none" });
    expect(await eventsFor(mail.id)).toHaveLength(1);
  });

  it("marked Just info is never auto-applied", async () => {
    const { app, mail } = await fixture("REJECTION");
    await db
      .update(mailEvents)
      .set({ details: { justInfo: true } })
      .where(eq(mailEvents.mailMessageId, mail.id));
    expect(await auto(mail.id)).toEqual({ kind: "none" });
    expect((await record(app.id)).status).toBe("APPLIED");
  });

  it("an email linked by hand is never auto-applied", async () => {
    const { app, mail } = await fixture("REJECTION", { attentionState: "OPEN" });
    await db
      .update(mailMessages)
      .set({ linkedApplicationId: app.id, attentionState: "DONE" })
      .where(eq(mailMessages.id, mail.id));
    expect(await auto(mail.id)).toEqual({ kind: "none" });
    expect((await record(app.id)).status).toBe("APPLIED");
  });

  it("never re-applies an email whose outcome was undone", async () => {
    const { app, mail } = await fixture("REJECTION");
    await auto(mail.id);
    await run((tx) => undoAutoOutcome(tx, mail.id, NOW));
    expect(await auto(mail.id)).toEqual({ kind: "none" });
    expect((await record(app.id)).status).toBe("APPLIED");
  });

  it("retagging rejection to acknowledgement undoes then acknowledges", async () => {
    const { app, mail } = await fixture("REJECTION");
    await auto(mail.id);
    expect(await retag(mail.id, "APPLICATION_ACKNOWLEDGEMENT")).toEqual({
      kind: "acknowledge",
      applicationId: app.id,
    });
    expect((await record(app.id)).status).toBe("ACKNOWLEDGED");
    const events = await eventsFor(mail.id);
    expect(events.map((event) => event.eventType)).toEqual(["ACKNOWLEDGEMENT_RECEIVED"]);
  });

  it("retagging after Undo re-runs the rule when the tag changes", async () => {
    const { app, mail } = await fixture("REJECTION");
    await auto(mail.id);
    await run((tx) => undoAutoOutcome(tx, mail.id, NOW));
    expect(await retag(mail.id, "OFFER")).toEqual({
      kind: "outcome",
      applicationId: app.id,
      outcome: "offer",
    });
    expect((await record(app.id)).status).toBe("OFFER");
  });

  it("retagging an acknowledgement as a rejection drops the automatic link", async () => {
    const { app, mail } = await fixture("APPLICATION_ACKNOWLEDGEMENT");
    await auto(mail.id);
    expect(await retag(mail.id, "REJECTION")).toMatchObject({
      kind: "outcome",
      outcome: "rejected",
    });
    expect((await record(app.id)).status).toBe("REJECTED");
    expect((await eventsFor(mail.id)).map((event) => event.eventType)).toEqual([
      "REJECTION_RECEIVED",
    ]);
  });

  it("retagging keeps an outcome that can no longer be undone", async () => {
    const { app, mail } = await fixture("OFFER");
    await auto(mail.id);
    await run((tx) =>
      applyOutcome(
        tx,
        {
          applicationId: app.id,
          outcome: "accepted",
          detail: { name: "", note: "", happenedAt: NOW },
        },
        NOW,
      ),
    );
    const status = (await record(app.id)).status;
    expect(await retag(mail.id, "REJECTION")).toEqual({ kind: "none" });
    expect((await record(app.id)).status).toBe(status);
  });

  /** Fetch new mail for one inbox whose only company is the fixture's, with its application. */
  async function fetchPage(
    found: Awaited<ReturnType<typeof fixture>>,
    messages: ScannedMessage[],
    recoveredBefore: Date | null,
  ) {
    const [connection] = await db
      .insert(mailConnections)
      .values({
        provider: "OUTLOOK",
        email: `${prefix}-inbox-${++counter}@fixture.invalid`,
        encryptedAccessToken: "unused-fixture",
      })
      .returning();
    const key = found.mail.companyKey!;
    const context: MailContext = {
      baselineAt: "2026-10-01T00:00:00Z",
      companies: [
        {
          id: key,
          name: found.job.company,
          slug: null,
          baselineAt: "2026-10-01T00:00:00Z",
          ruleSource: "test",
          rule: {
            company: found.job.company,
            aliases: [],
            domains: [`${key.replace(/[^a-z0-9]/g, "")}.invalid`],
            senders: [],
            keywords: [],
            excludedTerms: [],
          },
        },
      ],
      applications: [
        {
          id: found.app.id,
          company: key,
          role: "Backend Engineer",
          recipient: null,
          sentAt: found.app.appliedAt!.toISOString(),
        },
      ],
      outbound: [],
    };
    const run = (page: ScannedMessage[]) =>
      db.transaction((tx) =>
        ingestPage(tx, {
          connection,
          providerId: "OUTLOOK",
          messages: page,
          context,
          threads: [],
          recoveredBefore,
        }),
      );
    return { first: await run(messages), again: () => run(messages), connection };
  }
  const scanned = (
    found: Awaited<ReturnType<typeof fixture>>,
    patch: Partial<ScannedMessage>,
  ): ScannedMessage => ({
    externalId: `${prefix}-scan-${++counter}`,
    sender: `talent@${found.mail.companyKey!.replace(/[^a-z0-9]/g, "")}.invalid`,
    senderName: "Talent team",
    subject: "Update on your application",
    bodyText: "Thank you for your time. We have decided not to proceed with your application.",
    receivedAt: "2026-10-29T05:00:00Z",
    folders: ["Inbox"],
    ...patch,
  });
  const fetched = async (connection: { email: string }) =>
    (
      await db.select().from(mailMessages).where(eq(mailMessages.accountEmail, connection.email))
    )[0];

  it("fetching a rejection for a single-application company marks it Rejected", async () => {
    const found = await fixture("FOLLOW_UP");
    const { connection } = await fetchPage(
      found,
      [scanned(found, {})],
      new Date("2026-10-31T00:00:00Z"),
    );
    const mail = await fetched(connection);
    expect(mail).toMatchObject({
      classification: "REJECTION",
      attentionState: "DONE",
      linkedApplicationId: found.app.id,
    });
    expect((await record(found.app.id)).status).toBe("REJECTED");
  });

  it("fetching an assessment keeps it open with a suggestion", async () => {
    const found = await fixture("FOLLOW_UP");
    const { connection } = await fetchPage(
      found,
      [
        scanned(found, {
          subject: "Online assessment invitation",
          bodyText: "Please complete the online assessment by Friday.",
        }),
      ],
      new Date("2026-10-31T00:00:00Z"),
    );
    const mail = await fetched(connection);
    expect(mail).toMatchObject({ classification: "ASSESSMENT", attentionState: "OPEN" });
    expect(await details(mail.id)).toEqual([
      expect.objectContaining({ suggestedApplicationId: found.app.id }),
    ]);
    expect((await record(found.app.id)).status).toBe("APPLIED");
  });

  it("does not apply an email twice when its page is ingested again", async () => {
    const found = await fixture("FOLLOW_UP");
    const { connection, again } = await fetchPage(found, [scanned(found, {})], null);
    await again();
    const mail = await fetched(connection);
    expect(
      (await eventsFor(mail.id)).filter((event) => event.eventType === "REJECTION_RECEIVED"),
    ).toHaveLength(1);
  });

  it("placing an unplaced acknowledgement at the company acknowledges", async () => {
    const found = await fixture("APPLICATION_ACKNOWLEDGEMENT", {
      companyKey: null,
      attentionState: "OPEN",
    });
    const key = (await loadMailContext()).companies.find(
      (company) => company.name === found.job.company,
    )!.id;
    await updateMail(found.mail.id, { company: key });
    expect((await record(found.app.id)).status).toBe("ACKNOWLEDGED");
    expect(await message(found.mail.id)).toMatchObject({
      attentionState: "DONE",
      linkedApplicationId: found.app.id,
    });
  });

  it("retagging through updateMail undoes the old outcome and applies the new one", async () => {
    const { app, mail } = await fixture("REJECTION");
    await auto(mail.id);
    await updateMail(mail.id, { classification: "APPLICATION_ACKNOWLEDGEMENT" });
    expect((await record(app.id)).status).toBe("ACKNOWLEDGED");
    expect((await eventsFor(mail.id)).map((event) => event.eventType)).toEqual([
      "ACKNOWLEDGEMENT_RECEIVED",
    ]);
  });

  it("lists autoOutcome for an auto-applied email", async () => {
    const { app, mail } = await fixture("OFFER");
    expect((await readMailItem(mail.id)).autoOutcome).toBeNull();
    await auto(mail.id);
    expect((await readMailItem(mail.id)).autoOutcome).toEqual({ undoable: true });
    await run((tx) =>
      applyOutcome(
        tx,
        {
          applicationId: app.id,
          outcome: "accepted",
          detail: { name: "", note: "", happenedAt: NOW },
        },
        NOW,
      ),
    );
    expect((await readMailItem(mail.id)).autoOutcome).toEqual({ undoable: false });
  });

  it("Undo on the email puts the application back", async () => {
    const { app, mail } = await fixture("REJECTION");
    await auto(mail.id);
    const form = new FormData();
    form.set("id", mail.id);
    expect(await undoAutoOutcomeAction({}, form)).toEqual({
      success: "Undone. The email stays on the application as information.",
    });
    expect((await record(app.id)).status).toBe("APPLIED");
    expect(await undoAutoOutcomeAction({}, form)).toMatchObject({
      error: "This outcome can no longer be undone. Correct it on the application.",
    });
  });

  it("unlinking an auto-applied email undoes its outcome first", async () => {
    const { app, mail } = await fixture("REJECTION");
    await auto(mail.id);
    const form = new FormData();
    form.set("mailId", mail.id);
    form.set("recordId", app.id);
    await unlinkMail({}, form);
    expect(await record(app.id)).toMatchObject({ status: "APPLIED", closedReason: null });
    expect(await message(mail.id)).toMatchObject({
      attentionState: "OPEN",
      linkedApplicationId: null,
    });
    expect(await auto(mail.id)).toEqual({ kind: "none" });
  });

  it("Undo leaves the email marked as undone", async () => {
    const { mail } = await fixture("REJECTION");
    await auto(mail.id);
    await run((tx) => undoAutoOutcome(tx, mail.id, NOW));
    expect((await readMailItem(mail.id)).autoOutcome).toEqual({ undoable: false, undone: true });
  });

  it("placing an acknowledgement says it was acknowledged", async () => {
    const found = await fixture("APPLICATION_ACKNOWLEDGEMENT", {
      companyKey: null,
      attentionState: "OPEN",
    });
    const key = (await loadMailContext()).companies.find(
      (company) => company.name === found.job.company,
    )!.id;
    const form = new FormData();
    form.set("id", found.mail.id);
    form.set("company", key);
    expect(await placeMailAction({}, form)).toEqual({
      success: "Email placed and marked acknowledged.",
    });
  });

  it("retagging names the outcome it recorded", async () => {
    const { mail } = await fixture("ASSESSMENT", { attentionState: "OPEN" });
    expect(await retagMail(mail.id, "applicationRejected")).toEqual({
      success: "Tagged as Application rejected. Marked rejected.",
      previous: "ASSESSMENT",
    });
  });

  it("an older rejection does not close an application the company answered later", async () => {
    const { app, mail } = await fixture("REJECTION");
    await db.insert(applicationEvents).values({
      applicationId: app.id,
      eventType: "INTERVIEW_SCHEDULED",
      occurredAt: new Date("2026-10-30T05:00:00Z"),
      summary: "Round scheduled",
    });
    expect(await auto(mail.id)).toEqual({ kind: "ask", applicationId: app.id });
    expect((await record(app.id)).status).toBe("APPLIED");
  });
});
