import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { expect, test } from "@playwright/test";
import { closeDatabase, db } from "../../src/db";
import {
  applicationEvents,
  applicationRounds,
  applications,
  companyFacts,
  companyRecords,
  jobs,
  settings,
} from "../../src/db/schema";

const fixture = {
  jobId: randomUUID(),
  applicationId: randomUUID(),
  outreachId: randomUUID(),
  companyId: randomUUID(),
};
const company = `Records ladder ${fixture.companyId}`;
let ownsFixtures = false;

async function guardDatabase() {
  if (!process.env.DATABASE_URL || new URL(process.env.DATABASE_URL).pathname !== "/jobops_e2e")
    throw new Error("Records browser tests require the isolated jobops_e2e database.");
  const [marker] = await db.select().from(settings).where(eq(settings.key, "__jobops_e2e"));
  if (marker?.value.ownedBy !== "jobops-browser-tests")
    throw new Error("Records browser tests require the JobOps test ownership marker.");
}

test.beforeAll(async () => {
  await guardDatabase();
  ownsFixtures = true;
  await db.insert(companyRecords).values({
    id: fixture.companyId,
    slug: `records-ladder-${fixture.companyId}`,
    name: company,
  });
  await db.insert(companyFacts).values({
    companyId: fixture.companyId,
    factKey: "long-loop",
    category: "INTERVIEW",
    title: "Research loop",
    sourceUrl: "https://example.invalid/research",
    data: {
      role: "Software Engineer II",
      outcome: "OFFER",
      roundCount: 28,
      rounds: [{ kind: "DSA", name: "Coding" }],
    },
  });
  await db.insert(jobs).values({
    id: fixture.jobId,
    company,
    title: "Software Engineer II",
    canonicalUrl: `https://example.invalid/records/${fixture.jobId}`,
    dedupeKey: fixture.jobId,
    source: "E2E",
    location: "Bengaluru",
  });
  await db.insert(applications).values([
    {
      id: fixture.applicationId,
      jobId: fixture.jobId,
      source: "MANUAL",
      status: "TECHNICAL_INTERVIEW",
      appliedAt: new Date(),
    },
    {
      id: fixture.outreachId,
      jobId: fixture.jobId,
      source: "REFERRAL",
      status: "APPLIED",
      appliedAt: new Date(),
    },
  ]);
  await db.insert(applicationEvents).values({
    applicationId: fixture.outreachId,
    eventType: "OUTREACH_SENT",
    summary: "Asked Ananya for a referral",
    payload: { recipient: "Ananya" },
    occurredAt: new Date(),
  });
  await db.insert(applicationRounds).values(
    Array.from({ length: 12 }, (_, index) => ({
      applicationId: fixture.applicationId,
      position: index + 1,
      kind: "DSA" as const,
      name: index === 0 ? "Long".repeat(40) : `Recorded round ${index + 1}`,
      outcome: index === 11 ? ("SCHEDULED" as const) : ("PASSED" as const),
      scheduledAt: new Date("2026-10-05T10:00:00+05:30"),
    })),
  );
});

test.afterAll(async () => {
  try {
    if (ownsFixtures) {
      await guardDatabase();
      await db.delete(applications).where(eq(applications.jobId, fixture.jobId));
      await db.delete(jobs).where(eq(jobs.id, fixture.jobId));
      await db.delete(companyRecords).where(eq(companyRecords.id, fixture.companyId));
    }
  } finally {
    await closeDatabase();
  }
});

test("Records wraps real and research ladders and exposes round details to hover and focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/applications?tab=records&filter=all&q=${encodeURIComponent(company)}`);
  const opening = page
    .locator("li")
    .filter({ has: page.getByRole("link", { name: company, exact: true }) });
  await expect(opening).toHaveCount(1);
  await expect(
    opening.getByRole("link", { name: "Referral ask · Ananya", exact: true }),
  ).toBeVisible();
  const rounds = opening.getByRole("button", { name: /^DSA:/ });
  await expect(rounds).toHaveCount(12);
  const research = opening.locator('[aria-label="Typical loop: 28 rounds (company research)"]');
  await expect(research).toHaveCount(1);

  await rounds.first().hover();
  await expect(page.getByRole("tooltip")).toContainText("Long".repeat(40));
  await expect(page.getByRole("tooltip")).toContainText("cleared");
  await page.mouse.move(0, 0);
  await rounds.last().focus();
  await expect(page.getByRole("tooltip")).toContainText("Recorded round 12");
  await expect(page.getByRole("tooltip")).toContainText("booked");
  const tooltipId = await page.getByRole("tooltip").getAttribute("id");
  await expect(rounds.last()).toHaveAttribute("aria-describedby", tooltipId!);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await research.focus();
  await expect(page.getByRole("tooltip")).toHaveText("Typical loop: 28 rounds (company research)");

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  expect(await opening.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
    true,
  );
  const positions = await rounds.evaluateAll((elements) =>
    elements.map((element) => element.getBoundingClientRect().top),
  );
  expect(new Set(positions).size).toBeGreaterThan(1);

  await page.setViewportSize({ width: 1280, height: 900 });
  for (const label of ["Opening", "Rounds", "Latest"])
    await expect(page.getByText(label, { exact: true })).toBeVisible();
});

for (const research of [false, true]) {
  test(`Escape dismisses a pointer-open ${research ? "research" : "recorded round"} tooltip with focus on search`, async ({
    page,
  }) => {
    await page.goto(`/applications?tab=records&filter=all&q=${encodeURIComponent(company)}`);
    const opening = page
      .locator("li")
      .filter({ has: page.getByRole("link", { name: company, exact: true }) });
    const search = page.getByRole("searchbox");
    await search.focus();
    const marker = research
      ? opening.locator('[aria-label="Typical loop: 28 rounds (company research)"]')
      : opening.getByRole("button", { name: /^DSA:/ }).first();
    await marker.hover();
    await expect(page.getByRole("tooltip")).toBeVisible();
    await expect(search).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("tooltip")).toHaveCount(0);
    await expect(search).toBeFocused();
  });
}
