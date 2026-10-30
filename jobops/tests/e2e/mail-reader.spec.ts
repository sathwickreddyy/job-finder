import { expect, test } from "@playwright/test";
import { closeDatabase } from "../../src/db";
import { cleanupRecords } from "./helpers/records";
import { cleanupMailFixtures, guardMailFixtures } from "./helpers/task13-mail";
import { stubExternalSites } from "./helpers/external-sites";

test.beforeEach(guardMailFixtures);
test.beforeEach(async ({ page }) => stubExternalSites(page));
test.afterEach(async () => {
  await cleanupMailFixtures();
  await cleanupRecords();
});
test.afterAll(closeDatabase);

for (const path of [
  "/inbox?view=attention&q=old",
  "/mail?status=REVIEWED",
  "/mail/review?type=INTERVIEW",
]) {
  test(`${path} opens Mail and drops legacy filters`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveURL(/\/mail(\?status=REVIEWED)?$/);
    await expect(page.getByRole("link", { name: "Emails", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await page.goto("/applications?tab=records");
    await expect(page.getByRole("link", { name: "Emails", exact: true })).not.toHaveAttribute(
      "aria-current",
      "page",
    );
  });
}

test("unverified Gmail callback returns to Mail without connecting an inbox", async ({ page }) => {
  const response = await page.request.get("/api/mail/gmail/callback", { maxRedirects: 0 });
  expect(response.status()).toBe(307);
  const destination = new URL(response.headers().location);
  expect(destination.pathname).toBe("/mail");
  expect(destination.searchParams.get("notice")).toContain("could not be verified");
});
