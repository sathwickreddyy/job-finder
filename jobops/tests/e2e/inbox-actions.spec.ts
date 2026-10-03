import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { expect, test } from "@playwright/test";
import { Pool } from "pg";
import { tsImport } from "tsx/esm/api";
import type { WorkStore } from "next/dist/server/app-render/work-async-storage.external";

// Supply the server request context for Next's real revalidatePath outside HTTP.
Object.assign(globalThis, { AsyncLocalStorage });
const loader = { parentURL: import.meta.url, namespace: "task17-inbox-actions" };
const actions = (await tsImport(
  "../../src/features/mail/actions.ts",
  loader,
)) as typeof import("../../src/features/mail/actions");
const { providers } = (await tsImport(
  "../../src/services/mail/providers/index.ts",
  loader,
)) as typeof import("../../src/services/mail/providers");
const { closeDatabase } = (await tsImport(
  "../../src/db/index.ts",
  loader,
)) as typeof import("../../src/db");
const { workAsyncStorage } =
  await import("next/dist/server/app-render/work-async-storage.external.js");
const originals = providers.map((provider) => provider.listRecruitingMail);
let pool: Pool;
let ids: string[] = [];
let emails: string[] = [];
let trigger: string | undefined;
let owned = false;
async function guard() {
  if (!process.env.DATABASE_URL || new URL(process.env.DATABASE_URL).pathname !== "/jobops_e2e")
    throw new Error("Requires isolated jobops_e2e.");
  const marker = await pool.query("SELECT value FROM settings WHERE key='__jobops_e2e'");
  if (marker.rows[0]?.value?.ownedBy !== "jobops-browser-tests")
    throw new Error("Requires ownership marker.");
}
async function run<T>(action: () => Promise<T>) {
  const store = {
    route: "/applications",
    page: "/applications/page",
    incrementalCache: {},
    pendingRevalidatedTags: [],
  } as unknown as WorkStore;
  return workAsyncStorage.run(store, action);
}
const message = (email: string, suffix = "first") => ({
  externalId: `${email}:${suffix}`,
  sender: "recruiter@example.invalid",
  subject: "Interview invitation",
  receivedAt: new Date().toISOString(),
});
function barrier() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function lockWait() {
  await expect
    .poll(async () =>
      Number(
        (
          await pool.query(
            "SELECT count(*)::int AS count FROM pg_locks WHERE locktype='advisory' AND NOT granted",
          )
        ).rows[0].count,
      ),
    )
    .toBeGreaterThan(0);
}

test.beforeEach(async () => {
  owned = false;
  if (!process.env.DATABASE_URL || new URL(process.env.DATABASE_URL).pathname !== "/jobops_e2e")
    throw new Error("Refusing non-test database.");
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await guard();
  if ((await pool.query("SELECT id FROM mail_connections")).rowCount)
    throw new Error(
      "Action fixture requires no pre-existing test inbox connections; refusing to alter them.",
    );
  ids = [randomUUID(), randomUUID(), randomUUID()];
  emails = [`${ids[0]}@gmail.com`, `${ids[1]}@outlook.in`, `${ids[2]}@outlook.com`];
  owned = true;
  for (let index = 0; index < 3; index++)
    await pool.query(
      "INSERT INTO mail_connections(id,provider,email,encrypted_access_token) VALUES ($1,$2,$3,$4)",
      [ids[index], index ? "OUTLOOK" : "GMAIL", emails[index], "fixture-not-a-live-token"],
    );
});
test.afterEach(async () => {
  providers.forEach((provider, index) => {
    provider.listRecruitingMail = originals[index];
  });
  if (owned) {
    await guard();
    if (trigger) {
      await pool.query(`DROP TRIGGER IF EXISTS "${trigger}" ON mail_connections`);
      await pool.query(`DROP FUNCTION IF EXISTS "${trigger}"()`);
      trigger = undefined;
    }
    const messages = await pool.query(
      "SELECT id FROM mail_messages WHERE account_email=ANY($1::text[])",
      [emails],
    );
    const logs = await pool.query(
      "SELECT id FROM activity_logs WHERE metadata->>'accountEmail'=ANY($1::text[]) OR entity_id=ANY($2::uuid[])",
      [emails, ids],
    );
    await pool.query("DELETE FROM mail_messages WHERE id=ANY($1::uuid[])", [
      messages.rows.map((row) => row.id),
    ]);
    await pool.query("DELETE FROM activity_logs WHERE id=ANY($1::uuid[])", [
      logs.rows.map((row) => row.id),
    ]);
    await pool.query("DELETE FROM settings WHERE key=ANY($1::text[])", [
      ids.map((id) => `mailCursor:${id}`),
    ]);
    await pool.query("DELETE FROM mail_connections WHERE id=ANY($1::uuid[])", [ids]);
  }
  await closeDatabase();
  await pool?.end();
});

test("actual refresh-all action imports other inboxes when one Outlook grant is revoked", async () => {
  providers.forEach((provider) => {
    provider.listRecruitingMail = async (row) => {
      if (row.email === emails[1]) throw new Error("Outlook access expired. Reconnect Outlook.");
      return { messages: [message(row.email)] };
    };
  });
  const result = await run(() => actions.refreshAllInboxes({}));
  expect(result).toMatchObject({
    success: expect.stringContaining("Refreshed 2 of 3 inboxes · 2 new."),
    mailRefresh: { arrived: 2 },
  });
  expect(result.success).toContain(emails[1]);
  expect(
    (
      await pool.query(
        "SELECT account_email FROM mail_messages WHERE account_email=ANY($1::text[]) ORDER BY account_email",
        [emails],
      )
    ).rows
      .map((row) => row.account_email)
      .sort(),
  ).toEqual([emails[0], emails[2]].sort());
  expect(
    (await pool.query("SELECT last_error FROM mail_connections WHERE id=$1", [ids[1]])).rows[0]
      .last_error,
  ).toContain("expired");
});

