import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { eq, inArray } from "drizzle-orm";
import { closeDatabase, db } from "../../src/db";
import { activityLogs, applications, jobs } from "../../src/db/schema";
import { stubExternalSites } from "./helpers/external-sites";
import { cleanupMailFixtures, guardMailFixtures, seedMail } from "./helpers/task13-mail";

const recorded: { jobs: string[]; applications: string[]; companies: string[] } = {
  jobs: [],
  applications: [],
  companies: [],
};
test.beforeEach(async ({ page }) => {
  await stubExternalSites(page);
});
test.afterEach(async ({ request }) => {
  await cleanupMailFixtures();
  await guardMailFixtures();
  if (recorded.applications.length) {
    await db.delete(activityLogs).where(inArray(activityLogs.entityId, recorded.applications));
    await db.delete(applications).where(inArray(applications.id, recorded.applications));
  }
  if (recorded.jobs.length) await db.delete(jobs).where(inArray(jobs.id, recorded.jobs));
  for (const id of recorded.companies)
    await request.patch(`/api/v1/companies/${id}`, { data: { archive: true } });
  recorded.jobs.length = recorded.applications.length = recorded.companies.length = 0;
});
test.afterAll(closeDatabase);

const status = (page: import("@playwright/test").Page) =>
  page.getByRole("navigation", { name: "Mail status" });

test("needs attention, then just info", async ({ page }) => {
  const subject = `Foundation interview ${randomUUID()}`;
  await seedMail({ subject, classification: "INTERVIEW" });
  await page.goto("/mail");
  await expect(
    status(page).getByRole("button", { name: /^Needs attention \(\d+\)$/ }),
  ).toHaveAttribute("aria-pressed", "true");
  const row = page.getByRole("button", { name: new RegExp(subject) });
  await expect(row).toBeVisible();
  await expect(row.getByText("Application / interview")).toBeVisible();
  await row.click();
  await page.getByRole("button", { name: "Just info", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Marked as just info." })).toBeVisible();
  await expect(page.getByRole("button", { name: new RegExp(subject) })).toHaveCount(0);
  await status(page).getByRole("button", { name: "All mail", exact: true }).click();
  const handled = page.getByRole("button", { name: new RegExp(subject) });
  await expect(handled).toBeVisible();
  await expect(handled.getByText("Handled", { exact: true })).toBeVisible();
});

test("agent record appears on Applications and the company page", async ({ page, request }) => {
  const key = randomUUID().slice(0, 8);
  const name = `Foundation ${key}`;
  const company = await request.post("/api/v1/companies", {
    data: { slug: `e2e-foundation-${key}`, name },
  });
  expect(company.status(), await company.text()).toBe(201);
  recorded.companies.push((await company.json()).id);
  const response = await request.post("/api/v1/applications", {
    data: {
      opening: {
        url: `https://jobs.example.invalid/foundation/${key}`,
        company: name,
        title: `Platform Engineer ${key}`,
      },
      application: { method: "DIRECT" },
      humanConfirmed: true,
    },
  });
  expect(response.status(), await response.text()).toBe(201);
  const result = await response.json();
  recorded.applications.push(result.id);
  const [app] = await db.select().from(applications).where(eq(applications.id, result.id));
  recorded.jobs.push(app.jobId);
  expect(result.links).toEqual({
    application: `/applications/${result.id}`,
    company: `/companies/e2e-foundation-${key}`,
  });
  expect(result.warnings).toContain(
    "Posting date unknown. Verify it before applying to similar openings.",
  );
  await page.goto("/applications");
  await expect(page.getByText(name).first()).toBeVisible();
  await page.goto(`${result.links.company}?tab=progress`);
  await expect(page.getByRole("heading", { name: "Applications (1)" })).toBeVisible();
  await expect(
    page.locator("#applications").getByRole("link", { name: `Platform Engineer ${key}` }),
  ).toBeVisible();
});

test("captures the mail page for review", async ({ page }) => {
  await seedMail({ subject: `Foundation offer ${randomUUID()}`, classification: "OFFER" });
  await seedMail({
    subject: `Foundation outreach ${randomUUID()}`,
    classification: "RECRUITER_OUTREACH",
  });
  await seedMail({ subject: `Foundation rejection ${randomUUID()}`, classification: "REJECTION" });
  for (const theme of ["light", "dark"] as const)
    for (const [width, height] of [
      [375, 812],
      [1440, 900],
    ]) {
      await page.addInitScript((value) => localStorage.setItem("jobops-theme", value), theme);
      await page.setViewportSize({ width, height });
      await page.goto("/mail");
      await expect(status(page)).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      await page.screenshot({
        path: `test-results/mail-foundation/mail-${theme}-${width}.png`,
        fullPage: true,
      });
    }
});
