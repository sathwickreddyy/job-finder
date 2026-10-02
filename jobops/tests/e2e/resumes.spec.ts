import { stubExternalSites } from "./helpers/external-sites";
import { expect, test } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
async function pdf(text: string) {
  const document = await PDFDocument.create();
  document.addPage().drawText(text);
  return Buffer.from(await document.save());
}
async function upload(page: import("@playwright/test").Page, name: string, bytes: Buffer) {
  await page.goto("/resumes");
  await page.getByRole("button", { name: "Upload a resume", exact: true }).click();
  const form = page.getByRole("dialog", { name: "Upload a resume", exact: true });
  await form.getByLabel("Add this file to").selectOption("new");
  await form.getByLabel("Resume name").fill(name);
  await form
    .getByLabel("PDF file", { exact: true })
    .setInputFiles({ name: "original.pdf", mimeType: "application/pdf", buffer: bytes });
  await form.getByRole("button", { name: "Upload resume", exact: true }).click();
  await expect(page).toHaveURL(/\/resumes\?file=[0-9a-f-]+/);
  return new URL(page.url()).searchParams.get("file")!;
}
const rail = (page: import("@playwright/test").Page) =>
  page.getByRole("navigation", { name: "Resume files" });

test.beforeEach(async ({ page }) => {
  await stubExternalSites(page);
});

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
  const resumeName = `Browser resume ${suffix}`;
  const originalId = await upload(page, resumeName, original);
  const family = rail(page).getByRole("region", { name: resumeName });
  await expect(page.getByRole("heading", { name: "Original", level: 2 })).toBeVisible();
  await expect(family.getByRole("link", { name: /Original/ })).toHaveAttribute(
    "aria-current",
    "true",
  );
  const filePath = await page.locator("iframe").getAttribute("src");
  expect((await (await request.get(filePath!)).body()).equals(original)).toBe(true);
  expect((await (await request.get(`${filePath}?download=1`)).body()).equals(original)).toBe(true);
  await page.getByText("Bullet changes", { exact: true }).click();
  await page
    .getByLabel("Changes for this file")
    .fill("Original wording clarified; no new experience claimed.");
  await page.getByRole("button", { name: "Save bullet changes" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Bullet changes saved" })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Changes for this file")).toHaveValue(
    "Original wording clarified; no new experience claimed.",
  );

  await page.getByText("Assessments", { exact: true }).click();
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
  await expect(page.getByRole("status").filter({ hasText: "Assessment saved" })).toBeVisible();
  await page.goto(`/resumes?file=${originalId}&section=assessments`);
  await expect(page.getByText("78/100", { exact: true })).toBeVisible();
  await page.goto(`/applications/new?jobId=${jobId}`);
  await page.getByLabel("Resume file used").selectOption(originalId);
  await page.getByLabel("What happened?").selectOption("sent");
  await page.getByRole("button", { name: "Save application record" }).click();
  await expect(page).toHaveURL(/\/applications\/[0-9a-f-]+$/);
  await page.goto(`/resumes?file=${originalId}`);
  await page.getByRole("button", { name: "Upload revision", exact: true }).click();
  await page.getByLabel("Version label", { exact: true }).fill("Revised for backend");
  const revised = await pdf("Fictional revised resume: clearer Kafka project bullet");
  await page
    .getByLabel("PDF file", { exact: true })
    .setInputFiles({ name: "revised.pdf", mimeType: "application/pdf", buffer: revised });
  await page.getByText("Bullet changes and default setting", { exact: true }).click();
  await page.getByLabel("Use this as my default file").check();
  await page
    .getByLabel("Bullet changes with this upload")
    .fill("Clarified ownership of the existing Kafka project.");
  await page.getByRole("button", { name: "Upload PDF", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Revised for backend", exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(
    (url) => Boolean(url.searchParams.get("file")) && url.searchParams.get("file") !== originalId,
  );
  const revisedId = new URL(page.url()).searchParams.get("file")!;
  await expect(page.getByLabel("Changes for this file")).toHaveValue(
    "Clarified ownership of the existing Kafka project.",
  );
  await page.getByText("Bullet changes", { exact: true }).click();
  await page.getByLabel("Changes for this file").fill("Unsaved revision-only wording");
  await family.getByRole("link", { name: /Original/ }).click();
  await expect(page).toHaveURL(new RegExp(`file=${originalId}`));
  await expect(page.getByLabel("Changes for this file")).toHaveValue(
    "Original wording clarified; no new experience claimed.",
  );
  await expect(page.getByRole("status").filter({ hasText: "saved" })).toHaveCount(0);
  await family.getByRole("link", { name: /Revised for backend/ }).click();
  await expect(page).toHaveURL(new RegExp(`file=${revisedId}`));
  await expect(page.getByLabel("Changes for this file")).toHaveValue(
    "Clarified ownership of the existing Kafka project.",
  );
  await page.goto(`/resumes?file=${originalId}`);
  await expect(
    page
      .getByRole("region", { name: /^Applications using/ })
      .getByRole("link", { name: new RegExp(company) }),
  ).toBeVisible();
  await page.goto("/resumes");
  await rail(page).getByRole("searchbox", { name: "Search resume files" }).fill(company);
  await expect(rail(page).getByRole("link")).toHaveCount(1);
  await expect(rail(page).getByRole("link")).toContainText("Original");
  expect(
    (await (await request.get(`/api/resumes/${originalId}/file`)).body()).equals(original),
  ).toBe(true);
  await page.goto(jobPath);
  await page.getByText("Notes and saved description history", { exact: true }).click();
  await page
    .getByLabel("Updated job description")
    .fill("Later description asking for an additional Kubernetes skill.");
  await page.getByRole("button", { name: "Save description version" }).click();
  await expect(page.getByRole("status").filter({ hasText: "New snapshot saved" })).toBeVisible();
  await page.goto(`/resumes?file=${originalId}&section=assessments`);
  await expect(page.getByText("78/100", { exact: true })).toBeVisible();
  await expect(page.getByText(/This assessment uses an earlier job description/)).toBeVisible();
  await page.getByText("Job description assessed", { exact: true }).first().click();
  await expect(page.getByText(jobDescription, { exact: true })).toBeVisible();
  await page.locator("summary", { hasText: "More file actions" }).click();
  await page.getByRole("button", { name: "Archive this resume", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Resume family archived" }),
  ).toBeVisible();
  await page.goto("/resumes");
  await rail(page).getByRole("searchbox", { name: "Search resume files" }).fill(resumeName);
  await expect(family).toHaveCount(0);
  await page.getByRole("link", { name: "Include archived resumes", exact: true }).click();
  await rail(page).getByRole("searchbox", { name: "Search resume files" }).fill(resumeName);
  await expect(family.getByRole("link")).toHaveCount(2);
  await expect(family).toContainText("Archived");
  await expect(family).not.toContainText("Default");
  expect(
    (await (await request.get(`/api/resumes/${originalId}/file`)).body()).equals(original),
  ).toBe(true);
});

