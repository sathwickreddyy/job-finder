import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ search: vi.fn() }));
vi.mock("@/features/mail/search-service", () => ({
  searchMail: mocks.search,
  MailSearchError: class extends Error {
    status = 400;
  },
}));
import { GET, POST } from "@/app/api/v1/mail/search/route";
afterEach(() => vi.clearAllMocks());
const request = (body: string, headers: Record<string, string> = { "content-type": "application/json" }) =>
  new Request("http://localhost/api/v1/mail/search", { method: "POST", headers, body });
describe("mail search API", () => {
  it("publishes a discoverable contract and example N-day search", async () => {
    const response = GET();
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect((await response.json()).examples).toContainEqual({ lastDays: 3 });
  });
  it("forwards explicit search criteria and returns structured per-account progress", async () => {
    mocks.search.mockResolvedValue({
      complete: false,
      accounts: [{ account: "me@example.com", fetched: 25 }],
      nextCursor: "opaque",
    });
    const response = await POST(request('{"lastDays":7,"keywords":["Amazon"]}'));
    expect(mocks.search).toHaveBeenCalledWith({ lastDays: 7, keywords: ["Amazon"] });
    expect((await response.json()).nextCursor).toBe("opaque");
  });
  it("rejects wrong media types, malformed bodies, server-action headers and oversized inputs", async () => {
    expect((await POST(request("{}", { "content-type": "text/plain" }))).status).toBe(415);
    expect((await POST(request("invalid"))).status).toBe(400);
    expect(
      (
        await POST(
          request("{}", { "content-type": "application/json", "next-action": "x" } as Record<
            string,
            string
          >),
        )
      ).status,
    ).toBe(403);
    expect((await POST(request(" ".repeat(65537)))).status).toBe(413);
    expect(mocks.search).not.toHaveBeenCalled();
  });
  it("does not leak unexpected database/provider errors", async () => {
    mocks.search.mockRejectedValue(new Error("secret SQL/token"));
    const response = await POST(request("{}"));
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("secret");
  });
});
