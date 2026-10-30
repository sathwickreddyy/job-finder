import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, like } from "drizzle-orm";
import { db, closeDatabase } from "@/db";
import {
  mailConnections,
  mailMessages,
  mailTracking,
  settings,
  companyRecords,
  companyMailMatches,
  jobs,
  applications,
} from "@/db/schema";
import { readMailWorkspace } from "@/features/mail/workspace-read";
import { readCompanyMail } from "@/features/mail/company-search";
import { loadMailContext } from "@/features/mail/context";
import { companyRevision } from "@/features/mail/company-search-policy";
import { outlook } from "@/services/mail/providers/outlook";
import { scanConnection, scanKey } from "@/features/mail/scan-service";
import type { MailContext } from "@/features/mail/context";
import type { ScannedMessage } from "@/services/mail/providers/types";

const enabled = process.env.MAIL_WORKSPACE_DB_TEST === "1";
const prefix = `mail-workspace-${randomUUID()}`;
const connectionIds: string[] = [];
const jobIds: string[] = [];
const applicationIds: string[] = [];
const companyIds: string[] = [];
const baseline = "2026-10-29T00:00:00Z";
const context: MailContext = {
  baselineAt: baseline,
  companies: [
    {
      id: "fixture",
      name: "Fixture",
      slug: null,
      baselineAt: baseline,
      ruleSource: "test",
      rule: {
        company: "Fixture",
        aliases: [],
        domains: ["fixture.invalid"],
        senders: [],
        subjectTerms: [],
        excludedTerms: [],
      },
    },
  ],
  applications: [],
  outbound: [],
};
const mail = (id: string): ScannedMessage => ({
  externalId: id,
  internetMessageId: "<shared@fixture.invalid>",
  sender: "talent@fixture.invalid",
  subject: "Interview invitation",
  bodyText: "Please share your interview availability",
  receivedAt: "2026-10-30T00:00:00Z",
  folders: ["Junk"],
});
async function connection(index = 0) {
  const [row] = await db
    .insert(mailConnections)
    .values({
      provider: "OUTLOOK",
      email: `${prefix}-${index}@fixture.invalid`,
      encryptedAccessToken: "unused-fixture",
    })
    .returning();
  connectionIds.push(row.id);
  return row;
}
describe.skipIf(!enabled)("mail ledger and page checkpoint integration", () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL || new URL(process.env.DATABASE_URL).pathname !== "/jobops_e2e")
      throw new Error("Refusing any database other than jobops_e2e");
    const [marker] = await db.select().from(settings).where(eq(settings.key, "__jobops_e2e"));
    if (marker?.value.ownedBy !== "jobops-browser-tests")
      throw new Error("Test ownership marker required");
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    // Guard again before deleting only this run's disposable fixtures.
    if (!process.env.DATABASE_URL || new URL(process.env.DATABASE_URL).pathname !== "/jobops_e2e")
      return;
    await db.delete(mailTracking).where(like(mailTracking.accountEmail, `${prefix}%`));
    await db.delete(mailMessages).where(like(mailMessages.accountEmail, `${prefix}%`));
    await db.delete(mailConnections).where(like(mailConnections.email, `${prefix}%`));
    for (const id of connectionIds) await db.delete(settings).where(like(settings.key, `%${id}%`));
    for (const id of applicationIds) await db.delete(applications).where(eq(applications.id, id));
    for (const id of jobIds) await db.delete(jobs).where(eq(jobs.id, id));
    for (const id of companyIds) await db.delete(companyRecords).where(eq(companyRecords.id, id));
    await closeDatabase();
  });
  it("keeps one message identity across a rescan and folder move, and preserves reviewed history", async () => {
    const own = await connection();
    vi.spyOn(outlook, "folders").mockResolvedValue([{ id: "junk", name: "Junk" }]);
    const scan = vi.spyOn(outlook, "scanMail").mockResolvedValue({ messages: [mail("stable")] });
    expect((await scanConnection(own, "latest", {}, context)).arrived).toBe(1);
    scan.mockResolvedValue({
      messages: [{ ...mail("stable"), folders: ["Inbox"] }],
    });
    expect((await scanConnection(own, "latest", {}, context)).arrived).toBe(0);
    let rows = await db.select().from(mailTracking).where(eq(mailTracking.accountEmail, own.email));
    expect(rows).toHaveLength(1);
    expect(rows[0].folders).toEqual(["Inbox"]);
    expect(rows[0].disposition).toBe("latest");
    await db
      .update(mailTracking)
      .set({ disposition: "history" })
      .where(eq(mailTracking.id, rows[0].id));
    await db
      .update(mailMessages)
      .set({ attentionState: "DONE" })
      .where(eq(mailMessages.id, rows[0].messageId!));
    expect((await scanConnection(own, "latest", {}, context)).arrived).toBe(0);
    rows = await db.select().from(mailTracking).where(eq(mailTracking.accountEmail, own.email));
    expect(rows[0].disposition).toBe("history");
  });
  it("counts a repeated identity only once within a provider page", async () => {
    const account = await connection(9);
    vi.spyOn(outlook, "folders").mockResolvedValue([{ id: "junk", name: "Junk" }]);
    vi.spyOn(outlook, "scanMail").mockResolvedValue({
      messages: [mail("repeated"), mail("repeated")],
    });
    const result = await scanConnection(account, "latest", {}, context);
    expect(result.arrived).toBe(1);
    const rows = await db
      .select()
      .from(mailTracking)
      .where(eq(mailTracking.accountEmail, account.email));
    expect(rows).toHaveLength(1);
  });
  it("does not collapse the same Internet Message-ID across two Outlook accounts", async () => {
    const first = await connection(1),
      second = await connection(2);
    vi.spyOn(outlook, "folders").mockResolvedValue([]);
    vi.spyOn(outlook, "scanMail").mockResolvedValue({
      messages: [mail("same-provider-id")],
    });
    expect((await scanConnection(first, "latest", {}, context)).arrived).toBe(1);
    expect((await scanConnection(second, "latest", {}, context)).arrived).toBe(1);
    const a = await db
      .select()
      .from(mailTracking)
      .where(eq(mailTracking.accountEmail, first.email));
    const b = await db
      .select()
      .from(mailTracking)
      .where(eq(mailTracking.accountEmail, second.email));
    expect(a[0].messageId).not.toBe(b[0].messageId);
  });
  it("keeps an unassigned personal update pending across repeated checks without counting it twice", async () => {
    const own = await connection(8);
    vi.spyOn(outlook, "folders").mockResolvedValue([]);
    vi.spyOn(outlook, "scanMail").mockResolvedValue({
      messages: [
        {
          ...mail("unassigned"),
          sender: "careers@untracked.invalid",
          subject: "We received your application",
          bodyText: "Thank you for applying to the Software Engineer role.",
        },
      ],
    });
    const noCompanies = { ...context, companies: [] };
    expect((await scanConnection(own, "latest", {}, noCompanies)).arrived).toBe(1);
    expect((await scanConnection(own, "latest", {}, noCompanies)).arrived).toBe(0);
    const rows = await db
      .select()
      .from(mailTracking)
      .where(eq(mailTracking.accountEmail, own.email));
    expect(rows).toHaveLength(1);
    expect(rows[0].disposition).toBe("latest");
    expect(rows[0].companyKeys).toEqual([]);
  });
  it("checkpoints a committed history page before failure and resumes the failed page", async () => {
    const own = await connection(3);
    vi.spyOn(outlook, "folders").mockResolvedValue([]);
    const scan = vi
      .spyOn(outlook, "scanMail")
      .mockResolvedValueOnce({
        messages: [mail("history-first")],
        next: "opaque-second",
      })
      .mockRejectedValueOnce(new Error("Temporary provider failure"));
    expect((await scanConnection(own, "history", {}, context)).historical).toBe(1);
    await expect(scanConnection(own, "history", {}, context)).rejects.toThrow(
      "Temporary provider failure",
    );
    const [checkpoint] = await db
      .select()
      .from(settings)
      .where(eq(settings.key, scanKey(own.id, "history", {})));
    expect(checkpoint.value.next).toBe("opaque-second");
    expect(checkpoint.value.scanned).toBe(1);
    scan.mockResolvedValueOnce({ messages: [mail("history-second")] });
    const result = await scanConnection(own, "history", {}, context);
    expect(scan.mock.calls.at(-1)?.[1].next).toBe("opaque-second");
    expect(result.arrived).toBe(0);
    expect(result.historical).toBe(1);
    const rows = await db
      .select()
      .from(mailTracking)
      .where(eq(mailTracking.accountEmail, own.email));
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.disposition === "history")).toBe(true);
  });
  it("rolls back a failing page and does not consume unrelated mail in a company-scoped search", async () => {
    const own = await connection(4);
    vi.spyOn(outlook, "folders").mockResolvedValue([]);
    const scan = vi.spyOn(outlook, "scanMail").mockResolvedValue({
      messages: [mail("rollback-first"), { ...mail("invalid"), receivedAt: "invalid" }],
    });
    await expect(scanConnection(own, "latest", {}, context)).rejects.toThrow();
    expect(
      await db.select().from(mailTracking).where(eq(mailTracking.accountEmail, own.email)),
    ).toHaveLength(0);
    const [checkpoint] = await db
      .select()
      .from(settings)
      .where(eq(settings.key, scanKey(own.id, "latest", {})));
    expect(checkpoint).toBeUndefined();
    scan.mockResolvedValue({ messages: [mail("outside-scope")] });
    await scanConnection(own, "latest", { company: "another" }, context);
    expect(
      await db.select().from(mailTracking).where(eq(mailTracking.accountEmail, own.email)),
    ).toHaveLength(0);
    expect((await scanConnection(own, "latest", {}, context)).arrived).toBe(1);
  });
  it("uses cumulative, company and application scopes over the same paginated message identities", async () => {
    const name = `Fixture ${prefix}`;
    const companyKey = name.toLowerCase();
    const [company] = await db
      .insert(companyRecords)
      .values({ slug: prefix, name, websiteUrl: "https://fixture.invalid" })
      .returning();
    companyIds.push(company.id);
    const [job] = await db
      .insert(jobs)
      .values({
        company: name,
        title: "Software Engineer II",
        canonicalUrl: `https://fixture.invalid/${prefix}`,
        dedupeKey: prefix,
        source: "MANUAL",
      })
      .returning();
    jobIds.push(job.id);
    const [app] = await db.insert(applications).values({ jobId: job.id }).returning();
    applicationIds.push(app.id);
    const account = `${prefix}-scope@fixture.invalid`;
    const base = {
      provider: "OUTLOOK",
      accountEmail: account,
      sender: "talent@fixture.invalid",
      subject: "Your application update",
      receivedAt: new Date("2026-10-30T00:00:00Z"),
      companyKeys: [companyKey],
      applicationIds: [app.id],
      disposition: "history",
    };
    await db.insert(mailTracking).values(
      Array.from({ length: 101 }, (_, index) => ({
        ...base,
        providerMessageId: `scope-${index}`,
      })),
    );
    const first = await readMailWorkspace({ account, view: "history" });
    expect(first.total).toBe(101);
    expect(first.messages).toHaveLength(100);
    expect(first.nextBefore).toBeTruthy();
    const second = await readMailWorkspace({
      account,
      view: "history",
      before: first.nextBefore!,
    });
    expect(second.messages).toHaveLength(1);
    expect(first.messages.map((row) => row.id)).not.toContain(second.messages[0].id);
    const byCompany = await readMailWorkspace({
      account,
      company: companyKey,
      view: "history",
    });
    const byApplication = await readMailWorkspace({
      account,
      application: app.id,
      view: "history",
    });
    expect(byCompany.total).toBe(101);
    expect(byApplication.messages.map((row) => row.id)).toEqual(
      byCompany.messages.map((row) => row.id),
    );
    expect(
      (
        await readMailWorkspace({
          account,
          company: "unrelated",
          view: "history",
        })
      ).total,
    ).toBe(0);
    expect((await readMailWorkspace({ account, view: "latest" })).total).toBe(0);
    const [linked] = await db
      .insert(mailMessages)
      .values({
        externalId: `${prefix}-legacy-link`,
        provider: "OUTLOOK",
        accountEmail: account,
        sender: "talent@fixture.invalid",
        subject: "Unique linked message",
        receivedAt: new Date("2026-10-30T00:00:00Z"),
        linkedApplicationId: app.id,
        bodyText: "Your application update",
      })
      .returning();
    const [linkedTracking] = await db
      .insert(mailTracking)
      .values({
        ...base,
        providerMessageId: "legacy-linked",
        subject: linked.subject,
        messageId: linked.id,
        companyKeys: ["outdated"],
        applicationIds: ["outdated"],
      })
      .returning();
    const currentContext = await loadMailContext();
    const currentCompany = currentContext.companies.find((row) => row.id === companyKey)!;
    await db.insert(companyMailMatches).values({
      companyKey,
      trackingId: linkedTracking.id,
      ruleRevision: companyRevision(currentCompany, currentContext),
      kept: false,
      reason: "A cached exclusion before the user linked the message",
    });
    const savedCompany = await readCompanyMail(companyKey);
    expect(savedCompany.messages.some((row) => row.subject === "Unique linked message")).toBe(true);
    const linkedResult = await readMailWorkspace({
      account,
      application: app.id,
      view: "history",
      q: "Unique linked",
    });
    expect(linkedResult.total).toBe(1);
    expect(linkedResult.messages[0].application).toBe(app.id);
    expect(
      (
        await readMailWorkspace({
          account,
          company: companyKey,
          view: "history",
          q: "Unique linked",
        })
      ).total,
    ).toBe(1);
  });
});
