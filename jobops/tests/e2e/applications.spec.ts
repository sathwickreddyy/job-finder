import { expect, test } from "@playwright/test";
import { closeDatabase } from "../../src/db";
import { stubExternalSites } from "./helpers/external-sites";
import { cleanupRecords, istDay, seedRecord } from "./helpers/records";

test.beforeEach(async ({ page }) => {
  await stubExternalSites(page);
});
test.beforeEach(() => expect(new URL(process.env.DATABASE_URL!).pathname).toBe("/jobops_e2e"));
test.afterEach(() => cleanupRecords());
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

test("a quiet referral shows up in Next and leaves once a follow-up is recorded", async ({
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
  const slipped = page.getByRole("region", { name: /slipped past/ });
  const pill = slipped.getByRole("link", { name: new RegExp(`${company}.*Record follow-up`) });
  await expect(pill).toBeVisible();
  await pill.click();
  await expect(page).toHaveURL(new RegExp(`/applications/${applicationId}\\?outcome=followup`));
  await expect(page.getByRole("button", { name: "Sent a follow-up", exact: true })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("region", { name: "History" })).toContainText("Sent a follow-up");
  await page.goto("/applications");
  await expect(page.getByRole("link", { name: new RegExp(company) })).toHaveCount(0);
  await page.goto(`/applications?tab=records&filter=waiting&q=${encodeURIComponent(company)}`);
  await expect(page.getByRole("link", { name: company, exact: true })).toBeVisible();
  await expect(page.getByText("0d of 5", { exact: true })).toBeVisible();
});

test("a follow-up date appears today and snoozing hides it until undone", async ({ page }) => {
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
  const row = page.getByRole("listitem").filter({ hasText: note });
  await expect(row).toHaveCount(1);
  // A date-only follow-up stays in Today, including before its 09:00 IST time.
  await expect(row).toContainText("9:00 am");
  await expect(row.locator("xpath=preceding-sibling::li[h2][1]")).toContainText("Today");
  await row.getByRole("button", { name: /Snooze/ }).click();
  await expect(page.getByRole("status").filter({ hasText: "Snoozed for 2 days" })).toContainText(
    note,
  );
  await expect(row).toHaveCount(0);
  await page.reload();
  await expect(row).toHaveCount(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(row).toHaveCount(1);
  await page.reload();
  await expect(row).toHaveCount(1);
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
  await page.goto(`/applications?tab=records&filter=interviewing&q=${encodeURIComponent(company)}`);
  await expect(page.getByRole("link", { name: company, exact: true })).toBeVisible();
  await expect(page.getByText("No rounds recorded", { exact: true })).toBeVisible();
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

test("snoozing an overdue pill keeps confirmation and Undo through reload", async ({ page }) => {
  const company = `Overdue Snooze ${Date.now()}`;
  await seedRecord({ company, source: "REFERRAL", sentDaysAgo: 6 });
  await page.goto("/applications");
  const slipped = page.getByRole("region", { name: /slipped past/ });
  const pill = slipped.getByRole("link", { name: new RegExp(`${company}.*Record follow-up`) });
  await expect(pill).toBeVisible();
  const snooze = slipped.getByRole("button", { name: new RegExp(`Snooze.*${company}`) });
  await snooze.click();
  await expect(page.getByRole("status").filter({ hasText: "Snoozed for 2 days" })).toContainText(
    company,
  );
  await expect(pill).toHaveCount(0);
  await page.reload();
  await expect(pill).toHaveCount(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(pill).toBeVisible();
  await page.reload();
  await expect(pill).toBeVisible();
});

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
