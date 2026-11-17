import { expect, test, type Page } from "@playwright/test";
import { closeDatabase } from "../../src/db";
import { stubExternalSites } from "./helpers/external-sites";
import { hydrated } from "./helpers/hydration";
import { cleanupRecords, istDay, seedRecord } from "./helpers/records";
import {
  captureSavedJob,
  cleanupMailFixtures,
  guardMailFixtures,
  seedMail,
} from "./helpers/task13-mail";

test.beforeEach(async ({ page }) => {
  await stubExternalSites(page);
});
test.beforeEach(() => expect(new URL(process.env.DATABASE_URL!).pathname).toBe("/jobops_e2e"));
test.beforeEach(guardMailFixtures);
test.afterEach(async () => {
  await cleanupMailFixtures();
  await cleanupRecords();
});
test.afterAll(() => closeDatabase());

/** Opens the tracker's + Add step panel, which offers the outcomes that add a step. */
async function openAddStep(page: Page) {
  const toggle = page.getByRole("button", { name: "+ Add step", exact: true });
  await hydrated(toggle);
  await toggle.click();
}

test("recording outcomes walks an application from OA to an accepted offer", async ({ page }) => {
  const company = `Ladder Labs ${Date.now()}`;
  const { applicationId } = await seedRecord({ company, source: "DIRECT", sentDaysAgo: 2 });
  await page.goto(`/applications/${applicationId}`);
  const row = page.locator(`#application-${applicationId}`);
  const phase = row.getByTestId("phase-label");
  const save = () => row.getByRole("button", { name: "Save", exact: true }).click();
  // New steps sit under + Add step; results sit on each round's own card.
  const addStep = async (name: string) => {
    const toggle = row.getByRole("button", { name: "+ Add step", exact: true });
    const chip = row.getByRole("button", { name, exact: true });
    await hydrated(toggle);
    // Saving leaves the panel open with its confirmation, so the toggle is only pressed once.
    if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
    await expect(chip).toBeVisible();
    await chip.click();
  };
  const rounds = row.locator('li[id^="round-"]');
  // The booked round's result is recorded from the current-step box, not the round's card.
  const roundResult = async (name: string) => {
    await row.getByTestId("current-step").getByRole("button", { name, exact: true }).click();
    await save();
  };
  await expect(phase).toHaveText("Applied");
  await row.getByRole("button", { name: "Set a follow-up", exact: true }).click();
  await page.getByLabel("Follow-up date").fill(istDay(2));
  await page.getByLabel("What to do").fill("Check the careers portal");
  await page.getByRole("button", { name: "Save follow-up", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Follow-up saved." })).toBeVisible();
  await expect(page.getByLabel("Follow-up date")).toHaveCount(0);
  await row.getByRole("button", { name: /^Follow up on/ }).click();
  await expect(page.getByLabel("What to do")).toHaveValue("Check the careers portal");
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Follow-up cleared." })).toBeVisible();
  await expect(row.getByRole("button", { name: "Set a follow-up", exact: true })).toBeVisible();
  await page.reload();
  await expect(row.getByRole("button", { name: "Set a follow-up", exact: true })).toBeVisible();

  await addStep("Got an OA");
  await page.getByLabel("Complete by (India time)").fill(istDay(3));
  await page.getByLabel("Name (optional)").fill("HackerRank");
  await save();
  await expect(page.getByRole("status").filter({ hasText: "Saved: Got an OA." })).toBeVisible();
  await expect(row).toContainText("OA received");
  await expect(row).toContainText("11:59 pm");
  await expect(page.getByLabel("Complete by (India time)")).toHaveCount(0);
  await expect(phase).toContainText("OA");

  await roundResult("Cleared the round");
  await expect(row).toContainText("Cleared the OA round");

  await addStep("Round scheduled");
  await page.getByLabel("Round", { exact: true }).selectOption("LLD");
  await page.getByLabel("Date (India time)").fill(istDay(5));
  await page.getByLabel("Time", { exact: true }).fill("11:00");
  const longName = "MachineCoding".repeat(12);
  await page.getByLabel("Name (optional)").fill(longName);
  await page.getByLabel("Note (optional)").fill("Keep this note after validation");
  const happened = page.getByLabel("When it happened");
  await happened.evaluate((element) => element.removeAttribute("max"));
  await happened.fill(istDay(1));
  await save();
  await expect(
    page.getByRole("alert").filter({ hasText: "cannot be in the future" }),
  ).toBeVisible();
  await expect(page.getByLabel("Note (optional)")).toHaveValue("Keep this note after validation");
  await expect(page.getByLabel("Name (optional)")).toHaveValue(longName);
  await happened.fill(istDay());
  await save();
  await expect(row).toContainText("LLD round scheduled");
  await row
    .getByTestId("current-step")
    .getByRole("button", { name: "Rescheduled", exact: true })
    .click();
  await expect(page.getByLabel("Date (India time)")).toHaveValue(istDay(5));
  await expect(page.getByLabel("Time", { exact: true })).toHaveValue("11:00");
  await page.getByLabel("Date (India time)").fill(istDay(6));
  await page.getByLabel("Time", { exact: true }).fill("12:30");
  await save();
  await expect(row).toContainText("LLD round moved");
  await page.setViewportSize({ width: 390, height: 844 });
  const editRound = rounds.filter({ hasText: "LLD" });
  if ((await editRound.getByRole("button", { expanded: true }).count()) === 0)
    await editRound.getByRole("button").first().click();
  await editRound.getByRole("button", { name: "Edit round", exact: true }).click();
  await editRound.getByLabel("Round notes").fill("Prepare idempotency examples");
  await editRound.getByRole("button", { name: "Save round", exact: true }).click();
  await editRound.getByRole("tab", { name: "Round notes" }).click();
  await expect(editRound).toContainText("Prepare idempotency examples");
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
  await page.reload();
  await expect(rounds.filter({ hasText: "LLD" })).toBeVisible();
  // Notes are written in the Notes fold as Markdown; Edit details holds the record's fields.
  const notes = row.getByRole("region", { name: "Notes", exact: true });
  await notes.getByRole("button", { name: /^Notes/ }).click();
  await notes.getByRole("button", { name: "Write notes", exact: true }).click();
  await page.getByRole("textbox", { name: "Notes, Markdown" }).click();
  await page.keyboard.type("Ask about on-call");
  await page.getByRole("button", { name: "Save notes", exact: true }).click();
  await expect(notes.getByRole("button", { name: "Edit notes", exact: true })).toBeVisible();
  await row.getByRole("button", { name: "Edit details", exact: true }).click();
  await page.getByLabel("Application page URL").fill("https://example.invalid/application/123");
  await page.getByRole("button", { name: "Save details", exact: true }).click();
  await expect(notes).toContainText("Ask about on-call");
  await expect(
    row.getByRole("link", { name: "https://example.invalid/application/123" }),
  ).toHaveAttribute("href", "https://example.invalid/application/123");
  // The saving overlay keeps the page inert for a moment after Edit details; typing into an
  // inert field is silently dropped, so wait for it to lift.
  await page.waitForFunction(() => !document.querySelector("[inert]"));
  await hydrated(row.getByRole("button", { name: "Add note", exact: true }));
  await row.getByLabel("Add to history").fill("Discussed system design preparation");
  await row.getByRole("button", { name: "Add note", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Timeline note added." })).toBeVisible();
  await expect(row).toContainText("Discussed system design preparation");
  await expect(row.getByRole("button", { name: "Got an offer", exact: true })).toHaveCount(0);

  await roundResult("Cleared the round");
  await addStep("Got an offer");
  await save();
  await expect(phase).toHaveText("Offer");
  await addStep("Accepted the offer");
  await save();
  await expect(
    page.getByRole("status").filter({ hasText: "Saved: Accepted the offer." }),
  ).toBeVisible();
  await expect(phase).toHaveText("Accepted");
  await expect(rounds.getByText("Cleared", { exact: true })).toHaveCount(2);
  await expect(row.getByRole("button", { name: "Rejected", exact: true })).toHaveCount(0);
});

test("a quiet referral asks for a follow-up on its lane and recording one restarts its clock", async ({
  page,
}) => {
  const company = `Quiet Co ${Date.now()}`;
  const { applicationId } = await seedRecord({
    company,
    source: "REFERRAL",
    sentDaysAgo: 6,
    contact: "Fictional Contact",
  });
  await page.goto("/applications");
  const row = page.getByRole("group", { name: company, exact: true });
  await expect(row.getByTestId("lane-status")).toHaveText("Referral ask · 6 days quiet");
  await row.getByRole("link", { name: /^I followed up/ }).click();
  await expect(page).toHaveURL(
    new RegExp(`/companies/[^?#]+\\?open=${applicationId}&outcome=followup`),
  );
  const open = page.locator(`#application-${applicationId}`);
  await expect(open.getByRole("button", { name: "Sent a follow-up", exact: true })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await open.getByRole("button", { name: "Save", exact: true }).click();
  // The row stays open after saving, with the follow-up on its timeline.
  await expect(
    page.getByRole("status").filter({ hasText: "Saved: Sent a follow-up." }),
  ).toBeVisible();
  await expect(open.getByText("Recorded", { exact: true }).first()).toBeVisible();
  await page.goto("/applications");
  await expect(
    page.getByRole("group", { name: company, exact: true }).getByTestId("lane-status"),
  ).toHaveText("Referral ask · 0 of 5 days");
});

test("a follow-up date for today puts the company under Needs you", async ({ page }) => {
  const company = `Follow Up Co ${Date.now()}`;
  const note = `Check portal ${company}`;
  const { applicationId } = await seedRecord({ company, source: "DIRECT", sentDaysAgo: 1 });
  await page.goto(`/applications/${applicationId}`);
  await page.getByRole("button", { name: "Set a follow-up", exact: true }).click();
  await page.getByLabel("Follow-up date").fill(istDay());
  await page.getByLabel("What to do").fill(note);
  await page.getByRole("button", { name: "Save follow-up", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Follow up on/ })).toBeVisible();
  await page.goto("/applications");
  const row = page.getByRole("group", { name: company, exact: true });
  await expect(row.getByText("Today", { exact: true })).toBeVisible();
  await expect(row.getByText(note)).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Needs you" }).getByRole("group", { name: company }),
  ).toBeVisible();
});

test("a record staged by the old dropdown still offers the right next steps", async ({ page }) => {
  const company = `Legacy Stage Co ${Date.now()}`;
  const { applicationId } = await seedRecord({
    company,
    source: "DIRECT",
    sentDaysAgo: 10,
    status: "TECHNICAL_INTERVIEW",
  });
  await page.goto(`/applications/${applicationId}`);
  await expect(page.getByTestId("phase-label")).toHaveText("Interviewing");
  await openAddStep(page);
  await expect(page.getByRole("button", { name: "Round scheduled", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Got an offer", exact: true })).toBeVisible();
  await page.goto("/applications");
  await expect(
    page.getByRole("group", { name: company, exact: true }).getByTestId("lane-status"),
  ).toHaveText("Interviewing");
});

test("keyboard Cancel restores focus to its outcome chip", async ({ page }) => {
  const { applicationId } = await seedRecord({
    company: `Cancel Focus ${Date.now()}`,
    source: "DIRECT",
    sentDaysAgo: 1,
  });
  await page.goto(`/applications/${applicationId}`);
  await openAddStep(page);
  const chip = page.getByRole("button", { name: "Heard back", exact: true });
  await chip.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Cancel", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Note (optional)")).toHaveCount(0);
  await expect(chip).toBeFocused();
});

for (const outcome of ["Sent a follow-up", "Rejected"]) {
  test(`keyboard outcome save restores focus after ${outcome}`, async ({ page }) => {
    const { applicationId } = await seedRecord({
      company: `Outcome Focus ${outcome} ${Date.now()}`,
      source: "DIRECT",
      sentDaysAgo: 1,
    });
    await page.goto(`/applications/${applicationId}`);
    if (outcome === "Rejected") await openAddStep(page);
    const chip = page.getByRole("button", { name: outcome, exact: true });
    await chip.focus();
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: "Save", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("status").filter({ hasText: `Saved: ${outcome}.` })).toBeVisible();
    await expect(page.getByLabel("Note (optional)")).toHaveCount(0);
    if (outcome === "Rejected") {
      await expect(chip).toHaveCount(0);
      await expect(page.getByRole("region", { name: "Progress", exact: true })).toBeFocused();
    } else {
      await expect(chip).toBeFocused();
    }
  });
}

for (const clear of [false, true]) {
  test(`keyboard follow-up ${clear ? "clear" : "save"} restores focus to its toggle`, async ({
    page,
  }) => {
    const { applicationId } = await seedRecord({
      company: `Follow-up Focus ${Date.now()}`,
      source: "DIRECT",
      sentDaysAgo: 1,
    });
    await page.goto(`/applications/${applicationId}`);
    if (clear) {
      await page.getByRole("button", { name: "Set a follow-up", exact: true }).click();
      await page.getByLabel("Follow-up date").fill(istDay(2));
      await page.getByRole("button", { name: "Save follow-up", exact: true }).click();
      await expect(page.getByLabel("Follow-up date")).toHaveCount(0);
    }
    const toggle = page.getByRole("button", { name: clear ? /^Follow up on/ : "Set a follow-up" });
    await toggle.focus();
    // The previous save can still leave the page inert while its popup fades out.
    await expect(toggle).toBeFocused();
    await page.keyboard.press("Enter");
    if (!clear) await page.getByLabel("Follow-up date").fill(istDay(2));
    await page
      .getByRole("button", { name: clear ? "Clear" : "Save follow-up", exact: true })
      .focus();
    await page.keyboard.press("Enter");
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: clear ? "Follow-up cleared." : "Follow-up saved." }),
    ).toBeVisible();
    await expect(page.getByLabel("Follow-up date")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: clear ? "Set a follow-up" : /^Follow up on/ }),
    ).toBeFocused();
  });
}

