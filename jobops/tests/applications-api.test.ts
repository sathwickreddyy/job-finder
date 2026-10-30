import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ record: vi.fn(), find: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/features/applications/agent-record", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/applications/agent-record")>()),
  recordAgentApplication: mocks.record,
  findApplications: mocks.find,
}));
import { GET, POST } from "@/app/api/v1/applications/route";

const body = {
  opening: { url: "https://jobs.example.invalid/sde-2", company: "Acme", title: "SDE II" },
  application: { method: "DIRECT" },
  humanConfirmed: true,
};
const post = (value: unknown, type = "application/json") =>
  new Request("http://localhost/api/v1/applications", {
    method: "POST",
    headers: { "content-type": type },
    body: JSON.stringify(value),
  });
const result = (duplicate: boolean) => ({
  id: "44444444-4444-4444-8444-444444444444",
  duplicate,
  links: { application: "/applications/44444444-4444-4444-8444-444444444444", company: null },
  warnings: [],
});

it("POST returns 201 then 200 for duplicate", async () => {
  mocks.record.mockImplementation(async () => result(false));
  const created = await POST(post(body));
  expect(created.status).toBe(201);
  expect(await created.json()).toEqual(result(false));
  mocks.record.mockImplementation(async () => result(true));
  expect((await POST(post(body))).status).toBe(200);
});

it("400 with issues when humanConfirmed is false", async () => {
  const calls = mocks.record.mock.calls.length;
  const response = await POST(post({ ...body, humanConfirmed: false }));
  expect(response.status).toBe(400);
  expect((await response.json()).issues[0].path).toBe("humanConfirmed");
  expect(mocks.record.mock.calls.length).toBe(calls);
});

it("415 for non-JSON", async () => {
  expect((await POST(post(body, "text/plain"))).status).toBe(415);
});

it("GET requires url or company", async () => {
  expect((await GET(new Request("http://localhost/api/v1/applications"))).status).toBe(400);
  mocks.find.mockImplementation(async () => []);
  const response = await GET(new Request("http://localhost/api/v1/applications?company=Acme"));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ applications: [] });
  expect(mocks.find).toHaveBeenLastCalledWith({ company: "Acme" });
});
