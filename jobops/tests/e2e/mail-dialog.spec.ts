import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { closeDatabase, db } from "../../src/db";
import { mailMessages } from "../../src/db/schema";
import { stubExternalSites } from "./helpers/external-sites";
import { hydrated } from "./helpers/hydration";
import { cleanupRecords, seedRecord } from "./helpers/records";
import { cleanupMailFixtures, guardMailFixtures, seedMail } from "./helpers/task13-mail";

test.beforeEach(guardMailFixtures);
test.beforeEach(async ({ page }) => stubExternalSites(page));
test.afterEach(async () => {
  await cleanupMailFixtures();
  await cleanupRecords();
});
test.afterAll(closeDatabase);

const row = (page: Page, subject: string) =>
  page.locator(`button[data-mail-row]`, { hasText: subject });

async function threeEmails() {
  const tag = randomUUID().slice(0, 8);
  const company = `Popup Co ${tag}`;
  await seedRecord({ company, source: "DIRECT", sentDaysAgo: 3 });
  const subjects = ["Newest", "Middle", "Oldest"].map((name) => `${name} ${tag}`);
  const ids: string[] = [];
  for (const [index, subject] of subjects.entries())
    ids.push(
      await seedMail({
        subject,
        classification: "INTERVIEW",
        attentionState: "DONE",
        companyKey: company.toLowerCase(),
        receivedAt: new Date(Date.now() - (index + 1) * 3_600_000),
        bodyText: `${subject} body.\nSee https://example.invalid/round for details.`,
      }),
    );
  return { company, subjects, ids };
}

test("every email opens in a focused popup and returns focus to its row", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 520 });
  const { company, subjects } = await threeEmails();
  await page.goto(`/mail?${new URLSearchParams({ company })}`);
  const first = row(page, subjects[0]);
  await hydrated(first);
  await expect(page.locator("[data-mail-row][aria-expanded]")).toHaveCount(0);

  await page.evaluate(() => window.scrollTo(0, 120));
  const before = await page.evaluate(() => window.scrollY);
  await first.click();
  const dialog = page.getByRole("dialog", { name: subjects[0] });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(`${subjects[0]} body.`);
  await expect(dialog.getByRole("link", { name: "https://example.invalid/round" })).toHaveAttribute(
    "rel",
    "noreferrer",
  );
  await page.mouse.wheel(0, 400);
  expect(await page.evaluate(() => window.scrollY)).toBe(before);

  await dialog.getByRole("button", { name: "Next email" }).click();
  await expect(page.getByRole("dialog", { name: subjects[1] })).toBeVisible();
  await page.getByRole("button", { name: "Previous email" }).click();
  await expect(page.getByRole("dialog", { name: subjects[0] })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(first).toBeFocused();
  expect(await page.evaluate(() => window.scrollY)).toBe(before);
});

test("a ?mail= link opens that email over the page", async ({ page }) => {
  const { company, subjects, ids } = await threeEmails();
  await page.goto(`/mail?${new URLSearchParams({ company, mail: ids[2] })}`);
  const dialog = page.getByRole("dialog", { name: subjects[2] });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(`${subjects[2]} body.`);
  await hydrated(dialog.getByRole("button", { name: "Close" }));
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("Unlink is offered on a company row's email popup, not on the Mail page", async ({ page }) => {
  const tag = randomUUID().slice(0, 8);
  const company = `Unlink Co ${tag}`;
  const { applicationId } = await seedRecord({ company, source: "DIRECT", sentDaysAgo: 3 });
  const subject = `Linked ${tag}`;
  const id = await seedMail({
    subject,
    classification: "INTERVIEW",
    attentionState: "DONE",
    companyKey: company.toLowerCase(),
  });
  await db
    .update(mailMessages)
    .set({ linkedApplicationId: applicationId })
    .where(eq(mailMessages.id, id));
  const unlink = (scope: Page) =>
    scope.getByRole("dialog").getByRole("button", { name: "Unlink from this application" });
  await page.goto(`/mail?${new URLSearchParams({ company, mail: id })}`);
  await expect(page.getByRole("dialog", { name: subject })).toBeVisible();
  await expect(unlink(page)).toHaveCount(0);

  await page.goto(`/applications/${applicationId}?mail=${id}`);
  await expect(page.getByRole("dialog", { name: subject })).toBeVisible();
  await hydrated(unlink(page));
  await unlink(page).click();
  await expect(page).toHaveURL(new RegExp(`/companies/[^?#]+\\?open=${applicationId}&notice=`));
  await expect(
    page.getByRole("status").filter({ hasText: "Recorded outcomes and history were kept." }),
  ).toBeVisible();
});
