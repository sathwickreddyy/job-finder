import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { closeDatabase } from "../../src/db";
import { stubExternalSites } from "./helpers/external-sites";
import { cleanupRecords, istDay, seedRecord } from "./helpers/records";
import { cleanupMailFixtures, guardMailFixtures, seedMail } from "./helpers/task13-mail";

test.beforeEach(guardMailFixtures);
test.beforeEach(async ({ page }) => stubExternalSites(page));
test.afterEach(async () => {
  await cleanupMailFixtures();
  await cleanupRecords();
});
test.afterAll(closeDatabase);

const unique = (label: string) => `${label} ${randomUUID().slice(0, 8)}`;
const keyOf = (name: string) => name.toLowerCase();
const rail = (page: Page) => page.getByRole("navigation", { name: "Companies" });
const railRow = (page: Page, company: string) =>
  rail(page).getByRole("link", { name: new RegExp(company) });
const mailRow = (page: Page, subject: string) =>
  page.getByRole("button", { name: new RegExp(subject) });
const openCompany = (page: Page, company: string) =>
  page.goto(`/mail?${new URLSearchParams({ company })}`);
async function companyWithMail(
  classification: Parameters<typeof seedMail>[0]["classification"],
  label = "Timeline Co",
) {
  const company = unique(label);
  await seedRecord({ company, source: "DIRECT", sentDaysAgo: 2 });
  const subject = unique("Email");
  const id = await seedMail({ subject, classification, companyKey: keyOf(company) });
  return { company, subject, id };
}

test("opens the first Needs you company", async ({ page }) => {
  const { company } = await companyWithMail("INTERVIEW");
  await page.goto("/mail");
  const needs = rail(page).getByRole("region", { name: "Needs you" });
  await expect(needs.getByRole("link").first()).toHaveAttribute("aria-current", "page");
  await expect(railRow(page, company)).toContainText("New: 1");
  await railRow(page, company).click();
  await expect(page.getByRole("heading", { level: 2, name: company })).toBeVisible();
  await expect(railRow(page, company)).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("button", { name: "Record round scheduled" })).toBeVisible();
  await expect(page.getByText("Suggested for an interview email.")).toBeVisible();
});

test("records the suggested outcome with a time", async ({ page }) => {
  const { company } = await companyWithMail("INTERVIEW");
  await openCompany(page, company);
  await page.getByRole("button", { name: "Record round scheduled" }).click();
  await page.getByLabel("Day", { exact: true }).fill(istDay(3));
  await page.getByLabel("Time", { exact: true }).fill("15:00");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText(/^Recorded: DSA round scheduled for/)).toBeVisible();
  await expect(railRow(page, company)).not.toContainText("New:");
  await expect(page.getByText("DSA round", { exact: true })).toBeVisible();
});

test("Just info and Undo", async ({ page }) => {
  const { company, subject } = await companyWithMail("INTERVIEW");
  await openCompany(page, company);
  await page.getByRole("button", { name: "Just info", exact: true }).click();
  await expect(page.getByText("Marked as just info")).toBeVisible();
  await expect(mailRow(page, subject)).not.toContainText("Needs you");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(mailRow(page, subject)).toContainText("Needs you");
  await expect(page.getByRole("button", { name: "Record round scheduled" })).toBeVisible();
});

test("asks which role with two open applications", async ({ page }) => {
  const company = unique("Two Roles Co");
  await seedRecord({ company, source: "DIRECT", sentDaysAgo: 2, title: "Backend Engineer" });
  await seedRecord({ company, source: "DIRECT", sentDaysAgo: 2, title: "Platform Engineer" });
  await seedMail({
    subject: unique("Update"),
    classification: "FOLLOW_UP",
    companyKey: keyOf(company),
  });
  await openCompany(page, company);
  await expect(page.getByRole("group", { name: "Filter by role" })).toContainText("All roles");
  const which = page.getByRole("radiogroup", { name: "Which role?" });
  await expect(page.getByRole("button", { name: "Record heard back" })).toHaveCount(0);
  await which.getByRole("radio", { name: "Platform Engineer" }).click();
  await expect(page.getByRole("button", { name: "Record heard back" })).toBeVisible();
  await page.getByRole("button", { name: "Something else" }).click();
  await page.getByRole("button", { name: "Sent a follow-up", exact: true }).click();
  await expect(page.getByText("Recorded: Sent a follow-up")).toBeVisible();
});

