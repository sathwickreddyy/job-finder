import { expect, test } from "@playwright/test";
import { closeDatabase } from "../../src/db";
import { stubExternalSites } from "./helpers/external-sites";
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

test("recording outcomes walks an application from OA to an accepted offer", async ({ page }) => {
  const company = `Ladder Labs ${Date.now()}`;
  const { applicationId } = await seedRecord({ company, source: "DIRECT", sentDaysAgo: 2 });
  await page.goto(`/applications/${applicationId}`);
  const phase = page.getByTestId("phase-label");
  const history = page.getByRole("region", { name: "History" });
  const save = () => page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(phase).toHaveText("Applied");
  await page.getByRole("button", { name: "Set a follow-up", exact: true }).click();
  await page.getByLabel("Follow-up date").fill(istDay(2));
  await page.getByLabel("What to do").fill("Check the careers portal");
  await page.getByRole("button", { name: "Save follow-up", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Follow-up saved." })).toBeVisible();
  await expect(page.getByLabel("Follow-up date")).toHaveCount(0);
  await page.getByRole("button", { name: /^Follow up on/ }).click();
  await expect(page.getByLabel("What to do")).toHaveValue("Check the careers portal");
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Follow-up cleared." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Set a follow-up", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Set a follow-up", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Got an OA", exact: true }).click();
  await page.getByLabel("Complete by (India time)").fill(istDay(3));
  await page.getByLabel("Name (optional)").fill("HackerRank");
  await save();
  await expect(history).toContainText("OA received");
  await expect(history).toContainText("11:59 pm");
  await expect(page.getByRole("status").filter({ hasText: "Saved: Got an OA." })).toBeVisible();
  await expect(page.getByLabel("Complete by (India time)")).toHaveCount(0);
  await expect(phase).toHaveText(/Interviewing · round 1/);

  await page.getByRole("button", { name: "Cleared the round", exact: true }).click();
  await save();
  await expect(history).toContainText("Cleared the OA round");

  await page.getByRole("button", { name: "Round scheduled", exact: true }).click();
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
  await expect(history).toContainText("LLD round scheduled");
  await page.getByRole("button", { name: "Rescheduled", exact: true }).click();
  await expect(page.getByLabel("Date (India time)")).toHaveValue(istDay(5));
  await expect(page.getByLabel("Time", { exact: true })).toHaveValue("11:00");
  await page.getByLabel("Date (India time)").fill(istDay(6));
  await page.getByLabel("Time", { exact: true }).fill("12:30");
  await save();
  await expect(history).toContainText("LLD round moved");
  await page.setViewportSize({ width: 390, height: 844 });
  const rounds = page.getByRole("region", { name: "Rounds" });
  const editRound = rounds.locator("li").filter({ hasText: longName });
  await editRound.getByText("Edit round", { exact: true }).click();
  await editRound.getByLabel("Round notes").fill("Prepare idempotency examples");
  await editRound.getByRole("button", { name: "Save round", exact: true }).click();
  await expect(editRound.getByRole("status")).toContainText("Round updated.");
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
  await page.reload();
  await expect(rounds).toContainText("Prepare idempotency examples");
  await page.getByText("Edit details", { exact: true }).click();
  await page.getByRole("textbox", { name: "Notes", exact: true }).fill("Ask about on-call");
  await page.getByLabel("Application URL").fill("https://example.invalid/application/123");
  await page.getByRole("button", { name: "Save details", exact: true }).click();
  await expect(page.getByRole("region", { name: "Notes", exact: true })).toContainText(
    "Ask about on-call",
  );
  await expect(page.getByRole("link", { name: "Application page", exact: true })).toHaveAttribute(
    "href",
    "https://example.invalid/application/123",
  );
  await page.getByLabel("Add to history").fill("Discussed system design preparation");
  await page.getByRole("button", { name: "Add note", exact: true }).click();
  await expect(history).toContainText("Discussed system design preparation");
  await expect(page.getByRole("button", { name: "Got an offer", exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Cleared the round", exact: true }).click();
  await save();
  await page.getByRole("button", { name: "Got an offer", exact: true }).click();
  await save();
  await expect(phase).toHaveText("Decision");
  await page.getByRole("button", { name: "Accepted the offer", exact: true }).click();
  await save();
  await expect(phase).toHaveText("Accepted");
  await expect(
    page.getByRole("status").filter({ hasText: "Saved: Accepted the offer." }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Rounds" }).getByText("Cleared", { exact: true }),
  ).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Rejected", exact: true })).toHaveCount(0);
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
  await expect(page).toHaveURL(new RegExp(`open=${applicationId}&outcome=followup$`));
  await expect(page.getByRole("button", { name: "Sent a follow-up", exact: true })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(row.getByTestId("lane-status")).toHaveText("Referral ask · 0 of 5 days");
  // The lane stays open after saving, so match the dot (named "…, Today"), not the chip.
  await expect(row.getByRole("button", { name: /Sent a follow-up, Today/ })).toBeVisible();
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
  await expect(row.getByRole("link", { name: `Open: ${note}` })).toBeVisible();
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
  await expect(page.getByRole("status").filter({ hasText: "Recorded as sent." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Record as sent", exact: true })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Progress", exact: true })).toBeFocused();
  await page.reload();
  await expect(page.getByTestId("phase-label")).toHaveText("Applied");
  await expect(page.getByLabel("Date sent (India time)")).toHaveCount(0);
});

test("linking an assessment mail books the OA and clears the message", async ({ page }) => {
  const subject = `Assessment invite ${Date.now()}`;
  const { applicationId } = await seedRecord({
    company: `Mail Link Co ${Date.now()}`,
    source: "DIRECT",
    sentDaysAgo: 3,
  });
  await seedMail({ subject, classification: "ASSESSMENT", recordId: applicationId });
  await page.goto("/applications");
  await expect(page.getByText(subject, { exact: true })).toBeVisible();
  await page.goto("/applications?tab=emails");
  await page
    .getByRole("region", { name: /Updates on your records/ })
    .getByRole("listitem")
    .filter({ hasText: subject })
    .getByRole("link", { name: "Link and update", exact: true })
    .click();
  await expect(page.getByText(`Linking mail: ${subject}`)).toBeVisible();
  await expect(page.getByRole("button", { name: "Got an OA", exact: true })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await page.getByLabel("Complete by (India time)").fill(istDay(4));
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const history = page.getByRole("region", { name: "History" });
  await expect(history).toContainText("OA received");
  await expect(history).toContainText(subject);
  await page.goto("/applications?tab=emails");
  await expect(page.getByRole("link", { name: subject, exact: true })).toHaveCount(0);
});

test("a recruiter mail becomes a saved opening", async ({ page }) => {
  const subject = `SDE-3 role ${Date.now()}`;
  await seedMail({ subject, classification: "RECRUITER_OUTREACH" });
  await page.goto("/applications?tab=emails");
  await page
    .getByRole("region", { name: /New roles for you/ })
    .getByRole("listitem")
    .filter({ hasText: subject })
    .getByRole("link", { name: "Save as opening", exact: true })
    .click();
  await expect(page.getByLabel("Job description")).toHaveValue(`${subject} full message`);
  await page.getByLabel("Company").fill(`Mail Role Co ${Date.now()}`);
  await page.getByLabel("Role / title").fill("SDE-3 Backend");
  await page.getByLabel("Original job URL").fill(`https://example.invalid/roles/${Date.now()}`);
  await page.getByRole("button", { name: "Save job", exact: true }).click();
  await expect(page).toHaveURL(/\/jobs\/[0-9a-f-]+\?savedFromMail=1$/);
  await captureSavedJob(new URL(page.url()).pathname.split("/").at(-1)!);
  await page.goto("/applications?tab=emails");
  await expect(page.getByRole("link", { name: subject, exact: true })).toHaveCount(0);
});

test("noise can be cleared in one action", async ({ page }) => {
  const subjects = [`Job alert one ${Date.now()}`, `Job alert two ${Date.now()}`];
  for (const subject of subjects)
    await seedMail({ subject, classification: "UNKNOWN", sender: "alerts@naukri.com" });
  await page.goto("/applications?tab=emails");
  await page
    .getByRole("region", { name: /Probably noise/ })
    .getByRole("button", { name: /Dismiss all \d+/ })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: /Dismissed \d+ messages/ }),
  ).toBeVisible();
  for (const subject of subjects)
    await expect(page.getByRole("link", { name: subject, exact: true })).toHaveCount(0);
});

test("the Emails tab describes missing configuration for both providers", async ({ page }) => {
  await page.goto("/applications?tab=emails");
  await expect(page.getByRole("button", { name: "Connect Gmail", exact: true })).toBeDisabled();
  await expect(
    page.getByText(
      "Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI, MAIL_TOKEN_ENCRYPTION_KEY in .env",
    ),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Connect Outlook", exact: true })).toBeDisabled();
  await expect(
    page.getByText(
      "Set MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, MICROSOFT_REDIRECT_URI, MAIL_TOKEN_ENCRYPTION_KEY in .env",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Refresh all inboxes", exact: true }),
  ).toBeDisabled();
});