test("keyboard Preparing success restores focus to Progress", async ({ page }) => {
  const { applicationId } = await seedRecord({
    company: `Preparing Focus ${Date.now()}`,
    source: "DIRECT",
    sentDaysAgo: null,
  });
  await page.goto(`/applications/${applicationId}`);
  const confirmation = page.getByRole("checkbox", {
    name: "I confirm I already submitted or sent this myself.",
  });
  await confirmation.focus();
  await page.keyboard.press("Space");
  await page.getByRole("button", { name: "Record as sent", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("phase-label")).toHaveText("Applied");
  await expect(page.getByRole("button", { name: "Record as sent", exact: true })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Progress", exact: true })).toBeFocused();
  await page.reload();
  await expect(page.getByTestId("phase-label")).toHaveText("Applied");
  await expect(page.getByLabel("Date sent (India time)")).toHaveCount(0);
});

test("an assessment email asks on its row and records with a date", async ({ page }) => {
  const subject = `Assessment invite ${Date.now()}`;
  const company = `Mail Link Co ${Date.now()}`;
  const { applicationId } = await seedRecord({
    company,
    source: "DIRECT",
    sentDaysAgo: 3,
  });
  await seedMail({ subject, classification: "ASSESSMENT", recordId: applicationId });
  await page.goto("/applications");
  await page
    .getByRole("group", { name: company, exact: true })
    .getByRole("link", { name: /^Link it/ })
    .click();
  const row = page.locator(`#application-${applicationId}`);
  await expect(page.getByText(`From this email: ${subject}`)).toBeVisible();
  await expect(row.getByRole("button", { name: "Got an OA", exact: true })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await hydrated(row.getByRole("button", { name: "Save", exact: true }));
  await page.getByLabel("Complete by (India time)").fill(istDay(4));
  await row.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/companies/[^?#]+\\?open=${applicationId}$`));
  await expect(row.getByTestId("phase-label")).toContainText("OA");
  await expect(row).toContainText(subject);
  await page.goto("/applications");
  await expect(
    page.getByRole("group", { name: company, exact: true }).getByTestId("lane-status"),
  ).toHaveText("Online assessment");
  await page.goto(`/mail?${new URLSearchParams({ company })}`);
  await expect(page.getByRole("button", { name: new RegExp(subject) })).toBeVisible();
});

test("a recruiter mail becomes a saved opening", async ({ page }) => {
  const subject = `SDE-3 role ${Date.now()}`;
  const id = await seedMail({ subject, classification: "RECRUITER_OUTREACH" });
  await page.goto(`/mail/${id}`);
  await page.getByRole("link", { name: "Save as opening", exact: true }).click();
  await expect(page.getByLabel("Job description")).toHaveValue(`${subject} full message`);
  await page.getByLabel("Company").fill(`Mail Role Co ${Date.now()}`);
  await page.getByLabel("Role / title").fill("SDE-3 Backend");
  await page.getByLabel("Original job URL").fill(`https://example.invalid/roles/${Date.now()}`);
  await page.getByRole("button", { name: "Save job", exact: true }).click();
  await expect(page).toHaveURL(/\/jobs\/[0-9a-f-]+\?savedFromMail=1$/);
  await captureSavedJob(new URL(page.url()).pathname.split("/").at(-1)!);
  await page.goto(`/mail/${id}`);
  await expect(page.getByRole("link", { name: "Save as opening", exact: true })).toHaveCount(0);
});

test("record history uses readable India-time dates and long notes render in full", async ({
  page,
}) => {
  const company = `Readable Co ${Date.now()}`;
  const { applicationId } = await seedRecord({ company, source: "DIRECT", sentDaysAgo: 0 });
  await page.goto(`/applications/${applicationId}`);
  const row = page.locator(`#application-${applicationId}`);
  await expect(row).toContainText(/\d{1,2}:\d{2} (am|pm)/);
  await expect(row).not.toContainText("Asia/Kolkata");
  const notes = row.getByRole("region", { name: "Notes", exact: true });
  await hydrated(notes.getByRole("button").first());
  await notes.getByRole("button", { name: /^Notes/ }).click();
  await notes.getByRole("button", { name: "Write notes", exact: true }).click();
  await page.getByRole("textbox", { name: "Notes, Markdown" }).click();
  await page.keyboard.type(Array.from({ length: 10 }, (_, i) => `Note line ${i + 1}`).join("\n\n"));
  await page.getByRole("button", { name: "Save notes", exact: true }).click();
  await expect(notes.getByRole("button", { name: "Edit notes", exact: true })).toBeVisible();
  await expect(notes.getByText("Note line 1", { exact: true })).toBeVisible();
  await expect(notes.getByText("Note line 10", { exact: true })).toBeVisible();
});

test("an application row links to its open row and an old outcome link keeps its outcome", async ({
  page,
}) => {
  const company = `Expand Co ${Date.now()}`;
  const { applicationId } = await seedRecord({ company, source: "DIRECT", sentDaysAgo: 2 });
  await page.goto("/applications");
  const lane = page.getByRole("group", { name: company, exact: true });
  await lane.getByRole("link", { name: new RegExp(`^${company}`) }).click();
  await expect(page).toHaveURL(
    new RegExp(`/companies/[^?#]+\\?open=${applicationId}#application-${applicationId}$`),
  );
  const row = page.locator(`#application-${applicationId}`);
  await expect(row.getByTestId("phase-label")).toBeVisible();
  // Old record links with an outcome open the row with that outcome ready.
  await page.goto(`/applications/${applicationId}?outcome=followup`);
  await expect(page).toHaveURL(
    new RegExp(`/companies/[^?#]+\\?open=${applicationId}&outcome=followup`),
  );
  await expect(row.getByRole("button", { name: "Sent a follow-up", exact: true })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
});