test("actual refresh-all keeps partial counts after secondary status persistence failure", async () => {
  trigger = `task17_${randomUUID().replaceAll("-", "")}`;
  await guard();
  await pool.query(
    `CREATE FUNCTION "${trigger}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id = '${ids[1]}' AND NEW.last_error IS NOT NULL THEN RAISE EXCEPTION 'status rejected'; END IF; RETURN NEW; END $$`,
  );
  await pool.query(
    `CREATE TRIGGER "${trigger}" BEFORE UPDATE ON mail_connections FOR EACH ROW EXECUTE FUNCTION "${trigger}"()`,
  );
  providers.forEach((provider) => {
    provider.listRecruitingMail = async (row, cursor) => {
      if (row.email === emails[1] && cursor)
        throw new Error("Outlook access expired. Reconnect Outlook.");
      return {
        messages: [message(row.email)],
        ...(row.email === emails[1] ? { nextCursor: { pageToken: "retry" } } : {}),
      };
    };
  });
  const result = await run(() => actions.refreshAllInboxes({}));
  expect(result).toMatchObject({
    success: expect.stringContaining("Refreshed 2 of 3 inboxes · 3 new."),
    mailRefresh: { arrived: 3 },
  });
  expect(result.success).toContain("More messages remain");
  expect(
    (await pool.query("SELECT id FROM mail_messages WHERE account_email=ANY($1::text[])", [emails]))
      .rowCount,
  ).toBe(3);
  expect(
    (await pool.query("SELECT value FROM settings WHERE key=$1", [`mailCursor:${ids[1]}`])).rows[0]
      .value.pageToken,
  ).toBe("retry");
});

test("actual refresh-all reports every failure and retains previously imported mail", async () => {
  providers.forEach((provider) => {
    provider.listRecruitingMail = async (row) => ({ messages: [message(row.email)] });
  });
  await run(() => actions.refreshAllInboxes({}));
  providers.forEach((provider) => {
    provider.listRecruitingMail = async () => {
      throw new Error("Access expired. Reconnect.");
    };
  });
  const result = await run(() => actions.refreshAllInboxes({}));
  expect(result.mailRefresh?.arrived).toBe(0);
  expect(result.error).toContain("No inbox refreshed.");
  for (const email of emails) expect(result.error).toContain(email);
  expect(
    (await pool.query("SELECT id FROM mail_messages WHERE account_email=ANY($1::text[])", [emails]))
      .rowCount,
  ).toBe(3);
});

test("concurrent refresh-all actions use the shared lock and import each message once", async () => {
  const entered = barrier(),
    release = barrier();
  let gmailCalls = 0;
  providers.forEach((provider) => {
    provider.listRecruitingMail = async (row) => {
      if (row.email === emails[0] && ++gmailCalls === 1) {
        entered.resolve();
        await release.promise;
      }
      return { messages: [message(row.email)] };
    };
  });
  const first = run(() => actions.refreshAllInboxes({}));
  await entered.promise;
  const second = run(() => actions.refreshAllInboxes({}));
  try {
    await lockWait();
  } finally {
    release.resolve();
  }
  const results = await Promise.all([first, second]);
  expect(results.map((row) => row.mailRefresh?.arrived)).toEqual([3, 0]);
  expect(
    (await pool.query("SELECT id FROM mail_messages WHERE account_email=ANY($1::text[])", [emails]))
      .rowCount,
  ).toBe(3);
  expect(
    (
      await pool.query(
        "SELECT m.id FROM mail_messages m JOIN mail_events e ON m.id=e.mail_message_id WHERE m.account_email=ANY($1::text[])",
        [emails],
      )
    ).rowCount,
  ).toBe(3);
});

test("actual disconnect action waits for refresh then removes credentials/cursor and preserves imported history", async () => {
  const entered = barrier(),
    release = barrier();
  providers.forEach((provider) => {
    provider.listRecruitingMail = async (row) => {
      if (row.email === emails[0]) {
        entered.resolve();
        await release.promise;
      }
      return { messages: [message(row.email)], nextCursor: { pageToken: "continued" } };
    };
  });
  const refresh = run(() => actions.refreshAllInboxes({}));
  await entered.promise;
  const form = new FormData();
  form.set("connectionId", ids[0]);
  const disconnect = run(() => actions.disconnectInbox({}, form));
  try {
    await lockWait();
  } finally {
    release.resolve();
  }
  await refresh;
  expect(await disconnect).toMatchObject({
    success: expect.stringContaining("Google or Microsoft"),
  });
  expect((await pool.query("SELECT id FROM mail_connections WHERE id=$1", [ids[0]])).rowCount).toBe(
    0,
  );
  expect(
    (await pool.query("SELECT key FROM settings WHERE key=$1", [`mailCursor:${ids[0]}`])).rowCount,
  ).toBe(0);
  expect(
    (
      await pool.query(
        "SELECT m.id FROM mail_messages m JOIN mail_events e ON e.mail_message_id=m.id WHERE m.account_email=$1",
        [emails[0]],
      )
    ).rowCount,
  ).toBe(1);
  expect(
    (
      await pool.query("SELECT id FROM activity_logs WHERE metadata->>'accountEmail'=$1", [
        emails[0],
      ])
    ).rowCount,
  ).toBeGreaterThan(0);
});
