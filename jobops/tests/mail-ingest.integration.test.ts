import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq, like } from "drizzle-orm";
import { closeDatabase, db } from "@/db";
import {
  applicationRounds,
  applications,
  jobs,
  mailConnections,
  mailEvents,
  mailMessages,
  mailTracking,
} from "@/db/schema";
import type { CompanyMailRule } from "@/features/mail/company-rules";
import type { MailContext } from "@/features/mail/context";
import { ingestPage } from "@/features/mail/ingest";
import type { MailConnection, ScannedMessage } from "@/services/mail/providers/types";
import { assertE2eDatabase, dbTests } from "./helpers/e2e-db";

const prefix = `mail-ingest-${randomUUID()}`;
const baseline = "2026-10-01T00:00:00Z";
const company = (id: string, name: string, rule: Partial<CompanyMailRule>) => ({
  id,
  name,
  slug: null,
  baselineAt: baseline,
  ruleSource: "test",
  rule: {
    company: name,
    aliases: [],
    domains: [],
    senders: [],
    keywords: [],
    excludedTerms: [],
    ...rule,
  },
});
const context: MailContext = {
  baselineAt: baseline,
  companies: [company("oracle", "Oracle", { domains: ["oracle.invalid"] })],
  applications: [],
  outbound: [],
};
const mail = (id: string, patch: Partial<ScannedMessage> = {}): ScannedMessage => ({
  externalId: `${prefix}-${id}`,
  sender: "oracle-hcm@oracle.invalid",
  senderName: "Oracle",
  subject: "Thank you for your application to Oracle",
  bodyText: "We will review your profile.",
  receivedAt: "2026-10-20T06:00:00Z",
  folders: ["Inbox"],
  ...patch,
});
let index = 0;
async function connection(): Promise<MailConnection> {
  const [row] = await db
    .insert(mailConnections)
    .values({
      provider: "OUTLOOK",
      email: `${prefix}-${index++}@fixture.invalid`,
      encryptedAccessToken: "unused-fixture",
    })
    .returning();
  return row;
}
const ingest = (
  own: MailConnection,
  messages: ScannedMessage[],
  options: { recoveredBefore?: Date | null; preferCompany?: string; context?: MailContext } = {},
) =>
  db.transaction((tx) =>
    ingestPage(tx, {
      connection: own,
      providerId: "OUTLOOK",
      messages,
      context: options.context ?? context,
      threads: [],
      recoveredBefore: options.recoveredBefore ?? null,
      preferCompany: options.preferCompany,
    }),
  );
const ledger = (email: string) =>
  db.select().from(mailTracking).where(eq(mailTracking.accountEmail, email));
const messages = (email: string) =>
  db.select().from(mailMessages).where(eq(mailMessages.accountEmail, email));

