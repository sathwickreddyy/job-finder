import { stubExternalSites } from "./helpers/external-sites";
import { expect, test } from "@playwright/test";
import { closeDatabase } from "../../src/db";
import { hydrated } from "./helpers/hydration";
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
  await expect(
    page.getByRole("status").filter({ hasText: "Candidate profile saved" }),
  ).toBeVisible();
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
  // A wide screen names the company Mail opens on in the URL.
  await expect(page).toHaveURL(/\/mail(\?(?:company=[^&]+|view=all))?$/);
  await page.goto(`/mail/${(await captureImportedMail(`e2e-mail-${suffix}`)).id}`);
  await expect(page.getByRole("heading", { level: 2, name: "Needs a home" })).toBeVisible();
  await page.getByText("Place at…").click();
  await page
    .getByLabel("Company or application")
    .selectOption({ value: `application:${applicationId}` });
  await page.getByRole("button", { name: "Place", exact: true }).click();
  await expect(page.getByRole("button", { name: new RegExp(subject) })).toHaveCount(0);
  await page.goto(`/applications/${applicationId}`);
  await expect(page.getByTestId("phase-label")).toHaveText(previousPhase);
  // The placed message shows on the application's own timeline on its company-page row.
  await expect(page.locator(`#application-${applicationId}`)).toContainText(subject);
});

test("a note added from the composer with Enter appears in the timeline, and notes edit in a dialog", async ({
  page,
}) => {
  const { applicationId } = await seedRecord({
    company: `Composer Co ${Date.now()}`,
    source: "DIRECT",
    sentDaysAgo: 1,
  });
  await page.goto(`/applications/${applicationId}`);
  const row = page.locator(`#application-${applicationId}`);
  const composer = row.getByRole("textbox", { name: "Add a note to this application's history…" });
  await hydrated(composer);
  await composer.fill("Spoke with the recruiter");
  await composer.press("Shift+Enter");
  await composer.pressSequentially("about the panel");
  await expect(composer).toHaveValue("Spoke with the recruiter\nabout the panel");
  await composer.press("Enter");
  await expect(row.getByRole("status").filter({ hasText: "Timeline note added." })).toBeVisible();
  await expect(composer).toHaveValue("");
  await expect(row).toContainText("Spoke with the recruiter");

  const notes = row.getByRole("region", { name: "Notes", exact: true });
  await hydrated(notes.getByRole("button", { name: "Open notes", exact: true }));
  await notes.getByRole("button", { name: "Open notes", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Notes", exact: true });
  await dialog.getByRole("button", { name: "Write notes", exact: true }).click();
  await page.getByRole("textbox", { name: "Notes, Markdown" }).click();
  await page.keyboard.type("Ask about the team");
  await page.getByRole("button", { name: "Save notes", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Edit notes", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(notes).toContainText("Ask about the team");
});