test("tag pill narrows rail and timeline", async ({ page }) => {
  const offer = await companyWithMail("OFFER", "Offer Co");
  const other = await companyWithMail("INTERVIEW", "Other Co");
  const interview = unique("Interview");
  await seedMail({
    subject: interview,
    classification: "INTERVIEW",
    companyKey: keyOf(offer.company),
  });
  await openCompany(page, offer.company);
  await expect(mailRow(page, interview)).toBeVisible();
  await page
    .getByRole("group", { name: "Filter by tag" })
    .getByRole("link", { name: /^Offer/ })
    .click();
  await expect(page).toHaveURL(/tag=offer/);
  await expect(railRow(page, offer.company)).toBeVisible();
  await expect(railRow(page, other.company)).toHaveCount(0);
  await expect(mailRow(page, offer.subject)).toBeVisible();
  await expect(mailRow(page, interview)).toHaveCount(0);
});

test("search narrows rail and timeline", async ({ page }) => {
  const word = `needle${randomUUID().slice(0, 6)}`;
  const match = await companyWithMail("FOLLOW_UP", "Search Co");
  const other = await companyWithMail("FOLLOW_UP", "Quiet Co");
  const subject = `Update about ${word}`;
  await seedMail({ subject, classification: "FOLLOW_UP", companyKey: keyOf(match.company) });
  await page.goto("/mail");
  const search = rail(page).getByRole("searchbox", { name: "Search mail" });
  await search.fill(word);
  await search.press("Enter");
  await expect(page).toHaveURL(new RegExp(`q=${word}`));
  await expect(railRow(page, match.company)).toContainText("1 match");
  await expect(railRow(page, other.company)).toHaveCount(0);
  await expect(mailRow(page, subject)).toBeVisible();
  await expect(mailRow(page, match.subject)).toHaveCount(0);
});

test("places a Needs a home email", async ({ page }) => {
  const company = unique("Home Co");
  await seedRecord({ company, source: "DIRECT", sentDaysAgo: 2 });
  const subject = unique("Unplaced note");
  const id = await seedMail({ subject, classification: "UNKNOWN" });
  await page.goto(`/mail?view=home&mail=${id}`);
  await expect(page.getByRole("heading", { level: 2, name: "Needs a home" })).toBeVisible();
  await expect(page.getByText(`${subject} full message`)).toBeVisible();
  await page.getByText("Place at…").click();
  await page.getByLabel("Company or application").selectOption({ label: company });
  await page.getByRole("button", { name: "Place", exact: true }).click();
  await expect(mailRow(page, subject)).toHaveCount(0);
  await openCompany(page, company);
  await expect(mailRow(page, subject)).toBeVisible();
});

test("old single-email links open the email in its timeline", async ({ page }) => {
  const { company, subject, id } = await companyWithMail("INTERVIEW");
  await page.goto(`/mail/${id}`);
  await expect(page).toHaveURL(new RegExp(`/mail\\?company=.+&mail=${id}$`));
  await expect(page.getByRole("heading", { level: 2, name: company })).toBeVisible();
  await expect(page.getByText(`${subject} full message`)).toBeVisible();
  await page.goto(`/mail/${randomUUID()}`);
  await expect(page.getByRole("heading", { name: /not found/i })).toBeVisible();
});

test("legacy handled mail stays handled despite a pending review event", async ({ page }) => {
  const company = unique("Legacy Co");
  const { applicationId } = await seedRecord({ company, source: "DIRECT", sentDaysAgo: 3 });
  const subject = unique("Legacy interview");
  await seedMail({
    subject,
    classification: "INTERVIEW",
    recordId: applicationId,
    attentionState: "DONE",
    companyKey: keyOf(company),
  });
  await openCompany(page, company);
  await expect(mailRow(page, subject)).toBeVisible();
  await expect(mailRow(page, subject)).not.toContainText("Needs you");
  await expect(page.getByRole("button", { name: "Record round scheduled" })).toHaveCount(0);
});

