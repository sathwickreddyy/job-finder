import { expect, test, type Page } from "@playwright/test";
import { closeDatabase, db } from "../../src/db";
import { applicationEvents, applications, applicationRounds } from "../../src/db/schema";
import { eq } from "drizzle-orm";
import { stubExternalSites } from "./helpers/external-sites";
import { cleanupRecords, istDay, seedRecord } from "./helpers/records";
import { cleanupMailFixtures, guardMailFixtures, seedMail } from "./helpers/task13-mail";

test.beforeEach(async ({ page }) => {
  await stubExternalSites(page);
});
test.beforeEach(guardMailFixtures);
test.afterEach(async () => {
  await cleanupMailFixtures();
  await cleanupRecords();
});
test.afterAll(() => closeDatabase());

const lane = (page: Page, company: string) =>
  page.getByRole("group", { name: company, exact: true });

test("lanes show each company's status and put the ones that need you first", async ({ page }) => {
  const stamp = Date.now();
  const quiet = `Quiet Lane ${stamp}`;
  const fresh = `Fresh Lane ${stamp}`;
  await seedRecord({ company: fresh, source: "DIRECT", sentDaysAgo: 1 });
  await seedRecord({ company: quiet, source: "DIRECT", sentDaysAgo: 9 });
  await page.goto("/applications");
  await expect(page.getByRole("tab")).toHaveCount(0);
  await expect(lane(page, quiet).getByTestId("lane-status")).toHaveText("Quiet for 9 days");
  await expect(lane(page, quiet).getByRole("link", { name: /^I followed up/ })).toBeVisible();
  await expect(lane(page, fresh).getByTestId("lane-status")).toHaveText("Applied · yesterday");
  const names = await page
    .getByRole("group")
    .evaluateAll((groups) => groups.map((group) => group.getAttribute("aria-label")));
  expect(names.indexOf(quiet)).toBeGreaterThan(-1);
  expect(names.indexOf(quiet)).toBeLessThan(names.indexOf(fresh));
  await expect(page.getByText("Today", { exact: true }).first()).toBeVisible();
});

test("opening a lane records an OA without leaving the page", async ({ page }) => {
  const company = `OA Lane ${Date.now()}`;
  const { applicationId } = await seedRecord({ company, source: "DIRECT", sentDaysAgo: 2 });
  await page.goto("/applications");
  await lane(page, company)
    .getByRole("link", { name: new RegExp(`^${company}`) })
    .click();
  await expect(page).toHaveURL(new RegExp(`/applications\\?open=${applicationId}$`));
  const detail = page.getByRole("region", { name: `${company} timeline` });
  await detail.getByRole("button", { name: "Got an OA", exact: true }).click();
  await detail.getByLabel("Complete by (India time)").fill(istDay(3));
  await detail.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved: Got an OA." })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/applications\\?open=${applicationId}$`));
  await expect(lane(page, company).getByTestId("lane-status")).toHaveText("Interviewing · round 1");
  await expect(lane(page, company).getByRole("button", { name: /OA closes/ })).toBeVisible();
});

test("two roles at one company share a lane and the role switcher scopes outcomes", async ({
  page,
}) => {
  const company = `Two Roles ${Date.now()}`;
  const first = await seedRecord({
    company,
    title: "Backend Engineer",
    source: "DIRECT",
    sentDaysAgo: 1,
  });
  const second = await seedRecord({
    company,
    title: "Platform Engineer",
    source: "DIRECT",
    sentDaysAgo: 3,
  });
  await page.goto("/applications");
  await expect(lane(page, company)).toHaveCount(1);
  await expect(lane(page, company).getByTestId("lane-status")).toHaveText(
    "Applied · yesterday · +1 role",
  );
  await page.goto(`/applications?open=${first.applicationId}`);
  const roles = page.getByRole("navigation", { name: "Roles" });
  await roles.getByRole("link", { name: /Platform Engineer/ }).click();
  await expect(page).toHaveURL(new RegExp(`open=${second.applicationId}$`));
  const detail = page.getByRole("region", { name: `${company} timeline` });
  await detail.getByRole("button", { name: "Rejected", exact: true }).click();
  await detail.getByRole("button", { name: "Save", exact: true }).click();
  await expect(roles.getByRole("link", { name: /Platform Engineer.*Rejected/ })).toBeVisible();
  await expect(lane(page, company).getByTestId("lane-status")).toHaveText("Applied · yesterday");
});

