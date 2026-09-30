import { expect, test } from "@playwright/test";

test("candidate answers preserve explicit UNKNOWN", async ({ page }) => {
  await page.goto("/settings");
  await page.getByLabel("Standard application answers").fill(JSON.stringify({ "Do you require sponsorship?": "UNKNOWN", "Are you authorized to work in India?": "" }));
  await page.getByRole("button", { name: "Save candidate profile", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Candidate profile saved");
  await page.reload();
  const answers = JSON.parse(await page.getByLabel("Standard application answers").inputValue()) as Record<string, string>;
  expect(answers["Do you require sponsorship?"]).toBe("UNKNOWN");
  expect(answers["Are you authorized to work in India?"]).toBe("UNKNOWN");
});

test("profile differences become an explicit update mission", async ({ page }) => {
  const suffix = Date.now().toString();
  await page.goto("/profiles/new");
  await page.getByLabel("Display name").fill(`Test portal ${suffix}`);
  await page.getByLabel("Profile URL", { exact: true }).fill(`https://example.invalid/profile/${suffix}`);
  await page.getByLabel("Known state (JSON)").fill(JSON.stringify({ headline: "Engineer", skills: ["Java"] }));
  await page.getByLabel("Target state (JSON)").fill(JSON.stringify({ headline: "Senior Engineer", skills: ["Java", "Kafka"], workAuthorization: "UNKNOWN" }));
  await page.getByRole("button", { name: "Create profile", exact: true }).click();
  await expect(page).toHaveURL(/\/profiles\/[0-9a-f-]+$/);
  await expect(page.getByRole("heading", { name: "Known → target differences" })).toBeVisible();
  await expect(page.locator("table")).toContainText("Senior Engineer");
  await expect(page.locator("table")).not.toContainText("workAuthorization");
  await page.getByRole("link", { name: "Create update mission", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Explicit profile differences" })).toBeVisible();
  await page.getByRole("button", { name: "Create mission", exact: true }).click();
  await expect(page).toHaveURL(/\/missions\/[0-9a-f-]+$/);
  await page.getByRole("link", { name: "Agent view", exact: true }).click();
  await expect(page.getByText("Senior Engineer", { exact: false }).first()).toBeVisible();
});

test("contact verification records evidence and company filters", async ({ page }) => {
  const suffix = Date.now().toString();
  await page.goto("/contacts/new?company=Orbit%20Ledger%20(Demo)");
  await page.getByLabel("Name", { exact: true }).fill(`Recruiter ${suffix}`);
  await page.getByLabel("Role / title").fill("Engineering recruiter");
  await page.getByLabel("Email (optional)").fill(`recruiter-${suffix}@example.invalid`);
  await page.getByLabel("Public source").fill("https://example.invalid/team");
  await page.getByLabel("Verification status").selectOption("MANUAL_VERIFIED");
  await page.getByLabel("Verification evidence / source").fill("Public company team directory checked manually");
  await page.getByRole("button", { name: "Create contact", exact: true }).click();
  await expect(page).toHaveURL(/\/contacts\/[0-9a-f-]+$/);
  await expect(page.getByRole("heading", { name: `Recruiter ${suffix}`, exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Jobs at Orbit Ledger (Demo)", exact: true })).toBeVisible();
  await page.goto(`/contacts?q=${encodeURIComponent(`Recruiter ${suffix}`)}`);
  await expect(page.getByRole("link", { name: `Recruiter ${suffix}`, exact: true })).toBeVisible();
});

test("mail import requires review and appends timeline without changing stage", async ({ page }) => {
  const suffix = Date.now().toString();
  const applicationId = "00000000-0000-4000-8000-000000000300";
  const subject = `Thank you for applying ${suffix}`;
  await page.goto(`/applications/${applicationId}`);
  const previousStage = await page.getByLabel("Application stage").inputValue();
  await page.goto("/mail/import");
  await page.getByLabel("Messages (JSON array)").fill(JSON.stringify([{ externalId: `e2e-mail-${suffix}`, sender: "recruiting@example.invalid", subject, receivedAt: new Date().toISOString(), bodyText: "We received your application at Harbor Compute (Demo)." }]));
  await page.getByRole("button", { name: "Import and classify messages", exact: true }).click();
  await expect(page).toHaveURL(/\/mail$/);
  await page.getByRole("link", { name: subject, exact: true }).click();
  await expect(page).toHaveURL(/\/mail\/[0-9a-f-]+$/);
  await expect(page.getByRole("button", { name: "Append reviewed event", exact: true })).toBeVisible();
  await page.getByLabel("Link to application").selectOption(applicationId);
  await page.getByRole("button", { name: "Append reviewed event", exact: true }).click();
  await expect(page.getByText("This proposal was manually reviewed.", { exact: true })).toBeVisible();
  await page.goto(`/applications/${applicationId}`);
  await expect(page.getByLabel("Application stage")).toHaveValue(previousStage);
  await expect(page.locator(".timeline")).toContainText(subject);
  await page.goto("/mail?status=REVIEWED");
  await expect(page.getByRole("link", { name: subject, exact: true })).toBeVisible();
});
