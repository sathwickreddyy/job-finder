import { randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext } from "@playwright/test";
const endpoint = "/api/v1/companies";
const fixtureRun = randomUUID();
const identity = () => {
  const key = randomUUID();
  return { slug: `e2e-api-${fixtureRun}-${key}`, name: `API company ${fixtureRun} ${key}` };
};
async function create(request: APIRequestContext, data: Record<string, unknown>) {
  const response = await request.post(endpoint, { data });
  expect(response.status(), await response.text()).toBe(201);
  return response.json();
}

// This hook runs even after assertion failures and keeps the seeded directory stable.
test.afterEach(async ({ request }) => {
  const response = await request.get(endpoint, {
    params: { q: `API company ${fixtureRun}`, status: "ACTIVE" },
  });
  expect(response.status()).toBe(200);
  const { companies } = await response.json();
  for (const company of companies as { id: string; slug: string }[]) {
    if (!company.slug.startsWith(`e2e-api-${fixtureRun}-`)) continue;
    expect(
      (await request.patch(`${endpoint}/${company.id}`, { data: { archive: true } })).status(),
    ).toBe(200);
  }
});

test("company upsert preserves identity, sourced history and omitted values", async ({
  request,
  page,
}) => {
  const input = {
    ...identity(),
    focus: "Payments",
    aliases: ["  API Trading  " + randomUUID()],
    locations: [
      {
        city: "Bangalore",
        state: "Karnataka",
        country: "India",
        workModes: ["ONSITE"],
        sourceUrl: "https://example.com/careers",
        verificationStatus: "VERIFIED",
      },
    ],
    facts: [
      {
        factKey: "offer-1",
        category: "COMPENSATION",
        title: "Reported offer",
        sourceUrl: "https://leetcode.com/discuss/post/1",
        data: {
          fixedAnnual: 4500000,
          currency: "INR",
          context: { city: "Bengaluru", role: "Engineer" },
          topics: ["graphs"],
        },
        occurredAt: "2026-03-01T00:30:00+05:30",
      },
    ],
  };
  const saved = await create(request, input);
  expect(saved.locations[0].city).toBe("Bengaluru");
  expect(saved.facts[0].verificationStatus).toBe("COMMUNITY_REPORTED");
  expect(saved.facts[0].observations).toHaveLength(1);
  const again = await request.post(endpoint, { data: input });
  expect(again.status()).toBe(200);
  const unchanged = await again.json();
  expect(unchanged.id).toBe(saved.id);
  expect(unchanged.outcome).toBe("unchanged");
  expect(unchanged.facts[0].observations).toHaveLength(1);
  expect(unchanged.facts[0].firstObservedAt).toBe(saved.facts[0].firstObservedAt);
  expect(Date.parse(unchanged.facts[0].lastObservedAt)).toBeGreaterThanOrEqual(
    Date.parse(saved.facts[0].lastObservedAt),
  );
  const patch = await request.patch(`${endpoint}/${saved.id}`, {
    data: {
      facts: [
        {
          factKey: "offer-1",
          data: { fixedAnnual: 5000000, context: { level: "Senior" }, topics: ["trees"] },
        },
      ],
      locations: [{ city: "BENGALURU", workModes: ["HYBRID"] }],
    },
  });
  expect(patch.status(), await patch.text()).toBe(200);
  const updated = await patch.json();
  expect(updated.focus).toBe("Payments");
  expect(updated.aliases).toEqual(saved.aliases);
  expect(updated.locations).toHaveLength(1);
  expect(updated.locations[0].state).toBe("Karnataka");
  expect(updated.locations[0].firstObservedAt).toBe(saved.locations[0].firstObservedAt);
  expect(updated.facts[0].data.context).toEqual({
    city: "Bengaluru",
    role: "Engineer",
    level: "Senior",
  });
  expect(updated.facts[0].data.topics).toEqual(["trees"]);
  expect(updated.facts[0].observations).toHaveLength(2);
  expect(updated.changes.facts).toEqual(["offer-1"]);
  await page.goto(`/companies?q=${encodeURIComponent(input.name)}`);
  const card = page.locator("#bengaluru article").filter({ hasText: input.name });
  await expect(card).toHaveCount(1);
  await card.locator("summary").click();
  await expect(card.getByText("Reported offer", { exact: true })).toBeVisible();
  await expect(card.getByText("community reported · leetcode", { exact: true })).toBeVisible();
  await expect(card.getByRole("link", { name: "leetcode.com", exact: true })).toHaveAttribute(
    "href",
    "https://leetcode.com/discuss/post/1",
  );
  await expect(card.getByText("50,00,000", { exact: true })).toBeVisible();
  const detail = await request.get(`${endpoint}/${input.slug}`);
  expect((await detail.json()).facts[0].observations).toHaveLength(2);
  const list = await request.get(endpoint, { params: { city: "Bangalore", q: input.name } });
  const selected = await (
    await request.get(endpoint, { params: { q: input.name, include: "locations" } })
  ).json();
  expect(selected.companies[0].facts).toBeUndefined();
  expect(selected.companies[0].locations).toHaveLength(1);
  expect((await list.json()).companies.map((company: { id: string }) => company.id)).toEqual([
    saved.id,
  ]);
});

