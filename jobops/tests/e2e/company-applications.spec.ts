import { expect, test } from "@playwright/test";
import { eq, inArray } from "drizzle-orm";
import { closeDatabase, db } from "../../src/db";
import { applicationRounds, applications, resumes, resumeVersions } from "../../src/db/schema";
import { stubExternalSites } from "./helpers/external-sites";
import { hydrated, openDetails } from "./helpers/hydration";
import { cleanupRecords, seedRecord } from "./helpers/records";
import { cleanupMailFixtures, guardMailFixtures, seedMail } from "./helpers/task13-mail";

test.beforeEach(guardMailFixtures);
test.beforeEach(async ({ page }) => stubExternalSites(page));
const resumeFamilies: string[] = [];
test.afterEach(async () => {
  await cleanupMailFixtures();
  await cleanupRecords();
  if (!resumeFamilies.length) return;
  await db.delete(resumeVersions).where(inArray(resumeVersions.resumeId, resumeFamilies));
  await db.delete(resumes).where(inArray(resumes.id, resumeFamilies));
  resumeFamilies.length = 0;
});
test.afterAll(closeDatabase);

/** An application at a company with no company record, so the minimal page is the company page. */
async function seedWithRound() {
  const company = `Tracking Co ${Date.now()}`;
  const { applicationId } = await seedRecord({
    company,
    source: "DIRECT",
    sentDaysAgo: 5,
    status: "TECHNICAL_INTERVIEW",
  });
  const [round] = await db
    .insert(applicationRounds)
    .values({
      applicationId,
      kind: "DSA",
      position: 1,
      scheduledAt: new Date(Date.now() - 3_600_000),
    })
    .returning();
  return { company, applicationId, roundId: round.id };
}

test("an application link lands on its open row on the company page", async ({ page }) => {
  const { applicationId, company } = await seedWithRound();
  await page.goto(`/applications/${applicationId}`);
  await expect(page).toHaveURL(
    new RegExp(`/companies/[^?#]+\\?open=${applicationId}#application-${applicationId}$`),
  );
  await expect(page.getByRole("heading", { name: company, level: 1 })).toBeVisible();
  const row = page.locator(`#application-${applicationId}`);
  await expect(row).toBeVisible();
  await expect(row.getByRole("button", { expanded: true }).first()).toBeVisible();
  await expect(row.getByTestId("phase-label")).toBeVisible();
});

test("the tracker's round step scrolls to the round card and opens its questions", async ({
  page,
}) => {
  const { applicationId, roundId } = await seedWithRound();
  await page.goto(`/applications/${applicationId}`);
  const row = page.locator(`#application-${applicationId}`);
  await hydrated(row.getByRole("button", { name: "+ Add step" }));
  // The Mail filter hides round cards; a step click shows All again before it scrolls.
  await row.getByRole("button", { name: "Mail", exact: true }).click();
  await expect(page.locator(`#round-${roundId}`)).toHaveCount(0);
  await row.locator('a[href^="#round-"]').first().click();
  await expect(page).toHaveURL(new RegExp(`#round-${roundId}$`));
  const card = page.locator(`#round-${roundId}`);
  await expect(card).toHaveAttribute("data-lit", "");
  await expect(card).not.toHaveAttribute("data-lit", "", { timeout: 4000 });
  await expect(card.getByRole("button", { expanded: true }).first()).toBeVisible();
  await expect(card.getByRole("tab", { name: /Questions/ })).toBeVisible();
  await expect(card).toBeInViewport();
});

