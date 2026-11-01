import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { closeDatabase, db } from "../../src/db";
import { mailMessages } from "../../src/db/schema";
import { assertE2eDatabase } from "../helpers/e2e-db";
import { cleanupRecords, seedRecord } from "./helpers/records";

test.beforeAll(assertE2eDatabase);
test.afterAll(async () => {
  await cleanupRecords();
  await closeDatabase();
});

test("iPhone essentials use real records, retain Undo and expand one flat application list", async ({
  page,
}) => {
  const suffix = randomUUID();
  const company = `Mobile Example ${suffix.slice(0, 8)}`;
  const seeded = await seedRecord({ company, source: "DIRECT", sentDaysAgo: 2 });
  const [mail] = await db
    .insert(mailMessages)
    .values({
      provider: "GMAIL",
      externalId: `mobile-${suffix}`,
      accountEmail: `mobile-${suffix}@fixture.invalid`,
      companyKey: company.toLowerCase(),
      linkedApplicationId: seeded.applicationId,
      sender: "recruiter@fixture.invalid",
      senderName: "Recruiter",
      subject: `Role details ${suffix}`,
      bodyText: "Please review the role details before our next conversation.",
      classification: "UNKNOWN",
      receivedAt: new Date("2025-09-03T10:30:00+05:30"),
    })
    .returning();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`${page.url()}: ${error.message}`));
  await page.setViewportSize({ width: 390, height: 844 });
  try {
    await page.goto("/");
    await expect(page.getByTestId("mobile-overview")).toBeVisible();
    await expect(page.getByRole("region", { name: "Your profiles" })).toBeHidden();
    const nav = page.getByRole("navigation", { name: "Mobile navigation" });
    await expect(nav.getByRole("link")).toHaveCount(3);
    const badgeCount = async () => {
      const badge = nav.getByRole("link", { name: /Mail/ }).locator(".bg-review");
      return (await badge.count()) ? Number((await badge.textContent())!.replace(/\D/g, "")) : 0;
    };
    const beforeCount = await badgeCount();
    await page.getByRole("button", { name: "7 days", exact: true }).click();
    await nav.getByRole("link", { name: /Mail/ }).click();
    await expect(page.getByTestId("mobile-mail")).toBeVisible();
    await page.goto(`/mail?company=${encodeURIComponent(company)}`);
    const workspace = page.getByTestId("mobile-mail");
    const row = workspace.locator(`#attention-${mail.id}`);
    await expect(row).toContainText("3 Sep 2025");
    await row.getByRole("link").click();
    await row.getByRole("button", { name: "Mark as handled", exact: true }).click();
    await expect(row.getByRole("button", { name: "Undo", exact: true })).toBeVisible();
    await expect
      .poll(
        async () =>
          (await db.select().from(mailMessages).where(eq(mailMessages.id, mail.id)))[0]
            .attentionState,
      )
      .toBe("DONE");
    await expect.poll(badgeCount).toBe(beforeCount - 1);
    await row.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(row.getByRole("button", { name: "Mark as handled", exact: true })).toBeVisible();
    await expect
      .poll(
        async () =>
          (await db.select().from(mailMessages).where(eq(mailMessages.id, mail.id)))[0]
            .attentionState,
      )
      .toBe("OPEN");
    await expect.poll(badgeCount).toBe(beforeCount);
    await nav.getByRole("link", { name: "Applications", exact: true }).click();
    const list = page.getByTestId("mobile-applications");
    await expect(list).toBeVisible();
    const application = list.getByRole("group", { name: company, exact: true });
    await application.getByRole("link", { name: new RegExp(company) }).click();
    await expect(application.getByRole("link", { name: new RegExp(company) })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await expect(
      list.locator("section[aria-label='Needs you'], section[aria-label='Closed']"),
    ).toHaveCount(0);
    for (const width of [320, 375, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await expect(nav).toBeHidden();
    await expect(page.getByRole("navigation", { name: "Primary", exact: true })).toBeVisible();
    await expect(page.getByTestId("mobile-applications")).toHaveCount(0);
    for (const path of [
      "/gallery",
      "/gallery/mobile",
      "/gallery/home",
      "/gallery/mail",
      "/gallery/applications-sync",
    ])
      expect((await page.request.get(path)).status()).toBe(404);
    expect(errors).toEqual([]);
  } finally {
    await assertE2eDatabase();
    await db.delete(mailMessages).where(eq(mailMessages.id, mail.id));
  }
});
