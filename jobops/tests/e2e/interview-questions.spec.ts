import { expect, test } from "@playwright/test";
import { closeDatabase, db } from "../../src/db";
import { applicationRounds, interviewQuestions } from "../../src/db/schema";
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

test("the question library sorts, searches and opens a question in a sheet", async ({ page }) => {
  const tag = Date.now();
  const seeded: { company: string; title: string; day: number; pattern: string }[] = [
    { company: `Library Alpha ${tag}`, title: `Alpha question ${tag}`, day: 6, pattern: "Graphs" },
    {
      company: `Library Beta ${tag}`,
      title: `Beta question ${tag}`,
      day: 1,
      pattern: "Sliding window",
    },
  ];
  for (const item of seeded) {
    const { applicationId } = await seedRecord({
      company: item.company,
      source: "DIRECT",
      sentDaysAgo: 10,
      status: "TECHNICAL_INTERVIEW",
    });
    const [round] = await db
      .insert(applicationRounds)
      .values({
        applicationId,
        kind: "DSA",
        position: 1,
        outcome: "PASSED",
        scheduledAt: new Date(Date.now() - item.day * 86_400_000),
      })
      .returning();
    await db.insert(interviewQuestions).values({
      roundId: round.id,
      position: 1,
      title: item.title,
      patterns: [item.pattern],
      answer: `Answer for ${item.title}`,
      outcome: "SOLVED_CODE",
    });
  }
  await page.setViewportSize({ width: 1024, height: 800 });
  await page.goto("/applications/questions");
  const search = page.getByRole("searchbox", { name: "Search questions" });
  await hydrated(search);
  await search.fill(String(tag));
  const titles = page.locator("tbody button[aria-haspopup=dialog]");
  await expect(titles).toHaveText([`Beta question ${tag}`, `Alpha question ${tag}`]);
  await page.getByRole("button", { name: "Date" }).click();
  await expect(titles).toHaveText([`Alpha question ${tag}`, `Beta question ${tag}`]);
  await search.fill(`Beta question ${tag}`);
  await expect(titles).toHaveText([`Beta question ${tag}`]);

  await titles.first().click();
  const sheet = page.getByRole("dialog", { name: `Beta question ${tag}` });
  await expect(sheet).toContainText(`Answer for Beta question ${tag}`);
  await expect(sheet.getByRole("link", { name: "Open application" })).toHaveAttribute(
    "href",
    /\/applications\/[0-9a-f-]+#round-[0-9a-f-]+/,
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(titles.first()).toBeFocused();

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