test("old resume detail links open the matching file in the workspace", async ({ page }) => {
  const bytes = await pdf("Fictional resume for redirect checks");
  const fileId = await upload(page, `Redirect resume ${Date.now()}`, bytes);
  const familyId = (await page.locator("[data-resume-id]").getAttribute("data-resume-id"))!;
  await page.goto(`/resumes/${familyId}?version=${fileId}&tab=changes`);
  await expect(page).toHaveURL(new RegExp(`/resumes\\?file=${fileId}&section=changes$`));
  await expect(page.getByLabel("Changes for this file")).toBeVisible();
  await page.goto(`/resumes/${familyId}?upload=1`);
  await expect(page.getByRole("dialog", { name: "Upload a resume", exact: true })).toBeVisible();
});

test("a parsing failure still preserves the uploaded original", async ({ page, request }) => {
  const bytes = Buffer.from("%PDF-1.7\n%%EOF\n");
  await upload(page, `Damaged PDF ${Date.now()}`, bytes);
  await expect(page.getByText("Text extraction needs review", { exact: true })).toBeVisible();
  await page.getByText("Text extraction needs attention", { exact: true }).click();
  await expect(
    page.getByText(/Text extraction failed. The original PDF was retained/),
  ).toBeVisible();
  const path = await page.locator("iframe").getAttribute("src");
  expect((await (await request.get(path!)).body()).equals(bytes)).toBe(true);
});

test("resume files and upload drawer work on a narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/resumes");
  await expect(page.getByRole("heading", { name: "Your resumes", level: 1 })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole("button", { name: "Upload a resume", exact: true }).click();
  const drawer = page.getByRole("dialog", { name: "Upload a resume", exact: true });
  await drawer.getByLabel("Add this file to").selectOption("new");
  await drawer.getByLabel("Resume name").fill("Unsaved validation check");
  await drawer
    .getByLabel("PDF file", { exact: true })
    .setInputFiles({ name: "wrong.txt", mimeType: "text/plain", buffer: Buffer.from("Not a PDF") });
  await expect(drawer.getByRole("alert")).toHaveText("Choose a PDF file.");
  await expect(drawer.getByRole("button", { name: "Upload resume", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(drawer).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Upload a resume", exact: true })).toBeFocused();
  await rail(page).getByRole("link").first().click();
  await expect(page).toHaveURL(/\/resumes\?file=[0-9a-f-]+/);
  await expect(rail(page)).toBeHidden();
  await expect(page.getByRole("heading", { level: 2 }).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole("link", { name: "All files", exact: true }).click();
  await expect(rail(page)).toBeVisible();
});
