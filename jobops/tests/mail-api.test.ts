import { expect, it, vi } from "vitest";

const listMail = vi.fn();
vi.mock("@/features/mail/mail-list", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/mail/mail-list")>()),
  listMail: (...args: unknown[]) => listMail(...args),
}));
import { GET } from "@/app/api/v1/mail/route";

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