test("a matched assessment email waits on its lane until Link it adds the OA", async ({ page }) => {
  const company = `Mail Lane ${Date.now()}`;
  const subject = `${company} assessment invite`;
  const { applicationId } = await seedRecord({ company, source: "DIRECT", sentDaysAgo: 2 });
  const mailId = await seedMail({ subject, classification: "ASSESSMENT", recordId: applicationId });
  await page.goto("/applications");
  await expect(lane(page, company).getByTestId("lane-status")).toHaveText(
    "Applied · 2 days · new email",
  );
  await expect(
    lane(page, company).getByRole("button", { name: /Assessment invite · not added yet/ }),
  ).toBeVisible();
  await lane(page, company)
    .getByRole("link", { name: /^Link it/ })
    .click();
  await expect(page).toHaveURL(new RegExp(`open=${applicationId}&mail=${mailId}&outcome=oa$`));
  const detail = page.getByRole("region", { name: `${company} timeline` });
  await expect(detail.getByRole("button", { name: "Got an OA", exact: true })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await detail.getByLabel("Complete by (India time)").fill(istDay(4));
  await detail.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/applications\\?open=${applicationId}$`));
  await expect(lane(page, company).getByRole("button", { name: /not added yet/ })).toHaveCount(0);
  await expect(lane(page, company).getByRole("button", { name: /OA closes/ })).toBeVisible();
});

test("old and stale links still land somewhere useful, and phones scroll the chart not the page", async ({
  page,
}) => {
  const company = `Phone Lane ${"Long name ".repeat(4)}${Date.now()}`;
  await seedRecord({ company, source: "DIRECT", sentDaysAgo: 4 });
  await page.goto("/applications?tab=records&filter=active");
  await expect(lane(page, company)).toBeVisible();
  await page.goto("/applications?open=00000000-0000-4000-8000-00000000dead");
  await expect(lane(page, company)).toBeVisible();
  await expect(page.getByRole("region", { name: /timeline$/ })).toHaveCount(0);
  await page.goto("/applications?open=not-a-uuid&mail=x");
  await expect(lane(page, company)).toBeVisible();
  await page.goto("/applications?tab=emails");
  await expect(page.getByRole("dialog", { name: "Emails" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Emails" })).toBeHidden();
  await expect(page).toHaveURL(/\/applications$/);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/applications");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  expect(
    await page
      .getByTestId("lanes-chart")
      .evaluate((element) => element.scrollWidth > element.clientWidth),
  ).toBe(true);
});

test("the Emails drawer links an unmatched reply into its lane and clears alerts", async ({
  page,
}) => {
  const company = `Drawer Lane ${Date.now()}`;
  const subject = `${company} interview`;
  const { applicationId } = await seedRecord({ company, source: "DIRECT", sentDaysAgo: 3 });
  await seedMail({ subject, classification: "INTERVIEW" });
  await seedMail({
    subject: `${company} alert one`,
    sender: "jobalerts@naukri.com",
    classification: "UNKNOWN",
  });
  await seedMail({
    subject: `${company} alert two`,
    sender: "jobalerts@naukri.com",
    classification: "UNKNOWN",
  });
  await page.goto("/applications");
  // With no inbox connected the header button reads "Connect inboxes" (spec §1).
  await page.getByRole("button", { name: /^(Emails|Connect inboxes)/ }).click();
  const drawer = page.getByRole("dialog", { name: "Emails" });
  const unmatched = drawer.getByRole("region", { name: /^Replies we couldn't match/ });
  const card = unmatched.getByRole("listitem").filter({ hasText: subject });
  await card.getByLabel("Record for this message").selectOption(applicationId);
  await card.getByRole("button", { name: "Link and update", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`open=${applicationId}&mail=`));
  await expect(page.getByText(`Linking mail: ${subject}`)).toBeVisible();
  await page.goto("/applications?emails=1");
  await drawer
    .getByRole("region", { name: /^Job alerts and auto-replies/ })
    .getByRole("button", { name: "Clear all", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: /Dismissed \d+ messages/ }),
  ).toBeVisible();
  await expect(drawer.getByText(`${company} alert one`)).toHaveCount(0);
});

test("a wrongly matched email can be dismissed from its lane", async ({ page }) => {
  const company = `Dismiss Lane ${Date.now()}`;
  const { applicationId } = await seedRecord({ company, source: "DIRECT", sentDaysAgo: 2 });
  await seedMail({ subject: `${company} offer`, classification: "OFFER", recordId: applicationId });
  await page.goto(`/applications?open=${applicationId}`);
  const history = page
    .getByRole("region", { name: `${company} timeline` })
    .getByRole("region", { name: "History" });
  await history.getByRole("button", { name: "Dismiss", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`open=${applicationId}&notice=`));
  await expect(page.getByRole("status").filter({ hasText: "Dismissed 1 message." })).toBeVisible();
  await expect(
    page
      .getByRole("group", { name: company, exact: true })
      .getByRole("button", { name: /not added yet/ }),
  ).toHaveCount(0);
});

test("linking a drawer reply to a closed record closes the drawer and opens that lane", async ({
  page,
}) => {
  const company = `Closed Lane ${Date.now()}`;
  const subject = `${company} late update`;
  const { applicationId } = await seedRecord({ company, source: "DIRECT", sentDaysAgo: 5 });
  await page.goto(`/applications/${applicationId}`);
  await page.getByRole("button", { name: "Rejected", exact: true }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved: Rejected." })).toBeVisible();
  await seedMail({ subject, classification: "INTERVIEW" });
  await page.goto("/applications");
  await expect(lane(page, company)).toHaveCount(0);
  await page.getByRole("button", { name: /^(Emails|Connect inboxes)/ }).click();
  const drawer = page.getByRole("dialog", { name: "Emails" });
  const card = drawer
    .getByRole("region", { name: /^Replies we couldn't match/ })
    .getByRole("listitem")
    .filter({ hasText: subject });
  await card.getByLabel("Record for this message").selectOption(applicationId);
  await card.getByRole("button", { name: "Link and update", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`open=${applicationId}&mail=`));
  await expect(drawer).toBeHidden();
  await expect(page.getByRole("region", { name: `${company} timeline` })).toBeVisible();
  await expect(page.getByText(`Linking mail: ${subject}`)).toBeVisible();
});

test("saving on a lane far down the page keeps it in view", async ({ page }) => {
  const stamp = Date.now();
  for (let index = 0; index < 14; index += 1)
    await seedRecord({ company: `Filler ${index} ${stamp}`, source: "DIRECT", sentDaysAgo: 2 });
  const company = `Far Lane ${stamp}`;
  const { applicationId } = await seedRecord({ company, source: "DIRECT", sentDaysAgo: 0 });
  await page.setViewportSize({ width: 1280, height: 640 });
  await page.goto(`/applications?open=${applicationId}`);
  const detail = page.getByRole("region", { name: `${company} timeline` });
  const heard = detail.getByRole("button", { name: "Heard back", exact: true });
  await heard.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await heard.click();
  await detail.getByRole("button", { name: "Save", exact: true }).click();
  const saved = page.getByRole("status").filter({ hasText: "Saved: Heard back." });
  await expect(saved).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/applications\\?open=${applicationId}$`));
  await expect(saved).toBeInViewport();
});

