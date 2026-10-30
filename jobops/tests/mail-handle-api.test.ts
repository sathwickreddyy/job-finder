import { expect, it, vi } from "vitest";
import { ApiError } from "@/features/agent-api/http";

const mocks = vi.hoisted(() => ({ handle: vi.fn(), update: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/features/mail/handle-service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/mail/handle-service")>()),
  handleMail: mocks.handle,
  updateMail: mocks.update,
}));
import { POST } from "@/app/api/v1/mail/[id]/handle/route";
import { PATCH } from "@/app/api/v1/mail/[id]/route";

const id = "22222222-2222-4222-8222-222222222222";
const params = (value = id) => ({ params: Promise.resolve({ id: value }) });
const json = (body: unknown, method = "POST") =>
  new Request(`http://localhost/api/v1/mail/${id}`, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

it("handle returns 200 with item", async () => {
  mocks.handle.mockImplementation(async () => ({ id, attention: "handled" }));
  const response = await POST(json({ justInfo: true }), params());
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ item: { id, attention: "handled" } });
  expect(mocks.handle).toHaveBeenLastCalledWith(id, { justInfo: true });
});

it("maps ApiError status and candidates", async () => {
  mocks.handle.mockImplementation(async () => {
    throw new ApiError(
      "This company has more than one open application. Pass applicationId.",
      409,
      {
        candidates: [{ id: "a", role: "SDE II" }],
      },
    );
  });
  const response = await POST(json({ outcome: "oa" }), params());
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({
    error: "This company has more than one open application. Pass applicationId.",
    candidates: [{ id: "a", role: "SDE II" }],
  });
});

it("PATCH returns 400 issues for an empty body", async () => {
  const calls = mocks.update.mock.calls.length;
  const response = await PATCH(json({}, "PATCH"), params());
  expect(response.status).toBe(400);
  expect((await response.json()).error).toBe("Invalid request.");
  expect(mocks.update.mock.calls.length).toBe(calls);
});

it("404 for a non-uuid id", async () => {
  expect((await POST(json({ justInfo: true }), params("not-an-id"))).status).toBe(404);
  expect((await PATCH(json({ tag: "offer" }, "PATCH"), params("not-an-id"))).status).toBe(404);
});
