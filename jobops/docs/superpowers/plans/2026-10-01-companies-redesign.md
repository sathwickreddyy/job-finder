# Companies Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce numeric compensation and typed interview rounds at the company API, normalize the stored research, and replace `/companies` and `/companies/[slug]` with the approved metrics views.

**Architecture:** The Zod fact schemas in `validation.ts` become the hard contract. They already run on the merged record in `ingestion.ts`, so patches are judged on the stored result. A local script exports non-conforming facts to a reviewable JSON file and applies the reviewed file through `patchCompany`, so the backfill uses the same validation and observation trail as the API. Pages render the components already built and previewed under `/gallery/companies-v2` (`views.tsx`, `detail.tsx`, `marks.tsx`, `format.ts`, `metrics.ts`, `summary.ts`).

**Tech Stack:** Next.js 16 App Router, React 19, Zod 4, Drizzle/PostgreSQL, Tailwind 4 tokens, Vitest 5, Playwright e2e (`npm run test:e2e`, port 3211, `jobops_e2e` DB).

**Spec:** `docs/superpowers/specs/2026-10-01-companies-redesign-design.md`

## Global Constraints

- Run all commands from `jobops/`.
- Commit key: `JOB_FINDER-9999: <summary>` (no Jira issue). No `feat:`/`fix:` prefixes. Commit **only when the user says so**; each "Commit" step means "propose this commit message and wait".
- Footer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Never invent numbers. Ambiguous source text is flagged for the user, never guessed.
- Stock stays in its original currency; never converted or added to INR totals.
- INR amounts are whole rupees per year (`3100000` = 31 LPA).
- Colors only from theme tokens (`bg-chart-*`, `bg-selected`, …); no palette literals in components.
- Pure helpers live in `format.ts`/`metrics.ts`; `"use client"` files export components only.
- Browser tests use `jobops_e2e` only; the backfill touches the personal DB only after the user approves the review file.
- Nothing may scroll horizontally at 390px width.

## File map

| File                                                                        | Change          | Responsibility                                                           |
| --------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------ |
| `src/features/companies/validation.ts`                                      | Modify          | COMPENSATION/INTERVIEW contract, twin rule, `data.`-prefixed issue paths |
| `src/features/companies/metrics.ts`                                         | Modify          | Keep as is; remove `inferRoundKind` in Task 7                            |
| `scripts/company-facts-backfill.ts`                                         | Create          | `export` and `apply` commands                                            |
| `src/features/companies/backfill.ts`                                        | Create          | Pure helpers: conformance check, review-file schema                      |
| `src/app/companies/page.tsx`                                                | Replace         | View switcher, grid/compare/pipeline                                     |
| `src/app/companies/[slug]/page.tsx`                                         | Replace         | Tabbed company page                                                      |
| `src/features/companies/detail.tsx`                                         | Modify          | Keep `LayoutTabs` only; URL tab support                                  |
| `src/features/companies/detail-client.tsx`                                  | Modify          | `DetailTabs` driven by `?tab=`                                           |
| `src/features/companies/card.tsx`                                           | Delete          | Replaced by `CompanyGridCard`                                            |
| Gallery-v2 routes, `gallery-v2.tsx`, `preview-bar.tsx`, app-shell exception | Delete (Task 7) | Previews no longer needed                                                |
| `README.md` (jobops)                                                        | Modify          | Field table and assistant prompt                                         |
| `tests/company-ingestion.test.ts`, `tests/company-research.test.ts`         | Modify          | New contract fixtures                                                    |
| `tests/company-metrics.test.ts`, `tests/company-backfill.test.ts`           | Create          | Unit tests                                                               |
| `tests/e2e/company-api.spec.ts`, `tests/e2e/companies.spec.ts`              | Modify          | Contract payload; new page structure                                     |

---

### Task 1: Research contract at the API

**Files:**

- Modify: `src/features/companies/validation.ts` (fact data schemas around lines 79–125, `validateFact` around line 230)
- Modify: `tests/company-ingestion.test.ts`, `tests/company-research.test.ts`, `tests/e2e/company-api.spec.ts`
- Modify: `README.md` (field table lines ~121–122, assistant prompt line ~139)

**Interfaces:**

- Consumes: `roundKinds`, `interviewOutcomes` from `src/features/companies/metrics.ts`.
- Produces: `validateFact(input)` throws `ZodError` whose data issues have paths starting with `"data"` (e.g. `data.fixedAnnual`, `data.rounds.0.kind`). `equitySchema` export. `compensationTwins` export (`readonly [original: string, numeric: string[]][]`).

- [ ] **Step 1: Write the failing tests** in `tests/company-ingestion.test.ts`. Replace the test `"validates typed compensation while preserving future sourced information"` with:

```ts
const pay = {
  factKey: "offer",
  category: "COMPENSATION",
  title: "Offer",
  sourceUrl: "https://leetcode.com/discuss/1",
};
const paths = (run: () => unknown) => {
  try {
    run();
  } catch (error) {
    return (error as { issues: { path: (string | number)[] }[] }).issues.map((issue) =>
      issue.path.join("."),
    );
  }
  return [];
};
it("requires role, currency and a numeric annual amount for compensation", () => {
  const fact = validateFact({
    ...pay,
    data: { role: "SDE-2", currency: "INR", fixedAnnual: 4500000, notes: { relocation: true } },
  });
  expect(fact.data).toMatchObject({ fixedAnnual: 4500000, notes: { relocation: true } });
  expect(fact.verificationStatus).toBe("COMMUNITY_REPORTED");
  expect(
    paths(() => validateFact({ ...pay, data: { currency: "INR", fixedAnnual: 1 } })),
  ).toContain("data.role");
  expect(paths(() => validateFact({ ...pay, data: { role: "SDE", fixedAnnual: 1 } }))).toContain(
    "data.currency",
  );
  expect(
    paths(() => validateFact({ ...pay, data: { role: "SDE", currency: "inr", fixedAnnual: 1 } })),
  ).toContain("data.currency");
  expect(paths(() => validateFact({ ...pay, data: { role: "SDE", currency: "INR" } }))).toContain(
    "data.fixedAnnual",
  );
  expect(() =>
    validateFact({ ...pay, data: { role: "SDE", currency: "INR", fixedAnnual: 0 } }),
  ).toThrow();
  expect(() =>
    validateFact({ ...pay, data: { role: "SDE", currency: "INR", fixedAnnual: "45L" } }),
  ).toThrow();
  expect(
    validateFact({ ...pay, data: { role: "SDE", currency: "INR", totalAnnual: 5000000 } }).data
      .totalAnnual,
  ).toBe(5000000);
});
it("requires a numeric twin for every original text amount", () => {
  const base = { role: "SDE", currency: "INR", fixedAnnual: 3100000 };
  expect(
    paths(() => validateFact({ ...pay, data: { ...base, joiningBonusOriginal: "3L" } })),
  ).toContain("data.joiningBonus");
  expect(
    paths(() => validateFact({ ...pay, data: { ...base, variableOriginal: "10%" } })),
  ).toContain("data.variableAnnual");
  expect(() =>
    validateFact({ ...pay, data: { ...base, variableOriginal: "10%", variablePercent: 10 } }),
  ).not.toThrow();
  expect(
    paths(() => validateFact({ ...pay, data: { ...base, equityOriginal: "$58K over 4 years" } })),
  ).toContain("data.equity");
});
it("keeps stock as a typed grant in its own currency", () => {
  const base = { role: "SDE", currency: "INR", fixedAnnual: 3100000 };
  const equity = { amount: 58000, currency: "USD", vestingYears: 4, type: "RSU" };
  expect(validateFact({ ...pay, data: { ...base, equity } }).data.equity).toEqual(equity);
  expect(() => validateFact({ ...pay, data: { ...base, equity: 58000 } })).toThrow();
  expect(() => validateFact({ ...pay, data: { ...base, equity: { amount: 58000 } } })).toThrow();
  expect(() => validateFact({ ...pay, data: { ...base, variablePercent: 120 } })).toThrow();
  expect(() =>
    validateFact({ ...pay, data: { ...base, benefits: ["Relocation ₹1.5L"] } }),
  ).not.toThrow();
});
it("requires typed rounds, a round count and an outcome for interviews", () => {
  const interview = {
    factKey: "loop",
    category: "INTERVIEW",
    title: "Loop",
    sourceUrl: "https://leetcode.com/discuss/2",
  };
  const data = {
    role: "SDE-2",
    outcome: "OFFER",
    roundCount: 3,
    rounds: [
      { name: "R1 — DSA", kind: "DSA" },
      { name: "R2 — HLD", kind: "HLD" },
    ],
  };
  expect(validateFact({ ...interview, data }).data.roundCount).toBe(3);
  expect(
    paths(() => validateFact({ ...interview, data: { ...data, outcome: "Offer" } })),
  ).toContain("data.outcome");
  expect(
    paths(() => validateFact({ ...interview, data: { ...data, rounds: [{ name: "R1 — DSA" }] } })),
  ).toContain("data.rounds.0.kind");
  expect(paths(() => validateFact({ ...interview, data: { ...data, rounds: [] } }))).toContain(
    "data.rounds",
  );
  expect(paths(() => validateFact({ ...interview, data: { ...data, roundCount: 1 } }))).toContain(
    "data.roundCount",
  );
  expect(paths(() => validateFact({ ...interview, data: { ...data, role: undefined } }))).toContain(
    "data.role",
  );
});
```

In the same file, update the contract assertion in `"exports a self-contained schema and typed category data"`:

```ts
const schemas = contract.components.schemas as Record<
  string,
  { properties?: Record<string, unknown>; required?: string[] }
>;
expect(schemas.COMPENSATIONData.properties?.fixedAnnual).toMatchObject({
  type: "number",
  exclusiveMinimum: 0,
});
expect(schemas.COMPENSATIONData.required).toEqual(expect.arrayContaining(["role", "currency"]));
expect(schemas.INTERVIEWData.required).toEqual(
  expect.arrayContaining(["role", "outcome", "roundCount", "rounds"]),
);
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx vitest run tests/company-ingestion.test.ts`
Expected: FAIL. `data.role`/`data.currency` paths are missing (current schemas are optional), and paths lack the `data.` prefix.

- [ ] **Step 3: Implement the contract** in `validation.ts`. Add the import and helpers below the existing `amount` helper:

```ts
import { interviewOutcomes, roundKinds } from "./metrics";

const positive = z.number().finite().positive();
const currencyCode = z
  .string()
  .trim()
  .regex(/^[A-Z]{3}$/, "Use an uppercase ISO 4217 currency code such as INR.");
export const equitySchema = z
  .object({
    amount: positive,
    currency: currencyCode,
    vestingYears: z.number().positive().max(10).optional(),
    type: z.enum(["RSU", "ESOP", "STOCK_BONUS", "OTHER"]).optional(),
  })
  .passthrough();
export const compensationTwins = [
  ["fixedAnnualOriginal", ["fixedAnnual"]],
  ["totalAnnualOriginal", ["totalAnnual"]],
  ["joiningBonusOriginal", ["joiningBonus"]],
  ["variableOriginal", ["variableAnnual", "variablePercent"]],
  ["equityOriginal", ["equity"]],
] as const;
const interviewRound = z
  .object({
    name: text().min(1),
    kind: z.enum(roundKinds),
    summary: text(10000).optional(),
    durationMinutes: amount,
    topics: words,
    questions,
    referenceUrl: httpUrl.optional(),
  })
  .passthrough();
```

Replace the `COMPENSATION` and `INTERVIEW` entries of `factDataSchemas` with:

```ts
  COMPENSATION: z
    .object({
      ...publicationFields,
      role: text().min(1),
      level: text().optional(),
      yearsExperience: amount,
      currency: currencyCode,
      fixedAnnual: positive.optional(),
      totalAnnual: positive.optional(),
      variableAnnual: positive.optional(),
      variablePercent: z.number().min(0).max(100).optional(),
      joiningBonus: positive.optional(),
      equity: equitySchema.optional(),
      benefits: z.array(text(300).min(1)).max(50).optional(),
      vestingNotes: text(10000).optional(),
      offerDate: date.optional(),
      officeDaysPerWeek: z.number().int().min(0).max(7).optional(),
    })
    .passthrough()
    .superRefine((value, context) => {
      const data = value as Record<string, unknown>;
      if (data.fixedAnnual === undefined && data.totalAnnual === undefined)
        context.addIssue({
          code: "custom",
          path: ["fixedAnnual"],
          message:
            "Supply fixedAnnual or totalAnnual as a number in whole currency units per year, e.g. 3100000 for 31 LPA.",
        });
      for (const [original, numeric] of compensationTwins)
        if (data[original] !== undefined && numeric.every((key) => data[key] === undefined))
          context.addIssue({
            code: "custom",
            path: [numeric[0]],
            message: `${original} needs its numeric twin ${numeric.join(" or ")}.`,
          });
    }),
  INTERVIEW: z
    .object({
      ...publicationFields,
      role: text().min(1),
      level: text().optional(),
      yearsExperience: amount,
      outcome: z.enum(interviewOutcomes),
      outcomeNotes: text(10000).optional(),
      roundCount: z.number().int().positive(),
      rounds: z.array(interviewRound).min(1).max(100),
      topics: words,
      questions,
      applicationRoute: text().optional(),
    })
    .passthrough()
    .refine((value) => value.roundCount >= value.rounds.length, {
      path: ["roundCount"],
      message: "roundCount cannot be less than the number of described rounds.",
    }),
```

In `validateFact`, replace `const data = factDataSchemas[value.category].parse(value.data ?? {}) as Record<string, unknown>;` with:

```ts
const parsed = factDataSchemas[value.category].safeParse(value.data ?? {});
if (!parsed.success)
  throw new z.ZodError(
    parsed.error.issues.map((issue) => ({ ...issue, path: ["data", ...issue.path] })),
  );
const data = parsed.data as Record<string, unknown>;
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx vitest run tests/company-ingestion.test.ts`
Expected: PASS. If `exclusiveMinimum` is not what Zod emits for `.positive()`, print `JSON.stringify(schemas.COMPENSATIONData.properties.fixedAnnual)` and match the emitted key.

- [ ] **Step 5: Update the research test fixtures.** In `tests/company-research.test.ts`, add after the `input` constant:

```ts
const conforming: Record<string, Record<string, unknown>> = {
  COMPENSATION: { role: "SDE-2", currency: "INR", fixedAnnual: 3100000 },
  INTERVIEW: {
    role: "SDE-2",
    outcome: "OFFER",
    roundCount: 1,
    rounds: [{ name: "Coding", kind: "DSA" }],
  },
};
```

In the publication-year test, spread it into the data: `data: { ...conforming[category], publishedAt: "2025-12-31", publicationYear: 2025 }`. In the failing-publication loop, use `validateFact({ ...input, data: { ...conforming.INTERVIEW, ...data } })`. In the structured-questions test, set `data = { ...conforming.INTERVIEW, publicationYear: 2025, questions: [...], rounds: [{ name: "Coding", kind: "DSA", durationMinutes: 45, questions: [{ text: "Reverse a list" }] }] }`, and in its rejection loops spread `...conforming.INTERVIEW` before `questions`/`rounds`, adding `kind: "DSA"` to every round object.

- [ ] **Step 6: Run the whole unit suite**

Run: `npm test`
Expected: PASS. Any other failure means a fixture still writes legacy compensation/interview data; fix that fixture the same way.

- [ ] **Step 7: Update the API e2e payload.** In `tests/e2e/company-api.spec.ts`, change the `interview-1` fact data to:

```ts
        data: {
          publishedAt: "2024-12-31",
          role: "Software engineer",
          outcome: "OFFER",
          roundCount: 1,
          questions: ["Explain an LRU cache"],
          rounds: [
            {
              name: "Coding",
              kind: "DSA",
              durationMinutes: 45,
              topics: ["Arrays"],
              questions: [
                {
                  text: "Merge overlapping intervals",
                  topic: "Arrays",
                  referenceUrl: "https://leetcode.com/problems/merge-intervals/",
                },
              ],
            },
          ],
        },
```

Add one rejection test to the same spec:

```ts
test("rejects compensation stored as text with the missing field named", async ({ request }) => {
  const response = await request.post("/api/v1/companies", {
    data: {
      slug: `text-pay-${Date.now()}`,
      name: `Text pay ${Date.now()}`,
      facts: [
        {
          factKey: "offer",
          category: "COMPENSATION",
          title: "Offer",
          sourceUrl: "https://leetcode.com/discuss/post/9",
          data: { role: "SDE", currency: "INR", fixedAnnualOriginal: "31 LPA" },
        },
      ],
    },
  });
  expect(response.status()).toBe(400);
  const body = await response.json();
  expect(body.issues.map((issue: { path: string }) => issue.path)).toContain("data.fixedAnnual");
});
```

Note: compare with how the existing `create(request, input)` helper posts; if it adds headers (origin, content type), reuse it via `request.post` with the same options.

- [ ] **Step 8: Update the README contract docs.** In `README.md`, replace the two table rows with:

```md
| `COMPENSATION` | **Required:** `role`, `currency` (uppercase ISO code, `INR`), and `fixedAnnual` or `totalAnnual` (number, whole currency units per year: `3100000` = 31 LPA). Optional: `level`, `yearsExperience`, `variableAnnual`, `variablePercent` (0–100), `joiningBonus` (total), `equity` (`{ amount, currency, vestingYears?, type?: RSU/ESOP/STOCK_BONUS/OTHER }`, kept in its own currency), `benefits` (strings), `vestingNotes`, `offerDate`. Any `…Original` text needs its numeric twin. |
| `INTERVIEW` | **Required:** `role`, `outcome` (`OFFER`, `REJECTED`, `PENDING`, `WITHDREW`, `UNKNOWN`; detail in `outcomeNotes`), `roundCount` (≥ described rounds), `rounds` (non-empty; each `{ name, kind }` where `kind` is `ONLINE_ASSESSMENT`, `DSA`, `LLD`, `HLD`, `BEHAVIORAL`, `HIRING_MANAGER`, `DOMAIN` or `OTHER`). Optional: `level`, `yearsExperience`, `topics`, `questions`, `applicationRoute`. |
```