test("rename preserves historical names, alias conflicts point at canonical company, archive is explicit", async ({
  request,
}) => {
  const original = identity();
  const saved = await create(request, original);
  const rename = await request.patch(`${endpoint}/${original.slug}`, {
    data: { name: `${original.name} renamed` },
  });
  expect(rename.status()).toBe(200);
  expect((await rename.json()).aliases).toContain(original.name);
  const conflict = await request.post(endpoint, {
    data: { ...identity(), aliases: [original.name.toUpperCase()] },
  });
  expect(conflict.status()).toBe(409);
  expect((await conflict.json()).canonicalCompany.id).toBe(saved.id);
  expect(
    (await request.patch(`${endpoint}/${saved.id}`, { data: { slug: "changed" } })).status(),
  ).toBe(400);
  expect(
    (await request.patch(`${endpoint}/${saved.id}`, { data: { archive: true } })).status(),
  ).toBe(200);
  expect(
    (await (await request.get(endpoint, { params: { q: original.name } })).json()).companies,
  ).toHaveLength(0);
  expect(
    (
      await (
        await request.get(endpoint, { params: { q: original.name, status: "ARCHIVED" } })
      ).json()
    ).companies[0].id,
  ).toBe(saved.id);
  expect(
    (
      await request.patch(`${endpoint}/${saved.id}`, {
        data: { archive: false, replaceAliases: true, aliases: [] },
      })
    ).status(),
  ).toBe(200);
});

test("batch failures roll back earlier creates and updates", async ({ request }) => {
  const saved = await create(request, { ...identity(), focus: "Original" });
  const draft = identity();
  const duplicate = identity();
  const response = await request.post(`${endpoint}/batch`, {
    data: {
      companies: [
        { slug: saved.slug, name: saved.name, focus: "Should roll back" },
        draft,
        { ...duplicate, aliases: [saved.name] },
      ],
    },
  });
  expect(response.status()).toBe(409);
  expect((await request.get(`${endpoint}/${draft.slug}`)).status()).toBe(404);
  expect((await (await request.get(`${endpoint}/${saved.id}`)).json()).focus).toBe("Original");
  const invalidFact = identity();
  expect(
    (
      await request.post(`${endpoint}/batch`, {
        data: { companies: [draft, { ...invalidFact, facts: [{ factKey: "missing-required" }] }] },
      })
    ).status(),
  ).toBe(400);
  expect((await request.get(`${endpoint}/${draft.slug}`)).status()).toBe(404);
  const batch = await request.post(`${endpoint}/batch`, {
    data: { companies: [draft, duplicate] },
  });
  expect(batch.status()).toBe(200);
  expect(await batch.json()).toMatchObject({ created: 2, updated: 0, unchanged: 0 });
});

