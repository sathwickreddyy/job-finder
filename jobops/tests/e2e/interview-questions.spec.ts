import { expect, test } from "@playwright/test";
import { closeDatabase, db } from "../../src/db";
import { applicationRounds } from "../../src/db/schema";
import { stubExternalSites } from "./helpers/external-sites";
import { hydrated } from "./helpers/hydration";
import { cleanupRecords, seedRecord } from "./helpers/records";

test.beforeEach(async ({ page }) => stubExternalSites(page));
test.afterEach(cleanupRecords);
test.afterAll(closeDatabase);

test("adds, edits and deletes an interview question on a round", async ({ page }) => {
  const company = `Questions Co ${Date.now()}`;
  const { applicationId } = await seedRecord({
    company,
    source: "DIRECT",
    sentDaysAgo: 5,
    status: "TECHNICAL_INTERVIEW",
  });
  await db.insert(applicationRounds).values({
    applicationId,
    kind: "DSA",
    position: 1,
    scheduledAt: new Date(Date.now() - 3_600_000),
  });
  await page.goto(`/applications/${applicationId}`);
  await expect(page.getByRole("heading", { name: "Round 1 · DSA" })).toBeVisible();

  const add = page.getByRole("button", { name: "Add a question" });
  await hydrated(add);
  await add.click();
  await page.getByRole("textbox", { name: "Question title" }).fill("Minimum window substring");
  await page.getByRole("radio", { name: "Solved, finished aloud" }).click();
  const patterns = page.getByRole("textbox", { name: "Add a pattern" });
  await patterns.fill("Sliding window");
  await patterns.press("Enter");
  await page.getByRole("tab", { name: "How I answered" }).click();
  const editor = page.getByRole("textbox", { name: "How I answered, Markdown" });
  await editor.click();
  await page.keyboard.type("```python\ndef solve(s, t):\n    return ''\n```");
  await expect(page.locator(".md-view pre code.hljs")).toBeVisible();
  await page.keyboard.press("ControlOrMeta+s");
  await expect(page.getByText("Question saved.")).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();

  const row = page.getByText("Minimum window substring", { exact: true });
  await expect(row).toBeVisible();
  await expect(page.getByText("Solved, finished aloud")).toBeVisible();

  await row.click();
  await expect(page.getByText("How I answered")).toBeVisible();
  await page.getByRole("button", { name: "Edit question" }).click();
  await page
    .getByRole("textbox", { name: "Question title" })
    .fill("Minimum window substring (LC 76)");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Question saved.")).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("Minimum window substring (LC 76)")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add a question" })).toBeVisible();
});

test("the question editor stacks its panes on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { applicationId } = await seedRecord({
    company: `Phone Questions ${Date.now()}`,
    source: "DIRECT",
    sentDaysAgo: 5,
    status: "TECHNICAL_INTERVIEW",
  });
  await db.insert(applicationRounds).values({ applicationId, kind: "LLD", position: 1 });
  await page.goto(`/applications/${applicationId}`);
  const add = page.getByRole("button", { name: "Add a question" });
  await hydrated(add);
  await add.click();
  const markdown = page.getByRole("textbox", { name: "What they asked, Markdown" });
  await expect(markdown).toBeVisible();
  const editorBox = await markdown.boundingBox();
  const preview = await page.getByText("Nothing written yet.").boundingBox();
  expect(preview!.y).toBeGreaterThan(editorBox!.y + editorBox!.height - 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
