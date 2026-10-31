import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, inArray, like } from "drizzle-orm";
import { closeDatabase, db } from "@/db";
import { companyRecords, mailConnections, mailMessages, mailTracking, settings } from "@/db/schema";
import { normalizeCompany } from "@/features/applications/lanes";
import { companySearchStep, readCompanySearch } from "@/features/mail/company-search";
import { ruleKey } from "@/features/mail/context";
import { includeMail } from "@/features/mail/include";
import { outlook } from "@/services/mail/providers/outlook";
import { outlookSearchQuery } from "@/services/mail/providers/search-query";
import type { MailConnection, ScannedMessage } from "@/services/mail/providers/types";
import { assertE2eDatabase, dbTests } from "./helpers/e2e-db";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const prefix = `company-search-${randomUUID()}`;
const domain = `n${randomUUID().slice(0, 8)}.invalid`;
const name = `Northstar ${prefix.slice(-8)}`;
const key = normalizeCompany(name);
const companies: string[] = [];
const recent = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
const mail = (id: string, patch: Partial<ScannedMessage> = {}): ScannedMessage => ({
  externalId: `${prefix}-${id}`,
  internetMessageId: `<${prefix}-${id}@fixture.invalid>`,
  sender: `talent@${domain}`,
  senderName: `${name} Talent`,
  subject: "Interview invitation",
  bodyText: "Please share your interview availability",
  receivedAt: recent(5),
  folders: ["Inbox"],
  ...patch,
});
const promo = (id: string) =>
  mail(id, { sender: "news@elsewhere.invalid", senderName: "News", subject: "Weekend sale" });
let index = 0;
async function connection(): Promise<MailConnection> {
  const [row] = await db
    .insert(mailConnections)
    .values({
      provider: "OUTLOOK",
      email: `${prefix}-${index++}@fixture.invalid`,
      encryptedAccessToken: "unused-fixture",
      lastSyncedAt: new Date(Date.now() - 3_600_000),
    })
    .returning();
  return row;
}
const storedMail = (email: string) =>
  db.select().from(mailMessages).where(eq(mailMessages.accountEmail, email));
const savedRule = async () =>
  (
    await db
      .select()
      .from(settings)
      .where(eq(settings.key, ruleKey(key)))
  )[0]?.value.rule;
async function dropped(own: MailConnection, raw: ScannedMessage) {
  const [row] = await db
    .insert(mailTracking)
    .values({
      provider: "OUTLOOK",
      accountEmail: own.email,
      providerMessageId: raw.externalId,
      sender: raw.sender,
      senderName: raw.senderName ?? "",
      subject: raw.subject,
      receivedAt: new Date(raw.receivedAt),
      disposition: "excluded",
      reason: "No hiring update matched a saved company, application or outgoing contact",
    })
    .returning();
  return row;
}

