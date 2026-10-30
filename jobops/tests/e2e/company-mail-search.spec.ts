import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { eq, inArray, sql } from "drizzle-orm";
import { db, closeDatabase } from "../../src/db";
import {
  activityLogs,
  companyRecords,
  mailConnections,
  mailMessages,
  mailTracking,
  settings,
} from "../../src/db/schema";
import { companyPage } from "../../src/features/mail/company-search";
import { companyProgressKey } from "../../src/features/mail/company-search-policy";
import { ruleKey } from "../../src/features/mail/context";
import { gmail } from "../../src/services/mail/providers/gmail";
import { stubExternalSites } from "./helpers/external-sites";
let account: typeof mailConnections.$inferSelect;
let company: typeof companyRecords.$inferSelect;
async function guard() {
  if (!process.env.DATABASE_URL || new URL(process.env.DATABASE_URL).pathname !== "/jobops_e2e")
    throw new Error("Company browser fixtures require jobops_e2e.");
  const [marker] = await db.select().from(settings).where(eq(settings.key, "__jobops_e2e"));
  if (marker?.value.ownedBy !== "jobops-browser-tests")
    throw new Error("Company browser fixtures require ownership marker.");
}
test.beforeEach(async ({ page }) => {
  await guard();
  await stubExternalSites(page);
  const key = `saved-company-${randomUUID()}`;
  [account] = await db
    .insert(mailConnections)
    .values({
      provider: "GMAIL",
      email: `${key}@example.invalid`,
      encryptedAccessToken: "fixture-never-read",
    })
    .returning();
  [company] = await db
    .insert(companyRecords)
    .values({ name: key, slug: key, websiteUrl: "https://recruiting.fixture.invalid" })
    .returning();
});
test.afterEach(async () => {
  await guard();
  await db.delete(mailTracking).where(eq(mailTracking.accountEmail, account.email));
  await db.delete(mailMessages).where(eq(mailMessages.accountEmail, account.email));
  await db
    .delete(activityLogs)
    .where(sql`${activityLogs.metadata}->>'accountEmail' = ${account.email}`);
  await db
    .delete(settings)
    .where(
      inArray(settings.key, [
        ruleKey(company.name),
        ...["latest", "history"].map((mode) => companyProgressKey(company.name, account.id, mode)),
      ]),
    );
  await db.delete(mailConnections).where(eq(mailConnections.id, account.id));
  await db.delete(companyRecords).where(eq(companyRecords.id, company.id));
});
test.afterAll(closeDatabase);
test("company rules, saved history, reloads, cache checks and rule-based exclusions work together", async ({
  page,
}, testInfo) => {
  const now = Date.now();
  const originalFolders = gmail.folders,
    originalScan = gmail.scanMail;
  const context = {
    baselineAt: new Date(now - 30 * 86400000).toISOString(),
    outbound: [],
    applications: [],
    companies: [
      {
        id: company.name,
        name: company.name,
        slug: company.slug,
        baselineAt: new Date(now - 30 * 86400000).toISOString(),
        ruleSource: "fixture",
        rule: {
          company: company.name,
          domains: ["recruiting.fixture.invalid"],
          aliases: [],
          senders: [],
          subjectTerms: [],
          excludedTerms: [],
        },
      },
    ],
  };
  try {
    gmail.folders = async () => [{ id: "SPAM", name: "Spam" }];
    gmail.scanMail = async () => ({
      messages: [
        {
          externalId: "ack",
          sender: "talent@recruiting.fixture.invalid",
          subject: "Application received",
          bodyText: "Thank you for applying. This is fictional browser-test mail.",
          receivedAt: new Date(now - 3600000).toISOString(),
          folders: ["Spam"],
        },
        {
          externalId: "receipt",
          sender: "billing@recruiting.fixture.invalid",
          subject: "Your invoice",
          bodyText: "Invoice details. Careers footer.",
          receivedAt: new Date(now - 7200000).toISOString(),
          folders: ["Inbox"],
        },
      ],
    });
    await companyPage(
      account,
      context.companies[0],
      context,
      {
        keywords: [],
        senders: [],
        subjects: [],
        since: new Date(now - 14 * 86400000).toISOString(),
        until: new Date(now + 86400000).toISOString(),
      },
      "latest",
    );
  } finally {
    gmail.folders = originalFolders;
    gmail.scanMail = originalScan;
  }
  let checks = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/api/v1/mail/company/search"))
      checks++;
  });
  await page.goto(`/mail/search?company=${company.name}&account=${account.email}`);
  await expect(page.getByRole("button", { name: "Kept (1)", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Application received/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Your invoice/ })).toHaveCount(0);
  await expect(page.getByLabel("Recruiting sender domains")).toHaveValue(
    "recruiting.fixture.invalid",
  );
  await page.reload();
  await expect(page.getByRole("button", { name: /Application received/ })).toBeVisible();
  expect(checks).toBe(0);
  await page.getByRole("button", { name: "Check company mail", exact: true }).click();
  await expect(
    page.getByText("Already covered · used saved mail, no provider request."),
  ).toBeVisible();
  expect(checks).toBe(1);
  await page.getByRole("button", { name: /Application received/ }).click();
  await page.screenshot({ path: testInfo.outputPath("saved-company-mail-kept.png"), fullPage: true });
  await page.getByLabel("Exclude phrases", { exact: true }).fill("application");
  await page.getByRole("button", { name: "Save company rules", exact: true }).click();
  await expect(page.getByRole("button", { name: "Kept (0)", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Excluded (2)", exact: true }).click();
  await expect(page.getByRole("button", { name: /Application received/ })).toBeVisible();
  await page.getByRole("button", { name: /Application received/ }).click();
  await expect(page.getByLabel("Search message reader")).toContainText(
    "Matches a company exclusion rule",
  );
  await page.screenshot({ path: testInfo.outputPath("saved-company-mail.png"), fullPage: true });
});
