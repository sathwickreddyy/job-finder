import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { searchMail } from "./search-service";
import { mailSearchSchema, resolveMailSearch } from "./search-contract";
import type { MailConnection, ScannedMessage } from "@/services/mail/providers/types";
const connections = ["GMAIL", "OUTLOOK", "OUTLOOK"].map((provider, index) => ({
  id: `00000000-0000-4000-8000-00000000000${index}`,
  email: `me${index}@example.com`,
  provider,
})) as MailConnection[];
const now = new Date("2026-10-30T12:00:00.000Z");
const mail = (id = "1", extra: Partial<ScannedMessage> = {}): ScannedMessage => ({
  externalId: id,
  subject: "Hello",
  sender: "someone@example.com",
  bodyText: "Unrecognized wording",
  receivedAt: "2026-10-29T12:00:00.000Z",
  folders: ["Junk"],
  ...extra,
});
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.stubEnv("MAIL_TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 7).toString("base64"));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
describe("explicit mail search", () => {
  it("resolves any N-day duration and offset dates without a hidden baseline", () => {
    expect(resolveMailSearch(mailSearchSchema.parse({ lastDays: 7 }), now).since).toBe(
      "2026-10-23T12:00:00.000Z",
    );
    expect(
      resolveMailSearch(mailSearchSchema.parse({ since: "2020-01-01T00:00:00+05:30" }), now).since,
    ).toBe("2019-12-31T18:30:00.000Z");
    expect(resolveMailSearch(mailSearchSchema.parse({}), now).since).toBeUndefined();
  });
  it.each([
    { lastDays: 0 },
    { lastDays: 1.5 },
    { lastDays: 2, since: now.toISOString() },
    { keywords: ['x" OR from:anyone'] },
    { rawQuery: "anything" },
    { since: now.toISOString(), until: "2020-01-01T00:00:00Z" },
  ])("rejects ambiguous or unsafe input %j", (input) => {
    expect(mailSearchSchema.safeParse(input).success).toBe(false);
  });
  it("starts all three accounts concurrently, retaining unknown messages and exact query details", async () => {
    const releases: (() => void)[] = [];
    const page = vi.fn(async () => {
      await new Promise<void>((resolve) => releases.push(resolve));
      return { messages: [mail()] };
    });
    const pending = searchMail({ lastDays: 3 }, { connections: async () => connections, page });
    await Promise.resolve();
    await Promise.resolve();
    expect(page).toHaveBeenCalledTimes(3);
    releases.forEach((resolve) => resolve());
    const result = await pending;
    expect(result.complete).toBe(true);
    expect(result.nextCursor).toBeNull();
    expect(result.accounts.every((a) => a.returned === 1)).toBe(true);
    expect(result.accounts[0].messages[0].classification.type).toBe("UNKNOWN");
    expect(result.window.since).toBe("2026-10-27T12:00:00.000Z");
  });
  it("continues only unfinished accounts and freezes the original window", async () => {
    const page = vi
      .fn()
      .mockResolvedValueOnce({ messages: [mail()], next: "opaque" })
      .mockResolvedValueOnce({ messages: [] })
      .mockResolvedValueOnce({ messages: [] })
      .mockResolvedValueOnce({ messages: [mail("2")] });
    const deps = { connections: async () => connections, page };
    const first = await searchMail({ lastDays: 3 }, deps);
    vi.setSystemTime(new Date("2026-10-31T12:00:00Z"));
    // Cursor expires after 24h, so resume just before that boundary.
    vi.setSystemTime(new Date("2026-10-31T11:00:00Z"));
    const second = await searchMail({ cursor: first.nextCursor }, deps);
    expect(page).toHaveBeenCalledTimes(4);
    expect(page.mock.calls[3][1]).toMatchObject({ until: now.toISOString(), next: "opaque" });
    expect(second.complete).toBe(true);
  });
  it("returns partial account failures and retries without repeating completed accounts or leaking errors", async () => {
    const page = vi
      .fn()
      .mockResolvedValueOnce({ messages: [] })
      .mockRejectedValueOnce(new Error("secret bearer token"))
      .mockResolvedValueOnce({ messages: [] })
      .mockResolvedValueOnce({ messages: [] });
    const deps = { connections: async () => connections, page };
    const first = await searchMail({ lastDays: 4 }, deps);
    expect(first.complete).toBe(false);
    expect(first.more).toBe(true);
    expect(JSON.stringify(first)).not.toContain("secret bearer");
    expect((await searchMail({ cursor: first.nextCursor }, deps)).complete).toBe(true);
    expect(page).toHaveBeenCalledTimes(4);
  });
  it("exposes skipped context and date-edge counts without silently removing unknown recruiting text", async () => {
    const page = vi
      .fn()
      .mockResolvedValue({
        messages: [
          mail(),
          mail("sent", { contextOnly: true }),
          mail("old", { receivedAt: "2020-01-01T00:00:00Z" }),
          mail("edge", { receivedAt: now.toISOString() }),
        ],
      });
    const result = await searchMail(
      { lastDays: 3, accounts: [connections[0].email] },
      { connections: async () => connections, page },
    );
    expect(result.accounts[0]).toMatchObject({
      fetched: 4,
      returned: 1,
      skippedContext: 1,
      skippedOutsideWindow: 2,
    });
    expect(page).toHaveBeenCalledTimes(1);
  });
  it("reports Outlook's ceiling as incomplete even when the provider omits continuation", async () => {
    const page = vi
      .fn()
      .mockResolvedValue({
        messages: Array.from({ length: 50 }, (_, i) => mail(String(i))),
        next: "next",
      });
    const deps = { connections: async () => [connections[1]], page };
    let result = await searchMail({ keywords: ["Amazon"], lastDays: 10 }, deps);
    for (let i = 1; i < 20; i++) result = await searchMail({ cursor: result.nextCursor }, deps);
    expect(result).toMatchObject({ complete: false, limited: true, more: false, nextCursor: null });
    expect(result.warning).toContain("Narrow");
  });
  it("rejects unknown accounts, forged cursors and expired cursors", async () => {
    const deps = {
      connections: async () => connections,
      page: vi.fn().mockResolvedValue({ messages: [], next: "next" }),
    };
    await expect(searchMail({ accounts: ["missing@example.com"] }, deps)).rejects.toThrow(
      "not connected",
    );
    await expect(searchMail({ cursor: "forged" }, deps)).rejects.toThrow("Invalid search cursor");
    const result = await searchMail({ lastDays: 1 }, deps);
    vi.setSystemTime(new Date("2026-11-01T12:00:00Z"));
    await expect(searchMail({ cursor: result.nextCursor }, deps)).rejects.toThrow("expired");
  });
});
