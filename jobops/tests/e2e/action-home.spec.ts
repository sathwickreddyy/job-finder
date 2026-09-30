import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";
import { closeDatabase, db } from "../../src/db";
import { mailMessages } from "../../src/db/schema";

test.beforeEach(() => expect(new URL(process.env.DATABASE_URL!).pathname).toBe("/jobops_e2e"));
test.afterAll(() => closeDatabase());

test("inbox surfaces dated actions and marking done preserves the original message", async ({
  page,
}) => {
  const subject = `Interview test ${Date.now()}`;
  const [mail] = await db
    .insert(mailMessages)
    .values({
      externalId: subject,
      sender: "fictional@example.invalid",
      subject,
      receivedAt: new Date(),
      classification: "INTERVIEW",
      snippet: "Please confirm availability for your interview.",
    })
    .returning();
  await page.goto(`/inbox?view=attention&q=${encodeURIComponent(subject)}`);
  await expect(page.getByRole("heading", { name: "Today", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: subject, exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Mark done", exact: true }).click();
  await expect(page.getByRole("link", { name: subject, exact: true })).not.toBeVisible();
  await page.goto(`/inbox?q=${encodeURIComponent(subject)}`);
  await expect(page.getByRole("link", { name: subject, exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Reopen action", exact: true }).click();
  await expect(page.getByRole("button", { name: "Mark done", exact: true })).toBeVisible();
  expect(
    (await db.select().from(mailMessages).where(eq(mailMessages.id, mail.id)))[0].attentionState,
  ).toBe("OPEN");
});

test("core pages fit a phone and preserve the selected theme", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Use light theme", exact: true }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  for (const path of [
    "/",
    "/find",
    "/jobs",
    "/resumes",
    "/resume-prompt",
    "/applications",
    "/my-profile",
    "/inbox",
  ]) {
    await page.goto(path);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  }
  expect(errors).toEqual([]);
});