describe.skipIf(!dbTests)("one mail ingest path", () => {
  beforeAll(assertE2eDatabase);
  afterEach(async () => {
    await assertE2eDatabase();
    await db.delete(mailTracking).where(like(mailTracking.accountEmail, `${prefix}%`));
    await db.delete(mailMessages).where(like(mailMessages.accountEmail, `${prefix}%`));
    await db.delete(mailConnections).where(like(mailConnections.email, `${prefix}%`));
  });
  afterAll(async () => {
    await assertE2eDatabase();
    if (interviewed) {
      await db.delete(applications).where(eq(applications.id, interviewed.app));
      await db.delete(jobs).where(eq(jobs.id, interviewed.job));
    }
    await closeDatabase();
  });

  /** An Oracle application with one round on 2026-10-22, before the rejection below. */
  let interviewed: { app: string; job: string } | null = null;
  async function withRound(): Promise<MailContext> {
    if (!interviewed) {
      const [job] = await db
        .insert(jobs)
        .values({
          company: "Oracle",
          title: "Backend Engineer",
          canonicalUrl: `https://fixture.invalid/${prefix}/job`,
          dedupeKey: `${prefix}-job`,
          source: "MANUAL",
          status: "APPLIED",
        })
        .returning();
      const [app] = await db
        .insert(applications)
        .values({ jobId: job.id, source: "MANUAL", status: "APPLIED" })
        .returning();
      await db.insert(applicationRounds).values({
        applicationId: app.id,
        kind: "DSA",
        position: 1,
        outcome: "PASSED",
        scheduledAt: new Date("2026-10-22T05:00:00Z"),
      });
      interviewed = { app: app.id, job: job.id };
    }
    return {
      ...context,
      applications: [
        {
          id: interviewed.app,
          company: "oracle",
          role: "Backend Engineer",
          recipient: null,
          sentAt: null,
        },
      ],
    };
  }
  const rejection = (id: string) =>
    mail(id, {
      subject: "Update on your Oracle application",
      bodyText: "Thank you for your time. We have decided not to proceed with your application.",
      receivedAt: "2026-10-25T06:00:00Z",
    });

  it("sorts a new rejection after a recorded round as Rejected after interview", async () => {
    const own = await connection();
    const { items } = await ingest(own, [rejection("after-round")], { context: await withRound() });
    const [stored] = await messages(own.email);
    expect(stored.classification).toBe("INTERVIEW_REJECTION");
    const events = await db
      .select()
      .from(mailEvents)
      .where(eq(mailEvents.mailMessageId, stored.id));
    expect(events.map((event) => event.type)).toEqual(["INTERVIEW_REJECTION"]);
    expect(items).toEqual([expect.objectContaining({ tag: "interviewRejected" })]);
  });

  it("keeps a new rejection without rounds as Application rejected", async () => {
    const own = await connection();
    const { items } = await ingest(own, [rejection("no-round")]);
    const [stored] = await messages(own.email);
    expect(stored.classification).toBe("REJECTION");
    expect(items).toEqual([expect.objectContaining({ tag: "applicationRejected" })]);
  });

  it("re-decides an excluded identity that now matches", async () => {
    const own = await connection();
    const raw = mail("ack");
    await db.insert(mailTracking).values({
      provider: "OUTLOOK",
      accountEmail: own.email,
      providerMessageId: raw.externalId,
      sender: raw.sender,
      subject: raw.subject,
      receivedAt: new Date(raw.receivedAt),
      disposition: "excluded",
      reason: "No hiring update matched a saved company, application or outgoing contact",
    });
    const { counts, items } = await ingest(own, [raw]);
    expect(counts).toEqual({ fetched: 1, alreadyHere: 0, kept: 1, dropped: 0, newAttention: 1 });
    const [row] = await ledger(own.email);
    expect(row).toMatchObject({ disposition: "kept", companyKeys: ["oracle"] });
    const stored = await messages(own.email);
    expect(stored).toHaveLength(1);
    expect(stored[0].companyKey).toBe("oracle");
    expect(row.messageId).toBe(stored[0].id);
    expect(items).toEqual([
      expect.objectContaining({
        trackingId: row.id,
        messageId: stored[0].id,
        kept: true,
        tag: "application",
        companyKeys: ["oracle"],
      }),
    ]);
  });

  it("never reopens a kept identity", async () => {
    const own = await connection();
    await ingest(own, [mail("kept")]);
    const [first] = await messages(own.email);
    await db
      .update(mailMessages)
      .set({ attentionState: "DONE" })
      .where(eq(mailMessages.id, first.id));
    const { counts, items } = await ingest(own, [mail("kept", { folders: ["Archive"] })]);
    expect(counts).toEqual({ fetched: 1, alreadyHere: 1, kept: 0, dropped: 0, newAttention: 0 });
    expect(items).toEqual([]);
    const stored = await messages(own.email);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ attentionState: "DONE", folders: ["Archive"] });
  });

  it("recovered mail before the previous last fetch enters handled", async () => {
    const own = await connection();
    const { counts } = await ingest(own, [mail("old")], {
      recoveredBefore: new Date("2026-10-30T00:00:00Z"),
    });
    expect(counts.newAttention).toBe(0);
    expect(counts.kept).toBe(1);
    const [stored] = await messages(own.email);
    expect(stored.attentionState).toBe("DONE");
    expect(stored.processedAt).not.toBeNull();
  });

  it("mail after the previous last fetch starts open", async () => {
    const own = await connection();
    const { counts } = await ingest(own, [mail("new")], {
      recoveredBefore: new Date("2026-10-19T00:00:00Z"),
    });
    expect(counts.newAttention).toBe(1);
    const [stored] = await messages(own.email);
    expect(stored.attentionState).toBe("OPEN");
  });

  it("stores the company key and reason on still-excluded rows", async () => {
    const own = await connection();
    const meetup = mail("meetup", {
      sender: "events@example.invalid",
      senderName: "Events",
      subject: "Oracle meetup this Friday",
      bodyText: "Join us",
    });
    await db.insert(mailTracking).values({
      provider: "OUTLOOK",
      accountEmail: own.email,
      providerMessageId: meetup.externalId,
      sender: meetup.sender,
      subject: meetup.subject,
      receivedAt: new Date(meetup.receivedAt),
      disposition: "excluded",
      reason: "No hiring update matched a saved company, application or outgoing contact",
    });
    const { counts, items } = await ingest(own, [meetup]);
    expect(counts).toEqual({ fetched: 1, alreadyHere: 1, kept: 0, dropped: 0, newAttention: 0 });
    expect(items).toEqual([]);
    const [row] = await ledger(own.email);
    expect(row.disposition).toBe("excluded");
    expect(row.reason).toBe("Matched Oracle by company name in subject; no job event recognised");
    expect(row.companyKeys).toEqual(["oracle"]);
    expect(await messages(own.email)).toHaveLength(0);
  });

  it("drops new mail with its reason and lists it", async () => {
    const own = await connection();
    const { counts, items } = await ingest(own, [
      mail("promo", { sender: "news@example.invalid", subject: "Weekend reading", bodyText: "" }),
    ]);
    expect(counts).toEqual({ fetched: 1, alreadyHere: 0, kept: 0, dropped: 1, newAttention: 0 });
    expect(items).toEqual([
      expect.objectContaining({ kept: false, tag: null, messageId: null, companyKeys: [] }),
    ]);
  });

  it("settles an ambiguous match for the company being searched", async () => {
    const own = await connection();
    const shared = {
      ...context,
      companies: [
        company("oracle", "Oracle", { senders: ["talent@ats.invalid"] }),
        company("weave", "Weave", { senders: ["talent@ats.invalid"] }),
      ],
    };
    const raw = mail("ambiguous", {
      sender: "talent@ats.invalid",
      subject: "Thank you for your application",
    });
    const plain = await ingest(own, [raw], { context: shared });
    expect(plain.counts.dropped).toBe(1);
    await db.delete(mailTracking).where(eq(mailTracking.accountEmail, own.email));
    const preferred = await ingest(own, [raw], { context: shared, preferCompany: "weave" });
    expect(preferred.counts.kept).toBe(1);
    const [stored] = await messages(own.email);
    expect(stored.companyKey).toBe("weave");
  });

  it("remembers on the ledger whether dropped mail was recovered history", async () => {
    const own = await connection();
    const promo = (id: string) =>
      mail(id, { sender: "news@example.invalid", subject: "Weekend reading", bodyText: "" });
    await ingest(own, [promo("old-drop")], { recoveredBefore: new Date("2026-10-30T00:00:00Z") });
    await ingest(own, [promo("new-drop")], { recoveredBefore: new Date("2026-10-19T00:00:00Z") });
    const rows = await ledger(own.email);
    const of = (id: string) => rows.find((row) => row.providerMessageId === `${prefix}-${id}`);
    expect(of("old-drop")?.recovered).toBe(true);
    expect(of("new-drop")?.recovered).toBe(false);
  });
});
