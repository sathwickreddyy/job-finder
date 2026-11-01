import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { gmail, gmailCall } from "./gmail";
import { graphCall } from "./outlook";
import type { MailConnection } from "./types";
import {
  foldUsage,
  metered,
  meteredCalls,
  pacing,
  pendingUsage,
  RateLimitError,
  summarize,
  type ApiCall,
} from "./usage";

const connection = { email: "me@example.com" } as MailConnection;
const window = { until: "2026-10-30T05:00:00.000Z", since: "2026-10-29T00:00:00.000Z" };
const call = (at: string, units = 5, extra: Partial<ApiCall> = {}): ApiCall => ({
  at,
  label: "Read message",
  request: "GET messages/{id}?format=full",
  units,
  status: 200,
  ms: 100,
  ...extra,
});
const limited = (message: string, reason = "rateLimitExceeded", headers?: HeadersInit) =>
  Response.json({ error: { message, errors: [{ reason }] } }, { status: 429, headers });
let sleep: ReturnType<typeof vi.fn<(ms: number) => Promise<void>>>;
beforeEach(() => {
  vi.spyOn(gmail, "accessToken").mockResolvedValue("test-access");
  sleep = vi.fn<(ms: number) => Promise<void>>().mockResolvedValue(undefined);
  vi.spyOn(pacing, "sleep").mockImplementation(sleep);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("retries a Gmail rate limit after Retry-After and logs the refusal and the wait", async () => {
  const request = vi
    .fn()
    .mockResolvedValueOnce(
      limited("Too many concurrent requests for user", undefined, { "Retry-After": "3" }),
    )
    .mockResolvedValueOnce(Response.json({ messages: [], nextPageToken: "p2" }));
  vi.stubGlobal("fetch", request);
  const { page, calls } = await metered("GMAIL", undefined, async () => ({
    page: await gmail.scanMail(connection, window, []),
    calls: meteredCalls(),
  }));
  expect(page.next).toBe("p2");
  expect(request).toHaveBeenCalledTimes(2);
  expect(sleep).toHaveBeenCalledWith(3000);
  expect(calls).toMatchObject([
    {
      label: "List messages",
      status: 429,
      units: 5,
      reason: "rateLimitExceeded: too many requests at once",
      waitedMs: 3000,
    },
    { label: "List messages", status: 200, units: 5 },
  ]);
  expect(calls[1].request).toContain("q=-in:sent -in:drafts before:");
  expect(calls[1].request).toContain("includeSpamTrash=true");
});

it("pauses the inbox after three retries and refuses later requests without sending them", async () => {
  vi.useFakeTimers({ now: new Date("2026-11-01T07:25:00Z"), toFake: ["Date"] });
  const request = vi.fn(async () => limited("sensitive provider detail", "userRateLimitExceeded"));
  vi.stubGlobal("fetch", request);
  await metered("GMAIL", undefined, async () => {
    const error = await gmail.scanMail(connection, window, []).catch((caught) => caught);
    expect(error).toBeInstanceOf(RateLimitError);
    expect(error.message).toBe(
      "Gmail rate limit reached (userRateLimitExceeded). Paused until 12:57 pm; fetch again after that to continue where it stopped.",
    );
    expect(error.message).not.toContain("sensitive");
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([2000, 5000, 10000]);
    expect(request).toHaveBeenCalledTimes(4);
    // The pause holds: the next request fails at once.
    await expect(gmail.scanMail(connection, window, [])).rejects.toThrow("Paused until");
    expect(request).toHaveBeenCalledTimes(4);
    expect(pendingUsage()).toMatchObject({
      calls: 4,
      rateLimited: 4,
      units: 20,
      cooldown: { until: "2026-11-01T07:27:00.000Z", reason: "userRateLimitExceeded" },
    });
  });
});

it("pauses until a far Retry after date at once instead of waiting it out", async () => {
  vi.useFakeTimers({ now: new Date("2026-11-01T07:25:00Z"), toFake: ["Date"] });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => limited("User-rate limit exceeded.  Retry after 2026-11-01T07:40:00.000Z")),
  );
  await metered("GMAIL", undefined, async () => {
    await expect(gmail.scanMail(connection, window, [])).rejects.toThrow(
      "(rateLimitExceeded: per-user rate limit). Paused until 1:10 pm",
    );
    expect(sleep).not.toHaveBeenCalled();
  });
});

