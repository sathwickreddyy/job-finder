import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { like } from "drizzle-orm";
import { closeDatabase, db } from "@/db";
import { mailMessages, mailTracking } from "@/db/schema";
import { mailLocation } from "@/features/timeline/read";
import { assertE2eDatabase, dbTests } from "./helpers/e2e-db";

const prefix = `mail-redirect-${randomUUID()}`;
const account = `${prefix}@fixture.invalid`;
let counter = 0;
async function email(patch: Partial<typeof mailMessages.$inferInsert> = {}) {
  counter++;
  const [row] = await db
    .insert(mailMessages)
    .values({
      externalId: `${prefix}-${counter}`,
      provider: "GMAIL",
      accountEmail: account,
      sender: "talent@fixture.invalid",
      subject: `Redirect ${counter}`,
      receivedAt: new Date("2026-10-29T05:00:00Z"),
      ...patch,
    })
    .returning();
  return row;
}

describe.skipIf(!dbTests)("old mail links", () => {
  beforeAll(assertE2eDatabase);
  afterAll(async () => {
    await assertE2eDatabase();
    await db.delete(mailTracking).where(like(mailTracking.accountEmail, `${prefix}%`));
    await db.delete(mailMessages).where(like(mailMessages.accountEmail, `${prefix}%`));
    await closeDatabase();
  });

  it("sends placed mail to its company timeline", async () => {
    const row = await email({ companyKey: `acme ${prefix}` });
    expect(await mailLocation(row.id)).toBe(
      `/mail?${new URLSearchParams({ company: `acme ${prefix}`, mail: row.id })}`,
    );
  });

  it("sends unplaced mail to Needs a home", async () => {
    const row = await email();
    expect(await mailLocation(row.id)).toBe(`/mail?view=home&mail=${row.id}`);
  });

  it("gives null for excluded or missing mail", async () => {
    const row = await email();
    await db.insert(mailTracking).values({
      provider: "GMAIL",
      accountEmail: account,
      providerMessageId: `${prefix}-hidden`,
      messageId: row.id,
      sender: row.sender,
      subject: row.subject,
      receivedAt: row.receivedAt,
      disposition: "excluded",
    });
    expect(await mailLocation(row.id)).toBeNull();
    expect(await mailLocation(randomUUID())).toBeNull();
    expect(await mailLocation("not-an-id")).toBeNull();
  });
});