In the assistant prompt paragraph, replace `Extract roles/levels, INR compensation components, interview rounds/questions,` with `Extract roles/levels; convert every pay figure to numbers (fixedAnnual/totalAnnual in whole rupees per year, keep the original text in fixedAnnualOriginal; stock as an equity object in its own currency); tag every interview round with its kind and use the outcome enum;`.

- [ ] **Step 9: Verify and propose the commit**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all pass.
Propose: `JOB_FINDER-9999: Require numeric compensation and typed interview rounds in company research`

---

### Task 2: Metrics unit tests

**Files:**

- Create: `tests/company-metrics.test.ts`
- Modify (only if a test exposes a bug): `src/features/companies/metrics.ts`, `src/features/companies/format.ts`

**Interfaces:**

- Consumes: `companyMetrics`, `companyStage`, `interviewOutcome`, `interviewReports`, `payStats`, `lpa` from `metrics.ts`; `money`, `payExtras`, `payRange` from `format.ts`.

- [ ] **Step 1: Write the tests**

```ts
import { describe, expect, it } from "vitest";
import { money, payExtras, payRange } from "@/features/companies/format";
import {
  companyMetrics,
  companyStage,
  interviewOutcome,
  interviewReports,
  lpa,
  payStats,
} from "@/features/companies/metrics";
import type { ResearchFact } from "@/features/companies/research-data";

let id = 0;
const fact = (category: string, data: Record<string, unknown>) =>
  ({
    id: `fact-${++id}`,
    factKey: `key-${id}`,
    category,
    title: `Report ${id}`,
    summary: "",
    data,
    sourceUrl: `https://leetcode.com/discuss/post/${id}`,
  }) as unknown as ResearchFact;
const pay = (fixedAnnual: number, extra: Record<string, unknown> = {}) =>
  fact("COMPENSATION", { role: "SDE", currency: "INR", fixedAnnual, ...extra });

