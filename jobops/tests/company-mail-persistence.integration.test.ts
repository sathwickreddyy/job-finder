import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";
import { db, closeDatabase } from "@/db";
import {
  activityLogs,
  companyRecords,
  companyMailMatches,
  mailConnections,
  mailMessages,
  mailTracking,
  settings,
} from "@/db/schema";
import { companyPage, readCompanyMail, searchCompanyMail } from "@/features/mail/company-search";
import { companyProgressKey } from "@/features/mail/company-search-policy";
import { gmail } from "@/services/mail/providers/gmail";
import type { MailContext } from "@/features/mail/context";
import type { MailConnection, ScannedMessage } from "@/services/mail/providers/types";
const enabled = process.env.COMPANY_MAIL_DB_TEST === "1";
const request = {
  keywords: [],
  senders: [],
  subjects: [],
  since: "2026-10-27T00:00:00.000Z",
  until: "2026-10-30T12:00:00.000Z",
};
let connection: MailConnection;
let companyRecordId: string;
let context: MailContext;
const mail = (id: string, changes: Partial<ScannedMessage> = {}): ScannedMessage => ({
  externalId: id,
  internetMessageId: `<${id}@fixture.invalid>`,
  sender: "talent@fixture.invalid",
  subject: "Your application received",
  bodyText: "Thank you for applying",
  receivedAt: "2026-10-30T11:30:00.000Z",
  folders: ["Spam"],
  ...changes,
});
async function guard() {
  if (!process.env.DATABASE_URL || new URL(process.env.DATABASE_URL).pathname !== "/jobops_e2e")
    throw new Error("Company mail tests require jobops_e2e.");
  const [marker] = await db.select().from(settings).where(eq(settings.key, "__jobops_e2e"));
  if (marker?.value.ownedBy !== "jobops-browser-tests")
    throw new Error("Company mail tests require the ownership marker.");
}
describe.skipIf(!enabled)("persistent company mail", () => {
  beforeEach(async () => {
    await guard();
    vi.stubEnv("MAIL_TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 9).toString("base64"));
    const key = `company-cache-${randomUUID()}`;
    const [saved] = await db
      .insert(mailConnections)
      .values({
        provider: "GMAIL",
        email: `${key}@example.invalid`,
        encryptedAccessToken: "fixture-no-provider-access",
      })
      .returning();
    connection = saved;
    const [company] = await db
      .insert(companyRecords)
      .values({ name: key, slug: key, websiteUrl: "https://fixture.invalid" })
      .returning();
    companyRecordId = company.id;
    context = {
      baselineAt: "2026-10-29T00:00:00Z",
      applications: [],
      outbound: [],
      companies: [
        {
          id: key,
          name: key,
          slug: key,
          baselineAt: "2026-10-29T00:00:00Z",
          ruleSource: "fixture",
          rule: {
            company: key,
            domains: ["fixture.invalid"],
            aliases: [],
            senders: [],
            subjectTerms: [],
            excludedTerms: [],
          },
        },
      ],
    };
    vi.spyOn(gmail, "folders").mockResolvedValue([{ id: "SPAM", name: "Spam" }]);
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    await guard();
    if (!connection) return;
    await db.delete(mailTracking).where(eq(mailTracking.accountEmail, connection.email));
    await db.delete(mailMessages).where(eq(mailMessages.accountEmail, connection.email));
    await db
      .delete(activityLogs)
      .where(sql`${activityLogs.metadata}->>'accountEmail' = ${connection.email}`);
    await db.delete(settings).where(
      inArray(
        settings.key,
        ["latest", "history"].map((mode) =>
          companyProgressKey(context.companies[0].id, connection.id, mode),
        ),
      ),
    );
    await db.delete(mailConnections).where(eq(mailConnections.id, connection.id));
    await db.delete(companyRecords).where(eq(companyRecords.id, companyRecordId));
  });
  afterAll(closeDatabase);
  it("the reusable company API validates explicit dates and resumes its authenticated cursor", async () => {
    vi.spyOn(gmail, "scanMail")
      .mockResolvedValueOnce({ messages: [mail("api")], next: "more" })
      .mockResolvedValueOnce({ messages: [] });
    const first = await searchCompanyMail({
      company: context.companies[0].id,
      lastDays: 3,
      until: request.until,
      accounts: [connection.email],
    });
    expect(first.readOnly).toBe(false);
    expect(first.savedCompany).toBe(context.companies[0].id);
    expect(first.accounts[0].tracking?.saved).toBe(1);
    expect(first.nextCursor).toBeTruthy();
    const last = await searchCompanyMail({ companyCursor: first.nextCursor });
    expect(last.complete).toBe(true);
    expect(last.nextCursor).toBeNull();
    await expect(searchCompanyMail({ companyCursor: "forged" })).rejects.toThrow(
      "Invalid company search cursor",
    );
  });
  it("keeps real updates, records exclusions and reloads saved company mail without provider access", async () => {
    const scan = vi.spyOn(gmail, "scanMail").mockResolvedValue({
      messages: [
        mail("ack"),
        mail("invoice", {
          subject: "Your invoice",
          bodyText: "Our recruiting team works here too",
        }),
        mail("news", {
          sender: "news@elsewhere.invalid",
          subject: "Industry news",
          bodyText: `${context.companies[0].name} interview stories`,
        }),
      ],
    });
    const first = await companyPage(connection, context.companies[0], context, request, "latest");
    expect(first.tracking).toMatchObject({ saved: 1, excluded: 2 });
    expect(first.messages).toHaveLength(1);
    const saved = await readCompanyMail(context.companies[0].id);
    expect(saved.counts).toEqual({ kept: 1, excluded: 2 });
    expect(saved.messages[0].bodyText).toBe("Thank you for applying");
    const otherAccount = await readCompanyMail(
      context.companies[0].id,
      "kept",
      undefined,
      "other@example.invalid",
    );
    expect(otherAccount.counts).toEqual({ kept: 0, excluded: 0 });
    expect(otherAccount.messages).toHaveLength(0);
    expect(otherAccount.nextBefore).toBeNull();
    const excluded = await readCompanyMail(context.companies[0].id, "excluded");
    expect(excluded.messages).toHaveLength(2);
    expect(excluded.messages.every((m) => m.bodyText?.startsWith("Excluded message:"))).toBe(true);
    const again = await companyPage(connection, context.companies[0], context, request, "latest");
    expect(again.tracking?.cacheHit).toBe(true);
    expect(scan).toHaveBeenCalledTimes(1);
  });
  it("adopts already-stored company mail without a second provider fetch", async () => {
    const scan = vi.spyOn(gmail, "scanMail").mockResolvedValue({ messages: [mail("legacy")] });
    await companyPage(connection, context.companies[0], context, request, "latest");
    await db
      .delete(companyMailMatches)
      .where(eq(companyMailMatches.companyKey, context.companies[0].id));
    expect((await readCompanyMail(context.companies[0].id)).counts.kept).toBe(1);
    expect(scan).toHaveBeenCalledTimes(1);
  });
  it("advances only to the uncovered tail and sends cached IDs so bodies are not downloaded again", async () => {
    const scan = vi.spyOn(gmail, "scanMail").mockResolvedValue({ messages: [mail("ack")] });
    await companyPage(connection, context.companies[0], context, request, "latest");
    scan.mockResolvedValue({ messages: [], fetched: 1, skippedKnown: 1 });
    const again = await companyPage(
      connection,
      context.companies[0],
      context,
      { ...request, until: "2026-10-30T12:01:00Z" },
      "latest",
    );
    expect(scan.mock.calls[1][1]).toMatchObject({
      since: "2026-10-30T11:00:00.000Z",
      skipIds: ["ack"],
    });
    expect(again.tracking).toMatchObject({ alreadyKnown: 1, saved: 0 });
    expect(
      await db.select().from(mailMessages).where(eq(mailMessages.accountEmail, connection.email)),
    ).toHaveLength(1);
  });
  it("commits a page and checkpoint atomically, and resumes after a later request fails", async () => {
    const scan = vi
      .spyOn(gmail, "scanMail")
      .mockResolvedValueOnce({ messages: [mail("first")], next: "page-two" })
      .mockRejectedValueOnce(new Error("provider unavailable"))
      .mockResolvedValueOnce({ messages: [mail("second")] });
    await companyPage(connection, context.companies[0], context, request, "latest");
    await expect(
      companyPage(connection, context.companies[0], context, request, "latest"),
    ).rejects.toThrow("unavailable");
    const [checkpoint] = await db
      .select()
      .from(settings)
      .where(
        eq(settings.key, companyProgressKey(context.companies[0].id, connection.id, "latest")),
      );
    expect(checkpoint.value.next).toBe("page-two");
    const done = await companyPage(connection, context.companies[0], context, request, "latest");
    expect(done.tracking?.resumed).toBe(true);
    expect(done.complete).toBe(true);
    expect(scan.mock.calls[2][1].next).toBe("page-two");
    expect((await readCompanyMail(context.companies[0].id)).counts.kept).toBe(2);
  });
  it("deduplicates folder moves by internet message identity", async () => {
    const scan = vi
      .spyOn(gmail, "scanMail")
      .mockResolvedValueOnce({
        messages: [mail("old", { internetMessageId: "<stable@fixture.invalid>" })],
      })
      .mockResolvedValueOnce({
        messages: [
          mail("moved", { internetMessageId: "<stable@fixture.invalid>", folders: ["Archive"] }),
        ],
      });
    await companyPage(connection, context.companies[0], context, request, "latest");
    const done = await companyPage(
      connection,
      context.companies[0],
      context,
      { ...request, until: "2026-10-30T12:01:00Z" },
      "latest",
    );
    expect(done.tracking?.alreadyKnown).toBe(1);
    expect(scan).toHaveBeenCalledTimes(2);
    const rows = await db
      .select()
      .from(mailTracking)
      .where(eq(mailTracking.accountEmail, connection.email));
    expect(rows).toHaveLength(1);
    expect(rows[0].folders).toEqual(["Archive"]);
    expect((await readCompanyMail(context.companies[0].id)).counts.kept).toBe(1);
  });
  it("counts a repeated identity only once within a provider page", async () => {
    vi.spyOn(gmail, "scanMail").mockResolvedValue({
      messages: [mail("repeated"), mail("repeated")],
    });
    const result = await companyPage(connection, context.companies[0], context, request, "latest");
    expect(result.tracking).toMatchObject({ saved: 1, alreadyKnown: 1 });
    expect(result.messages).toHaveLength(1);
    expect((await readCompanyMail(context.companies[0].id)).counts.kept).toBe(1);
  });
  it("reevaluates exclusions after rule changes without promoting seen mail into Latest", async () => {
    const raw = mail("reply", {
      sender: "person@external.invalid",
      subject: "A quick reply",
      bodyText: "Yes, Tuesday works.",
    });
    vi.spyOn(gmail, "scanMail").mockResolvedValue({ messages: [raw] });
    const first = await companyPage(connection, context.companies[0], context, request, "latest");
    expect(first.tracking?.excluded).toBe(1);
    context.companies[0].rule.senders = [raw.sender];
    const changed = await companyPage(connection, context.companies[0], context, request, "latest");
    expect(changed.tracking?.saved).toBe(1);
    const [row] = await db
      .select()
      .from(mailTracking)
      .where(eq(mailTracking.accountEmail, connection.email));
    expect(row.disposition).toBe("history");
  });
  it("a rejection for another company cannot overwrite a previously accepted association", async () => {
    vi.spyOn(gmail, "scanMail").mockResolvedValue({ messages: [mail("ack")] });
    await companyPage(connection, context.companies[0], context, request, "latest");
    const second = {
      ...context.companies[0],
      id: "other-fixture",
      name: "Other fixture",
      rule: { ...context.companies[0].rule, company: "Other fixture", domains: ["other.invalid"] },
    };
    await companyPage(connection, second, { ...context, companies: [second] }, request, "latest");
    const [row] = await db
      .select()
      .from(mailTracking)
      .where(eq(mailTracking.accountEmail, connection.email));
    expect(row.companyKeys).toContain(context.companies[0].id);
    expect(row.disposition).not.toBe("excluded");
    expect(
      await db.select().from(companyMailMatches).where(eq(companyMailMatches.trackingId, row.id)),
    ).toHaveLength(2);
    await db
      .delete(settings)
      .where(eq(settings.key, companyProgressKey(second.id, connection.id, "latest")));
  });
});
