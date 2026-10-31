import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { eq, inArray, like } from "drizzle-orm";
import { closeDatabase, db } from "../../src/db";
import {
  applicationEvents,
  applications,
  companyRecords,
  jobs,
  mailConnections,
  mailTracking,
  settings,
} from "../../src/db/schema";
import { stubExternalSites } from "./helpers/external-sites";
import { cleanupRecords, seedRecord } from "./helpers/records";
import { cleanupMailFixtures, guardMailFixtures, seedMail } from "./helpers/task13-mail";

const prefix = `job-mail-${randomUUID().slice(0, 8)}`;
const unique = (label: string) => `${label} ${randomUUID().slice(0, 6)}`;
const keyOf = (name: string) => name.toLowerCase();

async function connection() {
  await guardMailFixtures();
  // The token can't be decrypted, so a fetch or search fails before any network call.
  const [row] = await db
    .insert(mailConnections)
    .values({
      provider: "GMAIL",
      email: `${prefix}-${randomUUID().slice(0, 4)}@fixture.invalid`,
      encryptedAccessToken: "not-a-real-token",
    })
    .returning();
  return row;
}
async function company(name: string) {
  await guardMailFixtures();
  const [row] = await db
    .insert(companyRecords)
    .values({ slug: `${prefix}-${randomUUID().slice(0, 6)}`, name })
    .returning();
  return row;
}
async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test.beforeEach(guardMailFixtures);
test.beforeEach(async ({ page }) => stubExternalSites(page));
test.afterEach(async () => {
  await guardMailFixtures();
  const owned = await db
    .select({ id: mailConnections.id, email: mailConnections.email })
    .from(mailConnections)
    .where(like(mailConnections.email, `${prefix}%`));
  for (const row of owned) await db.delete(settings).where(like(settings.key, `%${row.id}%`));
  await db.delete(mailTracking).where(like(mailTracking.accountEmail, `${prefix}%`));
  await db.delete(mailConnections).where(like(mailConnections.email, `${prefix}%`));
  const previous = await db.select().from(jobs).where(like(jobs.canonicalUrl, "jobops:previous/%"));
  const mine = previous.filter((job) => job.company.includes(prefix));
  if (mine.length) {
    const apps = await db
      .select({ id: applications.id })
      .from(applications)
      .where(
        inArray(
          applications.jobId,
          mine.map((job) => job.id),
        ),
      );
    if (apps.length) {
      await db.delete(applicationEvents).where(
        inArray(
          applicationEvents.applicationId,
          apps.map((app) => app.id),
        ),
      );
      await db.delete(applications).where(
        inArray(
          applications.id,
          apps.map((app) => app.id),
        ),
      );
    }
    await db.delete(jobs).where(
      inArray(
        jobs.id,
        mine.map((job) => job.id),
      ),
    );
  }
  await db.delete(settings).where(like(settings.key, `companySearch%${prefix}%`));
  await db.delete(companyRecords).where(like(companyRecords.slug, `${prefix}%`));
  await db.delete(companyRecords).where(like(companyRecords.name, `%${prefix}%`));
  await cleanupMailFixtures();
  await cleanupRecords();
});
test.afterAll(closeDatabase);

test("feed shows two-line rows and Coming up", async ({ page }) => {
  const name = unique("Feed Co");
  await seedRecord({ company: name, source: "DIRECT", sentDaysAgo: 2 });
  const subject = unique("Interview invitation");
  await seedMail({
    subject,
    classification: "INTERVIEW",
    companyKey: keyOf(name),
    senderName: "Feed Talent",
    bodyText: "Please share your availability this week.\nThanks",
  });
  await page.goto("/mail");
  await expect(page.getByRole("heading", { level: 2, name: "All job mail" })).toBeVisible();
  const row = page.getByRole("button", { name: new RegExp(subject) });
  await expect(row).toContainText(name);
  await expect(row).toContainText("Feed Talent");
  await expect(row).toContainText("Interview call");
  await expect(row).toContainText("Please share your availability this week.");
  const comingUp = page.getByRole("region", { name: "Coming up" });
  await expect(comingUp).toContainText(subject);
  await expect(comingUp).toContainText("No date");
});

test("fetch last 30 days shows per-inbox progress and the dropped list", async ({ page }) => {
  const own = await connection();
  await page.goto("/mail?view=all");
  await page.getByRole("radio", { name: "Last N days" }).click();
  const days = page.getByLabel("Number of days");
  await days.fill("400");
  await expect(
    page.getByText("Fetch reads every message, so it goes back up to 180 days."),
  ).toBeVisible();
  await expect(days).toHaveValue("180");
  await days.fill("30");
  await expect(page.getByText(/for mail from the last 30 days\./)).toBeVisible();
  await page.getByRole("button", { name: "Fetch new mail" }).click();
  const result = page.getByRole("status").filter({ hasText: /kept, \d+ need you, \d+ dropped\./ });
  await expect(result).toBeVisible({ timeout: 30_000 });
  await expect(result).toContainText(`Reconnect ${own.email} in Inboxes`);
  await expect(page.getByRole("listitem").filter({ hasText: own.email })).toBeVisible();
  await page.getByRole("button", { name: "See what was dropped" }).click();
  await expect(page.getByText("Nothing was dropped.")).toBeVisible();
});

