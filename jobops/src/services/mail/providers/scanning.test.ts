import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { gmail } from "./gmail";
import { outlook, safeScanLink } from "./outlook";
import { plainText, currentMessageText } from "./plain-text";
import type { MailConnection } from "./types";
const connection = { email: "me@example.com" } as MailConnection;
beforeEach(() => {
  vi.spyOn(gmail, "accessToken").mockResolvedValue("test-access");
  vi.spyOn(outlook, "accessToken").mockResolvedValue("test-access");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const window = { until: "2026-10-30T05:00:00.000Z", since: "2026-10-29T00:00:00.000Z" };
describe("all-folder provider scans", () => {
  it("skips a Gmail message removed after listing without losing the page continuation", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ messages: [{ id: "removed" }], nextPageToken: "continue" }),
      )
      .mockResolvedValueOnce(Response.json({ error: { code: 404 } }, { status: 404 }));
    vi.stubGlobal("fetch", request);
    expect(await gmail.scanMail(connection, window, [])).toEqual({
      messages: [],
      next: "continue",
    });
  });
  it("reports Gmail quota errors without exposing provider response text", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json(
          {
            error: {
              message: "sensitive provider detail",
              errors: [{ reason: "userRateLimitExceeded" }],
            },
          },
          { status: 403 },
        ),
      ),
    );
    await expect(gmail.scanMail(connection, window, [])).rejects.toThrow("rate limit");
  });
  it("Gmail includes spam/trash, excludes sent/drafts and retains custom labels", async () => {
    const next = "opaque-page-token";
    const request = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ messages: [{ id: "stable" }], nextPageToken: next }))
      .mockResolvedValueOnce(
        Response.json({
          id: "stable",
          labelIds: ["SPAM", "Label_1"],
          internalDate: "1793332800000",
          payload: {
            mimeType: "text/html",
            body: {
              data: Buffer.from(
                '<p>Interview availability</p><img src="https://tracker.invalid" />',
              ).toString("base64url"),
            },
            headers: [
              { name: "From", value: '"Talent" <talent@example.com>' },
              { name: "Subject", value: "Interview invitation" },
            ],
          },
        }),
      );
    vi.stubGlobal("fetch", request);
    const result = await gmail.scanMail(connection, window, [{ id: "Label_1", name: "Careers" }]);
    const url = new URL(request.mock.calls[0][0]);
    expect(url.searchParams.get("includeSpamTrash")).toBe("true");
    expect(url.searchParams.get("q")).toContain("-in:sent -in:drafts");
    expect(result.messages[0]).toMatchObject({
      externalId: "stable",
      folders: ["SPAM", "Careers"],
      bodyText: "Interview availability",
    });
    expect(result.next).toBe(next);
    expect(request.mock.calls[0][1].redirect).toBe("error");
  });
  it("Gmail history omits the lower date bound and reuses opaque cursors", async () => {
    const request = vi.fn().mockResolvedValue(Response.json({ messages: [] }));
    vi.stubGlobal("fetch", request);
    await gmail.scanMail(connection, { until: window.until, next: "a+/=" }, []);
    const url = new URL(request.mock.calls[0][0]);
    expect(url.searchParams.get("q")).not.toContain("after:");
    expect(url.searchParams.get("pageToken")).toBe("a+/=");
  });
  it("Outlook scans the mailbox-wide endpoint and marks sent/draft messages as context", async () => {
    const request = vi.fn().mockResolvedValue(
      Response.json({
        value: [
          {
            id: "immutable",
            parentFolderId: "junk",
            subject: "Interview",
            receivedDateTime: window.since,
            body: { contentType: "HTML", content: "<p>Please reply</p>" },
          },
          {
            id: "sent-message",
            parentFolderId: "sent",
            subject: "Re: Interview",
            receivedDateTime: window.since,
          },
        ],
        "@odata.nextLink": "https://graph.microsoft.com/v1.0/me/messages?$skip=50",
      }),
    );
    vi.stubGlobal("fetch", request);
    const result = await outlook.scanMail(connection, window, [
      { id: "junk", name: "Junk Email" },
      { id: "sent", name: "Sent Items", contextOnly: true },
    ]);
    expect(new URL(request.mock.calls[0][0]).pathname).toBe("/v1.0/me/messages");
    expect(result.messages[0]).toMatchObject({
      externalId: "immutable",
      folders: ["Junk Email"],
      bodyText: "Please reply",
    });
    expect(result.messages[1].contextOnly).toBe(true);
    expect(new Headers(request.mock.calls[0][1].headers).get("Prefer")).toContain(
      'IdType="ImmutableId"',
    );
  });
  it("Outlook recursively inventories hidden and nested folders with source paths", async () => {
    const request = vi.fn().mockImplementation(async (value: string) => {
      const url = new URL(value);
      if (url.pathname.endsWith("sentitems")) return Response.json({ id: "sent" });
      if (url.pathname.endsWith("drafts")) return Response.json({ id: "drafts" });
      if (url.pathname.endsWith("outbox")) return Response.json({ id: "outbox" });
      expect(url.searchParams.get("includeHiddenFolders")).toBe("true");
      if (url.pathname.endsWith("childFolders"))
        return Response.json({
          value: [{ id: "nested", displayName: "Interviews", childFolderCount: 0 }],
        });
      return Response.json({
        value: [
          { id: "careers", displayName: "Careers", childFolderCount: 1 },
          { id: "sent", displayName: "Localized sent", childFolderCount: 0 },
        ],
      });
    });
    vi.stubGlobal("fetch", request);
    const folders = await outlook.folders(connection);
    expect(folders).toContainEqual({
      id: "nested",
      name: "Careers / Interviews",
      contextOnly: false,
    });
    expect(folders).toContainEqual({ id: "sent", name: "Localized sent", contextOnly: true });
  });
  it.each([
    "https://evil.invalid/v1.0/me/messages",
    "http://graph.microsoft.com/v1.0/me/messages",
    "https://user:pass@graph.microsoft.com/v1.0/me/messages",
    "https://graph.microsoft.com/v1.0/me/messages#",
    "https://graph.microsoft.com/v1.0/me/mailFolders/other/messages",
    "https://graph.microsoft.com/v1.0/me/messages/extra",
  ])("rejects continuation %s before sending credentials", async (next) => {
    const request = vi.fn();
    vi.stubGlobal("fetch", request);
    await expect(outlook.scanMail(connection, { ...window, next }, [])).rejects.toThrow("paging");
    expect(request).not.toHaveBeenCalled();
  });
  it("accepts equivalent OData folder continuations but rejects another folder", () => {
    expect(
      safeScanLink(
        "https://graph.microsoft.com/v1.0/me/mailFolders('ABC')/childFolders?$skip=1",
        "/v1.0/me/mailFolders/ABC/childFolders",
      ),
    ).toContain("ABC");
    expect(() =>
      safeScanLink(
        "https://graph.microsoft.com/v1.0/me/mailFolders('abc')/childFolders",
        "/v1.0/me/mailFolders/ABC/childFolders",
      ),
    ).toThrow("unsafe");
  });
  it("renders provider HTML as inert text and removes quoted reply history before matching", () => {
    expect(
      plainText(
        '<script>steal()</script><p>Hello &amp; welcome &#x1f44b;</p><img src="https://tracker.invalid">',
      ),
    ).toBe("Hello & welcome 👋");
    expect(currentMessageText("No update\nOn Monday, Recruiter wrote:\nInterview invitation")).toBe(
      "No update",
    );
  });
});
