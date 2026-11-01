import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, inArray, like } from "drizzle-orm";
import { closeDatabase, db } from "@/db";
import { mailConnections, mailMessages, mailTracking, settings } from "@/db/schema";
import { outlook } from "@/services/mail/providers/outlook";
import { checkConnection, checkKey, checkMailStep } from "@/features/mail/check-service";
import type { MailContext } from "@/features/mail/context";
import type { ScannedMessage } from "@/services/mail/providers/types";
import { assertE2eDatabase, dbTests } from "./helpers/e2e-db";

const prefix = `mail-check-${randomUUID()}`;
const baseline = "2026-10-29T00:00:00Z";
const rule = {
  company: "Fixture",
  aliases: [],
  domains: ["fixture.invalid"],
  senders: [],
  keywords: [],
  excludedTerms: [],
};
const context: MailContext = {
  baselineAt: baseline,
  companies: [
    { id: "fixture", name: "Fixture", slug: null, baselineAt: baseline, ruleSource: "test", rule },
  ],
  applications: [],
  outbound: [],
};
const mail = (id: string, patch: Partial<ScannedMessage> = {}): ScannedMessage => ({
  externalId: id,
  internetMessageId: "<shared@fixture.invalid>",
  sender: "talent@fixture.invalid",
  subject: "Interview invitation",
  bodyText: "Please share your interview availability",
  receivedAt: "2026-10-30T00:00:00Z",
  folders: ["Inbox"],
  ...patch,
});
// Kept without any company context: an explicit update about the user's own application.
const update = (id: string): ScannedMessage =>
  mail(id, {
    sender: "careers@untracked.invalid",
    subject: "We received your application",
    bodyText: "Thank you for applying to the Software Engineer role.",
  });
