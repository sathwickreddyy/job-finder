import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { eq, inArray } from "drizzle-orm";
import { closeDatabase, db } from "../../src/db";
import { activityLogs, applications, jobs } from "../../src/db/schema";
import { stubExternalSites } from "./helpers/external-sites";
import { cleanupMailFixtures, guardMailFixtures } from "./helpers/task13-mail";

const recorded: { jobs: string[]; applications: string[]; companies: string[] } = {
  jobs: [],
  applications: [],
  companies: [],
};
test.beforeEach(async ({ page }) => {
  await stubExternalSites(page);
});
test.afterEach(async ({ request }) => {
  await cleanupMailFixtures();
  await guardMailFixtures();
  if (recorded.applications.length) {
    await db.delete(activityLogs).where(inArray(activityLogs.entityId, recorded.applications));
    await db.delete(applications).where(inArray(applications.id, recorded.applications));
  }
  if (recorded.jobs.length) await db.delete(jobs).where(inArray(jobs.id, recorded.jobs));
  for (const id of recorded.companies)
    await request.patch(`/api/v1/companies/${id}`, { data: { archive: true } });
  recorded.jobs.length = recorded.applications.length = recorded.companies.length = 0;
});
test.afterAll(closeDatabase);

test("agent record appears on Applications and the company page", async ({ page, request }) => {
  const key = randomUUID().slice(0, 8);
  const name = `Foundation ${key}`;
  const company = await request.post("/api/v1/companies", {
    data: { slug: `e2e-foundation-${key}`, name },
  });
  expect(company.status(), await company.text()).toBe(201);
  recorded.companies.push((await company.json()).id);
  const response = await request.post("/api/v1/applications", {
    data: {
      opening: {
        url: `https://jobs.example.invalid/foundation/${key}`,
        company: name,
        title: `Platform Engineer ${key}`,
      },
      application: { method: "DIRECT" },
      humanConfirmed: true,
    },
  });
  expect(response.status(), await response.text()).toBe(201);
  const result = await response.json();
  recorded.applications.push(result.id);
  const [app] = await db.select().from(applications).where(eq(applications.id, result.id));
  recorded.jobs.push(app.jobId);
  expect(result.links).toEqual({
    application: `/applications/${result.id}`,
    company: `/companies/e2e-foundation-${key}`,
  });
  expect(result.warnings).toContain(
    "Posting date unknown. Verify it before applying to similar openings.",
  );
  await page.goto("/applications");
  await expect(page.getByText(name).first()).toBeVisible();
  await page.goto(result.links.company);
  await expect(
    page
      .getByRole("complementary", { name: "Company facts" })
      .getByRole("link", { name: `Platform Engineer ${key}` }),
  ).toBeVisible();
});
