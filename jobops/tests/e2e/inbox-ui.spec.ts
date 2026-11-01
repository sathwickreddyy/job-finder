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
    page.getByRole("link", { name: "Connect or check inboxes", exact: true }),
  ).toBeFocused();
  // The disconnected inbox's mail stays; unplaced, it waits in Needs a home.
  await page.goto(`/mail?view=home&mail=${messageIds[0]}`);
  await expect(page.getByRole("button", { name: /Inbox fixture 0:/ })).toBeVisible();
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
    page.getByRole("link", { name: "Connect or check inboxes", exact: true }),
  ).toBeFocused();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
});
