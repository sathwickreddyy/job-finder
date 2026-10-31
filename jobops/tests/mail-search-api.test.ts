import { expect, it, vi } from "vitest";
import type { MailContext } from "@/features/mail/context";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const context: MailContext = {
  baselineAt: "2026-10-01T00:00:00Z",
  applications: [],
  outbound: [],
  companies: [
    {
      id: "level ai",
      name: "Level AI",
      slug: "level-ai",
      baselineAt: "2026-10-01T00:00:00Z",
      ruleSource: "test",
      rule: {
        company: "Level AI",
        aliases: [],
        domains: [],
        senders: [],
        keywords: [],
        excludedTerms: [],
      },
    },
  ],
};
vi.mock("@/features/mail/context", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/mail/context")>()),
  loadMailContext: async () => context,
}));
const readCompanySearch = vi.fn();
const companySearchStep = vi.fn();
vi.mock("@/features/mail/company-search", () => ({
  readCompanySearch: (...args: unknown[]) => readCompanySearch(...args),
  companySearchStep: (...args: unknown[]) => companySearchStep(...args),
}));
const includeMail = vi.fn();
vi.mock("@/features/mail/include", () => ({
  includeMail: (...args: unknown[]) => includeMail(...args),
}));
import { PUT } from "@/app/api/v1/mail/company/[key]/rule/route";
import { GET, POST } from "@/app/api/v1/mail/company/[key]/search/route";
import { POST as include } from "@/app/api/v1/mail/[id]/include/route";

const json = (method: string, body: unknown) =>
  new Request("http://localhost/api", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const key = (value: string) => ({ params: Promise.resolve({ key: value }) });

it("PUT rule refuses a generic keyword with 400", async () => {
  const response = await PUT(
    json("PUT", {
      aliases: [],
      domains: [],
      senders: [],
      keywords: ["Interview"],
      excludedTerms: [],
    }),
    key("level%20ai"),
  );
  expect(response.status).toBe(400);
  expect((await response.json()).error).toBe(
    '"Interview" appears in every company\'s mail, so it can\'t identify Level AI. Try a phrase like "Level AI Talent".',
  );
  expect((await PUT(json("PUT", { aliases: [] }), key("nobody"))).status).toBe(404);
});

it("GET search returns queries for each inbox", async () => {
  readCompanySearch.mockResolvedValue({ queries: { "me@gmail.com": "-in:sent …" } });
  const response = await GET(new Request("http://localhost/api"), key("level%20ai"));
  expect(response.status).toBe(200);
  expect(readCompanySearch).toHaveBeenCalledWith("level ai");
  expect((await response.json()).queries).toEqual({ "me@gmail.com": "-in:sent …" });
});

it("POST search starts with options and continues with an empty body", async () => {
  companySearchStep.mockResolvedValue({ more: false, run: {}, lanes: [] });
  expect((await POST(json("POST", { lastDays: 365, restart: true }), key("level ai"))).status).toBe(
    200,
  );
  expect(companySearchStep).toHaveBeenLastCalledWith("level ai", { lastDays: 365, restart: true });
  expect(
    (await POST(new Request("http://localhost/api", { method: "POST" }), key("level ai"))).status,
  ).toBe(200);
  expect(companySearchStep).toHaveBeenLastCalledWith("level ai", {});
  expect((await POST(json("POST", { since: "yesterday" }), key("level ai"))).status).toBe(400);
});

it("POST include passes the company and refuses a missing one", async () => {
  includeMail.mockResolvedValue({ addedSender: null });
  const id = "6f1c3c2a-6a8a-4a57-9d1e-2b0a3f7c8d90";
  const params = { params: Promise.resolve({ id }) };
  expect((await include(json("POST", { company: "level ai" }), params)).status).toBe(200);
  expect(includeMail).toHaveBeenCalledWith(id, "level ai");
  expect((await include(json("POST", {}), params)).status).toBe(400);
});