test("clicking empty space inside the Emails drawer keeps it open", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 2000 });
  await page.goto("/applications?emails=1");
  const drawer = page.getByRole("dialog", { name: "Emails" });
  await expect(drawer).toBeVisible();
  const box = (await drawer.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height - 10);
  await expect(drawer).toBeVisible();
  await page.mouse.click(Math.max(5, box.x - 40), box.y + box.height / 2);
  await expect(drawer).toBeHidden();
});

test("stack previews organize saved events without moving the chart and dismiss with Escape", async ({
  page,
}) => {
  const company = `Preview Lane ${Date.now()}`;
  const { applicationId } = await seedRecord({ company, source: "DIRECT", sentDaysAgo: 0 });
  await page.goto(`/applications/${applicationId}`);
  await page.getByRole("button", { name: "Heard back", exact: true }).click();
  await page
    .getByLabel("Note (optional)")
    .fill("Interview preparation saved: ownership, evidence and next steps.");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved: Heard back." })).toBeVisible();
  await page.goto("/applications");
  const chart = page.getByTestId("lanes-chart");
  const dot = lane(page, company)
    .getByRole("button", { name: /Applied/ })
    .first();
  await dot.scrollIntoViewIfNeeded();
  const before = await chart.evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
  await dot.hover();
  const preview = page.getByTestId("lane-preview");
  await expect(preview).toBeVisible();
  await expect(preview.getByRole("listitem")).toHaveCount(2);
  await expect(preview.getByText(company, { exact: true })).toBeVisible();
  await expect(preview.getByText("Heard back", { exact: true })).toBeVisible();
  await expect(preview.getByText(/ownership, evidence/)).toBeVisible();
  const after = await chart.evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
  expect(after).toBe(before);
  await dot.focus();
  await expect(preview).toBeVisible();
  await expect(page.locator('[aria-live="polite"]').filter({ hasText: company })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(preview).toBeHidden();
  await expect(dot).toBeFocused();
});

test("keyboard saving a terminal outcome keeps focus within the lane", async ({ page }) => {
  const company = `Keyboard Lane ${Date.now()}`;
  const { applicationId } = await seedRecord({ company, source: "DIRECT", sentDaysAgo: 1 });
  await page.goto(`/applications?open=${applicationId}&outcome=rejected`);
  const detail = page.getByRole("region", { name: `${company} timeline` });
  const save = detail.getByRole("button", { name: "Save", exact: true });
  await save.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status").filter({ hasText: "Saved: Rejected." })).toBeVisible();
  await expect(detail.getByRole("region", { name: "Progress", exact: true })).toBeFocused();
});

test("closing a deep-linked drawer returns focus to the header trigger", async ({ page }) => {
  await page.goto("/applications?emails=1");
  await expect(page.getByRole("dialog", { name: "Emails" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: /^(Emails|Connect inboxes)/ })).toBeFocused();
  await expect(page).toHaveURL(/\/applications$/);
});

test("phone scrolling keeps edge dots and their badges behind the company column", async ({
  page,
}) => {
  const company = `Edge Lane ${Date.now()}`;
  const { applicationId } = await seedRecord({ company, source: "DIRECT", sentDaysAgo: 200 });
  await db.insert(applicationEvents).values({
    applicationId,
    eventType: "MANUAL_NOTE",
    occurredAt: new Date(Date.now() - 200 * 86400000),
    summary: "Another early event",
  });
  await seedMail({
    subject: "Old role acknowledgement",
    classification: "APPLICATION_ACKNOWLEDGEMENT",
    recordId: applicationId,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/applications");
  const chart = page.getByTestId("lanes-chart");
  const row = lane(page, company);
  const earlier = row.getByRole("button", { name: /^Earlier:/ });
  await earlier.scrollIntoViewIfNeeded();
  const companyBox = (await row
    .getByRole("link", { name: new RegExp(`^${company}`) })
    .boundingBox())!;
  const dotBox = (await earlier.boundingBox())!;
  expect(dotBox.x).toBeGreaterThanOrEqual(companyBox.x + companyBox.width);
  await chart.evaluate((element) => {
    element.scrollLeft = 80;
  });
  const coverage = await row.evaluate((element) => {
    const link = element.querySelector("a")!;
    const box = link.getBoundingClientRect();
    const buttons = [...element.querySelectorAll("button")];
    return buttons
      .flatMap((button) => [...button.querySelectorAll("span")])
      .every((badge) => {
        const b = badge.getBoundingClientRect();
        if (b.left >= box.right || b.right <= box.left) return true;
        const hit = document.elementFromPoint(
          Math.min(box.right - 1, Math.max(box.left + 1, b.left + 1)),
          b.top + b.height / 2,
        );
        return Boolean(hit && link.contains(hit));
      });
  });
  expect(coverage).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("notes only offer Show all when four rendered lines actually overflow", async ({ page }) => {
  const company = `Notes Lane ${Date.now()}`;
  const { applicationId } = await seedRecord({ company, source: "DIRECT", sentDaysAgo: 1 });
  // Wide short text triggers the old character-count heuristic without overflowing four lines.
  await db
    .update(applications)
    .set({ notes: "clear note ".repeat(33) })
    .where(eq(applications.id, applicationId));
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto(`/applications/${applicationId}`);
  await expect(page.getByRole("button", { name: "Show all", exact: true })).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: "Show all", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Show all", exact: true }).click();
  await expect(page.getByRole("button", { name: "Show less", exact: true })).toBeVisible();
});

test("Later stacks never cover an event at the end of this week's window", async ({ page }) => {
  const company = `Future Lane ${Date.now()}`;
  const { applicationId } = await seedRecord({ company, source: "DIRECT", sentDaysAgo: 0 });
  const second = await seedRecord({
    company,
    title: "Platform Engineer",
    source: "DIRECT",
    sentDaysAgo: 0,
  });
  await db.insert(applicationRounds).values([
    {
      applicationId,
      kind: "DSA",
      position: 1,
      scheduledAt: new Date(`${istDay(7)}T23:59:00+05:30`),
    },
    {
      applicationId: second.applicationId,
      kind: "DSA",
      position: 2,
      scheduledAt: new Date(`${istDay(60)}T11:00:00+05:30`),
    },
  ]);
  await page.goto("/applications");
  const row = lane(page, company);
  const inside = row.getByRole("button", { name: /Round 1/ });
  const later = row.getByRole("button", { name: /^Later:/ });
  await inside.scrollIntoViewIfNeeded();
  const a = (await inside.boundingBox())!;
  const b = (await later.boundingBox())!;
  const connector = inside.locator("..").locator(":scope > span[class*=border-dashed]");
  const lineBox = (await connector.boundingBox())!;
  expect(Math.abs(lineBox.y + lineBox.height / 2 - (a.y + a.height / 2))).toBeLessThanOrEqual(2);
  expect(
    a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y,
  ).toBe(true);
  await inside.hover();
  await expect(
    page.getByTestId("lane-preview").getByText("Round 1 · DSA", { exact: true }),
  ).toBeVisible();
  await later.hover();
  await expect(
    page.getByTestId("lane-preview").getByText("After this calendar window", { exact: false }),
  ).toBeVisible();
});

test("short previews above a dot stay close enough to hover", async ({ page }) => {
  const company = `Above Lane ${Date.now()}`;
  await seedRecord({ company, source: "DIRECT", sentDaysAgo: 0 });
  await page.setViewportSize({ width: 1280, height: 640 });
  await page.goto("/applications");
  const dot = lane(page, company).getByRole("button", { name: /^Applied/ });
  await dot.scrollIntoViewIfNeeded();
  await dot.evaluate((el) =>
    window.scrollBy(0, el.getBoundingClientRect().top - (window.innerHeight - 80)),
  );
  await dot.hover();
  const preview = page.getByTestId("lane-preview");
  await expect(preview).toBeVisible();
  const p = (await preview.boundingBox())!;
  const d = (await dot.boundingBox())!;
  expect(d.y - (p.y + p.height)).toBeLessThanOrEqual(16);
  expect(d.y - (p.y + p.height)).toBeGreaterThanOrEqual(0);
  await preview.hover();
  await expect(preview).toBeVisible();
});

test("six saved notes can be read by scrolling the hover preview", async ({ page }) => {
  const company = `Many Notes Lane ${Date.now()}`;
  const { applicationId } = await seedRecord({ company, source: "DIRECT", sentDaysAgo: 0 });
  const noteTime = Date.now();
  await db.insert(applicationEvents).values(
    Array.from({ length: 6 }, (_, index) => ({
      applicationId,
      eventType: "MANUAL_NOTE",
      occurredAt: new Date(noteTime + index),
      summary: `Preparation note ${index + 1}: ${"Verified evidence and next steps. ".repeat(3)}`,
    })),
  );
  await page.goto("/applications");
  const dot = lane(page, company).getByRole("button", { name: /Preparation note 6/ });
  await dot.hover();
  const preview = page.getByTestId("lane-preview");
  await expect(preview.getByRole("listitem")).toHaveCount(7);
  await preview.hover();
  await preview.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await expect(preview.getByText(/Preparation note 6/)).toBeInViewport();
  await expect(preview).toBeVisible();
  // The preview survives its own scrolling, but closes when its lane actually moves.
  await page.evaluate(() => window.scrollBy(0, -30));
  await expect(preview).toBeHidden();
});

test("matched acknowledgement on a closed company is actionable and stays closed after linking", async ({
  page,
}) => {
  const company = `Closed Ack Lane ${Date.now()}`;
  const { applicationId } = await seedRecord({ company, source: "DIRECT", sentDaysAgo: 1 });
  await page.goto(`/applications/${applicationId}?outcome=rejected`);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved: Rejected." })).toBeVisible();
  const mailId = await seedMail({
    subject: "Your application was received",
    classification: "APPLICATION_ACKNOWLEDGEMENT",
    recordId: applicationId,
  });
  await page.goto("/applications");
  await expect(lane(page, company)).toBeVisible();
  await expect(lane(page, company).getByTestId("lane-status")).toHaveText("Rejected");
  await lane(page, company)
    .getByRole("link", { name: /^Add to timeline/ })
    .click();
  await expect(page).toHaveURL(new RegExp(`open=${applicationId}&mail=${mailId}$`));
  const detail = page.getByRole("region", { name: `${company} timeline` });
  await detail.getByRole("button", { name: "Add to timeline", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`open=${applicationId}&notice=`));
  await expect(lane(page, company).getByTestId("lane-status")).toHaveText("Rejected");
  await page.goto("/applications");
  await expect(lane(page, company)).toHaveCount(0);
});

test("drawer focus stays on its trigger after a slow close navigation", async ({ page }) => {
  await page.goto("/applications?emails=1");
  await expect(page.getByRole("dialog", { name: "Emails" })).toBeVisible();
  await page.route("**/applications?**", async (route) => {
    if (route.request().headers().rsc === "1")
      await new Promise((resolve) => setTimeout(resolve, 600));
    await route.continue();
  });
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/applications$/);
  await expect(page.getByRole("button", { name: /^(Emails|Connect inboxes)/ })).toBeFocused();
});
