import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, like } from "drizzle-orm";
import { closeDatabase, db } from "@/db";
import { mailConnections, mailMessages, mailTracking } from "@/db/schema";
import type { MailContext } from "@/features/mail/context";
import { ingestPage } from "@/features/mail/ingest";
import { assertE2eDatabase, dbTests } from "./helpers/e2e-db";

// A rule that throws stands in for any email the rule cannot apply.
vi.mock("@/features/mail/auto-apply-rule", () => ({
  decideMailEffect: () => {
    throw new Error("Rule failed on purpose");
  },
}));

const prefix = `mail-rule-isolation-${randomUUID()}`;
const domain = `${randomUUID().slice(0, 8)}.invalid`;
const context: MailContext = {
  baselineAt: "2026-10-01T00:00:00Z",
  companies: [
    {
      id: "isolation co",
      name: "Isolation Co",
      slug: null,
      baselineAt: "2026-10-01T00:00:00Z",
      ruleSource: "test",
      rule: {
        company: "Isolation Co",
        aliases: [],
        domains: [domain],
        senders: [],
        keywords: [],
        excludedTerms: [],
      },
    },
  ],
  applications: [],
  outbound: [],
};

describe.skipIf(!dbTests)("mail rule isolation", () => {
  beforeAll(assertE2eDatabase);
  afterAll(async () => {
    await assertE2eDatabase();
    await db.delete(mailTracking).where(like(mailTracking.accountEmail, `${prefix}%`));
    await db.delete(mailMessages).where(like(mailMessages.accountEmail, `${prefix}%`));
    await db.delete(mailConnections).where(like(mailConnections.email, `${prefix}%`));
    await closeDatabase();
  });

  it("a failing rule never stops Fetch new mail from storing the page", async () => {
    const [connection] = await db
      .insert(mailConnections)
      .values({
        provider: "OUTLOOK",
        email: `${prefix}@fixture.invalid`,
        encryptedAccessToken: "unused-fixture",
      })
      .returning();
    const counts = await db.transaction((tx) =>
      ingestPage(tx, {
        connection,
        providerId: "OUTLOOK",
        messages: [
          {
            externalId: `${prefix}-1`,
            sender: `talent@${domain}`,
            senderName: "Talent team",
            subject: "Update on your application",
            bodyText: "We have decided not to proceed with your application.",
            receivedAt: "2026-10-29T05:00:00Z",
            folders: ["Inbox"],
          },
        ],
        context,
        threads: [],
        recoveredBefore: null,
      }),
    );
    expect(counts).toMatchObject({ counts: { kept: 1 } });
    expect(
      await db.select().from(mailMessages).where(eq(mailMessages.accountEmail, connection.email)),
    ).toHaveLength(1);
  });
});
