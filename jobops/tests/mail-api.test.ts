import { expect, it, vi } from "vitest";

const listMail = vi.fn();
vi.mock("@/features/mail/mail-list", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/mail/mail-list")>()),
  listMail: (...args: unknown[]) => listMail(...args),
}));
const listDropped = vi.fn();
vi.mock("@/features/mail/dropped", () => ({
  listDropped: (...args: unknown[]) => listDropped(...args),
}));
const checkMailStep = vi.fn();
vi.mock("@/features/mail/check-service", () => ({
  checkMailStep: (...args: unknown[]) => checkMailStep(...args),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { GET } from "@/app/api/v1/mail/route";
import { GET as dropped } from "@/app/api/v1/mail/dropped/route";
import { POST as check } from "@/app/api/v1/mail/check/route";

it("GET passes parsed filters and no-store headers", async () => {
  listMail.mockResolvedValue({ items: [], nextCursor: null, openCount: 3 });
  const response = await GET(
    new Request("http://localhost/api/v1/mail?attention=open&tag=offer&q=acme"),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(await response.json()).toEqual({ items: [], nextCursor: null, openCount: 3 });
  expect(listMail).toHaveBeenCalledWith({ attention: "open", tag: "offer", q: "acme" });
});

it("rejects an invalid filter with 400 and issues", async () => {
  const calls = listMail.mock.calls.length;
  const response = await GET(new Request("http://localhost/api/v1/mail?tag=spam"));
  expect(response.status).toBe(400);
  const body = await response.json();
  expect(body.error).toBe("Invalid request.");
  expect(body.issues[0].path).toBe("tag");
  expect(listMail.mock.calls.length).toBe(calls);
});

it("hides internal errors", async () => {
  listMail.mockImplementation(async () => {
    throw new Error("connect ECONNREFUSED secret-host");
  });
  const response = await GET(new Request("http://localhost/api/v1/mail"));
  expect(response.status).toBe(500);
  expect(JSON.stringify(await response.json())).not.toContain("secret-host");
});

it("accepts new and legacy tag filters", async () => {
  listMail.mockResolvedValue({ items: [], nextCursor: null, openCount: 0 });
  for (const tag of ["interviewCall", "backgroundCheck", "process", "rejected"]) {
    const response = await GET(new Request(`http://localhost/api/v1/mail?tag=${tag}`));
    expect(response.status).toBe(200);
  }
  expect((await GET(new Request("http://localhost/api/v1/mail?tag=nope"))).status).toBe(400);
});

it("lists dropped mail since a time", async () => {
  listDropped.mockResolvedValue([
    {
      trackingId: "t",
      reason: "Matched Oracle by company name in subject; no job event recognised",
    },
  ]);
  const since = "2026-10-31T04:00:00.000Z";
  const response = await dropped(
    new Request(`http://localhost/api/v1/mail/dropped?since=${since}&company=oracle`),
  );
  expect(response.status).toBe(200);
  expect(listDropped).toHaveBeenCalledWith({ since, company: "oracle" });
  expect((await response.json()).items).toHaveLength(1);
  expect((await dropped(new Request("http://localhost/api/v1/mail/dropped"))).status).toBe(400);
});

it("starts a last-N-days fetch from the body, and an empty body still works", async () => {
  checkMailStep.mockResolvedValue({ more: false, newAttention: 0, accounts: [] });
  const json = (body: unknown) =>
    new Request("http://localhost/api/v1/mail/check", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  expect((await check(json({ lastDays: 30 }))).status).toBe(200);
  expect(checkMailStep).toHaveBeenLastCalledWith({ lastDays: 30 });
  expect(
    (await check(new Request("http://localhost/api/v1/mail/check", { method: "POST" }))).status,
  ).toBe(200);
  expect(checkMailStep).toHaveBeenLastCalledWith({});
  expect((await check(json({ lastDays: "lots" }))).status).toBe(400);
});
