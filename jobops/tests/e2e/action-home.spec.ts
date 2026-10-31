import { stubExternalSites } from "./helpers/external-sites";
import { expect, test } from "@playwright/test";
import { closeDatabase } from "../../src/db";
import { cleanupMailFixtures, guardMailFixtures } from "./helpers/task13-mail";

test.beforeEach(async ({ page }) => {
  await stubExternalSites(page);
});

test.beforeEach(guardMailFixtures);
test.afterEach(cleanupMailFixtures);
test.afterAll(() => closeDatabase());

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
    "/mail",
  );
  await expect(page.locator("a").filter({ hasText: "Fetch new mail" })).toHaveAttribute(
    "href",
    "/mail",
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
    "/mail",
  ]) {
    await page.goto(path);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  }
  expect(errors).toEqual([]);
});
