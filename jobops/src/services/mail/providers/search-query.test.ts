import { afterEach, expect, it, vi } from "vitest";
import { gmailSearchQuery, outlookSearchQuery } from "./search-query";
import { gmail } from "./gmail";
import { outlook } from "./outlook";
import type { MailConnection } from "./types";
const request = {
  since: "2026-10-27T18:30:00.000Z",
  until: "2026-10-30T18:30:00.000Z",
  search: {
    keywords: ["Amazon", "Amazon Jobs"],
    senders: ["talent@example.com"],
    subjects: ["interview"],
  },
};
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("compiles literal OR groups within fields and AND between groups", () => {
  expect(gmailSearchQuery(request)).toContain(
    '{"Amazon" "Amazon Jobs"} {from:"talent@example.com"} {subject:"interview"}',
  );
  const expression = outlookSearchQuery(request)!;
  expect(JSON.parse(expression)).toContain(
    '("Amazon" OR "Amazon Jobs") AND (from:"talent@example.com")',
  );
  expect(expression).toContain("received>=2026-10-26");
  expect(expression).toContain("received<=2026-10-31");
  expect(
    outlookSearchQuery({ ...request, search: { keywords: [], senders: [], subjects: [] } }),
  ).toBeUndefined();
});
it("sends Gmail search conditions to the provider with spam/trash and pagination", async () => {
  vi.spyOn(gmail, "accessToken").mockResolvedValue("test");
  const fetcher = vi.fn().mockResolvedValue(Response.json({ messages: [], nextPageToken: "next" }));
  vi.stubGlobal("fetch", fetcher);
  const result = await gmail.scanMail({} as MailConnection, { ...request, next: "previous" }, []);
  const url = new URL(fetcher.mock.calls[0][0]);
  expect(url.searchParams.get("q")).toBe(gmailSearchQuery(request));
  expect(url.searchParams.get("includeSpamTrash")).toBe("true");
  expect(url.searchParams.get("pageToken")).toBe("previous");
  expect(result.next).toBe("next");
});
it("uses Graph mailbox search, omits incompatible filter/orderby and retains safe continuation", async () => {
  vi.spyOn(outlook, "accessToken").mockResolvedValue("test");
  const next = "https://graph.microsoft.com/v1.0/me/messages?$skiptoken=opaque";
  const fetcher = vi.fn().mockImplementation(async () => Response.json({ value: [], "@odata.nextLink": next }));
  vi.stubGlobal("fetch", fetcher);
  expect((await outlook.scanMail({} as MailConnection, request, [])).next).toBe(next);
  const url = new URL(fetcher.mock.calls[0][0]);
  expect(url.searchParams.get("$search")).toBe(outlookSearchQuery(request));
  expect(url.searchParams.has("$filter")).toBe(false);
  expect(url.searchParams.has("$orderby")).toBe(false);
  await outlook.scanMail({} as MailConnection, { ...request, next }, []);
  expect(fetcher.mock.calls[1][0]).toBe(next);
});