test("company page opens on Timeline with the aside", async ({ page }) => {
  await seedRecord({
    company: "Atlassian",
    source: "DIRECT",
    sentDaysAgo: 2,
    title: "Timeline Engineer",
  });
  const subject = unique("Atlassian interview");
  await seedMail({ subject, classification: "INTERVIEW", companyKey: "atlassian" });
  await page.goto("/companies/atlassian");
  await expect(page.getByRole("heading", { level: 1, name: "Atlassian" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Timeline", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  const aside = page.getByRole("complementary", { name: "Company facts" });
  for (const heading of ["Your roles", "Pay", "Interview loop"])
    await expect(aside.getByRole("heading", { name: heading, exact: true })).toBeVisible();
  await expect(aside.getByRole("link", { name: "Timeline Engineer" })).toBeVisible();
  await expect(mailRow(page, subject)).toBeVisible();
  await expect(page.getByRole("button", { name: "Record round scheduled" })).toBeVisible();
  await expect(
    page.getByText("Typical rounds", { exact: true }).filter({ visible: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Just info", exact: true }).click();
  await expect(page.getByText("Marked as just info")).toBeVisible();
  await expect(mailRow(page, subject)).not.toContainText("Needs you");
});

test("progress tab opens Timeline", async ({ page }) => {
  await page.goto("/companies/atlassian?tab=progress");
  await expect(page.getByRole("tab", { name: "Timeline", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

test("research tabs keep their content", async ({ page }) => {
  await page.goto("/companies/atlassian?tab=pay");
  await expect(page.getByRole("tab", { name: "Compensation", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByRole("heading", { level: 2, name: "Compensation" })).toBeVisible();
  await expect(
    page.getByText("Typical rounds", { exact: true }).filter({ visible: true }),
  ).toHaveCount(1);
});

const fitsWidth = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test("long and empty fields keep the phone layout", async ({ page }) => {
  await seedRecord({ company: "Atlassian", source: "DIRECT", sentDaysAgo: 2 });
  const subject = "Invitation_SoftwareDevelopmentEngineerII_BackendPaymentsInfrastructure_".repeat(
    5,
  );
  const id = await seedMail({
    subject: subject.slice(0, 300),
    sender: `${"recruiting-coordination-team".repeat(3)}@example.invalid`,
    senderName: "",
    classification: "INTERVIEW",
    companyKey: "atlassian",
    bodyText: `${"Please share your availability for the next round. ".repeat(90)}https://example.invalid/${"a".repeat(400)}`,
  });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/mail");
  expect(await fitsWidth(page)).toBe(true);
  await page.goto(`/mail?company=atlassian&mail=${id}`);
  await expect(page.getByText("Please share your availability").first()).toBeVisible();
  expect(await fitsWidth(page)).toBe(true);
  await page.goto("/companies/atlassian");
  await expect(page.getByRole("button", { name: "Record round scheduled" })).toBeVisible();
  expect(await fitsWidth(page)).toBe(true);
});

test("captures Mail and the company page", async ({ page }) => {
  await seedRecord({
    company: "Atlassian",
    source: "DIRECT",
    sentDaysAgo: 2,
    title: "SDE II Backend",
  });
  await seedMail({
    subject: unique("Interview invitation"),
    classification: "INTERVIEW",
    companyKey: "atlassian",
  });
  await seedMail({
    subject: unique("Offer letter"),
    classification: "OFFER",
    companyKey: "atlassian",
    attentionState: "DONE",
  });
  await seedMail({ subject: unique("Recruiter note"), classification: "RECRUITER_OUTREACH" });
  for (const theme of ["light", "dark"] as const)
    for (const [width, height] of [
      [375, 812],
      [1440, 900],
    ]) {
      await page.addInitScript((value) => localStorage.setItem("jobops-theme", value), theme);
      await page.setViewportSize({ width, height });
      for (const [name, path] of [
        ["mail", "/mail?company=atlassian"],
        ["company", "/companies/atlassian"],
      ]) {
        await page.goto(path);
        await expect(page.getByRole("button", { name: "Record round scheduled" })).toBeVisible();
        expect(await fitsWidth(page)).toBe(true);
        await page.screenshot({
          path: `test-results/company-timeline/${name}-${theme}-${width}.png`,
          fullPage: true,
        });
      }
    }
});
