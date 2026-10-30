import { randomUUID } from "node:crypto";
import { expect, test, type Route } from "@playwright/test";
import { eq, inArray } from "drizzle-orm";
import { db, closeDatabase } from "../../src/db";
import { mailConnections, settings } from "../../src/db/schema";
import { stubExternalSites } from "./helpers/external-sites";
import { type SearchAccount, type SearchResponse } from "../../src/features/mail/search-state";
let accounts: SearchAccount[] = [];
async function guard() {
  if (!process.env.DATABASE_URL || new URL(process.env.DATABASE_URL).pathname !== "/jobops_e2e")
    throw new Error("Search fixtures require jobops_e2e.");
  const [marker] = await db.select().from(settings).where(eq(settings.key, "__jobops_e2e"));
  if (marker?.value.ownedBy !== "jobops-browser-tests")
    throw new Error("Search fixtures require ownership marker.");
}
test.beforeEach(async ({ page }) => {
  await guard();
  accounts = ["GMAIL", "OUTLOOK", "OUTLOOK"].map((provider, i) => ({
    id: randomUUID(),
    provider,
    email: `search-${i}-${randomUUID()}@example.invalid`,
  }));
  await db
    .insert(mailConnections)
    .values(accounts.map((a) => ({ ...a, encryptedAccessToken: "fixture-never-used" })));
  await stubExternalSites(page);
});
test.afterEach(async () => {
  await guard();
  if (accounts.length)
    await db.delete(mailConnections).where(
      inArray(
        mailConnections.id,
        accounts.map((a) => a.id),
      ),
    );
});
test.afterAll(closeDatabase);
function response(
  account: SearchAccount,
  query: Record<string, unknown>,
  more = false,
  second = false,
): SearchResponse {
  const until = query.until as string;
  const text = "Unrecognized personal reply. <img src=https://tracker.invalid/pixel>";
  const message = {
    externalId: "fixture",
    subject: `Reply for ${account.provider} ${account.email}`,
    sender: "talent@example.invalid",
    senderName: "Talent",
    recipient: account.email,
    bodyText: text,
    snippet: text,
    receivedAt: new Date(Date.parse(until) - 3600000).toISOString(),
    folders: ["Junk Email"],
    account: account.email,
    provider: account.provider as "GMAIL" | "OUTLOOK",
    identity: `${account.id}:fixture`,
    classification: {
      type: "UNKNOWN" as const,
      confidence: 0.2,
      relevant: false,
      reasons: ["No clear recruiting event phrase matched"],
    },
  };
  return {
    query: query as SearchResponse["query"],
    readOnly: true,
    window: { since: query.since as string, until, bounds: "since inclusive; until exclusive" },
    scope: "Fixture incoming folders",
    accounts: [
      {
        accountId: account.id,
        account: account.email,
        provider: account.provider as "GMAIL" | "OUTLOOK",
        fetched: 3,
        returned: second ? 2 : 1,
        skippedContext: 1,
        skippedOutsideWindow: second ? 0 : 1,
        messages: second
          ? [
              message,
              {
                ...message,
                externalId: "second",
                identity: `${account.id}:second`,
                subject: `Second page ${account.email}`,
              },
            ]
          : [message],
        error: null,
        complete: !more,
        limited: false,
        totalFetched: second ? 6 : 3,
        effectiveQuery: 'from:"talent@example.invalid"',
      },
    ],
    complete: !more,
    more,
    limited: false,
    nextCursor: more ? account.id : null,
    warning: null,
  };
}
const fulfill = (route: Route, data: SearchResponse) =>
  route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data) });

