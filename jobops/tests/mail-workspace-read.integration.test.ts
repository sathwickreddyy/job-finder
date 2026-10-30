import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, inArray, like } from "drizzle-orm";
import { closeDatabase, db } from "@/db";
import { companyRecords, mailMessages, mailTracking, settings } from "@/db/schema";
import { listMail } from "@/features/mail/mail-list";
import { ruleKey } from "@/features/mail/context";
import { readMailWorkspace } from "@/features/mail/workspace-read";
import { saveWorkspaceRule } from "@/features/mail/workspace-actions";
import { assertE2eDatabase, dbTests } from "./helpers/e2e-db";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const prefix = `mail-workspace-read-${randomUUID()}`;
const domain = `r${randomUUID().slice(0, 8)}.invalid`;
const name = `Rule ${prefix}`;
const key = name.toLowerCase();
const companies: string[] = [];
let counter = 0;
async function email(patch: Partial<typeof mailMessages.$inferInsert> = {}) {
  const [row] = await db
    .insert(mailMessages)
    .values({
      externalId: `${prefix}-${++counter}`,
      provider: "OUTLOOK",
      accountEmail: `${prefix}@fixture.invalid`,
      sender: `talent@${domain}`,
      subject: `Interview invitation ${prefix}`,
      bodyText: "Please share your interview availability",
      receivedAt: new Date(Date.UTC(2026, 9, 29, 0, counter)),
      ...patch,
    })
    .returning();
  return row;
}

describe.skipIf(!dbTests)("mail workspace read model", () => {
  beforeAll(assertE2eDatabase);
  afterAll(async () => {
    await assertE2eDatabase();
    await db.delete(mailTracking).where(like(mailTracking.accountEmail, `${prefix}%`));
    await db.delete(mailMessages).where(like(mailMessages.accountEmail, `${prefix}%`));
    await db.delete(settings).where(eq(settings.key, ruleKey(key)));
    if (companies.length)
      await db.delete(companyRecords).where(inArray(companyRecords.id, companies));
    await closeDatabase();
  });

  it("workspace items equal the API items for the same filters", async () => {
    await email();
    await email({ attentionState: "DONE", processedAt: new Date() });
    expect((await readMailWorkspace({ view: "open" })).items).toEqual(
      (await listMail({ attention: "open" })).items,
    );
    const all = await readMailWorkspace({ view: "all", q: prefix });
    expect(all.items).toEqual((await listMail({ attention: "all", q: prefix })).items);
    expect(all.items).toHaveLength(2);
    expect(all.openCount).toBe(1);
  });

  it("rule save places unplaced mail without reopening it", async () => {
    const [company] = await db.insert(companyRecords).values({ slug: prefix, name }).returning();
    companies.push(company.id);
    const handled = await email({ attentionState: "DONE", processedAt: new Date() });
    const excluded = await email();
    await db.insert(mailTracking).values({
      provider: "OUTLOOK",
      accountEmail: `${prefix}@fixture.invalid`,
      providerMessageId: `${prefix}-excluded`,
      messageId: excluded.id,
      sender: excluded.sender,
      subject: excluded.subject,
      receivedAt: excluded.receivedAt,
      disposition: "excluded",
    });
    const form = new FormData();
    form.set("company", key);
    form.set("domains", domain);
    const result = await saveWorkspaceRule({}, form);
    expect(result.error).toBeUndefined();
    const [after] = await db.select().from(mailMessages).where(eq(mailMessages.id, handled.id));
    expect(after).toMatchObject({ companyKey: key, attentionState: "DONE" });
    const [hidden] = await db.select().from(mailMessages).where(eq(mailMessages.id, excluded.id));
    expect(hidden.companyKey).toBeNull();
  });
});
