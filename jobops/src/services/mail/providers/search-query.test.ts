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

it("company queries scope aliases to subjects and OR them with sender identities", () => {
  const company = { ...request, search: { keywords: [], senders: [], subjects: [], companyIdentity: { names: ["Amazon", "Amazon Jobs"], domains: ["amazon.jobs"], senders: ["talent@example.com"] } } };
  const gmailQuery = gmailSearchQuery(company);
  expect(gmailQuery).toContain('{subject:"Amazon" subject:"Amazon Jobs" from:"amazon.jobs" from:"talent@example.com"}');
  expect(JSON.parse(outlookSearchQuery(company)!)).toContain('(subject:"Amazon" OR subject:"Amazon Jobs" OR from:"amazon.jobs" OR from:"talent@example.com")');
});
it("does not download known Gmail bodies in a company overlap", async () => {
  vi.spyOn(gmail, "accessToken").mockResolvedValue("test");
  const fetcher = vi.fn().mockResolvedValue(Response.json({ messages: [{ id: "seen" }], nextPageToken: "next" }));
  vi.stubGlobal("fetch", fetcher);
  const result = await gmail.scanMail({} as MailConnection, { ...request, skipIds: ["seen"] }, []);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(result).toMatchObject({ messages: [], next: "next", fetched: 1, skippedKnown: 1 });
});
it("Outlook fetches metadata first and downloads only new in-window incoming bodies", async () => {
  vi.spyOn(outlook, "accessToken").mockResolvedValue("test");
  const message = { receivedDateTime: "2026-10-29T12:00:00Z", parentFolderId: "inbox", subject: "Interview" };
  const fetcher = vi.fn().mockImplementation(async (url: string) => {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith("/new")) return Response.json({ body: { contentType: "text", content: "Please share your interview availability." } });
    expect(parsed.searchParams.get("$select")!.split(",")).not.toContain("body");
    return Response.json({ value: [
      { ...message, id: "seen" }, { ...message, id: "new" },
      { ...message, id: "moved", internetMessageId: "<known@example.com>" },
      { ...message, id: "old", receivedDateTime: "2020-01-01T00:00:00Z" },
      { ...message, id: "sent", parentFolderId: "sent" },
    ] });
  });
  vi.stubGlobal("fetch", fetcher);
  const result = await outlook.scanMail({} as MailConnection, { ...request, skipIds: ["seen"], skipInternetIds: ["<known@example.com>"] }, [{ id: "inbox", name: "Inbox" }, { id: "sent", name: "Sent", contextOnly: true }]);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(result.messages.find((m) => m.externalId === "new")?.bodyText).toContain("availability");
});
it("an Outlook message deleted between listing and body download does not trap the checkpoint", async () => {
  vi.spyOn(outlook, "accessToken").mockResolvedValue("test");
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ value: [{ id: "gone", parentFolderId: "inbox", receivedDateTime: "2026-10-29T12:00:00Z", subject: "Interview" }], "@odata.nextLink": "https://graph.microsoft.com/v1.0/me/messages?$skiptoken=next" }))
    .mockResolvedValueOnce(Response.json({ error: { message: "sensitive detail" } }, { status: 404 }));
  vi.stubGlobal("fetch", fetcher);
  const result = await outlook.scanMail({} as MailConnection, { ...request, skipIds: [] }, [{ id: "inbox", name: "Inbox" }]);
  expect(result).toMatchObject({ messages: [], fetched: 1, skippedUnavailable: 1 });
  expect(result.next).toContain("next");
});
