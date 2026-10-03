import { stubExternalSites } from "./helpers/external-sites";
import { istDay } from "./helpers/records";
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await stubExternalSites(page);
});

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
  await expect(page.getByRole("region", { name: "History" })).toContainText(
    "Referral recorded as sent",
  );
  await expect(page.getByText("Sent", { exact: true })).toBeVisible();
  await page.goto("/applications");
  await expect(
    page.getByRole("group", { name: company, exact: true }).getByTestId("lane-status"),
  ).toHaveText(/^Referral ask/);
  await page.goto(`/applications/new?jobId=${jobId}`);
  await page.getByLabel("Resume file used").selectOption({ index: 1 });
  await page.getByLabel("What happened?").selectOption("sent");
  await page.getByRole("button", { name: "Save application record" }).click();
  await expect(page).toHaveURL(/\/applications\/[0-9a-f-]+$/);
  await expect(page.getByRole("region", { name: "History" })).toContainText(
    "Direct application recorded as sent",
  );
  await expect(page.getByLabel("Resume version used")).toHaveCount(0);
  await page.getByRole("button", { name: "Round scheduled", exact: true }).click();
  await page.getByLabel("Round", { exact: true }).selectOption("DSA");
  await page.getByLabel("Date (India time)").fill(istDay(5));
  await page.getByLabel("Time", { exact: true }).fill("11:00");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("region", { name: "History" })).toContainText("DSA round scheduled");
  await expect(page.getByTestId("phase-label")).toHaveText(/Interviewing/);
  await page.goto("/applications");
  const lane = page.getByRole("group", { name: company, exact: true });
  await expect(lane).toHaveCount(1);
  await expect(lane.getByTestId("lane-status")).toHaveText("Interviewing · round 1");
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

test("a prepared action becomes sent in the same record with its actual date", async ({ page }) => {
  const jobId = "00000000-0000-4000-8000-000000000100";
  await page.goto(`/outreach?job=${jobId}`);
  await page.getByLabel("Resume file used").selectOption({ index: 1 });
  await page.getByRole("button", { name: "Save outreach record" }).click();
  await expect(page).toHaveURL(/\/applications\/[a-f0-9-]+$/);
  const plannedPath = new URL(page.url()).pathname;
  await page.getByRole("link", { name: "Open outreach prompt", exact: true }).click();
  await expect(page).toHaveURL(/record=[a-f0-9-]+/);
  await expect(page.getByLabel("Resume file used")).not.toHaveValue("");
  await page.getByLabel("What happened?").selectOption("sent");
  await page.locator("summary").filter({ hasText: "Date, destination and notes" }).click();
  await page.getByLabel("Date sent (India time)").fill(istDay(-3));
  await page.getByRole("button", { name: "Save outreach record" }).click();
  await expect(page).toHaveURL(new RegExp(plannedPath + "$"));
  await expect(page.getByText("Sent", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "History" })).toContainText(istDay(-3));
  await page.reload();
  await expect(page.getByLabel("What happened?")).toHaveCount(0);

  await page.goto(`/applications/new?jobId=${jobId}`);
  await expect(page.getByRole("combobox", { name: "Opening", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Save application record" }).click();
  await expect(page).toHaveURL(/\/applications\/[a-f0-9-]+$/);
  await page.getByLabel("Date sent (India time)").fill(istDay(-3));
  await page
    .getByRole("checkbox", { name: "I confirm I already submitted or sent this myself." })
    .check();
  await page.getByRole("button", { name: "Record as sent", exact: true }).click();
  await expect(page.getByTestId("phase-label")).toHaveText("Applied");
  await expect(page.getByRole("status").filter({ hasText: "Recorded as sent." })).toBeVisible();
  await page.reload();
  await expect(page.getByText(`Applied ${istDay(-3)}`, { exact: true })).toBeVisible();
  await expect(page.getByLabel("Date sent (India time)")).toHaveCount(0);
});