let index = 0;
async function connection() {
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
const ledger = (email: string) =>
  db.select().from(mailTracking).where(eq(mailTracking.accountEmail, email));
const messages = (email: string) =>
  db.select().from(mailMessages).where(eq(mailMessages.accountEmail, email));
const current = async (id: string) =>
  (await db.select().from(mailConnections).where(eq(mailConnections.id, id)))[0];

describe.skipIf(!dbTests)("on-demand mail check", () => {
  beforeAll(async () => {
    await assertE2eDatabase();
    if ((await db.select({ id: mailConnections.id }).from(mailConnections)).length)
      throw new Error("Check fixtures need jobops_e2e without other inbox connections.");
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await assertE2eDatabase();
    const owned = await db
      .select({ id: mailConnections.id })
      .from(mailConnections)
      .where(like(mailConnections.email, `${prefix}%`));
    for (const { id } of owned) await db.delete(settings).where(like(settings.key, `%${id}%`));
    await db.delete(mailTracking).where(like(mailTracking.accountEmail, `${prefix}%`));
    await db.delete(mailMessages).where(like(mailMessages.accountEmail, `${prefix}%`));
    await db.delete(mailConnections).where(like(mailConnections.email, `${prefix}%`));
  });
  afterAll(closeDatabase);

  it("imports Junk and Deleted Items mail as open records", async () => {
    const own = await connection();
    vi.spyOn(outlook, "folders").mockResolvedValue([
      { id: "junk", name: "Junk" },
      { id: "deleted", name: "Deleted Items" },
    ]);
    vi.spyOn(outlook, "scanMail").mockResolvedValue({
      messages: [
        mail("junk", { folders: ["Junk"], internetMessageId: "<junk@fixture.invalid>" }),
        mail("trash", { folders: ["Deleted Items"], internetMessageId: "<trash@fixture.invalid>" }),
      ],
    });
    const result = await checkConnection(own, context);
    expect(result).toMatchObject({ status: "done", newAttention: 2, error: null });
    const rows = await messages(own.email);
    expect(rows.map((row) => row.attentionState)).toEqual(["OPEN", "OPEN"]);
    expect(rows.map((row) => row.folders).sort()).toEqual([["Deleted Items"], ["Junk"]]);
    expect(rows.every((row) => row.companyKey === "fixture")).toBe(true);
  });

  it("keeps the overlap hour open and recovered history handled", async () => {
    const own = await connection();
    const lastSyncedAt = new Date("2026-10-30T12:00:00Z");
    await db.update(mailConnections).set({ lastSyncedAt }).where(eq(mailConnections.id, own.id));
    vi.spyOn(outlook, "folders").mockResolvedValue([]);
    vi.spyOn(outlook, "scanMail").mockResolvedValue({
      messages: [
        mail("late-indexed", {
          internetMessageId: "<late@fixture.invalid>",
          receivedAt: "2026-10-30T11:30:00Z",
        }),
        mail("recovered", {
          internetMessageId: "<recovered@fixture.invalid>",
          receivedAt: "2026-10-27T09:00:00Z",
        }),
      ],
    });
    const result = await checkConnection(await current(own.id), context);
    expect(result.newAttention).toBe(1);
    const rows = await messages(own.email);
    const state = (time: string) =>
      rows.find((row) => row.receivedAt.toISOString().startsWith(time))?.attentionState;
    expect(state("2026-10-30T11:30")).toBe("OPEN");
    expect(state("2026-10-27T09:00")).toBe("DONE");
  });

  it("keeps one identity across a rescan and folder move", async () => {
    const own = await connection();
    vi.spyOn(outlook, "folders").mockResolvedValue([]);
    const scan = vi.spyOn(outlook, "scanMail").mockResolvedValue({
      messages: [mail("stable", { folders: ["Junk"] })],
    });
    expect((await checkConnection(own, context)).newAttention).toBe(1);
    scan.mockResolvedValue({ messages: [mail("stable", { folders: ["Inbox"] })] });
    expect((await checkConnection(own, context)).newAttention).toBe(0);
    const rows = await ledger(own.email);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ folders: ["Inbox"], disposition: "kept" });
    const [message] = await messages(own.email);
    expect(message.folders).toEqual(["Inbox"]);
    expect(await messages(own.email)).toHaveLength(1);
  });

  it("counts a repeated identity once within a page", async () => {
    const own = await connection();
    vi.spyOn(outlook, "folders").mockResolvedValue([]);
    vi.spyOn(outlook, "scanMail").mockResolvedValue({
      messages: [mail("repeated"), mail("repeated")],
    });
    expect((await checkConnection(own, context)).newAttention).toBe(1);
    expect(await ledger(own.email)).toHaveLength(1);
  });

  it("does not collapse one Internet Message-ID across two accounts", async () => {
    const first = await connection(),
      second = await connection();
    vi.spyOn(outlook, "folders").mockResolvedValue([]);
    vi.spyOn(outlook, "scanMail").mockResolvedValue({ messages: [mail("same-provider-id")] });
    expect((await checkConnection(first, context)).newAttention).toBe(1);
    // The second inbox keeps its own copy, settled as a copy of the first.
    expect((await checkConnection(second, context)).newAttention).toBe(0);
    const [a] = await ledger(first.email);
    const [b] = await ledger(second.email);
    expect(a.messageId).not.toBe(b.messageId);
    const [copy] = await messages(second.email);
    expect(copy.attentionState).toBe("DONE");
  });

  it("never imports excluded or context-only mail, even after a rule change", async () => {
    const own = await connection();
    const digest = mail("digest", {
      internetMessageId: "<digest@fixture.invalid>",
      sender: "messages-noreply@linkedin.com",
      senderName: "LinkedIn",
      subject: "You have a message",
      bodyText: "People you may know: Priya Sharma",
    });
    const sent = mail("sent", { contextOnly: true, internetMessageId: "<sent@fixture.invalid>" });
    vi.spyOn(outlook, "folders").mockResolvedValue([]);
    vi.spyOn(outlook, "scanMail").mockResolvedValue({ messages: [digest, sent] });
    expect((await checkConnection(own, context)).newAttention).toBe(0);
    let rows = await ledger(own.email);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      providerMessageId: "digest",
      disposition: "excluded",
      messageId: null,
    });
    const widened: MailContext = {
      ...context,
      companies: [
        {
          ...context.companies[0],
          rule: { ...rule, domains: ["fixture.invalid", "linkedin.com"] },
        },
      ],
    };
    expect((await checkConnection(own, widened)).newAttention).toBe(0);
    rows = await ledger(own.email);
    expect(rows).toHaveLength(1);
    expect(rows[0].disposition).toBe("excluded");
    expect(await messages(own.email)).toHaveLength(0);
  });

  it("isolates a failing account", async () => {
    const a = await connection(),
      b = await connection();
    vi.spyOn(outlook, "folders").mockResolvedValue([]);
    vi.spyOn(outlook, "scanMail").mockImplementation(async (row) => {
      if (row.id === a.id) throw new Error("token expired");
      return { messages: [update(`${row.email}-update`)] };
    });
    const result = await checkMailStep();
    const byAccount = Object.fromEntries(result.accounts.map((row) => [row.account, row]));
    expect(byAccount[a.email]).toMatchObject({ status: "failed", lastFetchedAt: null });
    expect(byAccount[a.email].error).toBeTruthy();
    expect(byAccount[b.email]).toMatchObject({ status: "done", error: null });
    expect(result).toMatchObject({ more: false, newAttention: 1 });
    expect((await current(a.id)).lastError).toBeTruthy();
    expect((await current(a.id)).lastSyncedAt).toBeNull();
    expect((await current(b.id)).lastSyncedAt).not.toBeNull();
  });

  it("advances last fetch only when the window completes", async () => {
    const own = await connection();
    vi.spyOn(outlook, "folders").mockResolvedValue([]);
    vi.spyOn(outlook, "scanMail")
      .mockResolvedValueOnce({ messages: [mail("page-1")], next: "page-2" })
      .mockResolvedValueOnce({ messages: [mail("page-2", { internetMessageId: "<p2@x>" })] });
    expect(await checkConnection(own, context)).toMatchObject({ status: "more" });
    expect((await current(own.id)).lastSyncedAt).toBeNull();
    const [saved] = await db
      .select()
      .from(settings)
      .where(eq(settings.key, checkKey(own.id)));
    const second = await checkConnection(own, context);
    expect(second.status).toBe("done");
    expect((await current(own.id)).lastSyncedAt?.toISOString()).toBe(saved.value.until);
    expect(second.lastFetchedAt).toBe(saved.value.until);
    expect((await current(own.id)).lastError).toBeNull();
  });

  it("resumes an incomplete check after a rule edit", async () => {
    const own = await connection();
    vi.spyOn(outlook, "folders").mockResolvedValue([]);
    const scan = vi
      .spyOn(outlook, "scanMail")
      .mockResolvedValueOnce({ messages: [mail("resume-1")], next: "resume-2" })
      .mockResolvedValueOnce({
        messages: [mail("resume-1"), mail("resume-2", { internetMessageId: "<r2@x>" })],
      });
    await checkConnection(own, context);
    const edited: MailContext = {
      ...context,
      companies: [{ ...context.companies[0], rule: { ...rule, excludedTerms: ["newsletter"] } }],
    };
    expect((await checkConnection(own, edited)).newAttention).toBe(1);
    const [first, second] = scan.mock.calls.map((call) => call[1]);
    expect(second).toMatchObject({ since: first.since, until: first.until, next: "resume-2" });
    expect(await messages(own.email)).toHaveLength(2);
    expect(await ledger(own.email)).toHaveLength(2);
  });

  it("does not let a failed incomplete account hold back the others", async () => {
    const a = await connection(),
      b = await connection();
    vi.spyOn(outlook, "folders").mockResolvedValue([]);
    const scan = vi.spyOn(outlook, "scanMail").mockImplementation(async (row) => {
      if (row.id === a.id) return { messages: [], next: "a-2" };
      return { messages: [] };
    });
    await checkMailStep();
    scan.mockImplementation(async (row) => {
      if (row.id === a.id) throw new Error("Provider unavailable");
      return { messages: [] };
    });
    // The resumed inbox fails: the check is not over until every inbox has been checked.
    const resumed = await checkMailStep();
    expect(resumed.more).toBe(true);
    expect(resumed.accounts.find((row) => row.account === b.email)?.status).toBe("more");
    const calls = scan.mock.calls.length;
    const last = await checkMailStep();
    const stepped = scan.mock.calls.slice(calls).map((call) => call[0].id);
    expect(stepped.sort()).toEqual([a.id, b.id].sort());
    expect(last.more).toBe(false);
  });

  it("follows a resumed window with fresh windows for every inbox", async () => {
    const a = await connection(),
      b = await connection();
    vi.spyOn(outlook, "folders").mockResolvedValue([]);
    let first = true;
    const scan = vi.spyOn(outlook, "scanMail").mockImplementation(async (row) => {
      if (row.id === a.id && first) {
        first = false;
        return { messages: [], next: "a-2" };
      }
      return { messages: [] };
    });
    await checkMailStep();
    const resumed = await checkMailStep();
    expect(resumed.more).toBe(true);
    const calls = scan.mock.calls.length;
    const fresh = await checkMailStep();
    expect(
      scan.mock.calls
        .slice(calls)
        .map((call) => call[0].id)
        .sort(),
    ).toEqual([a.id, b.id].sort());
    expect(fresh.more).toBe(false);
  });

  it("rejects 181 days", async () => {
    await expect(checkMailStep({ lastDays: 181 })).rejects.toMatchObject({
      status: 400,
      message: "Fetch goes back up to 180 days. For older mail, search a company from its page.",
    });
    await expect(checkMailStep({ lastDays: 0 })).rejects.toMatchObject({ status: 400 });
  });

  it("reports per-account counts", async () => {
    const own = await connection();
    vi.spyOn(outlook, "folders").mockResolvedValue([]);
    vi.spyOn(outlook, "scanMail").mockResolvedValue({
      messages: [
        update(`${own.email}-kept`),
        mail("digest", {
          internetMessageId: "<counts-digest@fixture.invalid>",
          sender: "messages-noreply@linkedin.com",
          subject: "You have 10+ new invitations",
        }),
      ],
    });
    const result = await checkMailStep();
    const [account] = result.accounts;
    expect(account.counts).toEqual({
      fetched: 2,
      alreadyHere: 0,
      kept: 1,
      dropped: 1,
      newAttention: 1,
    });
    expect(Number.isFinite(Date.parse(account.since ?? ""))).toBe(true);
  });

  it("moves the last fetch to the window end when complete", async () => {
    const own = await connection();
    const lastSyncedAt = new Date(Date.now() - 2 * 3_600_000);
    await db.update(mailConnections).set({ lastSyncedAt }).where(eq(mailConnections.id, own.id));
    await db.insert(settings).values({
      key: checkKey(own.id),
      value: {
        since: new Date(lastSyncedAt.getTime() - 86_400_000).toISOString(),
        until: lastSyncedAt.toISOString(),
        complete: true,
        scanned: 0,
        folders: [],
        checkedAt: lastSyncedAt.toISOString(),
      },
    });
    vi.spyOn(outlook, "folders").mockResolvedValue([]);
    const old = update(`${own.email}-old`);
    const scan = vi.spyOn(outlook, "scanMail").mockResolvedValue({
      messages: [{ ...old, receivedAt: new Date(Date.now() - 20 * 86_400_000).toISOString() }],
    });
    const before = Date.now();
    const result = await checkMailStep({ lastDays: 30 });
    const request = scan.mock.calls[0][1];
    expect(Date.parse(request.since!)).toBeLessThanOrEqual(before - 30 * 86_400_000 + 1000);
    expect(result.accounts[0]).toMatchObject({ status: "done", since: request.since });
    expect((await current(own.id)).lastSyncedAt?.toISOString()).toBe(request.until);
    // Mail from before the last fetch arrives handled, so it never floods Needs you.
    expect(result.newAttention).toBe(0);
    expect((await messages(own.email))[0].attentionState).toBe("DONE");
  });

  it("a second Last N days press continues the window instead of starting over", async () => {
    const own = await connection();
    vi.spyOn(outlook, "folders").mockResolvedValue([]);
    let page = 0;
    const scan = vi.spyOn(outlook, "scanMail").mockImplementation(async () => ({
      messages: [],
      next: `page-${++page}`,
    }));
    await checkMailStep({ lastDays: 30 });
    await checkMailStep({ lastDays: 30 });
    const [first, second] = scan.mock.calls.map((call) => call[1]);
    expect(second).toMatchObject({ since: first.since, until: first.until, next: "page-1" });
    expect(own.id).toBeTruthy();
  });

  it("the first Last N days fetch on a new inbox arrives handled", async () => {
    const own = await connection();
    vi.spyOn(outlook, "folders").mockResolvedValue([]);
    const old = update(`${own.email}-first`);
    vi.spyOn(outlook, "scanMail").mockResolvedValue({
      messages: [{ ...old, receivedAt: new Date(Date.now() - 20 * 86_400_000).toISOString() }],
    });
    const result = await checkMailStep({ lastDays: 30 });
    expect(result.newAttention).toBe(0);
    expect((await messages(own.email))[0].attentionState).toBe("DONE");
  });

  it("excludes an unreadable message instead of blocking the inbox", async () => {
    const own = await connection();
    vi.spyOn(outlook, "folders").mockResolvedValue([]);
    vi.spyOn(outlook, "scanMail").mockResolvedValue({
      messages: [
        mail("no-sender", { sender: "", internetMessageId: "<no-sender@fixture.invalid>" }),
        mail("blank-subject", { subject: "   ", internetMessageId: "<blank@fixture.invalid>" }),
      ],
    });
    expect(await checkConnection(own, context)).toMatchObject({ status: "done", newAttention: 1 });
    const rows = await ledger(own.email);
    expect(rows.find((row) => row.providerMessageId === "no-sender")).toMatchObject({
      disposition: "excluded",
      messageId: null,
      reason: expect.stringContaining("Unreadable"),
    });
    expect((await messages(own.email)).map((row) => row.subject)).toEqual(["(No subject)"]);
    expect((await current(own.id)).lastError).toBeNull();
  });

  it("refuses to check without a connected inbox", async () => {
    const owned = await db
      .select({ id: mailConnections.id })
      .from(mailConnections)
      .where(inArray(mailConnections.provider, ["GMAIL", "OUTLOOK"]));
    expect(owned).toHaveLength(0);
    await expect(checkMailStep()).rejects.toMatchObject({
      status: 409,
      message: "Connect an inbox before checking mail.",
    });
  });
});
