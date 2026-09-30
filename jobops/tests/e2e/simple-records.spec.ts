import { expect, test } from "@playwright/test";

test("a saved job supports resume prompts, referral records and a separate direct application", async ({
  page,
}) => {
  const suffix = Date.now();
  const company = `Browser Record ${suffix}`;
  const description = "Build reliable Kafka and PostgreSQL services in Bengaluru, India.";
  await page.goto("/jobs/new");
  await page.getByLabel("Company", { exact: true }).fill(company);
  await page.getByLabel("Role / title").fill("Backend Engineer");
  await page
    .getByLabel("Original job URL")
    .fill(`https://www.naukri.com/job-listings/browser-${suffix}`);
  await page.getByLabel("Job description", { exact: true }).fill(description);
  await page.getByRole("button", { name: "Save job", exact: true }).click();
  await expect(page).toHaveURL(/\/jobs\/[0-9a-f-]+$/);
  const jobId = new URL(page.url()).pathname.split("/").at(-1)!;
  await expect(
    page.getByRole("heading", { name: "Job description", exact: true }).locator(".."),
  ).toContainText(description);
  await page.getByRole("link", { name: "Review my resume", exact: true }).click();
  await expect(page.getByRole("region", { name: "Your complete prompt" })).toContainText(
    description,
  );
  await page.goto(`/outreach?job=${jobId}`);
  await page.getByLabel("Resume file used").selectOption({ index: 1 });
  await page.getByLabel("What happened?").selectOption("sent");
  await page.getByRole("button", { name: "Save outreach record" }).click();
  await expect(page).toHaveURL(/\/applications\/[0-9a-f-]+$/);
  const referralPath = new URL(page.url()).pathname;
  await expect(page.locator(".timeline")).toContainText("Referral recorded as sent");
  await expect(page.getByText("Sent", { exact: true })).toBeVisible();
  await page.goto("/applications?view=applied");
  await expect(page.getByRole("heading", { name: company, exact: true })).toHaveCount(0);
  await page.goto(`/applications/new?jobId=${jobId}`);
  await page.getByLabel("Resume file used").selectOption({ index: 1 });
  await page.getByLabel("What happened?").selectOption("sent");
  await page.getByRole("button", { name: "Save application record" }).click();
  await expect(page).toHaveURL(/\/applications\/[0-9a-f-]+$/);
  await expect(page.locator(".timeline")).toContainText("Direct application recorded as sent");
  await expect(page.getByLabel("Resume version used")).toHaveCount(0);
  await page.getByLabel("Application stage", { exact: true }).selectOption("TECHNICAL_INTERVIEW");
  await page.getByRole("button", { name: "Save application", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Application saved");
  await page.goto("/applications?view=applied");
  await expect(page.getByRole("heading", { name: company, exact: true })).toHaveCount(1);
  await page.goto(referralPath);
  await expect(page.getByText("Sent", { exact: true })).toBeVisible();
});

test("removed workflow routes redirect and old agent endpoints reject access", async ({
  page,
  request,
}) => {
  for (const path of ["/tasks/new", "/missions/new", "/agent-guide"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/find$/);
  }
  const response = await request.get("/api/v1/tasks/00000000-0000-4000-8000-000000000999");
  expect(response.status()).toBe(410);
});
