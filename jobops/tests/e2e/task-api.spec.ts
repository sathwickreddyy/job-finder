import { expect, test } from "@playwright/test";

test("retired agent API rejects reads and writes without exposing personal records", async ({
  request,
}) => {
  const base = "/api/v1/tasks/00000000-0000-4000-8000-000000000999";
  for (const suffix of ["", "/updates", "/proposals", "/resume"]) {
    for (const method of ["GET", "POST"]) {
      const response = await request.fetch(`${base}${suffix}`, { method });
      expect(response.status()).toBe(410);
      expect(await response.text()).not.toContain("resumeVersionId");
    }
  }
  expect(
    (await request.get("/missions/00000000-0000-4000-8000-000000000999/context.json")).status(),
  ).toBe(410);
});

test("retired endpoints cannot bypass origin or server-action protections", async ({ request }) => {
  const url = "/api/v1/tasks/00000000-0000-4000-8000-000000000999";
  expect(
    (await request.post(url, { headers: { origin: "https://example.invalid" } })).status(),
  ).toBe(403);
  expect((await request.post(url, { headers: { "next-action": "forged-action" } })).status()).toBe(
    403,
  );
});
