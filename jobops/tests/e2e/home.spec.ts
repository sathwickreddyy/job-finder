import { expect, test, type Page, type Route } from "@playwright/test";
import { and, desc, eq } from "drizzle-orm";
import { db, closeDatabase } from "../../src/db";
import { profiles, resumes, resumeVersions } from "../../src/db/schema";
import { stubExternalSites } from "./helpers/external-sites";

test.beforeEach(async ({ page }) => {
  expect(new URL(process.env.DATABASE_URL!).pathname).toBe("/jobops_e2e");
  await stubExternalSites(page);
});
test.afterAll(() => closeDatabase());

const popup = (page: Page) =>
  page.getByRole("status").filter({ has: page.getByRole("progressbar") });
const tile = (page: Page, name: string) =>
  page.locator("article").filter({ has: page.getByRole("heading", { name, exact: true }) });

/** Hold a response until the assertion releases it; no timing assumptions about server speed. */
function heldResponse() {
  let release!: () => void;
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    release: () => release(),
    handle: async (route: Route) => {
      const response = await route.fetch();
      await ready;
      await route.fulfill({ response });
    },
  };
}

async function expectBlocked(page: Page) {
  await expect(page.locator("[inert]")).toContainText("JobOps");
  await expect(popup(page).getByRole("progressbar")).not.toHaveAttribute("aria-valuenow");
}

test("home identity and search cards use real seeded current and desired roles", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Demo", exact: true })).toBeVisible();
  await expect(
    page.getByText("Software Engineer at Example Systems (Fictional)", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("6 years experience", { exact: true })).toBeVisible();
  await expect(page.getByText("Fictional demo candidate.", { exact: true })).toBeVisible();
  const [current] = await db
    .select()
    .from(resumeVersions)
    .innerJoin(resumes, eq(resumes.id, resumeVersions.resumeId))
    .where(and(eq(resumes.isActive, true), eq(resumeVersions.isCurrent, true)))
    .orderBy(desc(resumeVersions.createdAt))
    .limit(1);
  await expect(
    page.getByRole("link", {
      name: `Current resume: ${current.resume_versions.versionLabel}`,
      exact: true,
    }),
  ).toHaveAttribute("href", `/resumes?file=${current.resume_versions.id}`);
  await expect(
    page.getByRole("link", { name: "GitHub, demo-jobops (opens in a new tab)", exact: true }),
  ).toHaveAttribute("href", "https://github.com/demo-jobops");
  await expect(
    page.getByRole("link", { name: "Medium, @demo-jobops (opens in a new tab)", exact: true }),
  ).toHaveAttribute("href", "https://medium.com/@demo-jobops");
  await expect(tile(page, "Portfolio")).toBeVisible();
  await expect(tile(page, "Resume")).toBeVisible();
  await tile(page, "GitHub").scrollIntoViewIfNeeded();
  await expect(
    tile(page, "GitHub").getByRole("img", {
      name: "GitHub contributions for demo-jobops over the last year",
    }),
  ).toBeVisible();
  const sites = page.getByRole("region", { name: "Places to find openings" });
  const linkedIn = sites.getByRole("link", { name: /^LinkedIn/ });
  const searchUrl = new URL((await linkedIn.getAttribute("href"))!);
  expect(searchUrl.searchParams.get("keywords")).toBe("Senior Backend Engineer");
  expect(searchUrl.searchParams.get("location")).toBe("Bengaluru, India");
  await expect(sites.getByRole("link", { name: /^Naukri/ })).toHaveAttribute(
    "href",
    "https://www.naukri.com/senior-backend-engineer-jobs-in-bengaluru",
  );
  for (const [name, href] of [
    ["Instahyre", "https://www.instahyre.com/"],
    ["Cutshort", "https://cutshort.io/"],
    ["Hirist", "https://www.hirist.tech/"],
  ])
    await expect(sites.getByRole("link", { name: new RegExp(`^${name}`) })).toHaveAttribute(
      "href",
      href,
    );
});

