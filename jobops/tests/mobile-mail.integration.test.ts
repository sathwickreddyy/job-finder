import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, like } from "drizzle-orm";
import { closeDatabase, db } from "@/db";
import { mailMessages, mailTracking } from "@/db/schema";
import { readAttentionMail } from "@/features/mobile/read";
import { assertE2eDatabase, dbTests } from "./helpers/e2e-db";
const key = `mobile-${randomUUID()}`;
const account = `${key}@fixture.invalid`;
describe.skipIf(!dbTests)("mobile attention mail", () => {
  beforeAll(assertE2eDatabase);
  afterAll(async () => {
    await assertE2eDatabase();
    await db.delete(mailTracking).where(eq(mailTracking.accountEmail, account));
    await db.delete(mailMessages).where(like(mailMessages.accountEmail, `${key}%`));
    await closeDatabase();
  });
  it("pages only open visible messages and retains an explicitly focused handled email", async () => {
    const inserted = await db
      .insert(mailMessages)
      .values(
        Array.from({ length: 54 }, (_, index) => ({
          provider: "GMAIL" as const,
          externalId: `${key}-${index}`,
          accountEmail: account,
          sender: "talent@fixture.invalid",
          companyKey: key,
          subject: `Attention ${index}`,
          bodyText: `Message ${index}`,
          receivedAt: new Date(Date.UTC(2026, 10, 1, 0, index)),
          attentionState: index === 53 ? ("DONE" as const) : ("OPEN" as const),
        })),
      )
      .returning();
    const excluded = inserted[52];
    await db
      .insert(mailTracking)
      .values({
        provider: "GMAIL",
        accountEmail: account,
        providerMessageId: excluded.externalId,
        messageId: excluded.id,
        sender: excluded.sender,
        subject: excluded.subject,
        receivedAt: excluded.receivedAt,
        disposition: "excluded",
      });
    const first = await readAttentionMail({ company: key });
    expect(first.openCount).toBe(52);
    expect(first.entries).toHaveLength(50);
    expect(first.entries.every((entry) => entry.item.attention === "open")).toBe(true);
    expect(first.entries.some((entry) => entry.item.id === excluded.id)).toBe(false);
    const next = await readAttentionMail({ company: key, cursor: first.nextCursor });
    expect(next.entries).toHaveLength(2);
    const ids = new Set(first.entries.map((entry) => entry.item.id));
    expect(next.entries.some((entry) => ids.has(entry.item.id))).toBe(false);
    const focused = await readAttentionMail({ company: key, mail: inserted[53].id });
    expect(focused.entries.find((entry) => entry.item.id === inserted[53].id)?.item.attention).toBe(
      "handled",
    );
    expect(focused.openCount).toBe(52);
    const hidden = await readAttentionMail({ company: key, mail: excluded.id });
    expect(hidden.entries.some((entry) => entry.item.id === excluded.id)).toBe(false);
  });
});
