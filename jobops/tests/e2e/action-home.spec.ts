import { expect, test } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { eq } from "drizzle-orm";
import { closeDatabase, db } from "../../src/db";
import { mailMessages, resumeVersions } from "../../src/db/schema";
import { taskContext } from "../../src/features/tasks/read";

test.beforeEach(() => expect(new URL(process.env.DATABASE_URL!).pathname).toBe("/jobops_e2e"));
test.afterAll(() => closeDatabase());

test("profile context follows an editable custom task through human review", async ({ page }) => {
  const context =
    "Prioritize developer tools in India. Discuss tradeoffs with me before suggesting a role.";
  await page.goto("/my-profile");
  await page.getByLabel("My working preferences").fill(context);
  await page.getByRole("button", { name: "Save preferences", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Preferences saved");
  await page.goto("/");
  const trigger = page.getByRole("button", { name: "Start with your own goal" });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await dialog.getByLabel("Task name", { exact: true }).fill("Explore my next meaningful project");
  await dialog
    .getByLabel("What do you want your assistant to do?")
    .fill("Discuss my existing project ideas and help me choose impactful work to showcase.");
  await dialog.locator("summary").filter({ hasText: "Your preferences for this task" }).click();
  await expect(dialog.getByLabel("Preferences for this task")).toHaveValue(context);
  await dialog
    .getByLabel("Preferences for this task")
    .fill(`${context} Use my existing Claude context.`);
  await dialog.getByRole("button", { name: "Create task", exact: true }).click();
  await expect(page).toHaveURL(/\/tasks\/[a-f0-9-]+$/);
  await page.locator("summary").filter({ hasText: "Handoff instructions" }).click();
  await expect(page.getByLabel("Handoff instructions", { exact: true })).toContainText(
    "Use my existing Claude context.",
  );
  await page.locator("summary").filter({ hasText: "Paste an assistant proposal" }).click();
  await page.getByLabel("Proposal summary", { exact: true }).fill("Discuss these project ideas");
  await page.getByLabel("Proposal JSON", { exact: true }).fill(
    JSON.stringify({
      kind: "NOTE",
      content: "Build on a real project and measure its impact before writing a case study.",
    }),
  );
  await page.getByRole("button", { name: "Add proposal", exact: true }).click();
  await expect(page.getByRole("button", { name: "Accept this result" })).toBeVisible();
  await page.getByRole("button", { name: "Accept this result" }).click();
  await expect(
    page.getByText("Your decision is recorded for this exact proposal.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Accept this result" })).not.toBeVisible();
});

test("public profiles carry improvement notes into a showcase task", async ({ page }) => {
  const name = `Project portfolio ${Date.now()}`;
  await page.goto("/my-profile");
  const details = page
    .locator("details")
    .filter({ has: page.locator("summary", { hasText: "Add a profile or website" }) });
  if (!(await details.evaluate((el) => (el as HTMLDetailsElement).open)))
    await details.locator("summary").click();
  await details.getByLabel("Profile name", { exact: true }).fill(name);
  await details
    .getByLabel("Profile URL", { exact: true })
    .fill("https://example.invalid/my-portfolio");
  await details
    .getByLabel("What would you like to improve or showcase?")
    .fill("Explain the measured impact of my own developer tools project.");
  await details.getByRole("button", { name: "Save profile link" }).click();
  const card = page
    .getByRole("heading", { name, exact: true })
    .locator("xpath=ancestor::section[1]");
  await expect(card).toBeVisible();
  await card.getByRole("link", { name: "Create a showcase" }).click();
  const selectedId = await page.getByLabel("Profile or portfolio", { exact: true }).inputValue();
  expect(selectedId).toBeTruthy();
  await page.getByRole("button", { name: "Create task", exact: true }).click();
  await expect(page).toHaveURL(/\/tasks\/[a-f0-9-]+$/);
  const context = await taskContext(new URL(page.url()).pathname.split("/").at(-1)!);
  expect(context?.profile?.notes).toContain("measured impact");
  await page.goto(`/missions/${context!.task.id}/result`);
  await expect(page).toHaveURL(`/tasks/${context!.task.id}`);
});

test("resume drafts remain separate until reviewed in the task", async ({ page }) => {
  const doc = await PDFDocument.create();
  doc.addPage().drawText("Fictional browser-test resume. TypeScript and PostgreSQL.");
  const buffer = Buffer.from(await doc.save());
  const name = `Hub resume ${Date.now()}`;
  await page.goto("/my-profile");
  const resume = page.locator("#resume");
  await resume.locator("summary").filter({ hasText: "Add a resume" }).click();
  await resume.getByLabel("Resume name", { exact: true }).fill(name);
  await resume
    .getByLabel("Resume PDF", { exact: true })
    .setInputFiles({ name: "original.pdf", mimeType: "application/pdf", buffer });
  await resume.getByRole("button", { name: "Save resume", exact: true }).click();
  await expect(resume.getByRole("heading", { name, exact: true })).toBeVisible();
  await page.goto("/tasks/new?kind=TAILOR");
  const selector = page.getByLabel("Resume", { exact: true });
  const originalId = await selector
    .locator("option")
    .filter({ hasText: name })
    .getAttribute("value");
  await selector.selectOption(originalId!);
  await page.getByRole("button", { name: "Create task", exact: true }).click();
  await expect(page).toHaveURL(/\/tasks\/[a-f0-9-]+$/);
  await page.locator("summary").filter({ hasText: "Upload a proposed resume" }).click();
  await page
    .getByLabel("Proposed PDF", { exact: true })
    .setInputFiles({ name: "proposed.pdf", mimeType: "application/pdf", buffer });
  await page.getByLabel("Revision name", { exact: true }).fill("Reviewed for role");
  await page
    .getByLabel("What changed?", { exact: true })
    .fill("Clarified existing experience without adding skills.");
  await page.getByRole("button", { name: "Upload for review", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Approve resume version", exact: true }),
  ).toBeVisible();
  expect(
    (await db.select().from(resumeVersions).where(eq(resumeVersions.id, originalId!)))[0].isCurrent,
  ).toBe(true);
  await page.getByRole("button", { name: "Approve resume version", exact: true }).click();
  await expect(
    page.getByText("Your decision is recorded for this exact proposal.", { exact: true }),
  ).toBeVisible();
  expect(
    (await db.select().from(resumeVersions).where(eq(resumeVersions.id, originalId!)))[0].isCurrent,
  ).toBe(false);
  await expect(page.getByRole("link", { name: "Open original resume" })).toBeVisible();
});

test("inbox surfaces dated actions and marking done preserves the original message", async ({
  page,
}) => {
  const subject = `Interview test ${Date.now()}`;
  const [mail] = await db
    .insert(mailMessages)
    .values({
      externalId: subject,
      sender: "fictional@example.invalid",
      subject,
      receivedAt: new Date(),
      classification: "INTERVIEW",
      snippet: "Please confirm availability for your interview.",
    })
    .returning();
  await page.goto(`/inbox?view=attention&q=${encodeURIComponent(subject)}`);
  await expect(page.getByRole("heading", { name: "Today", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: subject, exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Mark done", exact: true }).click();
  await expect(page.getByRole("link", { name: subject, exact: true })).not.toBeVisible();
  await page.goto(`/inbox?q=${encodeURIComponent(subject)}`);
  await expect(page.getByRole("link", { name: subject, exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Reopen action", exact: true }).click();
  await expect(page.getByRole("button", { name: "Mark done", exact: true })).toBeVisible();
  expect(
    (await db.select().from(mailMessages).where(eq(mailMessages.id, mail.id)))[0].attentionState,
  ).toBe("OPEN");
});

test("core pages and task drawer fit a phone and preserve the selected theme", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Use colourful light theme", exact: true }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: /Find openings/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(await page.getByRole("dialog").evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
  await page.keyboard.press("Escape");
  for (const path of ["/", "/my-profile", "/opportunities", "/inbox"]) {
    await page.goto(path);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  expect(errors).toEqual([]);
});
