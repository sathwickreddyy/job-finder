import { stubExternalSites } from "./helpers/external-sites";
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await stubExternalSites(page);
});

test("spacious home leads directly to a complete editable discovery prompt", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Your profiles" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your search in numbers" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Find openings/ }).last()).toBeVisible();
  await expect(page.getByText("Agent API access", { exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "Find openings", exact: false }).last().click();
  await expect(page).toHaveURL(/\/find$/);
  await page.getByRole("button", { name: "Copy prompt", exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("Naukri");
  await page.getByRole("button", { name: "Edit prompt", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Edit complete prompt" })
    .fill("Find Indian backend openings matching my known skills.");
  await page.getByRole("button", { name: "Copy prompt", exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "Find Indian backend openings matching my known skills.",
  );
  for (const path of ["/", "/find", "/my-profile"]) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(path);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
});

test("saved preferences and profile links persist and appear in the real home", async ({
  page,
}) => {
  const suffix = Date.now();
  const name = `Portfolio ${suffix}`;
  const url = `https://example.invalid/portfolio/${suffix}`;
  const preference = `Prefer backend ownership in India ${suffix}`;
  await page.goto("/my-profile");
  const add = page.locator("#add-link");
  await add.getByLabel("Profile name").fill(name);
  await add.getByLabel("Profile URL").fill(url);
  await add
    .getByLabel("What would you like to improve or showcase?")
    .fill("Explain my project contribution with a working demo.");
  await add.getByRole("button", { name: "Save profile link" }).click();
  await expect(add.getByRole("status")).toContainText("Profile link saved");
  const prefs = page.locator("#preferences");
  await prefs.getByLabel("My working preferences").fill(preference);
  await prefs.getByRole("button", { name: "Save preferences" }).click();
  await expect(prefs.getByRole("status")).toContainText("Preferences saved");
  await page.reload();
  await expect(page.getByLabel("My working preferences")).toHaveValue(preference);
  await page.goto("/");
  await expect(
    page
      .locator("article")
      .filter({ has: page.getByRole("heading", { name, exact: true }) })
      .getByRole("link", { name: `Open ${name} in a new tab`, exact: true }),
  ).toHaveAttribute("href", url);
  await page.goto("/find");
  await expect(page.getByRole("region", { name: "Your complete prompt" })).toContainText(
    preference,
  );
  await page.goto("/settings");
  await expect(page.getByText("Agent API access", { exact: true })).toHaveCount(0);
});
