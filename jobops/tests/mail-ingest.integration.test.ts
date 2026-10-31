import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq, like } from "drizzle-orm";
import { closeDatabase, db } from "@/db";
import { mailConnections, mailMessages, mailTracking } from "@/db/schema";
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
  afterAll(closeDatabase);

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
});
