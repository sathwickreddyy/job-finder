import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { Pool } from "pg";
import { stubExternalSites } from "./helpers/external-sites";
let pool: Pool;
let ids: string[] = [];
let emails: string[] = [];
let messageIds: string[] = [];
async function guard() {
  if (!process.env.DATABASE_URL || new URL(process.env.DATABASE_URL).pathname !== "/jobops_e2e")
    throw new Error("Requires isolated jobops_e2e.");
  const marker = await pool.query("SELECT value FROM settings WHERE key='__jobops_e2e'");
  if (marker.rows[0]?.value?.ownedBy !== "jobops-browser-tests")
    throw new Error("Requires ownership marker.");
}
test.beforeEach(async ({ page }) => {
  if (!process.env.DATABASE_URL || new URL(process.env.DATABASE_URL).pathname !== "/jobops_e2e")
    throw new Error("Refusing non-test database.");
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await guard();
  ids = [];
  emails = [];
  messageIds = [];
  await stubExternalSites(page);
});
test.afterEach(async () => {
  await guard();
  const logs = await pool.query("SELECT id FROM activity_logs WHERE entity_id=ANY($1::uuid[])", [
    ids,
  ]);
  await pool.query("DELETE FROM activity_logs WHERE id=ANY($1::uuid[])", [
    logs.rows.map((row) => row.id),
  ]);
  await pool.query("DELETE FROM mail_messages WHERE id=ANY($1::uuid[])", [messageIds]);
  await pool.query("DELETE FROM settings WHERE key=ANY($1::text[])", [
    ids.map((id) => `mailCursor:${id}`),
  ]);
  await pool.query("DELETE FROM mail_connections WHERE id=ANY($1::uuid[])", [ids]);
  await pool.end();
});
async function seedInboxes() {
  await guard();
  for (const [index, domain] of ["gmail.com", "outlook.in", "outlook.com"].entries()) {
    const id = randomUUID();
    ids.push(id);
    const email = `very.long.recruiting.address.${id}.job.search@${domain}`;
    emails.push(email);
    await pool.query(
      "INSERT INTO mail_connections(id,provider,email,encrypted_access_token,last_refreshed_at,last_refreshed_count,last_error,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
      [
        id,
        index ? "OUTLOOK" : "GMAIL",
        email,
        "fixture-not-a-live-token",
        new Date(),
        17 + index,
        index === 1 ? "Outlook access expired. Reconnect Outlook. " + "LongError".repeat(15) : null,
        new Date(Date.now() + index),
      ],
    );
    const mailId = randomUUID();
    messageIds.push(mailId);
    await pool.query(
      "INSERT INTO mail_messages(id,external_id,account_email,sender,subject,received_at,classification) VALUES ($1,$2,$3,$4,$5,now(),'RECRUITER_OUTREACH')",
      [
        mailId,
        mailId,
        email,
        "sender@example.invalid",
        `Inbox fixture ${index}: ${"LongSubject".repeat(12)}`,
      ],
    );
    await pool.query(
      "INSERT INTO mail_events(mail_message_id,type,confidence) VALUES ($1,'RECRUITER_OUTREACH',0.9)",
      [mailId],
    );
  }
}

test("three inbox addresses, account tags and long errors fit 390px with keyboard actions", async ({
  page,
}) => {
  await seedInboxes();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/applications?emails=1");
  const list = page.getByRole("list", { name: "Connected inboxes" });
  await expect(list.getByRole("listitem")).toHaveCount(3);
  for (const email of emails) {
    await expect(list.getByText(email, { exact: true })).toBeVisible();
    await expect(page.getByText(email, { exact: true })).toHaveCount(2);
  }
  await expect(list).toContainText("Set up Outlook below to reconnect.");
  await expect(
    list.getByText(`Choose ${emails[1]} when you sign in again.`, { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("status").filter({ hasText: "messages need a decision" }),
  ).not.toContainText("arrived just now");
  const refresh = page.getByRole("button", { name: "Refresh all inboxes", exact: true });
  await refresh.focus();
  await expect(refresh).toBeFocused();

  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
  // Retained mail keeps its exact address and neutral fallback tone after local disconnect.
  await guard();
  await pool.query("DELETE FROM mail_connections WHERE id=$1", [ids[0]]);
  await page.reload();
  await expect(page.getByText(emails[0], { exact: true })).toHaveCount(1);
  await expect(page.getByText(emails[0], { exact: true })).toBeVisible();
  const importLink = page.getByRole("link", { name: "Import messages", exact: true });
  await importLink.focus();
  await expect(importLink).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/mail\/import$/);
});

test("real all-failed refresh feedback survives revalidation and navigation without losing mail", async ({
  page,
}) => {
  await seedInboxes();
  await page.goto("/applications?emails=1");
  await page.getByRole("button", { name: "Refresh all inboxes", exact: true }).focus();
  await page.keyboard.press("Enter");
  const failure = page.getByRole("alert").filter({ hasText: "No inbox refreshed." });
  await expect(failure).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "arrived just now" })).toContainText(
    "0 arrived just now",
  );
  for (const email of emails) await expect(page.getByText(email, { exact: true })).toHaveCount(2);
  // Leave the drawer for the lanes, then come back through the header's Emails link.
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/applications$/);
  await page.getByRole("link", { name: "Emails", exact: true }).click();
  await expect(page).toHaveURL(/\/applications\?emails=1$/);
  await expect(failure).toBeVisible();
  await page.reload();
  await expect(failure).toBeVisible();
});