describe("company metrics", () => {
  it("computes interpolated quartiles", () => {
    const stats = payStats([1, 2, 3, 4].map((value) => ({ value, sourceUrl: "x" })))!;
    expect([stats.min, stats.p25, stats.median, stats.p75, stats.max]).toEqual([
      1, 1.75, 2.5, 3.25, 4,
    ]);
    expect(payStats([])).toBeNull();
  });
  it("uses only INR numeric pay and counts the rest as needing review", () => {
    const metrics = companyMetrics([
      pay(3000000),
      pay(4000000),
      fact("COMPENSATION", { role: "SDE", currency: "USD", fixedAnnual: 150000 }),
      fact("COMPENSATION", { role: "SDE", fixedAnnualOriginal: "31 LPA" }),
    ]);
    expect(metrics.fixed?.n).toBe(2);
    expect(metrics.payReports).toBe(4);
    expect(metrics.payNeedsReview).toBe(2);
    expect(payRange(metrics.fixed)).toBe("₹32.5–37.5 LPA");
  });
  it("keeps stock in its own currency with a per-year value", () => {
    const metrics = companyMetrics([
      pay(5200000, {
        equity: { amount: 58000, currency: "USD", vestingYears: 4 },
        joiningBonus: 450000,
      }),
    ]);
    expect(metrics.equity[0]).toMatchObject({ amount: 58000, currency: "USD", perYear: 14500 });
    expect(metrics.total).toBeNull();
    expect(payExtras(metrics)).toEqual(["₹4.5L joining", "$58K stock / 4 yrs"]);
  });
  it("summarizes interview rounds, outcomes and the typical loop", () => {
    const loop = (outcome: string, kinds: string[]) =>
      fact("INTERVIEW", {
        role: "SDE",
        outcome,
        roundCount: kinds.length,
        rounds: kinds.map((kind, index) => ({ name: `R${index + 1}`, kind })),
      });
    const metrics = companyMetrics([
      loop("OFFER", ["DSA", "HLD", "HIRING_MANAGER"]),
      loop("REJECTED", ["ONLINE_ASSESSMENT", "DSA", "LLD", "HLD", "BEHAVIORAL"]),
      loop("UNKNOWN", ["DSA", "DSA", "HLD"]),
    ]);
    expect(metrics.typicalRounds).toBe(3);
    expect(metrics.roundsRange).toEqual([3, 5]);
    expect(metrics.outcomes).toEqual({ offer: 1, rejected: 1, other: 1 });
    expect(metrics.typicalLoop).toEqual(["DSA", "HLD", "HIRING_MANAGER"]);
    expect(metrics.styleMix).toEqual([
      { family: "Coding", count: 5 },
      { family: "Design", count: 4 },
      { family: "People", count: 2 },
    ]);
  });
  it("reads contract outcomes and legacy outcome text", () => {
    expect(interviewOutcome("OFFER")).toBe("OFFER");
    expect(interviewOutcome("Not selected after HM")).toBe("REJECTED");
    expect(interviewOutcome("Selected")).toBe("OFFER");
    expect(interviewOutcome(undefined)).toBe("UNKNOWN");
  });
  it("orders interview reports newest first with round questions", () => {
    const reports = interviewReports([
      fact("INTERVIEW", {
        publicationYear: 2024,
        role: "A",
        outcome: "OFFER",
        roundCount: 1,
        rounds: [{ name: "R1", kind: "DSA" }],
      }),
      fact("INTERVIEW", {
        publicationYear: 2026,
        role: "B",
        outcome: "PENDING",
        roundCount: 1,
        rounds: [{ name: "R1", kind: "HLD", questions: [{ text: "Design a feed" }] }],
      }),
    ]);
    expect(reports.map((report) => report.role)).toEqual(["B", "A"]);
    expect(reports[0].rounds[0].questions[0].text).toBe("Design a feed");
  });
  it("derives the furthest active pipeline stage", () => {
    expect(companyStage([], 0)).toBe("Not started");
    expect(companyStage([], 2)).toBe("Opening saved");
    expect(companyStage(["APPLIED", "TECHNICAL_INTERVIEW"], 0)).toBe("Interviewing");
    expect(companyStage(["REJECTED", "APPLIED"], 0)).toBe("Applied");
    expect(companyStage(["REJECTED", "WITHDRAWN"], 0)).toBe("Closed");
    expect(companyStage(["OFFER"], 0)).toBe("Offer");
  });
  it("formats lakh, crore and foreign amounts without converting", () => {
    expect(lpa(3100000)).toBe("31");
    expect(money(450000)).toBe("₹4.5L");
    expect(money(12500000)).toBe("₹1.25Cr");
    expect(money(58000, "USD")).toBe("$58K");
    expect(money(1000, "SGD")).toBe("SGD 1K");
  });
});
```

- [ ] **Step 2: Run them**

Run: `npx vitest run tests/company-metrics.test.ts`
Expected: PASS. A failure is a real bug in already-written code; fix the code, not the expectation, unless the expectation contradicts the spec.

- [ ] **Step 3: Propose the commit**

Propose: `JOB_FINDER-9999: Cover company pay, interview and pipeline metrics with tests`

---

### Task 3: Backfill export and apply tooling

**Files:**

- Create: `src/features/companies/backfill.ts`
- Create: `scripts/company-facts-backfill.ts`
- Create: `tests/company-backfill.test.ts`

**Interfaces:**

- Consumes: `validateFact` (Task 1), `patchCompany(idOrSlug, value)` from `ingestion.ts`, `mergeData` from `validation.ts`.
- Produces:
  - `factProblems(fact: { factKey; category; title; sourceUrl; data; … }): string[]`, which returns issue strings (`"data.fixedAnnual: Supply fixedAnnual…"`); empty means conforming.
  - `reviewFileSchema` (Zod) for `{ generatedAt: string; items: ReviewItem[] }`, where `ReviewItem = { companySlug: string; factKey: string; category: "COMPENSATION" | "INTERVIEW"; problems: string[]; current: Record<string, unknown>; patch: Record<string, unknown> | null; ambiguous: string | null }`.
  - `previewPatch(current, patch)`, which returns `mergeData(current, patch)` and is used to validate before writing.
  - CLI: `npx tsx scripts/company-facts-backfill.ts export` writes `data/backfill/<YYYY-MM-DD>-company-facts.json`; `npx tsx scripts/company-facts-backfill.ts apply <file>` validates every item and then patches.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { factProblems, previewPatch, reviewFileSchema } from "@/features/companies/backfill";

const legacy = {
  factKey: "offer",
  category: "COMPENSATION",
  title: "Offer",
  sourceUrl: "https://leetcode.com/discuss/post/1",
  data: { role: "SDE-2", fixedAnnualOriginal: "31 LPA" },
};

describe("company fact backfill", () => {
  it("lists every contract problem of a legacy fact", () => {
    const problems = factProblems(legacy);
    expect(problems.some((line) => line.startsWith("data.currency"))).toBe(true);
    expect(problems.some((line) => line.startsWith("data.fixedAnnual"))).toBe(true);
  });
  it("accepts a reviewed patch that keeps the original text", () => {
    const merged = previewPatch(legacy.data, { currency: "INR", fixedAnnual: 3100000 });
    expect(merged).toEqual({
      role: "SDE-2",
      fixedAnnualOriginal: "31 LPA",
      currency: "INR",
      fixedAnnual: 3100000,
    });
    expect(factProblems({ ...legacy, data: merged })).toEqual([]);
  });
  it("requires either a patch or an ambiguity reason per item", () => {
    const item = {
      companySlug: "x",
      factKey: "offer",
      category: "COMPENSATION",
      problems: [],
      current: {},
    };
    expect(
      reviewFileSchema.safeParse({
        generatedAt: "2026-10-01",
        items: [{ ...item, patch: null, ambiguous: null }],
      }).success,
    ).toBe(false);
    expect(
      reviewFileSchema.safeParse({
        generatedAt: "2026-10-01",
        items: [{ ...item, patch: null, ambiguous: "Bare 37, unit unclear" }],
      }).success,
    ).toBe(true);
    expect(
      reviewFileSchema.safeParse({
        generatedAt: "2026-10-01",
        items: [{ ...item, patch: { currency: "INR" }, ambiguous: null }],
      }).success,
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run tests/company-backfill.test.ts`
Expected: FAIL with "Cannot find module '@/features/companies/backfill'".

- [ ] **Step 3: Implement `src/features/companies/backfill.ts`**

```ts
import { z, ZodError } from "zod";
import { mergeData, validateFact } from "./validation";

export function factProblems(fact: Record<string, unknown>): string[] {
  try {
    validateFact(fact);
    return [];
  } catch (error) {
    if (!(error instanceof ZodError)) throw error;
    return error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
  }
}

export const previewPatch = (current: Record<string, unknown>, patch: Record<string, unknown>) =>
  mergeData(current, patch);

const reviewItem = z
  .object({
    companySlug: z.string().min(1),
    factKey: z.string().min(1),
    category: z.enum(["COMPENSATION", "INTERVIEW"]),
    problems: z.array(z.string()),
    current: z.record(z.string(), z.unknown()),
    patch: z.record(z.string(), z.unknown()).nullable(),
    ambiguous: z.string().min(1).nullable(),
  })
  .refine((item) => (item.patch === null) !== (item.ambiguous === null), {
    message: "Each item needs exactly one of patch or ambiguous.",
  });
export const reviewFileSchema = z.object({ generatedAt: z.string(), items: z.array(reviewItem) });
export type ReviewItem = z.infer<typeof reviewItem>;
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx vitest run tests/company-backfill.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement the script** `scripts/company-facts-backfill.ts`:

```ts
import "dotenv/config";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { and, eq, inArray } from "drizzle-orm";
import { closeDatabase, db } from "../src/db";
import { companyFacts, companyRecords } from "../src/db/schema";
import {
  factProblems,
  previewPatch,
  reviewFileSchema,
  type ReviewItem,
} from "../src/features/companies/backfill";
import { patchCompany } from "../src/features/companies/ingestion";

