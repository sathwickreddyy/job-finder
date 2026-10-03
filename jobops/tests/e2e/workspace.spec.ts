import { stubExternalSites } from "./helpers/external-sites";
import { expect, test } from "@playwright/test";
import { closeDatabase } from "../../src/db";
import { cleanupRecords, seedRecord } from "./helpers/records";
import { captureImportedMail, cleanupMailFixtures, guardMailFixtures } from "./helpers/task13-mail";
test.beforeEach(guardMailFixtures);
test.afterEach(async () => {
  await cleanupMailFixtures();
  await cleanupRecords();
});
test.afterAll(closeDatabase);

test.beforeEach(async ({ page }) => {
  await stubExternalSites(page);
});

test("candidate answers preserve explicit UNKNOWN", async ({ page }) => {
  await page.goto("/settings");
  await page.getByLabel("Standard application answers").fill(
    JSON.stringify({
      "Do you require sponsorship?": "UNKNOWN",
      "Are you authorized to work in India?": "",
    }),
  );
  await page.getByRole("button", { name: "Save candidate profile", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Candidate profile saved");
  await page.reload();
  const answers = JSON.parse(
    await page.getByLabel("Standard application answers").inputValue(),
  ) as Record<string, string>;
  expect(answers["Do you require sponsorship?"]).toBe("UNKNOWN");
  expect(answers["Are you authorized to work in India?"]).toBe("UNKNOWN");
});

test("profile improvement prompt includes the saved link and showcase notes", async ({ page }) => {
  const suffix = Date.now();
  const name = `Project portfolio ${suffix}`;
  const url = `https://example.invalid/portfolio/${suffix}`;
  await page.goto("/my-profile");
  const add = page.locator("#add-link");
  await add.getByLabel("Profile name").fill(name);
  await add.getByLabel("Profile URL").fill(url);
  await add
    .getByLabel("What would you like to improve or showcase?")
    .fill("Show the measured impact of my developer tools project.");
  await add.getByRole("button", { name: "Save profile link" }).click();
  await expect(add.getByRole("status")).toContainText("Profile link saved");
  const card = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name, exact: true }) })
    .last();
  await card.getByRole("link", { name: "Open improvement prompt" }).click();
  await expect(page.getByRole("region", { name: "Your complete prompt" })).toContainText(url);
  await expect(page.getByRole("region", { name: "Your complete prompt" })).toContainText(
    "measured impact",
  );
});

test("contact verification records evidence and company filters", async ({ page }) => {
  const suffix = Date.now().toString();
  await page.goto("/contacts/new?company=Orbit%20Ledger%20(Demo)");
  await page.getByLabel("Name", { exact: true }).fill(`Recruiter ${suffix}`);
  await page.getByLabel("Role / title").fill("Engineering recruiter");
  await page.getByLabel("Email (optional)").fill(`recruiter-${suffix}@example.invalid`);
  await page.getByLabel("Public source").fill("https://example.invalid/team");
  await page.getByLabel("Verification status").selectOption("MANUAL_VERIFIED");
  await page
    .getByLabel("Verification evidence / source")
    .fill("Public company team directory checked manually");
  await page.getByRole("button", { name: "Create contact", exact: true }).click();
  await expect(page).toHaveURL(/\/contacts\/[0-9a-f-]+$/);
  await expect(
    page.getByRole("heading", { name: `Recruiter ${suffix}`, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Jobs at Orbit Ledger (Demo)", exact: true }),
  ).toBeVisible();
  await page.goto(`/contacts?q=${encodeURIComponent(`Recruiter ${suffix}`)}`);
  await expect(page.getByRole("link", { name: `Recruiter ${suffix}`, exact: true })).toBeVisible();
});

test("linking imported mail appends history without changing the application phase", async ({
  page,
}) => {
  const suffix = Date.now().toString();
  const { applicationId } = await seedRecord({
    company: `Imported Mail Co ${suffix}`,
    source: "DIRECT",
    sentDaysAgo: 3,
  });
  const subject = `Application update ${suffix}`;
  await page.goto(`/applications/${applicationId}`);
  const previousPhase = await page.getByTestId("phase-label").innerText();
  await page.goto("/mail/import");
  await page.getByLabel("Messages (JSON array)").fill(
    JSON.stringify([
      {
        externalId: `e2e-mail-${suffix}`,
        sender: "recruiting@example.invalid",
        subject,
        receivedAt: new Date().toISOString(),
        bodyText: "Following up on your application with next steps.",
      },
    ]),
  );
  await page.getByRole("button", { name: "Import and classify messages", exact: true }).click();
  await expect.poll(() => captureImportedMail(`e2e-mail-${suffix}`)).toBeTruthy();
  await expect(page).toHaveURL(/\/applications\?tab=emails$/);
  await page.getByRole("link", { name: subject, exact: true }).click();
  await expect(page).toHaveURL(/\/mail\/[0-9a-f-]+$/);
  await page.getByLabel("Record for this message").selectOption(applicationId);
  await page.getByRole("button", { name: "Link and update", exact: true }).click();
  await expect(page.getByText(`Linking mail: ${subject}`)).toBeVisible();
  await page.getByRole("button", { name: "Link without recording an outcome" }).click();
  await expect(page.getByText("Message linked to your record.", { exact: true })).toBeVisible();
  await page.goto(`/applications/${applicationId}`);
  await expect(page.getByTestId("phase-label")).toHaveText(previousPhase);
  await expect(page.getByRole("region", { name: "History" })).toContainText(subject);
});