test("ambiguous city-only location patches fail without changing existing locations", async ({
  request,
}) => {
  const saved = await create(request, {
    ...identity(),
    locations: [
      { city: "Springfield", state: "A", country: "India" },
      { city: "Springfield", state: "B", country: "India" },
    ],
  });
  expect(
    (
      await request.patch(`${endpoint}/${saved.id}`, {
        data: { locations: [{ city: "Springfield", workModes: ["REMOTE"] }] },
      })
    ).status(),
  ).toBe(400);
  const detail = await (await request.get(`${endpoint}/${saved.id}`)).json();
  expect(detail.locations).toHaveLength(2);
  expect(
    detail.locations.every((location: { workModes: string[] }) => location.workModes.length === 0),
  ).toBe(true);
  expect(
    (
      await request.patch(`${endpoint}/${saved.id}`, {
        data: {
          locations: [
            {
              city: "Springfield",
              state: "A",
              sourceUrl: "https://leetcode.com/discuss/post/1",
              verificationStatus: "VERIFIED",
            },
          ],
        },
      })
    ).status(),
  ).toBe(400);
});

test("concurrent conflicting aliases cannot create two active canonical identities", async ({
  request,
}) => {
  const alias = `Shared alias ${randomUUID()}`;
  const responses = await Promise.all(
    [identity(), identity()].map((input) =>
      request.post(endpoint, { data: { ...input, aliases: [alias] } }),
    ),
  );
  expect(responses.map((response) => response.status()).sort()).toEqual([201, 409]);
});

test("API rejects malformed, oversized, unsourced and elevated community evidence", async ({
  request,
}) => {
  expect(
    (
      await request.post(endpoint, { headers: { "content-type": "text/plain" }, data: "{}" })
    ).status(),
  ).toBe(415);
  expect(
    (
      await request.post(endpoint, { headers: { "content-type": "application/json" }, data: "{" })
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.post(endpoint, {
        headers: { "content-type": "application/json" },
        data: " ".repeat(512 * 1024 + 1),
      })
    ).status(),
  ).toBe(413);
  expect(
    (
      await request.post(`${endpoint}/batch`, {
        data: { companies: Array.from({ length: 101 }, identity) },
      })
    ).status(),
  ).toBe(413);
  const input = identity();
  expect(
    (
      await request.post(endpoint, {
        data: { ...input, facts: [{ factKey: "bad", category: "OTHER", title: "No source" }] },
      })
    ).status(),
  ).toBe(400);
  expect((await request.get(`${endpoint}/${input.slug}`)).status()).toBe(404);
  expect(
    (
      await request.post(endpoint, {
        data: {
          ...input,
          facts: [
            {
              factKey: "bad",
              category: "OTHER",
              title: "Community",
              sourceUrl: "https://leetcode.com/discuss/post/1",
              sourceKind: "OFFICIAL",
              verificationStatus: "VERIFIED",
            },
          ],
        },
      })
    ).status(),
  ).toBe(400);
  const communityPlace = await create(request, {
    ...identity(),
    locations: [{ city: "Bengaluru", sourceUrl: "https://leetcode.com/discuss/post/1" }],
  });
  expect(communityPlace.locations[0].verificationStatus).toBe("COMMUNITY_REPORTED");
  expect((await request.get(`${endpoint}/not-a-real-company`)).status()).toBe(404);
  expect(
    (
      await request.post(endpoint, {
        headers: { origin: "https://foreign.example" },
        data: identity(),
      })
    ).status(),
  ).toBe(403);
});

test("schema is self-contained and typed for external ingestion clients", async ({ request }) => {
  const response = await request.get(`${endpoint}/schema`);
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toBe("private, no-store");
  const contract = await response.json();
  expect(contract.openapi).toBe("3.1.0");
  expect(contract.components.schemas.CompanyInput.required).toContain("slug");
  expect(contract.components.schemas.CompanyPatch.properties.slug).toBeUndefined();
  expect(contract.components.schemas.COMPENSATIONData.properties.fixedAnnual.minimum).toBe(0);
});
