import { expect, test } from "@playwright/test";
import { eq, inArray } from "drizzle-orm";
import { closeDatabase, db } from "../../src/db";
import { applicationRounds, applications, resumes, resumeVersions } from "../../src/db/schema";
import { stubExternalSites } from "./helpers/external-sites";
import { hydrated } from "./helpers/hydration";
import { cleanupRecords, seedRecord } from "./helpers/records";

test.beforeEach(async ({ page }) => stubExternalSites(page));
const resumeFamilies: string[] = [];
test.afterEach(async () => {
  await cleanupRecords();
  if (!resumeFamilies.length) return;
  await db.delete(resumeVersions).where(inArray(resumeVersions.resumeId, resumeFamilies));
  await db.delete(resumes).where(inArray(resumes.id, resumeFamilies));
  resumeFamilies.length = 0;
});
test.afterAll(closeDatabase);

/** An application at a company with no company record, so the minimal page is the company page. */
async function seedWithRound() {
  const company = `Tracking Co ${Date.now()}`;
  const { applicationId } = await seedRecord({
    company,
    source: "DIRECT",
    sentDaysAgo: 5,
    status: "TECHNICAL_INTERVIEW",
  });
  const [round] = await db
    .insert(applicationRounds)
    .values({
      applicationId,
      kind: "DSA",
      position: 1,
      scheduledAt: new Date(Date.now() - 3_600_000),
    })
    .returning();
  return { company, applicationId, roundId: round.id };
}

test("an application link lands on its open row on the company page", async ({ page }) => {
  const { applicationId, company } = await seedWithRound();
  await page.goto(`/applications/${applicationId}`);
  await expect(page).toHaveURL(
    new RegExp(`/companies/[^?#]+\\?open=${applicationId}#application-${applicationId}$`),
  );
  await expect(page.getByRole("heading", { name: company, level: 1 })).toBeVisible();
  const row = page.locator(`#application-${applicationId}`);
  await expect(row).toBeVisible();
  await expect(row.getByRole("button", { expanded: true }).first()).toBeVisible();
  await expect(row.getByTestId("phase-label")).toBeVisible();
});

test("the tracker's round step scrolls to the round card and opens its questions", async ({
  page,
}) => {
  const { applicationId, roundId } = await seedWithRound();
  await page.goto(`/applications/${applicationId}`);
  const row = page.locator(`#application-${applicationId}`);
  await hydrated(row.getByRole("button", { name: "+ Add step" }));
  // The Mail filter hides round cards; a step click shows All again before it scrolls.
  await row.getByRole("button", { name: "Mail", exact: true }).click();
  await expect(page.locator(`#round-${roundId}`)).toHaveCount(0);
  await row.locator('a[href^="#round-"]').first().click();
  await expect(page).toHaveURL(new RegExp(`#round-${roundId}$`));
  const card = page.locator(`#round-${roundId}`);
  await expect(card).toHaveAttribute("data-lit", "");
  await expect(card).not.toHaveAttribute("data-lit", "", { timeout: 4000 });
  await expect(card.getByRole("button", { expanded: true }).first()).toBeVisible();
  await expect(card.getByRole("tab", { name: /Questions/ })).toBeVisible();
  await expect(card).toBeInViewport();
});

test("notes, details and the résumé preview open from the row", async ({ page }) => {
  const { applicationId } = await seedWithRound();
  const slug = `e2e-${Date.now()}`;
  const [family] = await db.insert(resumes).values({ name: "Tracking resume", slug }).returning();
  resumeFamilies.push(family.id);
  const [version] = await db
    .insert(resumeVersions)
    .values({
      resumeId: family.id,
      versionLabel: "Tracking tailored",
      originalFilename: "tracking.pdf",
      storagePath: `/unused/e2e/${slug}.pdf`,
      fileSize: 1,
      sha256: slug,
    })
    .returning();
  await db
    .update(applications)
    .set({
      resumeVersionId: version.id,
      notes:
        "## Summary\nWhy this role.\n\n## On the form\nNotice period.\n\n## Proof\nShipped it.",
    })
    .where(eq(applications.id, applicationId));
  await page.goto(`/applications/${applicationId}`);
  const row = page.locator(`#application-${applicationId}`);
  const notes = row.getByRole("region", { name: "Notes", exact: true });
  await hydrated(notes.getByRole("button").first());
  await notes.getByRole("button", { name: /^Notes/ }).click();
  await expect(notes.getByText("Why this role.")).toBeVisible();
  for (const name of ["On the form", "Proof"])
    await expect(notes.getByRole("heading", { name })).toBeVisible();
  await notes.getByRole("button", { name: "Edit notes", exact: true }).click();
  await expect(notes.getByRole("textbox", { name: "Notes, Markdown" })).toBeVisible();

  await row.getByRole("button", { name: /^Tracking tailored/ }).click();
  const preview = page.getByRole("dialog", { name: /Tracking tailored/ });
  await expect(preview).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(preview).toHaveCount(0);

  await row.getByRole("button", { name: "Edit details" }).click();
  const dialog = page.getByRole("dialog", { name: "Edit details" });
  await dialog.getByLabel("Application page URL").fill("https://example.invalid/apply/42");
  await dialog.getByRole("button", { name: "Save details" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(row.getByRole("link", { name: "https://example.invalid/apply/42" })).toBeVisible();
});

test("+ Add step records an OA in the tracker and the timeline", async ({ page }) => {
  const { applicationId } = await seedRecord({
    company: `Add Step Co ${Date.now()}`,
    source: "DIRECT",
    sentDaysAgo: 2,
  });
  await page.goto(`/applications/${applicationId}`);
  const row = page.locator(`#application-${applicationId}`);
  const add = row.getByRole("button", { name: "+ Add step" });
  await hydrated(add);
  await add.click();
  await row.getByRole("button", { name: "Got an OA", exact: true }).click();
  await row
    .getByLabel("Complete by (India time)")
    .fill(
      new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(
        Date.now() + 3 * 86_400_000,
      ),
    );
  await row.getByRole("button", { name: "Save", exact: true }).click();
  await expect(row.getByText("OA received").first()).toBeVisible();
  const recorded = row.getByText("Recorded", { exact: true }).first();
  await expect(recorded).toBeVisible();
  await expect(row.getByText(/\d{1,2}:\d{2} (am|pm)/).first()).toBeVisible();
});

test("an application at an unlisted company opens on the minimal page", async ({ page }) => {
  const { applicationId, company } = await seedWithRound();
  await page.goto(`/applications/${applicationId}`);
  await expect(page.getByRole("heading", { name: company, level: 1 })).toBeVisible();
  await expect(page.getByText("Not in your Companies list yet.")).toBeVisible();
  await expect(page.getByRole("tab", { name: /^Applications · 1/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Compensation" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
});

test("on a phone the row does not scroll sideways and its facts stack", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { applicationId } = await seedWithRound();
  await page.goto(`/applications/${applicationId}`);
  const row = page.locator(`#application-${applicationId}`);
  await expect(row.getByTestId("phase-label")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const facts = row.locator("dl > div");
  const first = await facts.nth(0).boundingBox();
  const last = await facts.nth(3).boundingBox();
  // Two columns on a phone: the fourth fact sits below the first.
  expect(last!.y).toBeGreaterThan(first!.y + first!.height - 1);
});