type FactRow = typeof companyFacts.$inferSelect;
/** The writable fact fields only; ids and timestamps would fail the strict fact schema. */
const factFields = (fact: FactRow) => ({
  factKey: fact.factKey,
  category: fact.category,
  title: fact.title,
  summary: fact.summary,
  sourceUrl: fact.sourceUrl,
  sourceTitle: fact.sourceTitle,
  sourceKind: fact.sourceKind,
  verificationStatus: fact.verificationStatus,
  data: fact.data,
});

async function exportFile() {
  const rows = await db
    .select({ fact: companyFacts, slug: companyRecords.slug })
    .from(companyFacts)
    .innerJoin(companyRecords, eq(companyRecords.id, companyFacts.companyId))
    .where(inArray(companyFacts.category, ["COMPENSATION", "INTERVIEW"]));
  const items: ReviewItem[] = rows.flatMap(({ fact, slug }) => {
    const problems = factProblems(factFields(fact));
    return problems.length
      ? [
          {
            companySlug: slug,
            factKey: fact.factKey,
            category: fact.category as ReviewItem["category"],
            problems,
            current: fact.data,
            patch: null,
            ambiguous: "Not reviewed yet",
          },
        ]
      : [];
  });
  const day = new Date().toISOString().slice(0, 10);
  await mkdir("data/backfill", { recursive: true });
  const path = `data/backfill/${day}-company-facts.json`;
  await writeFile(path, JSON.stringify({ generatedAt: new Date().toISOString(), items }, null, 2));
  console.log(`${items.length} non-conforming facts written to ${path}`);
}

async function applyFile(path: string) {
  const file = reviewFileSchema.parse(JSON.parse(await readFile(path, "utf8")));
  const ready = file.items.filter((item) => item.patch);
  const failures: string[] = [];
  for (const item of ready) {
    const [current] = await db
      .select({ fact: companyFacts })
      .from(companyFacts)
      .innerJoin(companyRecords, eq(companyRecords.id, companyFacts.companyId))
      .where(
        and(eq(companyRecords.slug, item.companySlug), eq(companyFacts.factKey, item.factKey)),
      );
    if (!current) {
      failures.push(`${item.companySlug}/${item.factKey}: fact not found`);
      continue;
    }
    const problems = factProblems({
      ...factFields(current.fact),
      data: previewPatch(current.fact.data, item.patch!),
    });
    if (problems.length)
      failures.push(`${item.companySlug}/${item.factKey}: ${problems.join("; ")}`);
  }
  if (failures.length) {
    console.error(`Nothing written. ${failures.length} items still fail:\n${failures.join("\n")}`);
    process.exitCode = 1;
    return;
  }
  for (const item of ready)
    await patchCompany(item.companySlug, { facts: [{ factKey: item.factKey, data: item.patch! }] });
  console.log(
    `${ready.length} facts updated; ${file.items.length - ready.length} left for review.`,
  );
}

const [command, path] = process.argv.slice(2);
try {
  if (command === "export") await exportFile();
  else if (command === "apply" && path) await applyFile(path);
  else console.error("Usage: tsx scripts/company-facts-backfill.ts export | apply <file>");
} finally {
  await closeDatabase();
}
```

`patchCompany` records a `company_fact_observations` row for every changed fact, so the backfill leaves the same audit trail as the API.

- [ ] **Step 6: Dry-run the export against the e2e DB only**

Run `npm run test:e2e` once so `jobops_e2e` exists, then:
`DATABASE_URL=$(grep ^DATABASE_URL .env | cut -d= -f2- | sed 's#/jobops$#/jobops_e2e#') npx tsx scripts/company-facts-backfill.ts export`
(the e2e runner derives `jobops_e2e` from the normal URL the same way).
Expected: prints a count and writes a JSON file under `data/backfill/` (gitignored). Delete that file afterwards.

- [ ] **Step 7: Verify and propose the commit**

Run: `npm run typecheck && npm run lint && npm test`
Propose: `JOB_FINDER-9999: Add reviewed backfill export and apply for company research facts`

---

### Task 4: Normalize stored research (review gate with the user)

No code. This task produces the review file and stops for approval.

- [ ] **Step 1: Export from the personal DB** (read-only)

Run: `npx tsx scripts/company-facts-backfill.ts export`
Expected: about 60 compensation and 88 interview items.

- [ ] **Step 2: Fill each item.** Read `current` and set either `patch` (and `ambiguous: null`) or keep `patch: null` with a specific `ambiguous` reason. Rules:

| Source text                                                         | Patch                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `"31 LPA"`, `"31L"`, `"31 lakh"`, `"33.07L"`                        | `31 × 100000` → `3100000` (`3307000`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `"1.2 Cr"`, `"1.2 crore"`                                           | `12000000`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `"Rs. 52,00,000"`, `"52,00,000"`                                    | `5200000`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `"30 base excluding PF"` (unit implied by the report's LPA context) | `3000000`, with `extractionNotes: "Unit LPA inferred from same report"` only when the same report states LPA elsewhere; otherwise ambiguous                                                                                                                                                                                                                                                                                                                                                                              |
| A bare number with no unit anywhere in the report (`"37"`)          | ambiguous: `"Bare 37, unit not stated"`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| A range (`"28–32 LPA"`)                                             | ambiguous unless the report names one figure as the offer                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Text contradicting itself (`"55,00,000 LPA (title says 55L base)"`) | ambiguous, quoting both figures                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Joining bonus split across years (`"6L total: 4L Y1 + 2L Y2"`)      | `joiningBonus: 600000`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Variable as a percentage (`"10–20%"`)                               | `variablePercent: 10` only when one value is stated; ranges become ambiguous, or use `variablePercent` = lower bound **only** if the report says "up to"/"minimum" explicitly                                                                                                                                                                                                                                                                                                                                            |
| Equity object with `amount` + `currency`                            | `equity: { amount, currency, vestingYears }`                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Equity `"$58K over 4 years"`                                        | `equity: { amount: 58000, currency: "USD", vestingYears: 4 }`                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Equity with `currencySymbol: "$"` but `currencyCodeStated: false`   | ambiguous: `"$ could be USD or SGD"` unless the company/report context names USD                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Missing `currency` with a rupee amount                              | `currency: "INR"`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Interview round names                                               | `kind` per round: OA/HackerRank/Codility → `ONLINE_ASSESSMENT`; DSA/coding/algorithms/PS-DS/phone coding screen → `DSA`; LLD/machine coding → `LLD`; HLD/system design → `HLD`; behavioral/values/bar raiser/leadership/cognitive → `BEHAVIORAL`; hiring manager/managerial/HM → `HIRING_MANAGER`; domain/Java/SQL/project deep-dive → `DOMAIN`; recruiter/HR → `OTHER`. Mixed rounds (`"HM / System Design"`) take the kind of the round's **summary** emphasis; if the summary doesn't settle it, use the first named. |
| Free-text `outcome`                                                 | enum via the same mapping as `interviewOutcome()`, with the original text moved to `outcomeNotes`                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Missing `roundCount`                                                | `rounds.length`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Missing `role`                                                      | the report's role from `title`/`summary` if stated; otherwise ambiguous                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

Patches replace whole arrays (`rounds`), so write out every round with its original fields plus `kind`.

- [ ] **Step 3: Validate the file without writing.** Run `apply` against the **e2e** DB (same `DATABASE_URL` override as Task 3 Step 6). The file must parse, and every item must fail only as "fact not found", so nothing is written anywhere. Then show the user:
  - the counts (`patched`, `ambiguous`),
  - every ambiguous item with its reason,
  - a sample of 5 patches side by side with their original text.

- [ ] **Step 4: STOP and wait for the user to approve or edit the file.**

- [ ] **Step 5: Apply to the personal DB** (only after approval)

Run: `npx tsx scripts/company-facts-backfill.ts apply data/backfill/<date>-company-facts.json`
Expected: "N facts updated; M left for review." Rerun `export` and confirm only the ambiguous items remain.

---

### Task 5: Companies page with Grid / Compare / Pipeline

**Files:**

- Replace: `src/app/companies/page.tsx`
- Delete: `src/features/companies/card.tsx`
- Modify: `tests/e2e/companies.spec.ts`

**Interfaces:**

- Consumes: `companySummaries(data)`, `sharedPayScale(summaries)` from `summary.ts`; `ViewSwitcher({ view, hrefs })`, `CompanyGridCard({ company, href })`, `CompareTable({ companies, scaleMax, basePath })`, `PipelineBoard({ companies, basePath })` from `views.tsx`; `companyViews`, `CompanyView` from `format.ts`.
- Produces: `/companies?view=grid|compare|pipeline&q=…`. Grid sections keep ids `#bengaluru`, `#hyderabad` (lower-cased, spaces → `-`); grid card links go to `/companies/<slug>?city=<City>`.

