import { stubExternalSites } from "./helpers/external-sites";
import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";
import { closeDatabase, db } from "../../src/db";
import { mailMessages } from "../../src/db/schema";
import { cleanupMailFixtures, guardMailFixtures, seedMail } from "./helpers/task13-mail";

test.beforeEach(async ({ page }) => {
  await stubExternalSites(page);
});

test.beforeEach(guardMailFixtures);
test.afterEach(cleanupMailFixtures);
test.afterAll(() => closeDatabase());

test("emails triage dismisses a message and undo restores it", async ({ page }) => {
  const subject = `Interview test ${Date.now()}`;
  const mailId = await seedMail({ subject, classification: "INTERVIEW" });
  await page.goto(`/inbox?view=attention&q=${encodeURIComponent(subject)}`);
  await expect(page).toHaveURL(/\/applications\?emails=1$/);
  const updates = page.getByRole("region", { name: /^Replies we couldn't match/ });
  const message = updates.getByRole("link", { name: subject, exact: true });
  await expect(message).toBeVisible();
  await updates
    .getByRole("listitem")
    .filter({ hasText: subject })
    .getByRole("button", { name: "Dismiss", exact: true })
    .click();
  await expect(page.getByRole("status").filter({ hasText: "Dismissed 1 message." })).toBeVisible();
  await expect(message).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "Undo last dismiss" }).click();
  await expect(message).toBeVisible();
  expect(
    (await db.select().from(mailMessages).where(eq(mailMessages.id, mailId)))[0].attentionState,
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
  await expect(page.getByRole("link", { name: /Applications sent$/ })).toHaveAttribute(
    "href",
    "/applications",
  );
  await expect(page.getByRole("link", { name: "Emails", exact: true })).toHaveAttribute(
    "href",
    "/applications?emails=1",
  );
  await expect(page.locator("a").filter({ hasText: "Refresh your inboxes" })).toHaveAttribute(
    "href",
    "/applications?emails=1",
  );
  for (const label of ["Interview stage", "Offers"]) {
    await expect(page.getByRole("link", { name: new RegExp(`${label}$`) })).toHaveAttribute(
      "href",
      "/applications",
    );
  }
  for (const path of [
    "/",
    "/find",
    "/jobs",
    "/resumes",
    "/resume-prompt",
    "/applications",
    "/applications?open=00000000-0000-4000-8000-000000000000",
    "/my-profile",
    "/applications?emails=1",
  ]) {
    await page.goto(path);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  }
  expect(errors).toEqual([]);
});
