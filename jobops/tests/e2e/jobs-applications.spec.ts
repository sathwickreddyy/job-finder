import { test, expect } from "@playwright/test";
test("manual job, snapshot, application stage and timeline", async ({ page }) => {
  const company = `Browser Manual ${Date.now()}`;
  await page.goto("/jobs/new");
  await page.getByLabel("Company", { exact: true }).fill(company);
  await page.getByLabel("Role / title").fill("Senior Platform Engineer");
  await page.getByLabel("Location", { exact: true }).fill("Pune");
  await page
    .getByLabel("Original job URL")
    .fill(`https://example.com/jobs/${encodeURIComponent(company)}`);
  await page
    .getByLabel("Job description", { exact: true })
    .fill("Python PostgreSQL Kafka Docker distributed systems");
  await page.getByRole("button", { name: "Save job", exact: true }).click();
  await expect(page).toHaveURL(/\/jobs\/[0-9a-f-]+$/);
  await expect(
    page.getByRole("heading", { name: "Senior Platform Engineer", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Job status", { exact: true }).selectOption("SHORTLISTED");
  await page.getByRole("button", { name: "Save job status" }).click();
  await expect(page.getByRole("status")).toHaveText("Job saved.");
  await page.getByRole("button", { name: "Save keyword comparisons" }).click();
  await expect(
    page.getByText("Keyword comparisons saved for current resume versions."),
  ).toBeVisible();
  await page.getByRole("link", { name: "Create application", exact: true }).click();
  await page.getByLabel("Resume version used").selectOption({ index: 1 });
  await page.getByRole("button", { name: "Create application", exact: true }).click();
  await expect(page).toHaveURL(/\/applications\/[0-9a-f-]+$/);
  await page.getByLabel("Application stage", { exact: true }).selectOption("APPLIED");
  await page.getByRole("button", { name: "Save application", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Confirm that final submission" }),
  ).toContainText("approved");
  await page.getByRole("checkbox", { name: /I confirm/ }).check();
  await page.getByRole("button", { name: "Save application", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Application saved and event appended.");
  await expect(
    page.getByRole("heading", { name: "Application Submitted", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Timeline note")
    .fill("Spoke to fictional recruiter about the platform role.");
  await page.getByRole("button", { name: "Add timeline note" }).click();
  await expect(
    page.getByText("Spoke to fictional recruiter about the platform role.", { exact: true }),
  ).toBeVisible();
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
  await page.getByRole("button", { name: "Filter jobs" }).click();
  await expect(page).toHaveURL(/status=SHORTLISTED/);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("link", { name: "Today", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Today", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Find today’s jobs", exact: true })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Inspect Naukri profile", exact: true }).first(),
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
  await expect(page.getByRole("link", { name: first.title, exact: true })).toBeVisible();
});