- [ ] **Step 1: Update the e2e test first.** In `tests/e2e/companies.spec.ts`, after `await page.goto("/companies?q=Amazon");` keep the `#bengaluru article` / `#hyderabad article` count checks. Replace `await expect(bengaluru.getByRole("link")).toHaveCount(0); await bengaluru.click(...)` with:

```ts
await bengaluru.click();
await expect(page).toHaveURL(/\/companies\/amazon\?city=Bengaluru$/);
await page.goto("/companies?view=compare&q=Amazon");
await expect(page.getByRole("table")).toContainText("Amazon");
await page.getByRole("button", { name: "Fewest rounds" }).click();
await expect(page.getByRole("button", { name: "Fewest rounds" })).toHaveAttribute(
  "aria-pressed",
  "true",
);
await page.goto("/companies?view=pipeline&q=Amazon");
await expect(page.getByRole("region", { name: "Applied" })).toContainText("Amazon");
await page.goto("/companies/amazon?city=Bengaluru&tab=progress");
```

Keep the remaining resume/application assertions; Task 6 adapts their selectors.

- [ ] **Step 2: Replace `src/app/companies/page.tsx`** with the preview implementation from `src/app/gallery/companies-v2/list/page.tsx`, changing: `base = "/companies"`; `detail = "/companies"`; remove `PreviewBar`; and add a `?city=` suffix to grid card links (`href={`/companies/${row.id}?city=${encodeURIComponent(city)}`}`). Add `id={city.toLowerCase().replaceAll(" ", "-")}` and `className="scroll-mt-6 space-y-5"` to each city `<section>`, and include `"Location not recorded"` companies (no cities) in a final section, as the current page does. Keep the footer note: "Research includes its source and observation dates. Community reports reflect their authors' experiences."

- [ ] **Step 3: Delete the old card**

Run: `git rm src/features/companies/card.tsx` and confirm `grep -rn "features/companies/card" src` returns nothing.

- [ ] **Step 4: Run checks**

Run: `npm run typecheck && npm run lint && npm test && npm run test:e2e -- companies`
Expected: all pass. (If `test:e2e` does not forward a filter, run the full e2e command.)

- [ ] **Step 5: Visual check** at 1440 and 390px widths in both themes (dev server on a free port with `APP_URL` set to match; the :3210 production server is not yours). `document.documentElement.scrollWidth` must equal the viewport width at 390px.

- [ ] **Step 6: Propose the commit**

Propose: `JOB_FINDER-9999: Rebuild Companies with grid, compare and pipeline views`

---

### Task 6: Tabbed company page with URL tabs

**Files:**

- Replace: `src/app/companies/[slug]/page.tsx`
- Modify: `src/features/companies/detail.tsx` (keep `LayoutTabs`; delete `LayoutSections`, `LayoutRail`, the `sections` array)
- Modify: `src/features/companies/detail-client.tsx` (`DetailTabs`)
- Modify: `tests/e2e/companies.spec.ts`

**Interfaces:**

- Consumes: `DetailProps`, `LayoutTabs` from `detail.tsx`; `interviewReports(facts)` from `metrics.ts`.
- Produces: `DetailTabs({ tabs, initial }: { tabs: { id: string; label: string; content: ReactNode }[]; initial: string })`. `LayoutTabs(props: DetailProps & { tab: string })`. Valid tab ids: `pay`, `interviews`, `progress`, `about`. The progress tab keeps `#resume-<city>` (from `CompanyResumeReference`) and an `#applications` wrapper around the applications card.

