import { eq } from "drizzle-orm";
import { expect, test } from "@playwright/test";
import { closeDatabase, db } from "../../src/db";
import {
  applicationEvents,
  applicationRounds,
  applications,
  mailMessages,
} from "../../src/db/schema";
import { cleanupRecords, seedRecord } from "./helpers/records";
import { cleanupMailFixtures, guardMailFixtures, seedMail } from "./helpers/task13-mail";
import { stubExternalSites } from "./helpers/external-sites";

test.beforeEach(guardMailFixtures);
test.beforeEach(async ({ page }) => stubExternalSites(page));
test.afterEach(async () => {
  await cleanupMailFixtures();
  await cleanupRecords();
});
test.afterAll(closeDatabase);

for (const path of [
  "/inbox?view=attention&q=old",
  "/mail?status=REVIEWED",
  "/mail/review?type=INTERVIEW",
]) {
  test(`${path} redirects and drops legacy filters`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveURL(/\/applications\?tab=emails$/);
    await expect(page.getByRole("link", { name: "Emails", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await page.goto("/applications?tab=records");
    await expect(page.getByRole("link", { name: "Emails", exact: true })).not.toHaveAttribute(
      "aria-current",
      "page",
    );
  });
}

test("reader matches actual buckets: roles save, updates link, alerts only dismiss", async ({
  page,
}) => {
  const { applicationId } = await seedRecord({
    company: `Reader Match ${Date.now()}`,
    source: "DIRECT",
    sentDaysAgo: 3,
  });
  const role = await seedMail({
    subject: "Unmatched opportunity",
    classification: "RECRUITER_OUTREACH",
  });
  const update = await seedMail({
    subject: "Matched opportunity",
    classification: "RECRUITER_OUTREACH",
    recordId: applicationId,
  });
  const alert = await seedMail({
    subject: "Alert pretending to be assessment",
    sender: "alerts@naukri.com",
    classification: "ASSESSMENT",
    recordId: applicationId,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/mail/${role}`);
  await expect(page.getByRole("link", { name: "Save as opening", exact: true })).toHaveAttribute(
    "href",
    `/jobs/new?fromMail=${role}`,
  );
  await expect(page.getByLabel("Record for this message")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Emails", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await page.goto(`/mail/${update}`);
  await expect(page.getByRole("link", { name: "Link and update", exact: true })).toHaveAttribute(
    "href",
    `/applications/${applicationId}?mail=${update}&outcome=heard#what-happened`,
  );
  await expect(page.getByRole("link", { name: "Save as opening", exact: true })).toHaveCount(0);
  await page.goto(`/mail/${alert}`);
  await expect(page.getByRole("button", { name: "Dismiss", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Save as opening", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Link and update", exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Record for this message")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("matched acknowledgement reader links without creating an outcome or resetting silence", async ({
  page,
}) => {
  const { applicationId } = await seedRecord({
    company: `Reader Ack ${Date.now()}`,
    source: "DIRECT",
    sentDaysAgo: 10,
  });
  const [before] = await db.select().from(applications).where(eq(applications.id, applicationId));
  const mailId = await seedMail({
    subject: "We received your application",
    classification: "APPLICATION_ACKNOWLEDGEMENT",
    recordId: applicationId,
  });
  await page.goto(`/mail/${mailId}`);
  await expect(page.getByRole("button", { name: "Link", exact: true })).toBeVisible();
  await expect(page.getByLabel("Record for this message")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Save as opening", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Link", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Message linked to your record." }),
  ).toBeVisible();
  const [after] = await db.select().from(applications).where(eq(applications.id, applicationId));
  expect(after.appliedAt).toEqual(before.appliedAt);
  const history = await db
    .select()
    .from(applicationEvents)
    .where(eq(applicationEvents.applicationId, applicationId));
  expect(history.map((event) => event.eventType).sort()).toEqual([
    "ACKNOWLEDGEMENT_RECEIVED",
    "APPLICATION_SUBMITTED",
  ]);
  expect(
    await db
      .select()
      .from(applicationRounds)
      .where(eq(applicationRounds.applicationId, applicationId)),
  ).toHaveLength(0);
  await page.goto(`/mail/${mailId}`);
  await expect(page.getByRole("link", { name: "its record", exact: true })).toHaveAttribute(
    "href",
    `/applications/${applicationId}`,
  );
  await expect(page.getByRole("button", { name: "Dismiss", exact: true })).toHaveCount(0);
});

test("reader dismiss keeps durable confirmation and Undo after its action disappears", async ({
  page,
}) => {
  const mailId = await seedMail({
    subject: `Reader dismissal ${Date.now()}`,
    classification: "INTERVIEW",
  });
  await page.goto(`/mail/${mailId}`);
  await page.getByRole("button", { name: "Dismiss", exact: true }).click();
  await expect(page).toHaveURL(/\/applications\?tab=emails&notice=/);
  await expect(page.getByRole("status").filter({ hasText: "Dismissed 1 message." })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Undo last dismiss" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Restored 1 message." })).toBeVisible();
  expect(
    (await db.select().from(mailMessages).where(eq(mailMessages.id, mailId)))[0].attentionState,
  ).toBe("OPEN");
  await page.goto(`/mail/${mailId}`);
  await expect(page.getByRole("button", { name: "Dismiss", exact: true })).toBeVisible();
});

for (const classification of [
  "RECRUITER_OUTREACH",
  "INTERVIEW",
  "APPLICATION_ACKNOWLEDGEMENT",
] as const) {
  test(`legacy DONE ${classification} stays handled despite NEEDS_REVIEW`, async ({ page }) => {
    const { applicationId } = await seedRecord({
      company: `Legacy Done ${Date.now()}`,
      source: "DIRECT",
      sentDaysAgo: 3,
    });
    const id = await seedMail({
      subject: `Legacy ${classification} ${Date.now()}`,
      classification,
      recordId: applicationId,
      attentionState: "DONE",
    });
    await page.goto(`/mail/${id}`);
    await expect(page.getByText("Handled.", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Dismiss", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Link", exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Save as opening", exact: true })).toHaveCount(0);
    await expect(page.getByLabel("Record for this message")).toHaveCount(0);
    await page.goto("/applications?tab=emails");
    await expect(page.locator(`a[href='/mail/${id}']`)).toHaveCount(0);
  });
}

test("unverified Gmail callback returns to Emails without connecting an inbox", async ({
  page,
}) => {
  const response = await page.request.get("/api/mail/gmail/callback", { maxRedirects: 0 });
  expect(response.status()).toBe(307);
  const destination = new URL(response.headers().location);
  expect(destination.pathname).toBe("/applications");
  expect(destination.searchParams.get("tab")).toBe("emails");
  expect(destination.searchParams.get("notice")).toContain("could not be verified");
});

test("reader wraps a long unbroken admitted subject at 390px", async ({ page }) => {
  const subject =
    "Invitation_SoftwareDevelopmentEngineerII_BackendDistributedPaymentsInfrastructureEngineering_Bengaluru".repeat(
      3,
    );
  const id = await seedMail({ subject, classification: "UNKNOWN" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/mail/${id}`);
  await expect(page.getByRole("heading", { name: subject, exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("unconfigured Gmail gives a reachable reason and keeps JSON import", async ({ page }) => {
  await page.goto("/applications?tab=emails");
  await expect(page.getByRole("button", { name: "Connect Gmail", exact: true })).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Connect Gmail", exact: true }),
  ).toHaveAccessibleDescription(
    "Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI, MAIL_TOKEN_ENCRYPTION_KEY in .env",
  );
  await expect(page.getByRole("link", { name: "Import messages", exact: true })).toHaveAttribute(
    "href",
    "/mail/import",
  );
  expect(await page.locator('a[href="/mail#gmail-setup"]').count()).toBe(0);
});