it("names Google's limit and slows the inbox after a refusal, then keeps the pace", async () => {
  vi.useFakeTimers({ now: new Date("2026-11-01T07:25:00Z"), toFake: ["Date"] });
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          {
            error: {
              message:
                "Quota exceeded for quota metric 'Queries' and limit 'Queries per minute per user' of service 'gmail.googleapis.com' for consumer 'project_number:1'.",
              errors: [{ reason: "rateLimitExceeded" }],
            },
          },
          { status: 403 },
        ),
      )
      .mockImplementation(async () => Response.json({ messages: [] })),
  );
  const stored = await metered("GMAIL", undefined, async () => {
    await gmail.scanMail(connection, window, []);
    expect(meteredCalls()[0].reason).toBe("rateLimitExceeded: Queries per minute per user");
    return pendingUsage();
  });
  expect(stored?.spacingMs).toBe(250);
  // The next fetch starts at the learned pace: its second request waits its turn.
  sleep.mockClear();
  await metered("GMAIL", stored!, async () => {
    await gmail.scanMail(connection, window, []);
    await gmail.scanMail(connection, window, []);
  });
  expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([250]);
});

it("speeds back up after 25 answered requests in a row", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ messages: [] })),
  );
  const stored = foldUsage(undefined, [], undefined, new Date(), 1000);
  const after = await metered("GMAIL", stored, async () => {
    for (let page = 0; page < 25; page++) await gmail.scanMail(connection, window, []);
    return pendingUsage();
  });
  expect(after?.spacingMs).toBe(750);
});

it("a stored pause stops the request before it reaches Gmail", async () => {
  const request = vi.fn();
  vi.stubGlobal("fetch", request);
  const until = new Date(Date.now() + 60_000).toISOString();
  const stored = foldUsage(undefined, [], { until, reason: "rateLimitExceeded" }, new Date());
  await metered("GMAIL", stored, async () => {
    await expect(gmail.scanMail(connection, window, [])).rejects.toBeInstanceOf(RateLimitError);
  });
  expect(request).not.toHaveBeenCalled();
});

it("folds today's totals in India time and counts only the provider's window", () => {
  const now = new Date("2026-11-01T07:25:30Z");
  const stored = foldUsage(
    { day: "2026-10-31", units: 900, calls: 180, rateLimited: 2, buckets: {} },
    [
      call("2026-11-01T07:10:00.000Z"),
      call("2026-11-01T07:24:45.000Z"),
      call("2026-11-01T07:25:05.000Z", 5, { status: 429, reason: "rateLimitExceeded" }),
    ],
    undefined,
    now,
  );
  // A new India day starts today's totals afresh; a bucket past every window drops off.
  expect(stored).toMatchObject({ day: "2026-11-01", units: 15, calls: 3, rateLimited: 1 });
  expect(Object.keys(stored.buckets)).toEqual(["2026-11-01T07:24:40", "2026-11-01T07:25:00"]);
  expect(summarize("GMAIL", stored, now)).toMatchObject({
    recent: 10,
    limit: 15_000,
    unit: "quota units",
    window: "minute",
    today: 15,
    callsToday: 3,
    rateLimitedToday: 1,
    cooldown: null,
  });
  expect(summarize("OUTLOOK", stored, now).recent).toBe(10);
  // Ten minutes on, Outlook's window has moved past the first bucket.
  expect(
    Object.keys(foldUsage(stored, [], undefined, new Date("2026-11-01T07:35:00Z")).buckets),
  ).toEqual(["2026-11-01T07:25:00"]);
});

it("logs exact queries with message ids, cursors and field lists elided", () => {
  expect(
    gmailCall("messages?q=-in%3Asent+after%3A1&maxResults=25&includeSpamTrash=true&pageToken=abc"),
  ).toEqual({
    label: "List messages",
    request: "GET messages?q=-in:sent after:1&maxResults=25&includeSpamTrash=true&pageToken=…",
    units: 5,
  });
  expect(gmailCall("messages/18c2f?format=full")).toMatchObject({
    request: "GET messages/{id}?format=full",
    units: 5,
  });
  expect(gmailCall("labels")).toMatchObject({ label: "List folders", units: 1 });
  const id = "A".repeat(120);
  expect(
    graphCall(
      `https://graph.microsoft.com/v1.0/me/messages?%24top=50&%24filter=receivedDateTime+ge+2026-10-01T00%3A00%3A00.000Z&%24select=id%2Cbody&%24skiptoken=xyz`,
    ),
  ).toEqual({
    label: "List messages",
    request:
      "GET /me/messages?$top=50&$filter=receivedDateTime ge 2026-10-01T00:00:00.000Z&$select=…&$skiptoken=…",
    units: 1,
  });
  expect(
    graphCall(`https://graph.microsoft.com/v1.0/me/mailFolders/${id}/childFolders?$top=100`),
  ).toMatchObject({
    label: "List folders",
    request: "GET /me/mailFolders/{id}/childFolders?$top=100",
  });
});