describe.skipIf(!dbTests)("company inbox search", () => {
  beforeAll(async () => {
    await assertE2eDatabase();
    const [company] = await db.insert(companyRecords).values({ slug: prefix, name }).returning();
    companies.push(company.id);
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await assertE2eDatabase();
    await db
      .insert(settings)
      .values({
        key: ruleKey(key),
        value: {
          rule: { aliases: [], domains: [domain], senders: [], keywords: [], excludedTerms: [] },
        },
      })
      .onConflictDoUpdate({
        target: settings.key,
        set: {
          value: {
            rule: { aliases: [], domains: [domain], senders: [], keywords: [], excludedTerms: [] },
          },
        },
      });
    await db.delete(settings).where(like(settings.key, `companySearch%${key}%`));
    await db.delete(mailTracking).where(like(mailTracking.accountEmail, `${prefix}%`));
    await db.delete(mailMessages).where(like(mailMessages.accountEmail, `${prefix}%`));
    await db.delete(mailConnections).where(like(mailConnections.email, `${prefix}%`));
  });
  afterAll(async () => {
    await assertE2eDatabase();
    await db.delete(settings).where(eq(settings.key, ruleKey(key)));
    if (companies.length)
      await db.delete(companyRecords).where(inArray(companyRecords.id, companies));
    await closeDatabase();
  });

  it("stores kept mail for the company and ledger rows for all", async () => {
    await db
      .insert(settings)
      .values({
        key: ruleKey(key),
        value: {
          rule: { aliases: [], domains: [domain], senders: [], keywords: [], excludedTerms: [] },
        },
      })
      .onConflictDoNothing();
    const own = await connection();
    vi.spyOn(outlook, "folders").mockResolvedValue([]);
    const search = vi.spyOn(outlook, "searchMail").mockImplementation(async (_row, request) => ({
      messages: [mail("kept"), promo("promo")],
      query: outlookSearchQuery(request),
    }));
    const { more, run, lanes } = await companySearchStep(key, {
      lastDays: 30,
      accounts: [own.email],
    });
    expect(more).toBe(false);
    expect(lanes).toHaveLength(1);
    expect(lanes[0]).toMatchObject({ account: own.email, state: "done", error: null });
    expect(lanes[0].counts).toEqual({
      fetched: 2,
      alreadyHere: 0,
      kept: 1,
      dropped: 1,
      newAttention: 0,
    });
    expect(lanes[0].query).toContain(`from:\\"${domain}\\"`);
    const request = search.mock.calls[0][1];
    expect(request.identity).toEqual({
      names: [name],
      keywords: [],
      senders: [],
      domains: [domain],
    });
    expect(Date.parse(request.since!)).toBeLessThanOrEqual(Date.now() - 30 * 86_400_000 + 5_000);
    const rows = await storedMail(own.email);
    expect(rows).toHaveLength(1);
    expect(rows[0].companyKey).toBe(key);
    const ledger = await db
      .select()
      .from(mailTracking)
      .where(eq(mailTracking.accountEmail, own.email));
    expect(ledger.map((row) => row.disposition).sort()).toEqual(["excluded", "kept"]);
    expect(run).toMatchObject({ key, accounts: [own.email], counts: { kept: 1, dropped: 1 } });
    expect(run.finishedAt).not.toBeNull();
    const read = await readCompanySearch(key);
    expect(read.lastRun?.counts.kept).toBe(1);
    expect(read.ruleHits).toEqual({ addresses: 0, domains: 1, keywords: 0, never: 0 });
    expect(read.inboxes).toEqual([{ account: own.email, provider: "OUTLOOK" }]);
    expect(read.queries[own.email]).toContain(`from:\\"${domain}\\"`);
    expect(read.dropped.map((item) => item.subject)).toEqual(["Weekend sale"]);
  });

  it("one failed inbox does not stop the others", async () => {
    const a = await connection();
    const b = await connection();
    vi.spyOn(outlook, "folders").mockResolvedValue([]);
    vi.spyOn(outlook, "searchMail").mockImplementation(async (row, request) => {
      if (row.id === a.id) throw new Error("Sign-in expired");
      return { messages: [mail("b-kept")], query: outlookSearchQuery(request) };
    });
    const { more, lanes } = await companySearchStep(key, { lastDays: 30 });
    const byAccount = Object.fromEntries(lanes.map((lane) => [lane.account, lane]));
    expect(byAccount[a.email]).toMatchObject({ state: "failed", error: "Sign-in expired" });
    expect(byAccount[b.email]).toMatchObject({ state: "done", error: null });
    expect(byAccount[b.email].counts.kept).toBe(1);
    expect(more).toBe(false);
  });

  it("continues a run one page per inbox until every inbox is done", async () => {
    const own = await connection();
    vi.spyOn(outlook, "folders").mockResolvedValue([]);
    vi.spyOn(outlook, "searchMail")
      .mockResolvedValueOnce({ messages: [mail("p1")], next: "page-2", query: "q" })
      .mockResolvedValueOnce({ messages: [mail("p2")], query: "q" });
    const first = await companySearchStep(key, { lastDays: 30, accounts: [own.email] });
    expect(first.more).toBe(true);
    expect(first.lanes[0].state).toBe("searching");
    expect(first.run.finishedAt).toBeNull();
    const second = await companySearchStep(key, {});
    expect(second.more).toBe(false);
    expect(second.run.counts.kept).toBe(2);
    expect(second.run.since).toBe(first.run.since);
  });

  it("a second press continues an unfinished search", async () => {
    const own = await connection();
    vi.spyOn(outlook, "folders").mockResolvedValue([]);
    let page = 0;
    const search = vi.spyOn(outlook, "searchMail").mockImplementation(async () => ({
      messages: [],
      next: `p${++page}`,
      query: "q",
    }));
    const first = await companySearchStep(key, { lastDays: 30, accounts: [own.email] });
    const second = await companySearchStep(key, { lastDays: 30, accounts: [own.email] });
    expect(second.run.startedAt).toBe(first.run.startedAt);
    expect(search.mock.calls[1][1]).toMatchObject({ next: "p1", since: first.run.since });
  });

  it("an inbox that failed is searched from its own coverage next time", async () => {
    const a = await connection();
    const b = await connection();
    vi.spyOn(outlook, "folders").mockResolvedValue([]);
    const search = vi.spyOn(outlook, "searchMail").mockImplementation(async (row, request) => {
      if (row.id === a.id) throw new Error("Sign-in expired");
      return { messages: [], query: outlookSearchQuery(request) };
    });
    await companySearchStep(key, { lastDays: 30 });
    search.mockImplementation(async (_row, request) => ({
      messages: [],
      query: outlookSearchQuery(request),
    }));
    const again = await companySearchStep(key, {});
    // a never finished the 30-day window, so the next search reaches the 90-day default for it.
    expect(Date.parse(again.run.since)).toBeLessThanOrEqual(Date.now() - 89 * 86_400_000);
  });

  it("a repeated search changes nothing", async () => {
    const own = await connection();
    vi.spyOn(outlook, "folders").mockResolvedValue([]);
    vi.spyOn(outlook, "searchMail").mockImplementation(async (_row, request) => ({
      messages: [mail("again"), promo("again-promo")],
      query: outlookSearchQuery(request),
    }));
    await companySearchStep(key, { lastDays: 30, accounts: [own.email] });
    const before = await storedMail(own.email);
    const { lanes } = await companySearchStep(key, { lastDays: 30, accounts: [own.email] });
    expect(lanes[0].counts).toEqual({
      fetched: 2,
      alreadyHere: 2,
      kept: 0,
      dropped: 0,
      newAttention: 0,
    });
    expect(lanes[0].items).toEqual([]);
    const after = await storedMail(own.email);
    expect(after.map((row) => [row.id, row.attentionState])).toEqual(
      before.map((row) => [row.id, row.attentionState]),
    );
  });

  it("recovered mail from before the last fetch arrives handled", async () => {
    const own = await connection();
    vi.spyOn(outlook, "folders").mockResolvedValue([]);
    vi.spyOn(outlook, "searchMail").mockResolvedValue({
      messages: [mail("old", { receivedAt: recent(60) })],
      query: "q",
    });
    const { lanes } = await companySearchStep(key, { lastDays: 90, accounts: [own.email] });
    expect(lanes[0].counts).toMatchObject({ kept: 1, newAttention: 0 });
    expect((await storedMail(own.email))[0].attentionState).toBe("DONE");
  });

  it("include adds a company sender", async () => {
    const own = await connection();
    const raw = mail("include", {
      sender: "eng-hiring@northstar-careers.invalid",
      senderName: "Eng Hiring",
      subject: "Quick chat",
      bodyText: "Are you free Tuesday?",
    });
    const row = await dropped(own, raw);
    vi.spyOn(outlook, "folders").mockResolvedValue([]);
    vi.spyOn(outlook, "fetchMessage").mockResolvedValue(raw);
    const result = await includeMail(row.id, key);
    expect(result).toMatchObject({
      addedSender: "eng-hiring@northstar-careers.invalid",
      skippedShared: null,
      suggestedKeyword: null,
    });
    expect(result.item.company?.key).toBe(key);
    expect(((await savedRule()) as { senders: string[] }).senders).toEqual([
      "eng-hiring@northstar-careers.invalid",
    ]);
    const [ledger] = await db.select().from(mailTracking).where(eq(mailTracking.id, row.id));
    expect(ledger).toMatchObject({
      disposition: "kept",
      messageId: result.item.id,
      companyKeys: [key],
    });
  });

  it("does not add a shared sender", async () => {
    const own = await connection();
    const raw = mail("shared", {
      sender: "meera.k@gmail.com",
      senderName: "Meera K",
      subject: "Following up",
      bodyText: "Hi again",
    });
    const row = await dropped(own, raw);
    vi.spyOn(outlook, "folders").mockResolvedValue([]);
    vi.spyOn(outlook, "fetchMessage").mockResolvedValue(raw);
    const before = await savedRule();
    const result = await includeMail(row.id, key);
    expect(result).toMatchObject({
      addedSender: null,
      skippedShared: "meera.k@gmail.com",
      suggestedKeyword: "Meera K",
    });
    expect(await savedRule()).toEqual(before);
    expect((await storedMail(own.email))[0].companyKey).toBe(key);
  });

  it("include keeps rescued new mail open and recovered history handled", async () => {
    const own = await connection();
    await db
      .update(mailConnections)
      .set({ lastSyncedAt: new Date() })
      .where(eq(mailConnections.id, own.id));
    const fresh = mail("rescued", { receivedAt: recent(0.125), subject: "Interview invitation" });
    const old = mail("history", { receivedAt: recent(40), subject: "Interview invitation" });
    const freshRow = await dropped(own, fresh);
    const oldRow = await dropped(own, old);
    await db.update(mailTracking).set({ recovered: true }).where(eq(mailTracking.id, oldRow.id));
    vi.spyOn(outlook, "folders").mockResolvedValue([]);
    vi.spyOn(outlook, "fetchMessage").mockImplementation(async (_row, id) =>
      id === fresh.externalId ? fresh : old,
    );
    expect((await includeMail(freshRow.id, key)).item.attention).toBe("open");
    expect((await includeMail(oldRow.id, key)).item.attention).toBe("handled");
  });

  it("include refuses an already kept identity with 409", async () => {
    const own = await connection();
    const [row] = await db
      .insert(mailTracking)
      .values({
        provider: "OUTLOOK",
        accountEmail: own.email,
        providerMessageId: `${prefix}-kept-already`,
        sender: "talent@x.invalid",
        subject: "Kept",
        receivedAt: new Date(),
        disposition: "kept",
      })
      .returning();
    await expect(includeMail(row.id, key)).rejects.toMatchObject({ status: 409 });
  });

  it("include returns 404 when the mailbox no longer has the email", async () => {
    const own = await connection();
    const row = await dropped(own, mail("gone"));
    vi.spyOn(outlook, "folders").mockResolvedValue([]);
    vi.spyOn(outlook, "fetchMessage").mockResolvedValue(null);
    await expect(includeMail(row.id, key)).rejects.toMatchObject({ status: 404 });
  });

  it("rejects 3651 days", async () => {
    await expect(companySearchStep(key, { lastDays: 3651 })).rejects.toMatchObject({ status: 400 });
    await expect(companySearchStep("no such company", {})).rejects.toMatchObject({ status: 404 });
  });
});