- [ ] **Step 1: Update the e2e assertions.** After `page.goto("/companies/amazon?city=Bengaluru&tab=progress")` from Task 5, the existing selectors `#applications`, `#resume-bengaluru` and `#resume-hyderabad` must resolve inside the visible progress tab. Add:

```ts
await expect(page.getByRole("tab", { name: "Your progress" })).toHaveAttribute(
  "aria-selected",
  "true",
);
await page.getByRole("tab", { name: "Compensation" }).click();
await expect(page).toHaveURL(/tab=pay/);
await page.reload();
await expect(page.getByRole("tab", { name: "Compensation" })).toHaveAttribute(
  "aria-selected",
  "true",
);
```

Run `npm run test:e2e` and confirm these fail (the current page has no tabs).

- [ ] **Step 2: Make `DetailTabs` URL-driven**

```tsx
export function DetailTabs({
  tabs,
  initial,
}: {
  tabs: { id: string; label: string; content: ReactNode }[];
  initial: string;
}) {
  const [active, setActive] = useState(tabs.some((tab) => tab.id === initial) ? initial : tabs[0]?.id);
  function select(id: string) {
    setActive(id);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", id);
    window.history.replaceState(null, "", url);
  }
```

Replace `onClick={() => setActive(tab.id)}` with `onClick={() => select(tab.id)}`. Add arrow-key support on the tablist (`onKeyDown`: ArrowRight/ArrowLeft move to the next/previous tab and focus it). This is required by the WAI-ARIA tabs pattern, since the tabs use `role="tab"`.

- [ ] **Step 3: Pass the tab through `LayoutTabs`.** Change its signature to `LayoutTabs(props: DetailProps & { tab: string })` and render `<DetailTabs initial={props.tab} tabs={…} />`. In `ProgressSection`, wrap the applications card in `<div id="applications">`. Delete `LayoutSections`, `LayoutRail` and the `sections` constant.

- [ ] **Step 4: Replace `src/app/companies/[slug]/page.tsx`** with the preview route's body, minus `PreviewBar` and the layout switcher:

```tsx
import { notFound } from "next/navigation";
import { getDisplayPreferences } from "@/features/candidate/preferences";
import { LayoutTabs } from "@/features/companies/detail";
import { interviewReports } from "@/features/companies/metrics";
import { readCompanies } from "@/features/companies/read";
import { companySummaries, sharedPayScale } from "@/features/companies/summary";

const tabs = ["pay", "interviews", "progress", "about"];

export default async function CompanyPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const [{ slug }, query, data, preferences] = await Promise.all([
    params,
    searchParams,
    readCompanies(),
    getDisplayPreferences(),
  ]);
  const company = data.companies.find((row) => row.id === slug);
  if (!company) notFound();
  const summaries = companySummaries(data);
  return (
    <LayoutTabs
      company={company}
      summary={summaries.find((row) => row.id === slug)!}
      reports={interviewReports(company.facts ?? [])}
      data={data}
      preferences={preferences}
      scaleMax={sharedPayScale(summaries)}
      tab={tabs.includes(query.tab ?? "") ? query.tab! : "pay"}
    />
  );
}
```

Update the header's next-action hrefs in `detail.tsx` (`nextAction`): `#questions` → `?tab=interviews#questions`, `#progress` → `?tab=progress`.

- [ ] **Step 5: Run checks**

Run: `npm run typecheck && npm run lint && npm test && npm run test:e2e`
Expected: all pass, including the Task 5 and Task 6 assertions.

- [ ] **Step 6: Visual check** of `/companies/new-relic`, `/companies/microsoft` and a company with no research, on every tab, at 1440 and 390px, in both themes. Check that empty states read "Not reported"/"Needs review", never `0` or blank.

- [ ] **Step 7: Propose the commit**

Propose: `JOB_FINDER-9999: Rebuild company page as tabs for pay, interviews, progress and sources`

---

### Task 7: Remove previews and the round-name fallback

Do this after Task 4 is applied, so every stored round carries `kind`.

**Files:**

- Delete: `src/app/gallery/companies-v2/` (all routes), `src/features/companies/gallery-v2.tsx`, `src/features/companies/preview-bar.tsx`
- Modify: `src/components/app-shell.tsx` (restore `pathname.startsWith("/gallery/companies")` without the v2 exception)
- Modify: `src/features/companies/metrics.ts` (remove `inferRoundKind`; `roundKindOf` returns `"OTHER"` when `kind` is missing; string rounds become `OTHER`)
- Modify: `tests/company-metrics.test.ts` (add the case below)
- Modify: `docs/superpowers/specs/2026-10-01-companies-redesign-design.md` (status → Implemented)
- Modify: `../AGENTS.md` (change "gallery `/gallery/companies-v2`" to "implemented at `/companies`")

- [ ] **Step 1: Add the test**

```ts
it("treats rounds without a stored kind as Other", () => {
  const metrics = companyMetrics([
    fact("INTERVIEW", {
      role: "SDE",
      outcome: "OFFER",
      roundCount: 1,
      rounds: [{ name: "R1 — DSA" }],
    }),
  ]);
  expect(metrics.typicalLoop).toEqual(["OTHER"]);
});
```

Run it and confirm it fails (the fallback infers `DSA`).

- [ ] **Step 2: Remove `inferRoundKind`** and its call sites in `metrics.ts`. Run `grep -rn inferRoundKind src tests` and expect no output.

- [ ] **Step 3: Delete the preview files and restore the shell condition**

Run: `git rm -r src/app/gallery/companies-v2 src/features/companies/gallery-v2.tsx src/features/companies/preview-bar.tsx`

- [ ] **Step 4: Run everything**

Run: `npm run typecheck && npm run lint && npm test && npm run test:e2e && npm run build`
Expected: all pass.

- [ ] **Step 5: Propose the commit**

Propose: `JOB_FINDER-9999: Remove companies redesign previews and the round-name fallback`
