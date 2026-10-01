import { stubExternalSites } from "./helpers/external-sites";
import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await stubExternalSites(page);
});

test("bulk JSON preview catches rows, skips duplicates and preserves changed snapshots", async ({
  page,
}) => {
  const company = `Browser Import ${Date.now()}`,
    job = {
      company,
      title: "Backend Engineer",
      location: "Bengaluru",
      url: `https://example.com/careers/${Date.now()}`,
      source: "COMPANY_CAREERS",
      description: "Java PostgreSQL",
    };
  await page.goto("/import/jobs");
  await page
    .getByLabel("Job records", { exact: true })
    .fill(JSON.stringify([{ ...job, url: "javascript:bad" }]));
  await page.getByRole("button", { name: "Validate and preview" }).click();
  await expect(page.getByText(/url: Use a valid/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Import validated jobs" })).toBeDisabled();
  await page.getByLabel("Job records", { exact: true }).fill(JSON.stringify([job, job]));
  await page.getByRole("button", { name: "Validate and preview" }).click();
  await expect(page.getByText("Duplicate of row 1", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Import validated jobs" }).click();
  await expect(page.getByRole("status")).toContainText("Imported 1 new jobs; merged 0; skipped 1");
  await page.goto("/import/jobs");
  await page
    .getByLabel("Job records", { exact: true })
    .fill(JSON.stringify([{ ...job, description: "Java PostgreSQL Kafka" }]));
  await page.getByRole("button", { name: "Validate and preview" }).click();
  await expect(page.getByRole("link", { name: "Existing job" })).toBeVisible();
  await page.getByLabel("Duplicate strategy").selectOption("merge");
  await page.getByRole("button", { name: "Import validated jobs" }).click();
  await expect(page.getByRole("status")).toContainText("merged 1");
  await page.getByRole("link", { name: "Existing job" }).click();
  await page.locator("summary").filter({ hasText: "Notes and saved description history" }).click();
  await expect(
    page.getByRole("heading", { name: "Snapshot history (2)", exact: true }),
  ).toBeVisible();
  const response = await page.request.get("/api/export?entity=jobs&format=json");
  expect(response.ok()).toBe(true);
  expect(
    (await response.json()).records.some((r: { company: string }) => r.company === company),
  ).toBe(true);
});
test("navigation and URL-persisted filters remain usable on small screens", async ({ page }) => {
  await page.goto("/jobs?status=SHORTLISTED");
  await expect(page.getByLabel("Job status", { exact: true })).toHaveValue("SHORTLISTED");
  await page.locator("summary").filter({ hasText: "Filter by company or status" }).click();
  await page.getByRole("button", { name: "Filter jobs" }).click();
  await expect(page).toHaveURL(/status=SHORTLISTED/);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("link", { name: "Home", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1, name: "Demo", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /Find openings/ }).last()).toBeVisible();
  await expect(
    page.getByRole("link", { name: "My sites & profile", exact: true }).first(),
  ).toBeVisible();
  await page.goto("/today");
  await expect(page).toHaveURL(/\/$/);
});

test("same-batch merge uses the final description and preserves omitted metadata", async ({
  page,
}) => {
  const suffix = Date.now();
  const company = `Browser Batch ${suffix}`;
  const first = {
    company,
    title: "Integration Engineer",
    location: "Pune",
    source: "LINKEDIN",
    employmentType: "CONTRACT",
    url: `https://example.com/batch/${suffix}`,
    description: "Python",
  };
  const second = { company, title: first.title, url: first.url, description: "Kafka" };
  await page.goto("/import/jobs");
  await page.getByLabel("Job records", { exact: true }).fill(JSON.stringify([first, second]));
  await page.getByRole("button", { name: "Validate and preview" }).click();
  await page.getByLabel("Duplicate strategy").selectOption("merge");
  await page.getByRole("button", { name: "Import validated jobs" }).click();
  await expect(page.getByRole("status")).toContainText("Imported 1 new jobs; merged 1");
  const response = await page.request.get("/api/export?entity=jobs&format=json");
  const records = (await response.json()).records as {
    id: string;
    company: string;
    location: string;
    source: string;
    employmentType: string;
    description: string;
    snapshots: unknown[];
  }[];
  const record = records.find((r) => r.company === company)!;
  expect(record.location).toBe("Pune");
  expect(record.source).toBe("LINKEDIN");
  expect(record.employmentType).toBe("CONTRACT");
  expect(record.description).toBe("Kafka");
  expect(record.snapshots).toHaveLength(2);
  await page.goto(`/jobs/${record.id}`);
  await expect(
    page
      .getByRole("heading", { name: "Job description", exact: true })
      .locator("..")
      .locator("p.whitespace-pre-wrap"),
  ).toHaveText("Kafka");
  await page.goto(`/jobs?q=Kafka&company=${encodeURIComponent(company)}`);
  await expect(
    page
      .getByRole("link")
      .filter({ has: page.getByRole("heading", { name: first.title, exact: true }) }),
  ).toBeVisible();
});
