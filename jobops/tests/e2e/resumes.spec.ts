import { expect, test } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";

async function fictionalPdf(text: string) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  doc.addPage().drawText(`Fictional resume for browser verification. ${text}`, {
    x: 40,
    y: 720,
    size: 12,
    font,
  });
  return Buffer.from(await doc.save());
}

test("resume vault preserves real PDFs, edits tags, switches versions and archives a family", async ({
  page,
  request,
}) => {
  const name = `Browser Test Resume ${Date.now()}`;
  await page.goto("/resumes");
  const creation = page.locator("#create-family");
  await creation.getByLabel("Name", { exact: true }).fill(name);
  await creation.getByLabel("Category", { exact: true }).fill("Browser verification");
  await creation.getByLabel("Description").fill("Fictional test data, safe to archive.");
  await creation.getByRole("button", { name: "Create Family", exact: true }).click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  const familyPath = new URL(page.url()).pathname;
  const first = await fictionalPdf("Python, Kafka and PostgreSQL");
  await page.getByLabel("Version label", { exact: true }).fill("Browser v1");
  await page
    .getByLabel("PDF file", { exact: true })
    .setInputFiles({ name: "fictional-v1.pdf", mimeType: "application/pdf", buffer: first });
  await page.getByRole("button", { name: "Upload PDF", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Selected version: Browser v1", exact: true }),
  ).toBeVisible();
  const keywords = page
    .getByRole("heading", { name: "Keywords by category", exact: true })
    .locator("..");
  await expect(keywords).toContainText("PostgreSQL");
  const previewPath = await page
    .getByTitle(`PDF preview of ${name}, Browser v1`, { exact: true })
    .getAttribute("src");
  expect(previewPath).toBeTruthy();
  const preview = await request.get(previewPath!);
  expect(preview.status()).toBe(200);
  expect(preview.headers()["content-type"]).toContain("application/pdf");
  expect(preview.headers()["content-disposition"]).toContain("inline");
  expect((await preview.body()).equals(first)).toBe(true);
  const download = await request.get(`${previewPath}?download=1`);
  expect(download.headers()["content-disposition"]).toContain("attachment");
  expect((await download.body()).equals(first)).toBe(true);
  await page.locator("summary").filter({ hasText: "View Extracted Text" }).click();
  await expect(
    page.locator("pre").filter({ hasText: "Fictional resume for browser verification." }),
  ).toContainText("Python, Kafka and PostgreSQL");
  await page.getByLabel("Keywords", { exact: true }).fill("Python, Kafka, Payment processing");
  await page.getByLabel("Experience tags", { exact: true }).fill("Payments, mentoring");
  await page.getByRole("button", { name: "Save Keywords and Tags", exact: true }).click();
  await expect(keywords).toContainText("Payment processing");

  const second = await fictionalPdf("Go, Kubernetes and Terraform");
  await page.getByLabel("Version label", { exact: true }).fill("Browser v2");
  await page
    .getByLabel("PDF file", { exact: true })
    .setInputFiles({ name: "fictional-v2.pdf", mimeType: "application/pdf", buffer: second });
  await page.getByLabel("Make current", { exact: true }).uncheck();
  await page.getByRole("button", { name: "Upload PDF", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Selected version: Browser v2", exact: true }),
  ).toBeVisible();
  const history = page.getByRole("heading", { name: "Version History", exact: true }).locator("..");
  await expect(history.getByRole("link", { name: "Browser v1", exact: true })).toBeVisible();
  await expect(history.getByRole("link", { name: "Browser v2", exact: true })).toBeVisible();
  await history.getByRole("button", { name: "Set Current Version", exact: true }).click();
  await expect(
    history.getByRole("link", { name: "Browser v2", exact: true }).locator(".."),
  ).toContainText("Current");
  await history.getByRole("link", { name: "Browser v1", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Selected version: Browser v1", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Keywords", { exact: true })).toHaveValue(
    "Python, Kafka, Payment processing",
  );
  await page.getByRole("button", { name: "Archive Family", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Resume family archived." }),
  ).toBeVisible();
  await page.goto(`/resumes?q=${encodeURIComponent(name)}`);
  await expect(
    page.getByRole("heading", { name: "No matching resume families", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Include archived", { exact: true }).check();
  await page.getByRole("button", { name: "Filter", exact: true }).click();
  await expect(page.getByRole("link", { name, exact: true })).toHaveAttribute("href", familyPath);
});

test("a PDF parsing failure retains the original file and permits manual keywords", async ({
  page,
  request,
}) => {
  const name = `Browser Damaged PDF ${Date.now()}`;
  await page.goto("/resumes");
  const creation = page.locator("#create-family");
  await creation.getByLabel("Name", { exact: true }).fill(name);
  await creation.getByRole("button", { name: "Create Family", exact: true }).click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  const damaged = Buffer.from("%PDF-1.7\n%%EOF\n");
  await page.getByLabel("Version label", { exact: true }).fill("Preserved failed extraction");
  await page
    .getByLabel("PDF file", { exact: true })
    .setInputFiles({ name: "damaged.pdf", mimeType: "application/pdf", buffer: damaged });
  await page.getByRole("button", { name: "Upload PDF", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Selected version: Preserved failed extraction",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Text extraction failed. The original PDF was retained." }),
  ).toBeVisible();
  const previewPath = await page
    .getByTitle(`PDF preview of ${name}, Preserved failed extraction`)
    .getAttribute("src");
  const response = await request.get(`${previewPath}?download=1`);
  expect(response.status()).toBe(200);
  expect((await response.body()).equals(damaged)).toBe(true);
  await page.getByLabel("Keywords", { exact: true }).fill("Python, Manual domain term");
  await page.getByRole("button", { name: "Save Keywords and Tags", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Keywords by category" }).locator(".."),
  ).toContainText("Manual domain term");
  await expect(
    page.getByRole("button", { name: "Retry Text Extraction", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Archive Family", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Resume family archived." }),
  ).toBeVisible();
});
