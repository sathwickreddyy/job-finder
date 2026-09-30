import { expect, test } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
async function pdf(text: string) {
  const document = await PDFDocument.create();
  document.addPage().drawText(text);
  return Buffer.from(await document.save());
}
async function upload(page: import("@playwright/test").Page, name: string, bytes: Buffer) {
  await page.goto("/resumes");
  const form = page.locator("#upload");
  await form.getByLabel("Resume name").fill(name);
  await form
    .getByLabel("PDF file", { exact: true })
    .setInputFiles({ name: "original.pdf", mimeType: "application/pdf", buffer: bytes });
  await form.getByRole("button", { name: "Upload resume", exact: true }).click();
  await expect(page).toHaveURL(/\/resumes\/[0-9a-f-]+/);
  return new URL(page.url()).pathname;
}

test("resume files, bullet changes, exact usage and sourced assessments survive revisions", async ({
  page,
  request,
}) => {
  const suffix = Date.now();
  const company = `Browser Resume Role ${suffix}`;
  const jobDescription = "Build Kafka and PostgreSQL services for an India-based platform team.";
  await page.goto("/jobs/new");
  await page.getByLabel("Company", { exact: true }).fill(company);
  await page.getByLabel("Role / title").fill("Backend Engineer");
  await page.getByLabel("Original job URL").fill(`https://example.invalid/india/${suffix}`);
  await page.getByLabel("Job description", { exact: true }).fill(jobDescription);
  await page.getByRole("button", { name: "Save job", exact: true }).click();
  await expect(page).toHaveURL(/\/jobs\/[0-9a-f-]+$/);
  const jobPath = new URL(page.url()).pathname;
  const jobId = jobPath.split("/").at(-1)!;
  const original = await pdf("Fictional original resume: Kafka PostgreSQL");
  const familyPath = await upload(page, `Browser resume ${suffix}`, original);
  const originalId = new URL(page.url()).searchParams.get("version")!;
  const filePath = await page.locator("iframe").getAttribute("src");
  expect((await (await request.get(filePath!)).body()).equals(original)).toBe(true);
  expect((await (await request.get(`${filePath}?download=1`)).body()).equals(original)).toBe(true);
  await page.getByRole("link", { name: "Bullet changes", exact: true }).click();
  await page
    .getByLabel("Changes for this file")
    .fill("Original wording clarified; no new experience claimed.");
  await page.getByRole("button", { name: "Save bullet changes" }).click();
  await expect(page.getByRole("status")).toContainText("Bullet changes saved");
  await page.reload();
  await expect(page.getByLabel("Changes for this file")).toHaveValue(
    "Original wording clarified; no new experience claimed.",
  );
  await page.getByRole("link", { name: "ATS assessment", exact: true }).click();
  await page.getByLabel("Job description assessed", { exact: true }).selectOption({
    label: await page
      .getByLabel("Job description assessed", { exact: true })
      .locator("option")
      .filter({ hasText: company })
      .innerText(),
  });
  await page.getByLabel("Assessed by").fill("Claude");
  await page.getByLabel("Score out of 100 (optional)").fill("78");
  await page.getByLabel("Scoring method").fill("Specific keyword and formatting rubric");
  await page
    .getByLabel("Findings")
    .fill("Readable file; verify evidence for system design claims.");
  await page.getByRole("button", { name: "Save assessment", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Assessment saved");
  await page.reload();
  await expect(page.getByText("78/100", { exact: true })).toBeVisible();
  await page.goto(`/applications/new?jobId=${jobId}`);
  await page.getByLabel("Resume file used").selectOption(originalId);
  await page.getByLabel("What happened?").selectOption("sent");
  await page.getByRole("button", { name: "Save application record" }).click();
  await expect(page).toHaveURL(/\/applications\/[0-9a-f-]+$/);
  await page.goto(familyPath);
  await page.getByRole("link", { name: "Upload revised PDF", exact: true }).click();
  await page.getByLabel("Version label", { exact: true }).fill("Revised for backend");
  const revised = await pdf("Fictional revised resume: clearer Kafka project bullet");
  await page
    .getByLabel("PDF file", { exact: true })
    .setInputFiles({ name: "revised.pdf", mimeType: "application/pdf", buffer: revised });
  await page
    .getByLabel("Bullet changes with this upload")
    .fill("Clarified ownership of the existing Kafka project.");
  await page.getByRole("button", { name: "Upload PDF", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Selected version: Revised for backend", exact: true }),
  ).toBeVisible();
  const revisedId = new URL(page.url()).searchParams.get("version")!;
  expect(revisedId).not.toBe(originalId);
  await page.getByRole("link", { name: "Bullet changes", exact: true }).click();
  await expect(page.getByLabel("Changes for this file")).toHaveValue(
    "Clarified ownership of the existing Kafka project.",
  );
  await page.goto(`${familyPath}?version=${originalId}&tab=usage`);
  await expect(page.getByRole("heading", { name: company, exact: true })).toBeVisible();
  await page.getByRole("link", { name: "File", exact: true }).click();
  expect(
    (await (await request.get(`/api/resumes/${originalId}/file`)).body()).equals(original),
  ).toBe(true);
  await page.goto(jobPath);
  await page.getByText("Notes and saved description history", { exact: true }).click();
  await page
    .getByLabel("Updated job description")
    .fill("Later description asking for an additional Kubernetes skill.");
  await page.getByRole("button", { name: "Save description version" }).click();
  await expect(page.getByRole("status")).toContainText("New snapshot saved");
  await page.goto(`${familyPath}?version=${originalId}&tab=ats`);
  await expect(page.getByText("78/100", { exact: true })).toBeVisible();
  await expect(page.getByText(/This assessment uses an earlier job description/)).toBeVisible();
  await page.getByText("Job description assessed", { exact: true }).first().click();
  await expect(page.getByText(jobDescription, { exact: true })).toBeVisible();
});

test("a parsing failure still preserves the uploaded original", async ({ page, request }) => {
  const bytes = Buffer.from("%PDF-1.7\n%%EOF\n");
  await upload(page, `Damaged PDF ${Date.now()}`, bytes);
  await page.getByText("Text extraction needs attention", { exact: true }).click();
  await expect(
    page.getByText(/Text extraction failed. The original PDF was retained/),
  ).toBeVisible();
  const path = await page.locator("iframe").getAttribute("src");
  expect((await (await request.get(path!)).body()).equals(bytes)).toBe(true);
});