test('company panel edits a keyword, refuses "interview", and runs a search with lanes', async ({
  page,
}) => {
  const name = unique(`Panel ${prefix}`);
  const record = await company(name);
  const own = await connection();
  await page.goto(`/companies/${record.slug}?tab=timeline`);
  const panel = page.getByRole("region", { name: `How we find ${name}'s mail` });
  await expect(panel).toBeVisible();
  await panel.getByRole("button", { name: "Add keyword" }).click();
  await panel.getByLabel("New keyword").fill("interview");
  await panel.getByRole("button", { name: "Add", exact: true }).click();
  await expect(panel.getByText(/"interview" appears in every company's mail/)).toBeVisible();
  await panel.getByLabel("New keyword").fill(`${name} Talent`);
  await panel.getByRole("button", { name: "Add", exact: true }).click();
  await expect(panel.getByText("Saved. Fetches and searches use it from now on.")).toBeVisible();
  await panel.getByText("Show the exact search sent to each inbox").click();
  await expect(panel.getByText(`"${name} Talent"`).first()).toBeVisible();
  await panel.getByRole("button", { name: `Search ${name}'s mail` }).click();
  const lane = panel
    .getByRole("region", { name: own.email })
    .or(panel.locator("section").filter({ hasText: own.email }));
  await expect(lane.first()).toContainText("Couldn't search", { timeout: 30_000 });
  await expect(panel.getByText(/needs reconnecting in Inboxes/)).toBeVisible();
});

test("the sticky company facts never cover the How we find link or the search panel while scrolling", async ({
  page,
}) => {
  const name = unique(`Sticky ${prefix}`);
  const record = await company(name);
  for (let day = 0; day < 24; day += 1)
    await seedMail({
      subject: unique(`Update ${day}`),
      classification: "RECRUITER_OUTREACH",
      companyKey: keyOf(name),
      attentionState: "DONE",
      receivedAt: new Date(Date.now() - day * 86_400_000),
    });
  await page.setViewportSize({ width: 1024, height: 700 });
  await page.goto(`/companies/${record.slug}?tab=timeline`);
  const link = page.getByRole("link", { name: `How we find ${name}'s mail` });
  await expect(link).toBeVisible();
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < height; y += 150) {
    await page.evaluate((top) => window.scrollTo(0, top), y);
    const overlap = await page.evaluate(() => {
      const meets = (a: DOMRect, b: DOMRect) =>
        a.top < b.bottom && b.top < a.bottom && a.left < b.right && b.left < a.right;
      const anchor = document.querySelector('a[href="#mail-search"]')!.getBoundingClientRect();
      const panel = document.querySelector("#mail-search")!.getBoundingClientRect();
      const facts = document.querySelector('aside[aria-label="Company facts"]')!;
      return {
        link: [...facts.querySelectorAll("a, button, select")].some((node) =>
          meets(node.getBoundingClientRect(), anchor),
        ),
        panel: meets(facts.getBoundingClientRect(), panel),
      };
    });
    expect(overlap, `overlap at scroll ${y}`).toEqual({ link: false, panel: false });
  }
});

test("add a previous employer from Companies", async ({ page }) => {
  const name = unique(`Former ${prefix}`);
  await page.goto("/companies");
  await page.getByText("Previous employers", { exact: true }).click();
  const form = page.locator("form").filter({ has: page.getByLabel("Company") });
  await form.getByLabel("Company").fill(name);
  await form.getByLabel("Role title").fill("SDE I");
  await form.getByLabel("Joined").fill("2022-04");
  await form.getByRole("button", { name: "Add previous employer" }).click();
  await expect(form.getByRole("status")).toHaveText("Saved.");
  await page.reload();
  await page.getByText("Previous employers", { exact: true }).click();
  await expect(page.getByRole("link", { name: new RegExp(name) })).toContainText(
    "Previous employer, joined Apr 2022",
  );
  const [created] = await db.select().from(companyRecords).where(eq(companyRecords.name, name));
  expect(created.kind).toBe("PREVIOUS_EMPLOYER");
});

test("applications shows one lane per application with tag icons", async ({ page }) => {
  const name = unique("Lanes Co");
  const first = await seedRecord({
    company: name,
    source: "DIRECT",
    sentDaysAgo: 3,
    title: "Backend II",
  });
  await seedRecord({ company: name, source: "DIRECT", sentDaysAgo: 5, title: "Platform Engineer" });
  await seedMail({
    subject: unique("Assessment"),
    classification: "ASSESSMENT",
    companyKey: keyOf(name),
    recordId: first.applicationId,
  });
  await page.goto("/applications");
  const lanes = page.getByRole("group", { name });
  await expect(lanes).toHaveCount(2);
  await expect(lanes.filter({ hasText: "Backend II" })).toHaveCount(1);
  await expect(lanes.filter({ hasText: "Platform Engineer" })).toHaveCount(1);
  await expect(lanes.locator(".bg-tag-interview-call-container").first()).toBeVisible();
});

test("375 px has no horizontal scroll on /mail, a company page and /applications", async ({
  page,
}) => {
  const name = unique(`Narrow ${prefix}`);
  const record = await company(name);
  await seedMail({
    subject: unique("Narrow mail"),
    classification: "OFFER",
    companyKey: keyOf(name),
  });
  await page.setViewportSize({ width: 375, height: 812 });
  for (const path of [
    "/mail?view=all",
    `/companies/${record.slug}?tab=timeline`,
    "/applications",
  ]) {
    await page.goto(path);
    await noHorizontalScroll(page);
  }
});
