import { expect, test } from "@playwright/test";
import { PDFDocument } from "pdf-lib";

test("city cards follow current resumes while applications preserve the submitted file", async ({
  page,
}) => {
  const suffix = Date.now();
  const name = `Company resume ${suffix}`;
  const role = `Company backend role ${suffix}`;
  const pdf = await PDFDocument.create();
  pdf.addPage().drawText("Fictional resume for the company directory test");
  const bytes = Buffer.from(await pdf.save());
  await page.goto("/resumes");
  await page.locator("#upload").getByLabel("Resume name").fill(name);
  await page
    .locator("#upload")
    .getByLabel("PDF file", { exact: true })
    .setInputFiles({ name: "company-original.pdf", mimeType: "application/pdf", buffer: bytes });
  await page.locator("#upload").getByRole("button", { name: "Upload resume", exact: true }).click();
  await expect(page).toHaveURL(/\/resumes\/[0-9a-f-]+/);
  const familyPath = new URL(page.url()).pathname;
  const familyId = familyPath.split("/").at(-1)!;
  const originalId = new URL(page.url()).searchParams.get("version")!;

  await page.goto("/jobs/new");
  await page.getByLabel("Company", { exact: true }).fill("Amazon India");
  await page.getByLabel("Role / title").fill(role);
  await page.getByLabel("Original job URL").fill(`https://example.invalid/company/${suffix}`);
  await page
    .getByLabel("Job description", { exact: true })
    .fill("Fictional India backend engineering role.");
  await page.getByText("Location and extra details", { exact: true }).click();
  await page.getByLabel("Location", { exact: true }).fill("Bangalore, Karnataka");
  await page.getByRole("button", { name: "Save job", exact: true }).click();
  await expect(page).toHaveURL(/\/jobs\/[0-9a-f-]+$/);
  const jobId = new URL(page.url()).pathname.split("/").at(-1)!;
  await page.goto(`/applications/new?jobId=${jobId}`);
  await page.getByLabel("Resume file used").selectOption(originalId);
  await page.getByLabel("What happened?").selectOption("sent");
  await page.getByRole("button", { name: "Save application record" }).click();
  await expect(page).toHaveURL(/\/applications\/[0-9a-f-]+$/);

  await page.goto("/companies?q=Amazon");
  const bengaluru = page.locator("#bengaluru article");
  const hyderabad = page.locator("#hyderabad article");
  await expect(bengaluru).toHaveCount(1);
  await expect(hyderabad).toHaveCount(1);
  await expect(bengaluru.getByRole("link")).toHaveCount(0);
  await bengaluru.click({ position: { x: 20, y: 20 } });
  await expect(page).toHaveURL(/\/companies\/amazon\?city=Bengaluru$/);
  const applications = page.locator("#applications");
  const bengaluruResume = page.locator("#resume-bengaluru");
  const hyderabadResume = page.locator("#resume-hyderabad");
  await expect(
    applications.locator('a[href^="/applications/"]').filter({ hasText: role }),
  ).toBeVisible();
  await expect(applications.locator(`a[href="${familyPath}?version=${originalId}"]`)).toHaveText(
    "Submitted: company-original.pdf (Original)",
  );
  await bengaluruResume.getByLabel("Resume for Amazon in Bengaluru").selectOption(familyId);
  await bengaluruResume.getByRole("button", { name: "Save resume reference" }).click();
  await expect(bengaluruResume.getByRole("status")).toContainText("Resume linked");
  await page.reload();
  await expect(bengaluruResume.getByLabel("Resume for Amazon in Bengaluru")).toHaveValue(familyId);
  await expect(hyderabadResume.getByLabel("Resume for Amazon in Hyderabad")).toHaveValue("");

  await page.goto(`${familyPath}?upload=1#upload-version`);
  await page.getByLabel("Version label", { exact: true }).fill("Company revision");
  await page
    .getByLabel("PDF file", { exact: true })
    .setInputFiles({ name: "company-revised.pdf", mimeType: "application/pdf", buffer: bytes });
  await page.getByRole("button", { name: "Upload PDF", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Selected version: Company revision", exact: true }),
  ).toBeVisible();
  await page.goto("/companies/amazon?city=Bengaluru");
  await expect(
    bengaluruResume.getByRole("link", { name: "Current resume: Company revision", exact: true }),
  ).toHaveAttribute("href", familyPath);
  await expect(applications.locator(`a[href="${familyPath}?version=${originalId}"]`)).toHaveText(
    "Submitted: company-original.pdf (Original)",
  );
  await bengaluruResume.getByLabel("Resume for Amazon in Bengaluru").selectOption("");
  await bengaluruResume.getByRole("button", { name: "Save resume reference" }).click();
  await expect(bengaluruResume.getByRole("status")).toContainText("Resume reference cleared");
  await page.reload();
  await expect(bengaluruResume.getByLabel("Resume for Amazon in Bengaluru")).toHaveValue("");
});

test("company search and separate city sections work on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/companies");
  await expect(page.locator("#bengaluru article")).toHaveCount(8);
  await expect(page.locator("#hyderabad article")).toHaveCount(6);
  await page.getByRole("searchbox", { name: "Search companies" }).fill("Atlassian");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page).toHaveURL(/q=Atlassian/);
  await expect(page.locator("#bengaluru article")).toHaveCount(1);
  await expect(page.locator("#hyderabad article")).toHaveCount(0);
  await expect(
    page.getByText("No companies match in Hyderabad. Try another search."),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole("link", { name: "View Atlassian in Bengaluru", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/companies\/atlassian\?city=Bengaluru$/);
  await expect(page.getByRole("heading", { name: "Atlassian", exact: true })).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath("company-detail-mobile.png"),
    fullPage: true,
  });
  await expect(page.getByRole("link", { name: "Open careers", exact: true })).toHaveAttribute(
    "href",
    "https://www.atlassian.com/company/careers/all-jobs",
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole("link", { name: "All companies", exact: true }).click();
  await expect(page).toHaveURL(/\/companies$/);
  expect((await page.goto("/companies/not-a-recorded-company"))?.status()).toBe(404);
});