test("profile previews open live content and close by Escape, button and backdrop with focus restored", async ({
  page,
}) => {
  await page.goto("/");
  const portfolio = tile(page, "Portfolio").getByRole("button", {
    name: "Preview Portfolio",
    exact: true,
  });
  await portfolio.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const frame = dialog.locator('iframe[title="Portfolio preview"]');
  await expect(frame).toHaveAttribute(
    "sandbox",
    "allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox",
  );
  await frame.contentFrame().getByRole("button", { name: "Explore demo" }).click();
  await expect(frame.contentFrame().getByRole("button", { name: "Demo clicked" })).toBeVisible();
  // A cross-origin iframe owns its keyboard events; return focus to the dialog's controls.
  await dialog.getByRole("button", { name: "Close preview" }).focus();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(portfolio).toBeFocused();
  await portfolio.click();
  await frame.contentFrame().getByRole("button", { name: "Explore demo" }).click();
  await dialog.getByRole("button", { name: "Close preview" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(portfolio).toBeFocused();
  await portfolio.click();
  await frame.contentFrame().getByRole("button", { name: "Explore demo" }).click();
  await page.mouse.click(4, 4);
  await expect(dialog).not.toBeVisible();
  await expect(portfolio).toBeFocused();
  const github = tile(page, "GitHub").getByRole("button", { name: "Preview GitHub", exact: true });
  await github.click();
  await expect(dialog.getByRole("link", { name: "Open GitHub", exact: true })).toHaveAttribute(
    "href",
    "https://github.com/demo-jobops",
  );
  await page.mouse.click(4, 4);
  await expect(dialog).not.toBeVisible();
  await expect(github).toBeFocused();
  await expect(tile(page, "Medium")).toHaveCount(0);
});

test("open-in-new-tab controls keep the first external request inside local stubs", async ({
  page,
}) => {
  await page.goto("/");
  const opened = page.waitForEvent("popup");
  await tile(page, "Portfolio")
    .getByRole("link", { name: "Open Portfolio in a new tab", exact: true })
    .click();
  const tab = await opened;
  await expect(
    tab.getByRole("heading", { name: "Fictional portfolio", exact: true }),
  ).toBeVisible();
  await tab.close();
});

test("slow RSC navigation blocks the app then dismisses on arrival", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Use light theme", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  const held = heldResponse();
  await page.route("**/companies?*", (route) =>
    route.request().headers().rsc === "1" ? held.handle(route) : route.continue(),
  );
  await page
    .getByRole("link", { name: "Browse Bengaluru & Hyderabad companies", exact: true })
    .click();
  await expect(popup(page)).toContainText("Opening Companies");
  await expectBlocked(page);
  held.release();
  await expect(page).toHaveURL(/\/companies$/);
  await expect(popup(page)).not.toBeVisible();
  await expect(page.locator("[inert]")).toHaveCount(0);
});

test("slow ActionForm save keeps its popup visible through the redirect", async ({ page }) => {
  const name = `Loading demo ${Date.now()}`;
  await page.goto("/contacts/new?company=Example%20Loading%20Company");
  await page.getByLabel("Name", { exact: true }).fill(name);
  const save = heldResponse();
  const navigation = heldResponse();
  await page.route("**/contacts/**", (route) => {
    if (route.request().method() === "POST") return save.handle(route);
    if (
      route.request().headers().rsc === "1" &&
      !new URL(route.request().url()).pathname.endsWith("/new")
    )
      return navigation.handle(route);
    return route.continue();
  });
  await page.getByRole("button", { name: "Create contact", exact: true }).click();
  await expect(popup(page)).toContainText("Saving");
  await expectBlocked(page);
  await page.evaluate(() => {
    const events: boolean[] = [];
    (window as unknown as { loadingVisibility: boolean[] }).loadingVisibility = events;
    new MutationObserver(() =>
      events.push(!!document.querySelector('[role="progressbar"]')),
    ).observe(document.body, { childList: true, subtree: true });
  });
  save.release();
  await expect(popup(page)).toContainText("Opening Contacts");
  await expectBlocked(page);
  expect(
    await page.evaluate(() =>
      (window as unknown as { loadingVisibility: boolean[] }).loadingVisibility.every(Boolean),
    ),
  ).toBe(true);
  navigation.release();
  await expect(page).toHaveURL(/\/contacts\/[0-9a-f-]+$/);
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  await expect(popup(page)).not.toBeVisible();
  await expect(page.locator("[inert]")).toHaveCount(0);
});

test("job import has distinct checking and saving popup labels", async ({ page }) => {
  await page.goto("/import/jobs");
  await page.getByLabel("Job records").fill(
    JSON.stringify([
      {
        company: `Home loading fixture ${Date.now()}`,
        title: "Senior Backend Engineer",
        location: "Bengaluru",
        source: "COMPANY_CAREERS",
        description: "Build Python services with PostgreSQL and Kafka.",
        url: "https://careers.example.invalid/home-loading",
      },
    ]),
  );
  let held = heldResponse();
  await page.route("**/import/jobs", (route) =>
    route.request().method() === "POST" ? held.handle(route) : route.continue(),
  );
  await page.getByRole("button", { name: "Validate and preview", exact: true }).click();
  await expect(popup(page)).toContainText("Checking jobs");
  await expectBlocked(page);
  held.release();
  await expect(page.getByRole("heading", { name: "Import preview", exact: true })).toBeVisible();
  await expect(popup(page)).not.toBeVisible();
  held = heldResponse();
  await page.getByRole("button", { name: "Import validated jobs", exact: true }).click();
  await expect(popup(page)).toContainText("Saving jobs");
  await expectBlocked(page);
  held.release();
  await expect(page.getByRole("heading", { name: "Import complete", exact: true })).toBeVisible();
  await expect(popup(page)).not.toBeVisible();
});

test("missing remote images and isolated LinkedIn badge retain usable fallbacks", async ({
  page,
}) => {
  await page.route(
    /https:\/\/(www.google.com\/s2\/favicons|github.com\/.*\.png|ghchart.rshah.org\/)/,
    (route) => route.abort(),
  );
  await page.goto("/");
  const github = tile(page, "GitHub");
  await github.scrollIntoViewIfNeeded();
  await expect(github.getByText("Contribution graph unavailable.", { exact: true })).toBeVisible();
  await expect(github.locator("svg").first()).toBeVisible();
  const identity = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Demo", exact: true }) });
  await expect(identity.locator("span[aria-hidden=true]").filter({ hasText: /^D$/ })).toBeVisible();
  await tile(page, "Demo LinkedIn Profile")
    .getByRole("button", { name: "Preview Demo LinkedIn Profile", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator("iframe")).toHaveAttribute(
    "sandbox",
    "allow-scripts allow-popups allow-popups-to-escape-sandbox",
  );
  await page.evaluate(() => window.postMessage({ type: "linkedin-badge", ok: false }, "*"));
  await expect(dialog.locator("iframe")).toBeVisible();
  await expect(
    dialog.getByRole("link", { name: "Open Demo LinkedIn Profile", exact: true }),
  ).toBeVisible({ timeout: 10000 });
});

test("home has no phone overflow in either theme", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  for (const theme of ["light", "dark"] as const) {
    await page.evaluate((nextTheme) => {
      localStorage.setItem("jobops-theme", nextTheme);
    }, theme);
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expect(page.getByRole("heading", { name: "Your profiles", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
});

test("hash-only Back navigation does not start a loading popup", async ({ page }) => {
  await page.goto("/my-profile");
  await page.getByRole("button", { name: "Use light theme", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.clock.install();
  await page.evaluate(() => history.pushState(null, "", "#add-link"));
  await page.goBack();
  await page.clock.runFor(500);
  await expect(popup(page)).not.toBeVisible();
  await expect(page.locator("[inert]")).toHaveCount(0);
});

test("long preview header keeps Close preview inside the dialog on a phone", async ({ page }) => {
  const name = `Portfolio with a long project title ${Date.now()}`;
  const [profile] = await db
    .insert(profiles)
    .values({
      provider: "OTHER",
      displayName: name,
      profileUrl: `https://portfolio.example.invalid/${"long-project-path-".repeat(12)}`,
    })
    .returning();
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await tile(page, name)
      .getByRole("button", { name: `Preview ${name}`, exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    const button = dialog.getByRole("button", { name: "Close preview", exact: true });
    await expect(button).toBeVisible();
    await expect
      .poll(async () => (await button.boundingBox())?.width ?? 0)
      .toBeGreaterThanOrEqual(36);
    const bounds = (await dialog.boundingBox())!;
    const close = (await button.boundingBox())!;
    expect(close.x).toBeGreaterThanOrEqual(bounds.x);
    expect(close.x + close.width).toBeLessThanOrEqual(bounds.x + bounds.width);
  } finally {
    await db.delete(profiles).where(eq(profiles.id, profile.id));
  }
});

test("capture approved home and gallery compositions in both themes", async ({ page }) => {
  for (const theme of ["light", "dark"] as const) {
    await page.goto("/");
    await page.evaluate((nextTheme) => localStorage.setItem("jobops-theme", nextTheme), theme);
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    for (const [name, width, height] of [
      ["desktop", 1440, 1000],
      ["mobile", 390, 844],
    ] as const) {
      await page.setViewportSize({ width, height });
      await page.getByRole("region", { name: "Your profiles" }).scrollIntoViewIfNeeded();
      await page.screenshot({
        path: test.info().outputPath(`home-${name}-${theme}.png`),
        fullPage: true,
        animations: "disabled",
      });
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/gallery/home");
    await page.screenshot({
      path: test.info().outputPath(`home-gallery-${theme}.png`),
      fullPage: true,
      animations: "disabled",
    });
  }
});