test("uses the API concurrently, shows independent completions, and accumulates actual pages", async ({
  page,
}) => {
  const queries = new Map<string, Record<string, unknown>>();
  const bodies: Record<string, unknown>[] = [];
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/v1/mail/search", async (route) => {
    const body = route.request().postDataJSON();
    bodies.push(body);
    const account = accounts.find((a) => body.cursor === a.id || body.accounts?.[0] === a.email)!;
    if (!body.cursor) queries.set(account.id, body);
    if (account.id === accounts[0].id && !body.cursor) await held;
    await fulfill(
      route,
      response(
        account,
        queries.get(account.id)!,
        account.id === accounts[0].id && !body.cursor,
        Boolean(body.cursor),
      ),
    );
  });
  await page.goto("/mail/search");
  await page.getByLabel("Number of days").fill("9");
  await page.getByRole("button", { name: "Search inboxes", exact: true }).click();
  const first = page.getByRole("article", { name: `Search status for ${accounts[0].email}` });
  const other = page.getByRole("article", { name: `Search status for ${accounts[1].email}` });
  await expect(first.getByRole("status")).toHaveText("Requesting mail…");
  await expect(other.getByRole("status")).toHaveText("Complete");
  expect(bodies).toHaveLength(3);
  const initial = bodies.filter((b) => !b.cursor);
  expect(new Set(initial.map((b) => b.until)).size).toBe(1);
  expect(Date.parse(initial[0].until as string) - Date.parse(initial[0].since as string)).toBe(
    9 * 86400000,
  );
  release();
  await expect(
    page.getByRole("heading", { name: "Search complete · 4 messages returned" }),
  ).toBeVisible();
  await expect(first).toContainText("2 pages · 6 fetched · 2 unique returned");
  await first.getByText("Query and page activity").click();
  await expect(first).toContainText('from:"talent@example.invalid"');
  await expect(first).toContainText("Page 2");
  await page
    .getByRole("button", { name: new RegExp(`Reply for GMAIL ${accounts[0].email}`) })
    .click();
  await expect(page.getByLabel("Search message reader")).toContainText(
    "No clear recruiting event phrase matched",
  );
  await expect(page.locator('img[src*="tracker.invalid"]')).toHaveCount(0);
});

test("pause retains each account cursor; continue uses the original window and deduplicates results", async ({
  page,
}) => {
  const queries = new Map<string, Record<string, unknown>>();
  const bodies: Record<string, unknown>[] = [];
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/v1/mail/search", async (route) => {
    const body = route.request().postDataJSON();
    bodies.push(body);
    const account = accounts.find((a) => body.cursor === a.id || body.accounts?.[0] === a.email)!;
    if (!body.cursor) {
      queries.set(account.id, body);
      await held;
    }
    await fulfill(
      route,
      response(account, queries.get(account.id)!, !body.cursor, Boolean(body.cursor)),
    );
  });
  await page.goto("/mail/search");
  await page.getByRole("button", { name: "Search inboxes", exact: true }).click();
  await expect.poll(() => bodies.length).toBe(3);
  await page.getByRole("button", { name: "Pause after current pages" }).click();
  release();
  await expect(
    page.getByRole("button", { name: "Continue / retry unfinished accounts" }),
  ).toBeVisible();
  expect(bodies).toHaveLength(3);
  await page.getByRole("button", { name: "Show / edit criteria" }).click();
  await page.getByLabel("Number of days").fill("100");
  await page.getByRole("button", { name: "Continue / retry unfinished accounts" }).click();
  await expect(
    page.getByRole("heading", { name: "Search complete · 6 messages returned" }),
  ).toBeVisible();
  expect(bodies.slice(3).every((b) => Object.keys(b).length === 1 && Boolean(b.cursor))).toBe(true);
});

test("retries only the failed account while keeping successful results", async ({ page }) => {
  const called = new Map<string, number>();
  await page.route("**/api/v1/mail/search", async (route) => {
    const body = route.request().postDataJSON();
    const account = accounts.find((a) => body.accounts?.[0] === a.email)!;
    const count = (called.get(account.id) ?? 0) + 1;
    called.set(account.id, count);
    if (account.id === accounts[1].id && count === 1)
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Fixture connection interrupted" }),
      });
    await fulfill(route, response(account, body));
  });
  await page.goto("/mail/search");
  await page.getByRole("button", { name: "Search inboxes", exact: true }).click();
  await expect(page.getByText("Fixture connection interrupted", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Continue / retry unfinished accounts" }).click();
  await expect(
    page.getByRole("heading", { name: "Search complete · 3 messages returned" }),
  ).toBeVisible();
  expect(called.get(accounts[0].id)).toBe(1);
  expect(called.get(accounts[1].id)).toBe(2);
});

test("gallery is explicitly sample-only and the mobile message reader fits the viewport", async ({
  page,
}, testInfo) => {
  let requests = 0;
  page.on("request", (request) => {
    if (request.url().includes("/api/v1/mail/search")) requests++;
  });
  await page.goto("/gallery/mail/search");
  await expect(
    page.getByText("Gallery preview · sample accounts and messages. No inboxes are contacted."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Search inboxes", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Search complete · 4 messages returned" }),
  ).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("mail-search-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: /Amazon interview invitation/ }).click();
  await expect(page.getByLabel("Search message reader")).toContainText("sample gallery content");
  await page.getByRole("button", { name: "Back to results" }).click();
  await expect(page.getByRole("button", { name: /Amazon interview invitation/ })).toBeVisible();
  expect(requests).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