test("a booked round's result is recorded from the current-step box, once", async ({ page }) => {
  const { applicationId, roundId } = await seedWithRound();
  await page.goto(`/applications/${applicationId}`);
  const row = page.locator(`#application-${applicationId}`);
  const box = row.getByTestId("current-step");
  await expect(box).toContainText("Round 1 · DSA was on");
  await expect(row.getByRole("button", { name: "Cleared the round" })).toHaveCount(1);
  await expect(box.getByRole("button", { name: "Cleared the round" })).toBeVisible();
  await expect(
    page.locator(`#round-${roundId}`).getByRole("button", { name: "Rescheduled" }),
  ).toHaveCount(0);
  await hydrated(box.getByRole("button", { name: "Cleared the round" }));
  await box.getByRole("button", { name: "Cleared the round" }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator(`#round-${roundId}`)).toContainText("Cleared");
  await expect(row.getByRole("button", { name: "Cleared the round" })).toHaveCount(0);
});

test("notes, details and the résumé preview open from the row", async ({ page }) => {
  const { applicationId } = await seedWithRound();
  const slug = `e2e-${Date.now()}`;
  const [family] = await db.insert(resumes).values({ name: "Tracking resume", slug }).returning();
  resumeFamilies.push(family.id);
  const [version] = await db
    .insert(resumeVersions)
    .values({
      resumeId: family.id,
      versionLabel: "Tracking tailored",
      originalFilename: "tracking.pdf",
      storagePath: `/unused/e2e/${slug}.pdf`,
      fileSize: 1,
      sha256: slug,
    })
    .returning();
  await db
    .update(applications)
    .set({
      resumeVersionId: version.id,
      notes:
        "## Summary\nWhy this role.\n\n## On the form\nNotice period.\n\n## Proof\nShipped it.",
    })
    .where(eq(applications.id, applicationId));
  await page.goto(`/applications/${applicationId}`);
  const row = page.locator(`#application-${applicationId}`);
  await openDetails(row);
  const notes = row.getByRole("region", { name: "Notes", exact: true });
  await hydrated(notes.getByRole("button").first());
  await expect(notes).toContainText("Summary · On the form · Proof");
  await notes.getByRole("button", { name: "Open notes", exact: true }).click();
  const notesDialog = page.getByRole("dialog", { name: "Notes", exact: true });
  await expect(notesDialog.getByText("Why this role.")).toBeVisible();
  for (const name of ["On the form", "Proof"])
    await expect(notesDialog.getByRole("heading", { name })).toBeVisible();
  await notesDialog.getByRole("button", { name: "Edit notes", exact: true }).click();
  const editor = notesDialog.getByRole("textbox", { name: "Notes, Markdown" });
  await expect(editor).toBeVisible();
  // Unsaved edits survive Escape until the discard prompt is accepted.
  await editor.click();
  await page.keyboard.type(" Extra unsaved words.");
  const prompts: string[] = [];
  let accept = false;
  page.on("dialog", (prompt) => {
    prompts.push(prompt.message());
    return accept ? prompt.accept() : prompt.dismiss();
  });
  await page.keyboard.press("Escape");
  await expect(notesDialog).toBeVisible();
  expect(prompts).toEqual(["Discard your unsaved changes to these notes?"]);
  accept = true;
  await page.keyboard.press("Escape");
  await expect(notesDialog).toHaveCount(0);

  await row.getByRole("button", { name: /^Tracking tailored/ }).click();
  const preview = page.getByRole("dialog", { name: /Tracking tailored/ });
  await expect(preview).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(preview).toHaveCount(0);

  await row.getByRole("button", { name: "Edit details" }).click();
  const dialog = page.getByRole("dialog", { name: "Edit details" });
  await dialog.getByLabel("Application page URL").fill("https://example.invalid/apply/42");
  await dialog.getByRole("button", { name: "Save details" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(row.getByRole("link", { name: "https://example.invalid/apply/42" })).toBeVisible();
});

test("+ Add step records an OA in the tracker and the timeline", async ({ page }) => {
  const { applicationId } = await seedRecord({
    company: `Add Step Co ${Date.now()}`,
    source: "DIRECT",
    sentDaysAgo: 2,
  });
  await page.goto(`/applications/${applicationId}`);
  const row = page.locator(`#application-${applicationId}`);
  const add = row.getByRole("button", { name: "+ Add step" });
  await hydrated(add);
  await add.click();
  await row.getByRole("button", { name: "Got an OA", exact: true }).click();
  await row
    .getByLabel("Complete by (India time)")
    .fill(
      new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(
        Date.now() + 3 * 86_400_000,
      ),
    );
  await row.getByRole("button", { name: "Save", exact: true }).click();
  await expect(row.getByText("OA received").first()).toBeVisible();
  const recorded = row.getByText("Recorded", { exact: true }).first();
  await expect(recorded).toBeVisible();
  await expect(row.getByText(/\d{1,2}:\d{2} (am|pm)/).first()).toBeVisible();
});

test("an application at an unlisted company opens on the minimal page", async ({ page }) => {
  const { applicationId, company } = await seedWithRound();
  await page.goto(`/applications/${applicationId}`);
  await expect(page.getByRole("heading", { name: company, level: 1 })).toBeVisible();
  await expect(page.getByText("Not in your Companies list yet.")).toBeVisible();
  await expect(page.getByRole("tab", { name: /^Applications · 1/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Compensation" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
});

test("on a phone the row does not scroll sideways and its facts stack", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { applicationId } = await seedWithRound();
  await page.goto(`/applications/${applicationId}`);
  const row = page.locator(`#application-${applicationId}`);
  await expect(row.getByTestId("phase-label")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  // Below the wide layout the facts collapse into one line; Details reveals the rest.
  const toggle = row.getByRole("button", { name: "Details", exact: true });
  await hydrated(toggle);
  const details = row.getByRole("region", { name: "Details", exact: true });
  await expect(details).toBeHidden();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(details).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("the header fits a 375 px screen without sideways scroll", async ({ page }) => {
  const { applicationId } = await seedWithRound();
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(`/applications/${applicationId}`);
  await expect(page.getByRole("link", { name: "Record application" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  // The quiet menu stays on the line of the header's other actions.
  const mail = await page.getByRole("link", { name: "Company mail" }).boundingBox();
  const more = await page.getByRole("button", { name: "More company actions" }).boundingBox();
  expect(Math.abs(more!.y - mail!.y)).toBeLessThan(4);
});

test("the note composer ignores Enter on whitespace", async ({ page }) => {
  const { applicationId } = await seedWithRound();
  await page.goto(`/applications/${applicationId}`);
  const field = page.getByRole("textbox", { name: "Add a note to this application's history…" });
  await hydrated(field);
  const posts: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST") posts.push(request.url());
  });
  await field.fill("   ");
  await field.press("Enter");
  await page.waitForTimeout(500);
  expect(posts).toEqual([]);
  await expect(field).toHaveValue("   ");
});

/** A company with two open applications and two open emails on no application. */
async function seedTray() {
  const company = `Tray Co ${Date.now()}`;
  const backend = await seedRecord({
    company,
    source: "DIRECT",
    sentDaysAgo: 3,
    title: "Backend Engineer",
  });
  const platform = await seedRecord({
    company,
    source: "DIRECT",
    sentDaysAgo: 2,
    title: "Platform Engineer",
  });
  const key = company.toLowerCase();
  const named = `Thanks for applying ${Date.now()}`;
  const unnamed = `Thanks again ${Date.now()}`;
  await seedMail({
    subject: named,
    classification: "APPLICATION_ACKNOWLEDGEMENT",
    companyKey: key,
    bodyText: "We received your application for Platform Engineer.",
    receivedAt: new Date(Date.now() - 60_000),
  });
  await seedMail({
    subject: unnamed,
    classification: "APPLICATION_ACKNOWLEDGEMENT",
    companyKey: key,
    bodyText: "We received your application.",
    receivedAt: new Date(Date.now() - 120_000),
  });
  return {
    company,
    key,
    backend: backend.applicationId,
    platform: platform.applicationId,
    named,
    unnamed,
  };
}

test("new mail waits in a tray until a role is picked and confirmed", async ({ page }) => {
  const { backend, platform, named, unnamed } = await seedTray();
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto(`/applications/${platform}`);
  const tray = page.locator("#new-mail");
  await expect(tray.getByRole("heading", { name: "2 new emails need a role" })).toBeVisible();
  await expect(tray.getByRole("img", { name: "New" })).toHaveCount(2);
  const line = tray.getByRole("listitem").filter({ hasText: named });
  await expect(line).toContainText("Role in the email: Platform Engineer");
  await expect(tray.getByRole("listitem").filter({ hasText: unnamed })).toContainText(
    "talent@example.invalid",
  );
  // The menu lists the matching application first, then the two other ways out.
  const choose = line.getByRole("button", { name: /^Choose role/ });
  await hydrated(choose);
  await choose.click();
  await expect(choose).toHaveAttribute("aria-expanded", "true");
  const menu = page.locator(`#${await choose.getAttribute("aria-controls")}`);
  await expect(menu.getByRole("button").first()).toContainText("matchPlatform Engineer");
  await expect(menu.getByRole("button", { name: "Just info, no application" })).toBeVisible();
  await expect(menu.getByRole("button", { name: "Place at a date…" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(choose).toBeFocused();
  await expect(menu).toHaveCount(0);
  // Picking a role only selects it: the line shows it and still waits for the button.
  await choose.click();
  await menu.getByRole("button", { name: /Platform Engineer/ }).click();
  await expect(line).toContainText("Role: Platform Engineer");
  await expect(tray.getByRole("img", { name: "New" })).toHaveCount(2);
  await expect(page.locator(`#application-${platform}`)).not.toContainText(named);
  // An acknowledgement suggests no outcome, so the button links it.
  await line.getByRole("button", { name: "Link to this application" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Message linked to your record." }),
  ).toBeVisible();
  await expect(tray.getByRole("heading", { name: "1 new email needs a role" })).toBeVisible();
  await expect(tray.getByText(named)).toHaveCount(0);
  await expect(page.locator(`#application-${platform}`)).toContainText(named);
  await expect(page.locator(`#application-${backend}`)).not.toContainText(named);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("Mark all just info empties the tray into the folded Other company mail", async ({ page }) => {
  const { platform, named, unnamed } = await seedTray();
  await page.goto(`/applications/${platform}`);
  const markAll = page.getByRole("button", { name: "Mark all just info" });
  await hydrated(markAll);
  await markAll.click();
  await expect(page.locator("#new-mail")).toHaveCount(0);
  const fold = page.locator("#unplaced");
  await expect(fold.locator("summary")).toContainText("Other company mail · 2");
  await expect(fold).not.toHaveAttribute("open", "");
  await fold.locator("summary").click();
  await expect(fold.getByText(named)).toBeVisible();
  await expect(fold.getByText(unnamed)).toBeVisible();
  await fold.getByText(named).click();
  const undo = page.getByRole("dialog").getByRole("button", { name: "Undo" });
  await expect(undo).toBeVisible();
  await undo.click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.locator("#new-mail").getByRole("heading")).toContainText("1 new email");
  await expect(fold.locator("summary")).toContainText("Other company mail · 1");
});

test("blocks keep at least 32 px between them", async ({ page }) => {
  const { platform, key } = await seedTray();
  await seedMail({
    subject: `Old note ${Date.now()}`,
    classification: "FOLLOW_UP",
    companyKey: key,
    attentionState: "DONE",
  });
  await page.goto(`/applications/${platform}`);
  const rows = page.getByRole("list", { name: "Applications" });
  const below = async (selector: string) => {
    const a = (await rows.locator("> li").last().boundingBox())!;
    const b = (await page.locator(selector).boundingBox())!;
    return b.y - (a.y + a.height);
  };
  expect(await below("#unplaced")).toBeGreaterThanOrEqual(32);
  const tray = (await page.locator("#new-mail").boundingBox())!;
  const first = (await rows.locator("> li").first().boundingBox())!;
  expect(first.y - (tray.y + tray.height)).toBeGreaterThanOrEqual(32);
});
