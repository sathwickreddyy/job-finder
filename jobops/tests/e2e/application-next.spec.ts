import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { expect, test } from "@playwright/test";
import { closeDatabase, db } from "../../src/db";
import { applicationEvents, applications, jobs, settings } from "../../src/db/schema";

let fixture: { applicationId: string; jobId: string } | null = null;

async function requireOwnedDatabase() {
  const url = process.env.DATABASE_URL;
  if (!url || new URL(url).pathname !== "/jobops_e2e")
    throw new Error("Next tests require the isolated jobops_e2e database.");
  const [marker] = await db.select().from(settings).where(eq(settings.key, "__jobops_e2e"));
  if (marker?.value.ownedBy !== "jobops-browser-tests")
    throw new Error("Next tests require the JobOps browser-test ownership marker.");
}

test.beforeEach(requireOwnedDatabase);
test.afterEach(async () => {
  if (!fixture) return;
  await requireOwnedDatabase();
  await db.delete(applications).where(eq(applications.id, fixture.applicationId));
  await db.delete(jobs).where(eq(jobs.id, fixture.jobId));
  fixture = null;
});
test.afterAll(closeDatabase);

test("overdue outreach keeps follow-up, close and snooze reachable at 390px", async ({ page }) => {
  const company = `Next mobile ${randomUUID()} LongCompanyNameWithNoBreaks`.repeat(2);
  const contact = "Recruiter with a very long contact name";
  const jobId = randomUUID();
  const applicationId = randomUUID();
  await requireOwnedDatabase();
  fixture = { applicationId, jobId };
  await db.insert(jobs).values({
    id: jobId,
    company,
    title: "SDE II",
    location: "Hyderabad",
    canonicalUrl: `https://example.invalid/next-mobile/${jobId}`,
    source: "MANUAL",
    dedupeKey: `next-mobile:${jobId}`,
    notes: "Fictional mobile queue fixture",
  });
  await db.insert(applications).values({
    id: applicationId,
    jobId,
    source: "REFERRAL",
    status: "APPLIED",
  });
  await db.insert(applicationEvents).values({
    applicationId,
    eventType: "OUTREACH_SENT",
    occurredAt: new Date(Date.now() - 8 * 86_400_000),
    summary: "Fictional referral request sent",
    payload: { recipient: contact },
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/applications?tab=next");
  const band = page.getByRole("region", { name: /slipped past .* date/ });
  const item = band.getByRole("listitem").filter({ hasText: company });
  const primary = item.getByRole("link", { name: new RegExp("Record follow-up") });
  const secondary = item.getByRole("link", { name: "Close as no reply", exact: true });
  const snooze = item.getByRole("button", { name: `Snooze No reply from ${contact} for 2 days` });
  await expect(primary).toHaveAttribute(
    "href",
    `/applications/${applicationId}?outcome=followup#what-happened`,
  );
  await expect(primary).toHaveAccessibleName(new RegExp(contact));
  await expect(secondary).toHaveAttribute(
    "href",
    `/applications/${applicationId}?outcome=ghosted#what-happened`,
  );
  for (const control of [primary, secondary, snooze]) {
    await expect(control).toBeVisible();
    await control.focus();
    await expect(control).toBeFocused();
    const bounds = await control.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  }
  // Full company text is visible and wraps; it is never ellipsized inside the pill.
  const label = primary.getByText(company, { exact: true });
  await expect(label).toBeVisible();
  expect(await label.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
