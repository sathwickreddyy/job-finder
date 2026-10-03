import { expect, test, type Page } from "@playwright/test";
import { closeDatabase } from "../../src/db";
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