test("typed successful refresh banner survives navigation and expires rather than claiming old arrivals", async ({
  page,
}) => {
  await seedInboxes();
  await page.goto("/applications?emails=1");
  await expect(
    page.getByRole("status").filter({ hasText: "messages need a decision" }),
  ).not.toContainText("arrived just now");
  // A captured typed action-result fixture; actual success/partial counts are verified
  // through the real action+importer in inbox-actions.spec.ts, not a fake OAuth call.
  await page.evaluate(() =>
    sessionStorage.setItem(
      "jobops:inbox-refresh",
      JSON.stringify({
        success: "Refreshed 2 of 3 inboxes · 3 new. Needs attention: one inbox.",
        mailRefresh: { arrived: 3, completedAt: new Date().toISOString() },
      }),
    ),
  );
  await page.reload();
  await expect(page.getByRole("status").filter({ hasText: "arrived just now" })).toContainText(
    "3 arrived just now",
  );
  // Leave the drawer for the lanes, then come back through the header's Emails link.
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/applications$/);
  await page.getByRole("link", { name: "Emails", exact: true }).click();
  await expect(page).toHaveURL(/\/applications\?emails=1$/);
  await expect(page.getByRole("status").filter({ hasText: "arrived just now" })).toBeVisible();
  await page.evaluate(() => {
    const key = "jobops:inbox-refresh";
    const result = JSON.parse(sessionStorage.getItem(key)!);
    result.mailRefresh.completedAt = new Date(Date.now() - 61_000).toISOString();
    sessionStorage.setItem(key, JSON.stringify(result));
  });
  await expect(
    page.getByRole("status").filter({ hasText: "messages need a decision" }),
  ).not.toContainText("arrived just now");
});

test("a refresh after the last inbox was disconnected shows the concrete connection error", async ({
  page,
}) => {
  await seedInboxes();
  await page.goto("/applications?emails=1");
  await guard();
  await pool.query("DELETE FROM mail_connections WHERE id=ANY($1::uuid[])", [ids]);
  await page.getByRole("button", { name: "Refresh all inboxes", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Connect Gmail or Outlook before refreshing." }),
  ).toBeVisible();
});

test("Settings disconnect removes only the selected inbox and keeps its tagged mail", async ({
  page,
}) => {
  await seedInboxes();
  await page.goto("/settings");
  await expect(
    page.getByText("Disconnect removes local credentials only.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: `Disconnect ${emails[0]}`, exact: true }).focus();
  // Hold the real coordination lock long enough to exercise the inert loading overlay.
  await guard();
  const blocker = await pool.connect();
  await blocker.query("SELECT pg_advisory_lock(hashtextextended($1, 0))", [
    `jobops-mail:${ids[0]}`,
  ]);
  try {
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("progressbar", { name: "Disconnecting inbox", exact: true }),
    ).toBeVisible();
  } finally {
    await blocker.query("SELECT pg_advisory_unlock_all()");
    blocker.release();
  }
  await expect(
    page.getByRole("button", { name: `Disconnect ${emails[0]}`, exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: `Disconnect ${emails[1]}`, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("status").filter({ hasText: `${emails[0]} disconnected locally.` }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Connect or refresh inboxes", exact: true }),
  ).toBeFocused();
  await page.goto("/applications?emails=1");
  await expect(page.getByText(emails[0], { exact: true })).toHaveCount(1);
  expect((await pool.query("SELECT id FROM mail_connections WHERE id=$1", [ids[0]])).rowCount).toBe(
    0,
  );
  expect(
    (await pool.query("SELECT id FROM mail_messages WHERE id=$1", [messageIds[0]])).rowCount,
  ).toBe(1);
});

test("last inbox disconnect announces the address and restores focus after revalidation", async ({
  page,
}) => {
  await seedInboxes();
  await guard();
  await pool.query("DELETE FROM mail_connections WHERE id=ANY($1::uuid[])", [ids.slice(1)]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/settings");
  await page.getByRole("button", { name: `Disconnect ${emails[0]}`, exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("No inbox connected.", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("status").filter({ hasText: `${emails[0]} disconnected locally.` }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Connect or refresh inboxes", exact: true }),
  ).toBeFocused();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
});
