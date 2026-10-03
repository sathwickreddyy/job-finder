# Applications Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `/applications` with a Next queue, a round-ladder record list and an Emails triage tab; record progress as outcomes on a two-column record page; refresh one Gmail and two personal Outlook inboxes on demand.

**Architecture:** Pure modules hold every rule (`phase.ts` for stages and outcomes, `queue.ts` for the silence clock and Next queue, `navigation.ts` for tabs and filters, `mail/triage.ts` for buckets). A single transactional outcome service writes rounds, stage, close reason and history. Pages are server components that read one loader (`applications/read.ts`) and render views ported from the approved gallery (`src/features/applications/gallery/*`). Mail providers sit behind one `MailProvider` interface; Gmail moves behind it and Outlook is added through Microsoft Graph.

**Tech Stack:** Next.js 16 App Router, React 19, Zod 4, Drizzle 0.45 + drizzle-kit 0.31 (PostgreSQL), Tailwind 4 theme tokens, lucide-react, Vitest 5, Playwright 1.63 (`npm run test:e2e`, port 3211, `jobops_e2e` DB).

**Spec:** `docs/superpowers/specs/2026-10-03-applications-redesign-design.md`

## Global Constraints

- Run all commands from `jobops/`.
- Commit key: `JOB_FINDER-9999: <summary>` (no Jira issue). No `feat:`/`fix:` prefixes. Subject line, blank line, body, blank line, footer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Commit **only when the user has authorized commits for this execution**; otherwise each "Commit" step means "propose this message and wait".
- Nothing is sent from the app and no AI model is called. Mail access is read-only.
- Never invent numbers. Every day count, queue item and round comes from recorded dates, events, rounds or mail. Dashed "still to come" dots only come from company research `typicalRounds`.
- All day arithmetic and display is Asia/Kolkata (IST).
- Silence thresholds: **7 days** for direct applications, **5 days** for outreach. Queue horizon: overdue + the next **7** IST days. Snooze: **2** days.
- Colours only from theme tokens (`bg-primary`, `bg-selected`, `bg-review`, `bg-danger-soft`, `bg-warning-soft`, `bg-success-soft`, `bg-chart-*`, …). No palette literals (`text-white`, hex) in components.
- `"use client"` files export components only; pure helpers live in non-client modules.
- `src/db/schema.ts` imports with relative paths only (drizzle-kit does not resolve `@/`).
- `drizzle-kit generate` must never see a create and a drop in the same diff (it prompts interactively). Task 14 splits that work.
- Browser tests use `jobops_e2e` only. Before running a migration that **drops** anything on the personal database, ask the user.
- Nothing may scroll horizontally at 390 px width.
- Copy is sentence case, plain verbs, no trailing arrows.

## Review Focus

1. **Records whose stage was set by the old dropdown** (e.g. `TECHNICAL_INTERVIEW` with no rounds) must render as Interviewing, offer "Round scheduled"/"Got an offer", and show "No rounds recorded" instead of an empty ladder. Pinned in Task 2 ("treats a legacy interview stage…") and Task 9 ("a record staged by the old dropdown…").
2. **A mail link whose suggested outcome the record cannot take** (an interview mail for a record already in Decision) must open the record with no chip preselected, not a broken panel. Pinned in Task 2 (`initialOutcome`).
3. **One revoked inbox during Refresh all** must not stop the others; it shows its error and Reconnect while the rest import. Pinned in Task 17 (`summarizeRefresh`).
4. **An Outlook message moved Inbox → Archive between refreshes** must not import twice. Pinned in Task 16 (`internetMessageId` dedup test).
5. **Records and Emails tabs at 390 px** must not scroll horizontally. Pinned in Task 9 and Task 13 (phone-width e2e list).

## File map

| File                                                                                                                              | Change           | Responsibility                                                                     |
| --------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ---------------------------------------------------------------------------------- |
| `src/lib/round-kinds.ts`                                                                                                          | Create           | Shared round vocabulary                                                            |
| `src/features/companies/metrics.ts`                                                                                               | Modify           | Re-export round kinds from the shared module                                       |
| `src/db/schema.ts`                                                                                                                | Modify           | Rounds, close reason, follow-up note, snoozes, mail connections, account email     |
| `drizzle/0006…0009`                                                                                                               | Generate         | Migrations                                                                         |
| `src/features/applications/dates.ts`                                                                                              | Create           | IST parsing/formatting helpers                                                     |
| `src/features/applications/phase.ts`                                                                                              | Create           | Phase, outcomes, planning, labels (pure)                                           |
| `src/features/applications/queue.ts`                                                                                              | Create           | Silence clock, Next queue (pure)                                                   |
| `src/features/applications/navigation.ts`                                                                                         | Create           | Tabs, filters, legacy links, queue keys (pure)                                     |
| `src/features/applications/read.ts`                                                                                               | Create           | Loader for records, rounds, events, linked mail, snoozes, research                 |
| `src/features/applications/outcome-service.ts`                                                                                    | Create           | `applyOutcome`, `resolveMail` (transactional, server-only)                         |
| `src/features/applications/outcomes.ts`                                                                                           | Create           | `recordOutcome` server action                                                      |
| `src/features/applications/record-actions.ts`                                                                                     | Create           | Follow-up, snooze, details, round edit actions                                     |
| `src/features/applications/views/*.tsx`                                                                                           | Create           | Tabs, marks, Next, Records, Emails, record page, chips, follow-up, picker, inboxes |
| `src/app/applications/page.tsx`, `[id]/page.tsx`                                                                                  | Replace          | New pages                                                                          |
| `src/features/applications/form.tsx`                                                                                              | Delete           | Stage dropdown form                                                                |
| `src/features/applications/actions.ts`                                                                                            | Modify           | Keep `addApplicationNote` only                                                     |
| `src/features/mail/triage.ts`, `read.ts`, `triage-actions.ts`, `handled.ts`                                                       | Create           | Buckets, triage loader, dismiss/link actions, saved-opening marker                 |
| `src/features/mail/refresh-service.ts`, `refresh-summary.ts`                                                                      | Create           | Provider-agnostic refresh, summary                                                 |
| `src/services/mail/providers/*`                                                                                                   | Create           | `MailProvider`, OAuth config, Gmail, Outlook, connections                          |
| `src/services/mail/gmail.ts`, `gmail.test.ts`                                                                                     | Delete (Task 15) | Moved into providers                                                               |
| `src/app/api/mail/[provider]/{connect,callback}/route.ts`                                                                         | Create           | OAuth routes                                                                       |
| `src/app/api/gmail/*`                                                                                                             | Delete (Task 15) | Replaced                                                                           |
| `src/app/inbox/page.tsx`, `src/app/mail/page.tsx`, `src/app/mail/review/page.tsx`                                                 | Replace          | Redirects                                                                          |
| `src/app/mail/[id]/page.tsx`, `src/app/jobs/new/page.tsx`, `src/features/jobs/actions.ts`                                         | Modify           | Triage actions, Save as opening                                                    |
| `src/features/mail/review-form.tsx`, `refresh.tsx`, `attention-actions.ts`                                                        | Delete           | Replaced                                                                           |
| `src/components/app-shell.tsx`, `src/features/workspace/home.tsx`, `src/app/settings/page.tsx`                                    | Modify           | Links, connections list                                                            |
| `scripts/demo-cleanup.ts`, `scripts/e2e.ts`, `README.md`, `.env.example`                                                          | Modify           | Table rename, env, docs                                                            |
| `tests/application-*.test.ts`, `tests/mail-triage.test.ts`, `tests/mail-refresh.test.ts`, `src/services/mail/providers/*.test.ts` | Create           | Unit tests                                                                         |
| `tests/e2e/applications.spec.ts`, `tests/e2e/helpers/records.ts`                                                                  | Create           | Browser tests                                                                      |
| `tests/e2e/simple-records.spec.ts`, `workspace.spec.ts`, `action-home.spec.ts`                                                    | Modify           | New flows                                                                          |

---

# Phase 1 — Tracking core

### Task 1: Shared round kinds and tracking schema

**Files:**

- Create: `src/lib/round-kinds.ts`
- Modify: `src/features/companies/metrics.ts:4-14`
- Modify: `src/db/schema.ts` (enums near line 95, `applications` near line 310, after `applicationEvents`)
- Generate: `drizzle/0006_application_rounds.sql`
- Test: `tests/application-schema.test.ts`

**Interfaces:**

- Produces: `roundKinds`, `RoundKind` from `@/lib/round-kinds`; `roundOutcomes`, `closeReasons`, `roundKindEnum`, `roundOutcomeEnum`, `closeReasonEnum`, `applicationRounds`, `queueSnoozes` from `@/db/schema`; `applications.closedReason`, `applications.nextActionNote`.

- [ ] **Step 1: Write the failing test** `tests/application-schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import {
  applicationRounds,
  applications,
  closeReasonEnum,
  queueSnoozes,
  roundKindEnum,
  roundOutcomeEnum,
} from "@/db/schema";
import { roundKinds as researchKinds } from "@/features/companies/metrics";
import { roundKinds } from "@/lib/round-kinds";

describe("application tracking schema", () => {
  it("shares one round vocabulary between research and applications", () => {
    expect(researchKinds).toBe(roundKinds);
    expect(roundKindEnum.enumValues).toEqual([...roundKinds]);
  });
  it("defines round outcomes and close reasons", () => {
    expect(roundOutcomeEnum.enumValues).toEqual(["SCHEDULED", "PASSED", "FAILED", "CANCELLED"]);
    expect(closeReasonEnum.enumValues).toEqual([
      "REJECTED",
      "NO_REPLY",
      "WITHDREW",
      "ACCEPTED",
      "DECLINED",
    ]);
  });
  it("allows at most one booked round per application", () => {
    const booked = getTableConfig(applicationRounds).indexes.find(
      (index) => index.config.name === "application_rounds_one_booked_idx",
    );
    expect(booked?.config.unique).toBe(true);
    expect(booked?.config.where).toBeDefined();
  });
  it("adds follow-up notes, close reasons and snoozes", () => {
    expect(getTableConfig(applications).columns.map((column) => column.name)).toEqual(
      expect.arrayContaining(["closed_reason", "next_action_note"]),
    );
    expect(getTableConfig(queueSnoozes).columns.map((column) => column.name)).toEqual([
      "item_key",
      "until",
      "created_at",
    ]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/application-schema.test.ts`
Expected: FAIL — `Cannot find module '@/lib/round-kinds'`.

- [ ] **Step 3: Create `src/lib/round-kinds.ts`**

```ts
/** Interview round kinds shared by company research and the user's own applications. */
export const roundKinds = [
  "ONLINE_ASSESSMENT",
  "DSA",
  "LLD",
  "HLD",
  "BEHAVIORAL",
  "HIRING_MANAGER",
  "DOMAIN",
  "OTHER",
] as const;
export type RoundKind = (typeof roundKinds)[number];
```

- [ ] **Step 4: Point `metrics.ts` at it.** Replace lines 4–14 of `src/features/companies/metrics.ts` (the `export const roundKinds = [...]` literal and `export type RoundKind`) with:

```ts
import { roundKinds, type RoundKind } from "@/lib/round-kinds";
export { roundKinds, type RoundKind };
```

- [ ] **Step 5: Extend the schema.** In `src/db/schema.ts`:

Add below the drizzle import block:

```ts
import { roundKinds } from "../lib/round-kinds";
```

Add after the `applicationStages` array:

```ts
export const roundOutcomes = ["SCHEDULED", "PASSED", "FAILED", "CANCELLED"] as const;
export const closeReasons = ["REJECTED", "NO_REPLY", "WITHDREW", "ACCEPTED", "DECLINED"] as const;
```

Add after `export const contactVerificationEnum = …`:

```ts
export const roundKindEnum = pgEnum("round_kind", roundKinds);
export const roundOutcomeEnum = pgEnum("round_outcome", roundOutcomes);
export const closeReasonEnum = pgEnum("application_close_reason", closeReasons);
```

In the `applications` table, add after `nextActionAt: date("next_action_at"),`:

```ts
    nextActionNote: text("next_action_note").notNull().default(""),
    closedReason: closeReasonEnum("closed_reason"),
```

Add after the `applicationEvents` table:

```ts
export const applicationRounds = pgTable(
  "application_rounds",
  {
    id: id(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    kind: roundKindEnum("kind").notNull(),
    name: text("name").notNull().default(""),
    scheduledAt: date("scheduled_at"),
    outcome: roundOutcomeEnum("outcome").notNull().default("SCHEDULED"),
    position: integer("position").notNull(),
    notes: text("notes").notNull().default(""),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("application_rounds_app_idx").on(t.applicationId, t.position),
    // A second booked round would make "Cleared the round" ambiguous.
    uniqueIndex("application_rounds_one_booked_idx")
      .on(t.applicationId)
      .where(sql`${t.outcome} = 'SCHEDULED'`),
    check("application_rounds_position", sql`${t.position} >= 1`),
  ],
);

export const queueSnoozes = pgTable("queue_snoozes", {
  itemKey: text("item_key").primaryKey(),
  until: date("until").notNull(),
  createdAt: createdAt(),
});
```

- [ ] **Step 6: Run the test and typecheck**

Run: `npx vitest run tests/application-schema.test.ts && npm run typecheck`
Expected: PASS; typecheck clean.

- [ ] **Step 7: Generate and inspect the migration**

Run: `npm run db:generate -- --name application_rounds`
Expected: `drizzle/0006_application_rounds.sql` creating three enums, `application_rounds`, `queue_snoozes`, two `applications` columns and `CREATE UNIQUE INDEX "application_rounds_one_booked_idx" … WHERE …'SCHEDULED'`. No prompt (additions only).

- [ ] **Step 8: Apply to the local database**

Run: `npm run db:migrate && docker exec jobops-postgres-1 psql -U jobops -d jobops -c '\d application_rounds'`
Expected: table listed with the partial unique index. (Additive migration; safe for the personal DB.)

- [ ] **Step 9: Run the whole unit suite**

Run: `npm test`
Expected: all pass (Companies tests still see the same `roundKinds`).

- [ ] **Step 10: Commit**

```bash
git add src/lib/round-kinds.ts src/features/companies/metrics.ts src/db/schema.ts drizzle tests/application-schema.test.ts
git commit -m "JOB_FINDER-9999: Add application rounds, close reasons and queue snoozes" -m "Share one round vocabulary with company research, allow one booked round per record, and store follow-up notes and snoozes." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: IST dates and the phase/outcome rules

**Files:**

- Create: `src/features/applications/dates.ts`, `src/features/applications/phase.ts`
- Test: `tests/application-dates.test.ts`, `tests/application-phase.test.ts`

**Interfaces:**

- Consumes: `indiaDate`, `indiaDayBoundary` (`@/features/mail/attention`); `roundKindLabel` (`@/features/companies/metrics`); `roundKinds`, `RoundKind`; schema types.
- Produces (dates): `indiaDate(d): string`, `istDayStart(d): Date`, `istDaysBetween(from, to): number`, `addDays(d, n): Date`, `istDateTime(day, "HH:MM"): Date | undefined`, `istClock(d): "HH:MM"`, `formatDay(d)` ("3 Oct"), `formatTime(d)` ("4:00 pm"), `formatDayTime(d)` ("3 Oct, 4:00 pm"), `formatWeekday(d)` ("Sat, 3 Oct").
- Produces (phase): `Stage`, `CloseReason`, `RoundOutcome`, `phases`, `Phase`, `isOutreach(source)`, `methodLabel`, `inboundEvents`, `RecordState`, `recordStateFrom(app, rounds, eventTypes)`, `phaseOf(state)`, `phaseText(input)`, `outcomeIds`, `OutcomeId`, `outcomeMeta`, `availableOutcomes(state)`, `initialOutcome(available, requested)`, `OutcomeDetail`, `outcomeDetail(input, now)`, `OutcomePlan`, `planOutcome(state, id, detail)`, `historyTone(eventType)`.

- [ ] **Step 1: Write the failing date tests** `tests/application-dates.test.ts`:

```ts
import { expect, it } from "vitest";
import {
  addDays,
  istClock,
  istDateTime,
  istDayStart,
  istDaysBetween,
} from "@/features/applications/dates";

it("parses a day and time in India time", () => {
  expect(istDateTime("2026-10-06", "11:00")).toEqual(new Date("2026-10-06T11:00:00+05:30"));
  expect(istDateTime("2026-10-06", "24:00")).toBeUndefined();
  expect(istDateTime("2026-02-30", "10:00")).toBeUndefined();
});
it("counts calendar days in IST, not UTC", () => {
  expect(
    istDaysBetween(new Date("2026-10-02T23:50:00+05:30"), new Date("2026-10-03T00:10:00+05:30")),
  ).toBe(1);
  expect(istDayStart(new Date("2026-10-02T19:00:00Z"))).toEqual(
    new Date("2026-10-03T00:00:00+05:30"),
  );
  expect(addDays(new Date("2026-10-03T00:00:00+05:30"), 2)).toEqual(
    new Date("2026-10-05T00:00:00+05:30"),
  );
  expect(istClock(new Date("2026-10-06T11:05:00+05:30"))).toBe("11:05");
});
```

- [ ] **Step 2: Write the failing phase tests** `tests/application-phase.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatDayTime, istDateTime } from "@/features/applications/dates";
import {
  availableOutcomes,
  historyTone,
  initialOutcome,
  outcomeDetail,
  phaseOf,
  phaseText,
  planOutcome,
  recordStateFrom,
  type OutcomeDetail,
  type RecordState,
} from "@/features/applications/phase";

const NOW = new Date("2026-10-03T10:30:00+05:30");
const state = (patch: Partial<RecordState> = {}): RecordState => ({
  source: "DIRECT",
  status: "APPLIED",
  sent: true,
  replied: false,
  referred: false,
  rounds: [],
  ...patch,
});
const booked = {
  kind: "DSA" as const,
  outcome: "SCHEDULED" as const,
  scheduledAt: new Date("2026-10-03T16:00:00+05:30"),
};
const detail = (patch: Partial<OutcomeDetail> = {}): OutcomeDetail => ({
  name: "",
  note: "",
  happenedAt: NOW,
  ...patch,
});
const text = (patch: Partial<Parameters<typeof phaseText>[0]>) =>
  phaseText({
    phase: "Applied",
    source: "DIRECT",
    replied: false,
    closedReason: null,
    status: "APPLIED",
    rounds: 0,
    typical: null,
    ...patch,
  });

describe("phase", () => {
  it("maps every stage to a phase", () => {
    expect(phaseOf(state({ status: "PREPARING", sent: false }))).toBe("Preparing");
    expect(phaseOf(state({ status: "ACKNOWLEDGED" }))).toBe("Applied");
    expect(phaseOf(state({ status: "FINAL_INTERVIEW" }))).toBe("Interviewing");
    expect(phaseOf(state({ status: "OFFER" }))).toBe("Decision");
    for (const status of ["REJECTED", "WITHDRAWN", "CLOSED"] as const)
      expect(phaseOf(state({ status }))).toBe("Closed");
  });
  it("derives outreach phase from sending, not the stored stage", () => {
    expect(phaseOf(state({ source: "REFERRAL", status: "PREPARING", sent: false }))).toBe(
      "Preparing",
    );
    expect(phaseOf(state({ source: "REFERRAL", status: "PREPARING", sent: true }))).toBe("Applied");
  });
  it("labels phases with rounds, outreach replies and close reasons", () => {
    expect(
      text({ phase: "Interviewing", status: "TECHNICAL_INTERVIEW", rounds: 2, typical: 4 }),
    ).toBe("Interviewing · round 2 of 4");
    expect(text({ phase: "Interviewing", status: "TECHNICAL_INTERVIEW" })).toBe("Interviewing");
    expect(text({ source: "REFERRAL", status: "PREPARING" })).toBe("Sent");
    expect(text({ source: "REFERRAL", status: "PREPARING", replied: true })).toBe("Replied");
    expect(text({ phase: "Closed", status: "CLOSED", closedReason: "ACCEPTED" })).toBe("Accepted");
    expect(text({ phase: "Closed", status: "WITHDRAWN" })).toBe("Withdrew");
  });
});

describe("available outcomes", () => {
  it("offers the applied set before any round", () =>
    expect(availableOutcomes(state())).toEqual([
      "heard",
      "oa",
      "scheduled",
      "followup",
      "rejected",
      "ghosted",
      "withdrew",
    ]));
  it("only settles or moves a booked round", () =>
    expect(availableOutcomes(state({ status: "TECHNICAL_INTERVIEW", rounds: [booked] }))).toEqual([
      "passed",
      "failed",
      "rescheduled",
      "rejected",
      "withdrew",
    ]));
  it("treats a legacy interview stage without rounds as interviewing with nothing booked", () =>
    expect(availableOutcomes(state({ status: "TECHNICAL_INTERVIEW" }))).toEqual([
      "scheduled",
      "offer",
      "followup",
      "rejected",
      "ghosted",
      "withdrew",
    ]));
  it("asks for a decision on an offer", () =>
    expect(availableOutcomes(state({ status: "OFFER" }))).toEqual(["accepted", "declined"]));
  it("offers nothing while preparing or closed", () => {
    expect(availableOutcomes(state({ status: "PREPARING", sent: false }))).toEqual([]);
    expect(availableOutcomes(state({ status: "REJECTED" }))).toEqual([]);
  });
  it("follows outreach from sent to replied to referred", () => {
    const sent = state({ source: "REFERRAL", status: "PREPARING" });
    expect(availableOutcomes(sent)).toEqual(["replied", "followup", "ghosted"]);
    expect(availableOutcomes({ ...sent, replied: true })).toEqual([
      "referred",
      "declinedReferral",
      "withdrew",
    ]);
    expect(availableOutcomes({ ...sent, replied: true, referred: true })).toEqual([]);
  });
  it("preselects a requested outcome only when it applies", () => {
    expect(initialOutcome(["passed", "failed"], "passed")).toBe("passed");
    expect(initialOutcome(["accepted", "declined"], "scheduled")).toBeNull();
    expect(initialOutcome(["replied", "followup", "ghosted"], "heard")).toBe("replied");
    expect(initialOutcome(["passed"], "not-an-outcome")).toBeNull();
    expect(initialOutcome(["passed"], undefined)).toBeNull();
  });
});

it("reads sending, replies and referrals from events", () => {
  const app = { source: "REFERRAL", status: "PREPARING" as const, appliedAt: null };
  expect(recordStateFrom(app, [], ["OUTREACH_SENT", "ACKNOWLEDGEMENT_RECEIVED"])).toMatchObject({
    sent: true,
    replied: false,
    referred: false,
  });
  expect(recordStateFrom(app, [], ["OUTREACH_SENT", "REFERRAL_SUBMITTED"])).toMatchObject({
    replied: true,
    referred: true,
  });
});

describe("outcome detail", () => {
  it("parses round time in India time and defaults OA deadlines to end of day", () => {
    expect(
      outcomeDetail({ outcome: "scheduled", kind: "LLD", day: "2026-10-06", time: "11:00" }, NOW)
        .detail.at,
    ).toEqual(new Date("2026-10-06T11:00:00+05:30"));
    expect(outcomeDetail({ outcome: "oa", day: "2026-10-07" }, NOW).detail.at).toEqual(
      new Date("2026-10-07T23:59:00+05:30"),
    );
  });
  it("requires the details an outcome needs", () => {
    expect(() => outcomeDetail({ outcome: "oa" }, NOW)).toThrow(/completed by/);
    expect(() => outcomeDetail({ outcome: "scheduled", day: "2026-10-06" }, NOW)).toThrow(
      /kind of round/,
    );
    expect(() => outcomeDetail({ outcome: "rescheduled", day: "2026-02-30" }, NOW)).toThrow(
      /valid date/,
    );
  });
  it("backdates to the chosen day and refuses the future", () => {
    expect(
      outcomeDetail({ outcome: "heard", happenedOn: "2026-10-01" }, NOW).detail.happenedAt,
    ).toEqual(new Date("2026-10-01T12:00:00+05:30"));
    expect(
      outcomeDetail({ outcome: "heard", happenedOn: "2026-10-03" }, NOW).detail.happenedAt,
    ).toEqual(NOW);
    expect(() => outcomeDetail({ outcome: "heard", happenedOn: "2026-10-04" }, NOW)).toThrow(
      /future/,
    );
  });
});

describe("planning an outcome", () => {
  it("books an OA as an assessment round", () => {
    const at = istDateTime("2026-10-07", "23:59")!;
    expect(planOutcome(state(), "oa", detail({ at, name: "HackerRank" }))).toEqual({
      status: "ASSESSMENT",
      closedReason: null,
      round: { action: "insert", kind: "ONLINE_ASSESSMENT", name: "HackerRank", scheduledAt: at },
      eventType: "ASSESSMENT_RECEIVED",
      summary: `OA received, complete by ${formatDayTime(at)}`,
    });
  });
  it("maps people rounds to the manager stage and others to technical", () => {
    const at = istDateTime("2026-10-06", "11:00")!;
    expect(planOutcome(state(), "scheduled", detail({ at, kind: "HIRING_MANAGER" })).status).toBe(
      "MANAGER_INTERVIEW",
    );
    expect(planOutcome(state(), "scheduled", detail({ at, kind: "LLD" })).status).toBe(
      "TECHNICAL_INTERVIEW",
    );
  });
  it("settles the booked round", () => {
    const interviewing = state({ status: "TECHNICAL_INTERVIEW", rounds: [booked] });
    expect(planOutcome(interviewing, "passed", detail())).toMatchObject({
      status: "TECHNICAL_INTERVIEW",
      round: { action: "settle", outcome: "PASSED" },
      summary: "Cleared the DSA round",
    });
    expect(planOutcome(interviewing, "failed", detail())).toMatchObject({
      status: "REJECTED",
      closedReason: "REJECTED",
      round: { action: "settle", outcome: "FAILED" },
    });
  });
  it("records close reasons", () => {
    expect(planOutcome(state(), "ghosted", detail())).toMatchObject({
      status: "CLOSED",
      closedReason: "NO_REPLY",
      eventType: "CLOSED_NO_REPLY",
    });
    expect(planOutcome(state({ status: "OFFER" }), "accepted", detail())).toMatchObject({
      status: "CLOSED",
      closedReason: "ACCEPTED",
    });
    expect(
      planOutcome(
        state({ source: "REFERRAL", status: "PREPARING", replied: true }),
        "declinedReferral",
        detail(),
      ),
    ).toMatchObject({ status: "CLOSED", closedReason: "REJECTED" });
  });
  it("keeps the stage for follow-ups and acknowledges a first reply", () => {
    expect(planOutcome(state(), "followup", detail())).toMatchObject({
      status: "APPLIED",
      eventType: "FOLLOW_UP_SENT",
    });
    expect(planOutcome(state(), "heard", detail())).toMatchObject({
      status: "ACKNOWLEDGED",
      eventType: "REPLY_RECEIVED",
    });
  });
  it("rejects outcomes that do not apply, naming the allowed ones", () =>
    expect(() => planOutcome(state(), "passed", detail())).toThrow(
      /Cleared the round does not apply.*Choose: Heard back/,
    ));
});

it("colours history by meaning", () => {
  expect(historyTone("ROUND_PASSED")).toBe("good");
  expect(historyTone("REJECTION_RECEIVED")).toBe("bad");
  expect(historyTone("MANUAL_NOTE")).toBe("neutral");
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run tests/application-dates.test.ts tests/application-phase.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 4: Create `src/features/applications/dates.ts`**

```ts
import { indiaDate, indiaDayBoundary } from "@/features/mail/attention";

const DAY = 86_400_000;
const zone = "Asia/Kolkata";
export { indiaDate };

/** Start of the IST calendar day that contains `value`. */
export function istDayStart(value: Date) {
  return indiaDayBoundary(indiaDate(value))!;
}
/** Whole IST calendar days from `from` to `to`; negative when `to` is earlier. */
export function istDaysBetween(from: Date, to: Date) {
  return Math.round((Date.parse(indiaDate(to)) - Date.parse(indiaDate(from))) / DAY);
}
export function addDays(value: Date, days: number) {
  return new Date(value.getTime() + days * DAY);
}
/** "2026-10-07" + "16:00" in IST; undefined when either part is invalid. */
export function istDateTime(day: string, time: string) {
  const start = indiaDayBoundary(day);
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!start || !match) return undefined;
  return new Date(start.getTime() + (Number(match[1]) * 60 + Number(match[2])) * 60_000);
}
const clock = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: zone,
});
const day = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: zone });
const time = new Intl.DateTimeFormat("en-IN", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: zone,
});
const weekday = new Intl.DateTimeFormat("en-IN", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: zone,
});
/** "11:05", for time inputs. */
export const istClock = (value: Date) => clock.format(value);
export const formatDay = (value: Date) => day.format(value);
export const formatTime = (value: Date) => time.format(value);
export const formatDayTime = (value: Date) => `${day.format(value)}, ${time.format(value)}`;
export const formatWeekday = (value: Date) => weekday.format(value);
```

- [ ] **Step 5: Create `src/features/applications/phase.ts`**

```ts
import { z } from "zod";
import type { applicationStages, closeReasons, roundOutcomes } from "@/db/schema";
import { roundKindLabel } from "@/features/companies/metrics";
import { indiaDayBoundary } from "@/features/mail/attention";
import { roundKinds, type RoundKind } from "@/lib/round-kinds";
import { formatDayTime, indiaDate, istDateTime, istDayStart } from "./dates";

export type Stage = (typeof applicationStages)[number];
export type CloseReason = (typeof closeReasons)[number];
export type RoundOutcome = (typeof roundOutcomes)[number];
export const phases = ["Preparing", "Applied", "Interviewing", "Decision", "Closed"] as const;
export type Phase = (typeof phases)[number];

const outreachSources = ["REFERRAL", "COLD_EMAIL", "LINKEDIN_MESSAGE"];
export const isOutreach = (source: string) => outreachSources.includes(source);
export const methodLabel: Record<string, string> = {
  DIRECT: "Applied directly",
  REFERRAL: "Referral ask",
  COLD_EMAIL: "Cold email",
  LINKEDIN_MESSAGE: "LinkedIn message",
};

/** Events that mean the other side responded. Automatic acknowledgements do not count. */
export const inboundEvents = new Set([
  "REPLY_RECEIVED",
  "ASSESSMENT_RECEIVED",
  "INTERVIEW_REQUESTED",
  "INTERVIEW_SCHEDULED",
  "ROUND_PASSED",
  "ROUND_FAILED",
  "ROUND_RESCHEDULED",
  "OFFER_RECEIVED",
  "REJECTION_RECEIVED",
  "REFERRAL_SUBMITTED",
  "REFERRAL_DECLINED",
  "FOLLOW_UP_RECEIVED",
  "RECRUITER_OUTREACH",
]);

export type RecordState = {
  source: string;
  status: Stage;
  sent: boolean;
  replied: boolean;
  referred: boolean;
  rounds: { kind: RoundKind; outcome: RoundOutcome; scheduledAt: Date | null }[];
};

export function recordStateFrom(
  app: { source: string; status: Stage; appliedAt: Date | null },
  rounds: RecordState["rounds"],
  eventTypes: string[],
): RecordState {
  return {
    source: app.source,
    status: app.status,
    sent: app.appliedAt !== null || eventTypes.includes("OUTREACH_SENT"),
    replied: eventTypes.some((type) => inboundEvents.has(type)),
    referred: eventTypes.includes("REFERRAL_SUBMITTED"),
    rounds,
  };
}

export function phaseOf(state: Pick<RecordState, "source" | "status" | "sent">): Phase {
  if (state.status === "REJECTED" || state.status === "WITHDRAWN" || state.status === "CLOSED")
    return "Closed";
  if (isOutreach(state.source)) return state.sent ? "Applied" : "Preparing";
  if (
    state.status === "DRAFT" ||
    state.status === "PREPARING" ||
    state.status === "READY_FOR_REVIEW"
  )
    return "Preparing";
  if (state.status === "APPLIED" || state.status === "ACKNOWLEDGED") return "Applied";
  if (state.status === "OFFER") return "Decision";
  return "Interviewing";
}

const closeReasonLabel: Record<CloseReason, string> = {
  REJECTED: "Rejected",
  NO_REPLY: "Closed, no reply",
  WITHDREW: "Withdrew",
  ACCEPTED: "Accepted",
  DECLINED: "Declined",
};
const legacyClosed: Partial<Record<Stage, string>> = {
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrew",
  CLOSED: "Closed",
};

export function phaseText(input: {
  phase: Phase;
  source: string;
  replied: boolean;
  closedReason: CloseReason | null;
  status: Stage;
  rounds: number;
  typical: number | null;
}) {
  if (input.phase === "Closed")
    return input.closedReason
      ? closeReasonLabel[input.closedReason]
      : (legacyClosed[input.status] ?? "Closed");
  if (isOutreach(input.source))
    return input.phase === "Preparing" ? "Preparing" : input.replied ? "Replied" : "Sent";
  if (input.phase === "Interviewing" && input.rounds)
    return `Interviewing · round ${input.rounds}${input.typical && input.typical >= input.rounds ? ` of ${input.typical}` : ""}`;
  return input.phase;
}

export const outcomeIds = [
  "heard",
  "replied",
  "oa",
  "scheduled",
  "followup",
  "passed",
  "failed",
  "rescheduled",
  "offer",
  "rejected",
  "ghosted",
  "withdrew",
  "accepted",
  "declined",
  "referred",
  "declinedReferral",
] as const;
export type OutcomeId = (typeof outcomeIds)[number];
export const outcomeMeta: Record<
  OutcomeId,
  { label: string; tone: "good" | "bad" | "neutral"; needs?: "round" | "deadline" | "time" }
> = {
  heard: { label: "Heard back", tone: "neutral" },
  replied: { label: "Replied", tone: "good" },
  oa: { label: "Got an OA", tone: "good", needs: "deadline" },
  scheduled: { label: "Round scheduled", tone: "good", needs: "round" },
  followup: { label: "Sent a follow-up", tone: "neutral" },
  passed: { label: "Cleared the round", tone: "good" },
  failed: { label: "Didn't clear it", tone: "bad" },
  rescheduled: { label: "Rescheduled", tone: "neutral", needs: "time" },
  offer: { label: "Got an offer", tone: "good" },
  rejected: { label: "Rejected", tone: "bad" },
  ghosted: { label: "No reply, close it", tone: "bad" },
  withdrew: { label: "I withdrew", tone: "neutral" },
  accepted: { label: "Accepted the offer", tone: "good" },
  declined: { label: "Declined the offer", tone: "neutral" },
  referred: { label: "Referral submitted", tone: "good" },
  declinedReferral: { label: "Not able to refer", tone: "bad" },
};

/** Only the outcomes that make sense from where the record stands (spec §3.1). */
export function availableOutcomes(state: RecordState): OutcomeId[] {
  const phase = phaseOf(state);
  if (phase === "Closed" || phase === "Preparing") return [];
  if (isOutreach(state.source)) {
    if (!state.replied) return ["replied", "followup", "ghosted"];
    return state.referred ? [] : ["referred", "declinedReferral", "withdrew"];
  }
  if (phase === "Decision") return ["accepted", "declined"];
  if (state.rounds.some((round) => round.outcome === "SCHEDULED"))
    return ["passed", "failed", "rescheduled", "rejected", "withdrew"];
  if (phase === "Interviewing")
    return ["scheduled", "offer", "followup", "rejected", "ghosted", "withdrew"];
  return ["heard", "oa", "scheduled", "followup", "rejected", "ghosted", "withdrew"];
}

/** A requested outcome (from a queue or mail link) is preselected only when it applies. */
export function initialOutcome(available: OutcomeId[], requested: string | undefined) {
  if (requested === "heard" && available.includes("replied")) return "replied";
  return available.find((id) => id === requested) ?? null;
}

export type OutcomeDetail = {
  kind?: RoundKind;
  at?: Date;
  name: string;
  note: string;
  happenedAt: Date;
};
const dayPattern = /^\d{4}-\d{2}-\d{2}$/;
const outcomeInput = z.object({
  outcome: z.enum(outcomeIds),
  kind: z.enum(roundKinds).optional(),
  day: z.string().regex(dayPattern).optional(),
  time: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  name: z.string().trim().max(200).default(""),
  note: z.string().trim().max(2000).default(""),
  happenedOn: z.string().regex(dayPattern).optional(),
});

export function outcomeDetail(input: z.input<typeof outcomeInput>, now: Date) {
  const data = outcomeInput.parse(input);
  const needs = outcomeMeta[data.outcome].needs;
  let at: Date | undefined;
  if (needs) {
    if (!data.day)
      throw new Error(
        needs === "deadline"
          ? "Choose the date the OA must be completed by."
          : "Choose the date of the round.",
      );
    at = istDateTime(data.day, data.time || (needs === "deadline" ? "23:59" : "10:00"));
    if (!at) throw new Error("Use a valid date and time in India time.");
  }
  if (needs === "round" && !data.kind) throw new Error("Choose the kind of round.");
  let happenedAt = now;
  if (data.happenedOn) {
    const start = indiaDayBoundary(data.happenedOn);
    if (!start) throw new Error("Use a valid date for when it happened.");
    if (start > istDayStart(now)) throw new Error("When it happened cannot be in the future.");
    // Noon IST keeps a backdated event on its calendar day in every display.
    if (indiaDate(start) !== indiaDate(now)) happenedAt = new Date(start.getTime() + 43_200_000);
  }
  const detail: OutcomeDetail = {
    kind: data.kind,
    at,
    name: data.name,
    note: data.note,
    happenedAt,
  };
  return { id: data.outcome, detail };
}

export type OutcomePlan = {
  status: Stage;
  closedReason: CloseReason | null;
  round?:
    | { action: "insert"; kind: RoundKind; name: string; scheduledAt: Date }
    | { action: "settle"; outcome: "PASSED" | "FAILED" }
    | { action: "move"; scheduledAt: Date };
  eventType: string;
  summary: string;
};

export function planOutcome(state: RecordState, id: OutcomeId, detail: OutcomeDetail): OutcomePlan {
  const allowed = availableOutcomes(state);
  if (!allowed.includes(id))
    throw new Error(
      `${outcomeMeta[id].label} does not apply to a record in ${phaseOf(state)}${
        allowed.length
          ? `. Choose: ${allowed.map((option) => outcomeMeta[option].label).join(", ")}`
          : ""
      }.`,
    );
  const booked = state.rounds.find((round) => round.outcome === "SCHEDULED");
  const kind = booked ? roundKindLabel[booked.kind] : "";
  const keep: Pick<OutcomePlan, "status" | "closedReason"> = {
    status: state.status,
    closedReason: null,
  };
  const close = (status: Stage, closedReason: CloseReason) => ({ status, closedReason });
  switch (id) {
    case "heard":
      return {
        status: state.status === "APPLIED" ? "ACKNOWLEDGED" : state.status,
        closedReason: null,
        eventType: "REPLY_RECEIVED",
        summary: "Heard back",
      };
    case "replied":
      return { ...keep, eventType: "REPLY_RECEIVED", summary: "Replied" };
    case "followup":
      return { ...keep, eventType: "FOLLOW_UP_SENT", summary: "Sent a follow-up" };
    case "oa":
      return {
        status: "ASSESSMENT",
        closedReason: null,
        round: {
          action: "insert",
          kind: "ONLINE_ASSESSMENT",
          name: detail.name || "Online assessment",
          scheduledAt: detail.at!,
        },
        eventType: "ASSESSMENT_RECEIVED",
        summary: `OA received, complete by ${formatDayTime(detail.at!)}`,
      };
    case "scheduled": {
      const roundKind = detail.kind!;
      return {
        status:
          roundKind === "BEHAVIORAL" || roundKind === "HIRING_MANAGER"
            ? "MANAGER_INTERVIEW"
            : "TECHNICAL_INTERVIEW",
        closedReason: null,
        round: {
          action: "insert",
          kind: roundKind,
          name: detail.name || roundKindLabel[roundKind],
          scheduledAt: detail.at!,
        },
        eventType: "INTERVIEW_SCHEDULED",
        summary: `${roundKindLabel[roundKind]} round scheduled for ${formatDayTime(detail.at!)}`,
      };
    }
    case "rescheduled":
      return {
        ...keep,
        round: { action: "move", scheduledAt: detail.at! },
        eventType: "ROUND_RESCHEDULED",
        summary: `${kind} round moved to ${formatDayTime(detail.at!)}`,
      };
    case "passed":
      return {
        ...keep,
        round: { action: "settle", outcome: "PASSED" },
        eventType: "ROUND_PASSED",
        summary: `Cleared the ${kind} round`,
      };
    case "failed":
      return {
        ...close("REJECTED", "REJECTED"),
        round: { action: "settle", outcome: "FAILED" },
        eventType: "ROUND_FAILED",
        summary: `Did not clear the ${kind} round`,
      };
    case "offer":
      return {
        status: "OFFER",
        closedReason: null,
        eventType: "OFFER_RECEIVED",
        summary: "Offer received",
      };
    case "rejected":
      return {
        ...close("REJECTED", "REJECTED"),
        eventType: "REJECTION_RECEIVED",
        summary: "Rejected",
      };
    case "ghosted":
      return {
        ...close("CLOSED", "NO_REPLY"),
        eventType: "CLOSED_NO_REPLY",
        summary: "Closed after no reply",
      };
    case "withdrew":
      return { ...close("WITHDRAWN", "WITHDREW"), eventType: "WITHDRAWN", summary: "Withdrew" };
    case "accepted":
      return {
        ...close("CLOSED", "ACCEPTED"),
        eventType: "OFFER_ACCEPTED",
        summary: "Accepted the offer",
      };
    case "declined":
      return {
        ...close("CLOSED", "DECLINED"),
        eventType: "OFFER_DECLINED",
        summary: "Declined the offer",
      };
    case "referred":
      return { ...keep, eventType: "REFERRAL_SUBMITTED", summary: "Referral submitted" };
    case "declinedReferral":
      return {
        ...close("CLOSED", "REJECTED"),
        eventType: "REFERRAL_DECLINED",
        summary: "Not able to refer",
      };
  }
}

const goodEvents = new Set([
  "ROUND_PASSED",
  "OFFER_RECEIVED",
  "OFFER_ACCEPTED",
  "REFERRAL_SUBMITTED",
  "ASSESSMENT_RECEIVED",
  "INTERVIEW_SCHEDULED",
  "INTERVIEW_REQUESTED",
  "REPLY_RECEIVED",
]);
const badEvents = new Set([
  "ROUND_FAILED",
  "REJECTION_RECEIVED",
  "CLOSED_NO_REPLY",
  "REFERRAL_DECLINED",
]);
export function historyTone(eventType: string): "good" | "bad" | "neutral" {
  return goodEvents.has(eventType) ? "good" : badEvents.has(eventType) ? "bad" : "neutral";
}
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run tests/application-dates.test.ts tests/application-phase.test.ts && npm run typecheck`
Expected: PASS. If `formatDayTime` output differs by ICU (e.g. "pm" vs "PM"), the tests still pass because they call the same formatter.

- [ ] **Step 7: Commit**

```bash
git add src/features/applications/dates.ts src/features/applications/phase.ts tests/application-dates.test.ts tests/application-phase.test.ts
git commit -m "JOB_FINDER-9999: Add application phase and outcome rules" -m "Derive phases from stored stages, offer only valid outcomes and plan each outcome's round, stage, close reason and history entry in India time." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Silence clock and Next queue

**Files:**

- Create: `src/features/applications/queue.ts`
- Test: `tests/application-queue.test.ts`

**Interfaces:**

- Consumes: Task 2 (`phaseOf`, `isOutreach`, `inboundEvents`, `methodLabel`, `Stage`, `RoundOutcome`; date helpers).
- Produces: `SILENCE_DAYS`, `HORIZON_DAYS`, `SNOOZE_DAYS`, `QueueRound`, `QueueRecord`, `QueueLink`, `QueueMail`, `Due`, `Reason`, `QueueItem`, `silenceClock(record, now): { since: Date; days: number; threshold: number } | null`, `buildQueue({ records, mail, snoozes, now }): QueueItem[]` (sorted overdue → today → week; mail first within a bucket, then by time).

- [ ] **Step 1: Write the failing tests** `tests/application-queue.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildQueue, silenceClock, type QueueRecord } from "@/features/applications/queue";

const NOW = new Date("2026-10-03T10:30:00+05:30");
const at = (value: string) => new Date(`${value}+05:30`);
let sequence = 0;
const uid = () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`;
const record = (patch: Partial<QueueRecord> = {}): QueueRecord => ({
  id: uid(),
  company: "Flipkart",
  role: "SDE 2",
  source: "DIRECT",
  status: "APPLIED",
  contact: null,
  sentAt: at("2026-10-01T10:00:00"),
  nextActionAt: null,
  nextActionNote: "",
  rounds: [],
  events: [],
  linkedMail: [],
  ...patch,
});
const queue = (records: QueueRecord[], extra: Partial<Parameters<typeof buildQueue>[0]> = {}) =>
  buildQueue({ records, mail: [], snoozes: new Map(), now: NOW, ...extra });
const round = (patch: Partial<QueueRecord["rounds"][number]>) => ({
  id: uid(),
  kind: "DSA" as const,
  name: "",
  scheduledAt: at("2026-10-05T10:00:00"),
  outcome: "SCHEDULED" as const,
  ...patch,
});

describe("silence clock", () => {
  it("counts IST days since sending and fires at 7 for applications", () =>
    expect(silenceClock(record({ sentAt: at("2026-09-20T12:00:00") }), NOW)).toMatchObject({
      days: 13,
      threshold: 7,
    }));
  it("ignores automatic acknowledgements", () => {
    const quiet = record({
      sentAt: at("2026-09-20T12:00:00"),
      linkedMail: [
        { classification: "APPLICATION_ACKNOWLEDGEMENT", receivedAt: at("2026-09-20T12:05:00") },
      ],
    });
    expect(silenceClock(quiet, NOW)?.days).toBe(13);
  });
  it("restarts from the latest reply for applications", () =>
    expect(
      silenceClock(
        record({
          sentAt: at("2026-09-20T12:00:00"),
          events: [{ eventType: "REPLY_RECEIVED", occurredAt: at("2026-10-01T09:00:00") }],
        }),
        NOW,
      )?.days,
    ).toBe(2));
  it("pauses while a round is booked", () =>
    expect(
      silenceClock(record({ status: "TECHNICAL_INTERVIEW", rounds: [round({})] }), NOW),
    ).toBeNull());
  it("stops outreach at the first reply until the next follow-up", () => {
    const base = {
      source: "REFERRAL",
      status: "PREPARING" as const,
      sentAt: at("2026-09-26T21:00:00"),
    };
    expect(silenceClock(record(base), NOW)).toMatchObject({ days: 7, threshold: 5 });
    const replied = record({
      ...base,
      events: [{ eventType: "REPLY_RECEIVED", occurredAt: at("2026-09-27T09:00:00") }],
    });
    expect(silenceClock(replied, NOW)).toBeNull();
    const nudged = record({
      ...base,
      events: [
        ...replied.events,
        { eventType: "FOLLOW_UP_SENT", occurredAt: at("2026-09-28T09:00:00") },
      ],
    });
    expect(silenceClock(nudged, NOW)).toMatchObject({ days: 5, threshold: 5 });
  });
  it("does not run before sending or after a decision", () => {
    expect(silenceClock(record({ status: "PREPARING", sentAt: null }), NOW)).toBeNull();
    expect(silenceClock(record({ status: "OFFER" }), NOW)).toBeNull();
    expect(silenceClock(record({ status: "REJECTED" }), NOW)).toBeNull();
  });
});

describe("queue", () => {
  it("puts a quiet application in overdue with follow-up actions", () => {
    const quiet = record({ sentAt: at("2026-09-20T12:00:00") });
    const [item] = queue([quiet]);
    expect(item).toMatchObject({
      key: `silence:${quiet.id}`,
      due: "overdue",
      reason: "silence",
      title: "Flipkart has been quiet",
      primary: {
        label: "Record follow-up",
        href: `/applications/${quiet.id}?outcome=followup#what-happened`,
      },
      secondary: {
        label: "Close as no reply",
        href: `/applications/${quiet.id}?outcome=ghosted#what-happened`,
      },
    });
    expect(item.dueAt).toEqual(at("2026-09-27T00:00:00"));
  });
  it("names the contact for quiet outreach", () =>
    expect(
      queue([
        record({
          source: "REFERRAL",
          status: "PREPARING",
          contact: "Rahul Mehta",
          sentAt: at("2026-09-26T21:00:00"),
        }),
      ])[0].title,
    ).toBe("No reply from Rahul Mehta"));
  it("buckets follow-up dates by IST day within a 7-day horizon", () => {
    const items = queue([
      record({ nextActionAt: at("2026-10-01T09:00:00"), nextActionNote: "Finish tailoring" }),
      record({ nextActionAt: at("2026-10-03T09:00:00") }),
      record({ nextActionAt: at("2026-10-10T09:00:00") }),
      record({ nextActionAt: at("2026-10-11T09:00:00") }),
    ]);
    expect(items.map((item) => [item.title, item.due])).toEqual([
      ["Finish tailoring", "overdue"],
      ["Follow up with Flipkart", "today"],
      ["Follow up with Flipkart", "week"],
    ]);
  });
  it("respects IST midnight rather than UTC", () => {
    const items = buildQueue({
      records: [
        record({ nextActionAt: at("2026-10-02T23:59:00") }),
        record({ nextActionAt: at("2026-10-03T00:05:00") }),
      ],
      mail: [],
      snoozes: new Map(),
      now: new Date("2026-10-03T00:10:00+05:30"),
    });
    expect(items.map((item) => item.due)).toEqual(["overdue", "today"]);
  });
  it("shows booked rounds and asks for a result once the time passes", () => {
    const items = queue([
      record({
        company: "Razorpay",
        status: "TECHNICAL_INTERVIEW",
        rounds: [round({ name: "Problem solving", scheduledAt: at("2026-10-02T16:00:00") })],
      }),
      record({
        company: "Zscaler",
        status: "ASSESSMENT",
        rounds: [
          round({
            kind: "ONLINE_ASSESSMENT",
            name: "HackerRank",
            scheduledAt: at("2026-10-07T23:59:00"),
          }),
        ],
      }),
    ]);
    expect(items.map((item) => [item.title, item.due, item.primary.label])).toEqual([
      ["Record the Razorpay DSA result", "overdue", "Record result"],
      ["Zscaler OA closes", "week", "Open record"],
    ]);
    expect(items[1].reason).toBe("deadline");
  });
  it("leads today with mail and orders the rest by time", () => {
    const mail = [
      {
        id: uid(),
        title: "Zscaler invited you to an assessment",
        detail: "HackerRank",
        receivedAt: at("2026-10-02T18:40:00"),
        primary: { label: "Link and update", href: "/x" },
      },
      {
        id: uid(),
        title: "Old mail",
        detail: "",
        receivedAt: at("2026-09-29T10:00:00"),
        primary: { label: "Save as opening", href: "/y" },
      },
    ];
    const items = queue(
      [
        record({
          company: "Uber",
          status: "TECHNICAL_INTERVIEW",
          rounds: [round({ kind: "LLD", scheduledAt: at("2026-10-03T16:00:00") })],
        }),
      ],
      { mail },
    );
    expect(items.map((item) => [item.title, item.due])).toEqual([
      ["Old mail", "overdue"],
      ["Zscaler invited you to an assessment", "today"],
      ["Uber LLD round", "today"],
    ]);
  });
  it("hides snoozed items until the snooze ends and skips closed records", () => {
    const quiet = record({ sentAt: at("2026-09-20T12:00:00") });
    const key = `silence:${quiet.id}`;
    expect(queue([quiet], { snoozes: new Map([[key, at("2026-10-05T00:00:00")]]) })).toEqual([]);
    expect(queue([quiet], { snoozes: new Map([[key, at("2026-10-03T00:00:00")]]) })).toHaveLength(
      1,
    );
    expect(
      queue([record({ status: "REJECTED", nextActionAt: at("2026-10-03T09:00:00") })]),
    ).toEqual([]);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/application-queue.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/features/applications/queue.ts`**

```ts
import { roundKindLabel } from "@/features/companies/metrics";
import type { RoundKind } from "@/lib/round-kinds";
import { addDays, formatDayTime, istDayStart, istDaysBetween } from "./dates";
import {
  inboundEvents,
  isOutreach,
  methodLabel,
  phaseOf,
  type RoundOutcome,
  type Stage,
} from "./phase";

export const SILENCE_DAYS = { DIRECT: 7, OUTREACH: 5 } as const;
export const HORIZON_DAYS = 7;
export const SNOOZE_DAYS = 2;

export type QueueRound = {
  id: string;
  kind: RoundKind;
  name: string;
  scheduledAt: Date | null;
  outcome: RoundOutcome;
};
export type QueueRecord = {
  id: string;
  company: string;
  role: string;
  source: string;
  status: Stage;
  contact: string | null;
  sentAt: Date | null;
  nextActionAt: Date | null;
  nextActionNote: string;
  rounds: QueueRound[];
  events: { eventType: string; occurredAt: Date }[];
  linkedMail: { classification: string; receivedAt: Date }[];
};
export type QueueLink = { label: string; href: string };
export type QueueMail = {
  id: string;
  title: string;
  detail: string;
  receivedAt: Date;
  primary: QueueLink;
};
export type Due = "overdue" | "today" | "week";
export type Reason = "followup" | "silence" | "round" | "deadline" | "mail";
export type QueueItem = {
  key: string;
  recordId: string | null;
  company: string | null;
  due: Due;
  dueAt: Date;
  reason: Reason;
  title: string;
  detail: string;
  primary: QueueLink;
  secondary?: QueueLink;
};

const latest = (dates: Date[]) =>
  dates.reduce<Date | null>((max, value) => (!max || value > max ? value : max), null);

/** Spec §5.1: quiet days since sending, the last follow-up or the last real reply. */
export function silenceClock(record: QueueRecord, now: Date) {
  const phase = phaseOf({
    source: record.source,
    status: record.status,
    sent: record.sentAt !== null,
  });
  if (!record.sentAt || (phase !== "Applied" && phase !== "Interviewing")) return null;
  if (record.rounds.some((round) => round.outcome === "SCHEDULED")) return null;
  const nudge = latest(
    record.events
      .filter((event) => event.eventType === "FOLLOW_UP_SENT")
      .map((event) => event.occurredAt),
  );
  const inbound = latest([
    ...record.events
      .filter((event) => inboundEvents.has(event.eventType))
      .map((event) => event.occurredAt),
    ...record.linkedMail
      .filter((mail) => mail.classification !== "APPLICATION_ACKNOWLEDGEMENT")
      .map((mail) => mail.receivedAt),
  ]);
  const outreach = isOutreach(record.source);
  if (outreach && inbound && (!nudge || inbound >= nudge)) return null;
  const since = latest([record.sentAt, ...(nudge ? [nudge] : []), ...(inbound ? [inbound] : [])])!;
  return {
    since,
    days: istDaysBetween(since, now),
    threshold: outreach ? SILENCE_DAYS.OUTREACH : SILENCE_DAYS.DIRECT,
  };
}

export function buildQueue(input: {
  records: QueueRecord[];
  mail: QueueMail[];
  snoozes: Map<string, Date>;
  now: Date;
}): QueueItem[] {
  const { now } = input;
  const today = istDayStart(now);
  const tomorrow = addDays(today, 1);
  const horizon = addDays(today, HORIZON_DAYS + 1);
  const dueOf = (at: Date): Due | null =>
    at < today ? "overdue" : at < tomorrow ? "today" : at < horizon ? "week" : null;
  const items: QueueItem[] = [];
  const push = (item: Omit<QueueItem, "due">) => {
    const due = dueOf(item.dueAt);
    if (due) items.push({ ...item, due });
  };
  for (const record of input.records) {
    const href = `/applications/${record.id}`;
    const base = { recordId: record.id, company: record.company };
    const phase = phaseOf({
      source: record.source,
      status: record.status,
      sent: record.sentAt !== null,
    });
    if (record.nextActionAt && phase !== "Closed")
      push({
        ...base,
        key: `followup:${record.id}`,
        dueAt: record.nextActionAt,
        reason: "followup",
        title: record.nextActionNote || `Follow up with ${record.company}`,
        detail: `${record.role} · the date you set`,
        primary: { label: "Open record", href },
      });
    const clock = silenceClock(record, now);
    if (clock && clock.days >= clock.threshold) {
      const outreach = isOutreach(record.source);
      push({
        ...base,
        key: `silence:${record.id}`,
        dueAt: addDays(istDayStart(clock.since), clock.threshold),
        reason: "silence",
        title: outreach
          ? `No reply from ${record.contact || record.company}`
          : `${record.company} has been quiet`,
        detail: `${outreach ? `${record.company} ${methodLabel[record.source]?.toLowerCase() ?? "outreach"}` : record.role} · ${clock.days} days quiet, follow up after ${clock.threshold}`,
        primary: { label: "Record follow-up", href: `${href}?outcome=followup#what-happened` },
        secondary: { label: "Close as no reply", href: `${href}?outcome=ghosted#what-happened` },
      });
    }
    for (const round of record.rounds) {
      if (round.outcome !== "SCHEDULED" || !round.scheduledAt) continue;
      const label = roundKindLabel[round.kind];
      const oa = round.kind === "ONLINE_ASSESSMENT";
      const past = round.scheduledAt <= now;
      push({
        ...base,
        key: `round:${round.id}`,
        dueAt: round.scheduledAt,
        reason: oa ? "deadline" : "round",
        title: past
          ? `Record the ${record.company} ${label} result`
          : oa
            ? `${record.company} OA closes`
            : `${record.company} ${label} round`,
        detail: `${round.name || label} · ${formatDayTime(round.scheduledAt)}`,
        primary: past
          ? { label: "Record result", href: `${href}#what-happened` }
          : { label: "Open record", href },
      });
    }
  }
  for (const message of input.mail)
    items.push({
      key: `mail:${message.id}`,
      recordId: null,
      company: null,
      due: istDaysBetween(message.receivedAt, now) <= 1 ? "today" : "overdue",
      dueAt: message.receivedAt,
      reason: "mail",
      title: message.title,
      detail: message.detail,
      primary: message.primary,
    });
  const order: Record<Due, number> = { overdue: 0, today: 1, week: 2 };
  return items
    .filter((item) => (input.snoozes.get(item.key)?.getTime() ?? 0) <= now.getTime())
    .sort(
      (a, b) =>
        order[a.due] - order[b.due] ||
        Number(b.reason === "mail") - Number(a.reason === "mail") ||
        a.dueAt.getTime() - b.dueAt.getTime(),
    );
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/application-queue.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/applications/queue.ts tests/application-queue.test.ts
git commit -m "JOB_FINDER-9999: Build the Next queue from recorded dates" -m "Compute quiet days per record, bucket follow-ups, rounds, deadlines and mail by IST day, and respect snoozes." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Navigation rules and the applications loader

**Files:**

- Create: `src/features/applications/navigation.ts`, `src/features/applications/read.ts`
- Test: `tests/application-navigation.test.ts`, `tests/application-read.test.ts`

**Interfaces:**

- Consumes: Tasks 1–3.
- Produces (navigation): `tabs`, `Tab`, `recordFilters`, `RecordFilter`, `filterLabel`, `queueKeyPattern`, `resolveView({ tab, filter, view, q }): { tab; filter; q }`, `matchesFilter(record: QueueRecord, filter, q, now): boolean`.
- Produces (read): `ApplicationRecord`, `typicalRoundsByName(companies)`, `linkedRecordIds(rows)`, `readApplications(): Promise<{ records: ApplicationRecord[]; snoozes: Map<string, Date> }>`.

`ApplicationRecord` fields: everything in `QueueRecord`, plus `jobId`, `city`, `jobUrl`, `applicationUrl`, `notes`, `appliedAt`, `resumeVersionId`, `resume: { id; filename } | null`, `closedReason`, `phase`, `typicalRounds`, `linkedIds: string[]`, `latest: { summary; at } | null`, and `events`/`rounds`/`linkedMail` as full rows (`linkedMail` items also carry `id` and `subject`).

- [ ] **Step 1: Write the failing tests** `tests/application-navigation.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { matchesFilter, queueKeyPattern, resolveView } from "@/features/applications/navigation";
import type { QueueRecord } from "@/features/applications/queue";

const NOW = new Date("2026-10-03T10:30:00+05:30");
const make = (patch: Partial<QueueRecord> = {}): QueueRecord => ({
  id: "00000000-0000-4000-8000-000000000001",
  company: "Uber",
  role: "Software Engineer II",
  source: "DIRECT",
  status: "APPLIED",
  contact: null,
  sentAt: new Date("2026-10-01T10:00:00+05:30"),
  nextActionAt: null,
  nextActionNote: "",
  rounds: [],
  events: [],
  linkedMail: [],
  ...patch,
});

describe("view resolution", () => {
  it("defaults to Next and Active", () =>
    expect(resolveView({})).toEqual({ tab: "next", filter: "active", q: "" }));
  it("keeps old Home links working", () => {
    expect(resolveView({ view: "applied" })).toMatchObject({ tab: "records", filter: "active" });
    expect(resolveView({ view: "interviews" })).toMatchObject({
      tab: "records",
      filter: "interviewing",
    });
    expect(resolveView({ view: "offers" })).toMatchObject({
      tab: "records",
      filter: "interviewing",
    });
  });
  it("ignores unknown tabs and filters", () =>
    expect(resolveView({ tab: "admin", filter: "x", q: "  Uber " })).toEqual({
      tab: "next",
      filter: "active",
      q: "Uber",
    }));
});

describe("record filters", () => {
  it("filters by phase", () => {
    expect(matchesFilter(make({ status: "OFFER" }), "interviewing", "", NOW)).toBe(true);
    expect(matchesFilter(make({ status: "REJECTED" }), "active", "", NOW)).toBe(false);
    expect(matchesFilter(make({ status: "REJECTED" }), "closed", "", NOW)).toBe(true);
  });
  it("waits on them only while the silence clock runs", () => {
    expect(matchesFilter(make(), "waiting", "", NOW)).toBe(true);
    expect(
      matchesFilter(
        make({
          source: "REFERRAL",
          status: "PREPARING",
          events: [{ eventType: "REPLY_RECEIVED", occurredAt: NOW }],
        }),
        "waiting",
        "",
        NOW,
      ),
    ).toBe(false);
  });
  it("searches company, role and contact", () => {
    expect(matchesFilter(make({ contact: "Ananya Iyer" }), "all", "ananya", NOW)).toBe(true);
    expect(matchesFilter(make(), "all", "flipkart", NOW)).toBe(false);
  });
  it("accepts only known queue keys", () => {
    expect(queueKeyPattern.test("silence:00000000-0000-4000-8000-000000000001")).toBe(true);
    expect(queueKeyPattern.test("silence:../../etc")).toBe(false);
  });
});
```

and `tests/application-read.test.ts`:

```ts
import { expect, it } from "vitest";
import { linkedRecordIds, typicalRoundsByName } from "@/features/applications/read";
import type { ResearchFact } from "@/features/companies/research-data";

const interview = (roundCount: number) =>
  ({ category: "INTERVIEW", data: { roundCount, rounds: [] } }) as unknown as ResearchFact;

it("finds research round counts by company name or alias", () => {
  const typical = typicalRoundsByName([
    {
      name: "Microsoft",
      aliases: ["Microsoft India Development Center"],
      facts: [interview(4), interview(5), interview(4)],
    },
    { name: "Quince", aliases: [], facts: [] },
  ]);
  expect(typical("microsoft  india development center")).toBe(4);
  expect(typical("Quince")).toBeNull();
  expect(typical("Unknown")).toBeNull();
});
it("links records that share an opening", () => {
  const rows = [
    { id: "a", jobId: "j1" },
    { id: "b", jobId: "j1" },
    { id: "c", jobId: "j2" },
  ];
  const linked = linkedRecordIds(rows);
  expect(linked(rows[0])).toEqual(["b"]);
  expect(linked(rows[2])).toEqual([]);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/application-navigation.test.ts tests/application-read.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Create `src/features/applications/navigation.ts`**

```ts
import { phaseOf } from "./phase";
import { silenceClock, type QueueRecord } from "./queue";

export const tabs = ["next", "records", "emails"] as const;
export type Tab = (typeof tabs)[number];
export const recordFilters = ["active", "interviewing", "waiting", "closed", "all"] as const;
export type RecordFilter = (typeof recordFilters)[number];
export const filterLabel: Record<RecordFilter, string> = {
  active: "Active",
  interviewing: "Interviewing",
  waiting: "Waiting on them",
  closed: "Closed",
  all: "All",
};
export const queueKeyPattern = /^(followup|silence|round|mail):[0-9a-f-]{36}$/;

const pick = <T extends string>(options: readonly T[], value: string | undefined, fallback: T) =>
  options.find((option) => option === value) ?? fallback;

export function resolveView(params: { tab?: string; filter?: string; view?: string; q?: string }) {
  // Home links and bookmarks from the old page used ?view=applied|interviews|offers.
  const legacy: RecordFilter | null =
    params.view === "applied"
      ? "active"
      : params.view === "interviews" || params.view === "offers"
        ? "interviewing"
        : null;
  return {
    tab: legacy ? ("records" as Tab) : pick(tabs, params.tab, "next"),
    filter: legacy ?? pick(recordFilters, params.filter, "active"),
    q: (params.q ?? "").trim().slice(0, 200),
  };
}

export function matchesFilter(record: QueueRecord, filter: RecordFilter, q: string, now: Date) {
  const text = `${record.company} ${record.role} ${record.contact ?? ""}`.toLowerCase();
  if (q && !text.includes(q.toLowerCase())) return false;
  const phase = phaseOf({
    source: record.source,
    status: record.status,
    sent: record.sentAt !== null,
  });
  switch (filter) {
    case "all":
      return true;
    case "closed":
      return phase === "Closed";
    case "interviewing":
      return phase === "Interviewing" || phase === "Decision";
    case "waiting":
      return phase === "Applied" && silenceClock(record, now) !== null;
    case "active":
      return phase !== "Closed";
  }
}
```

- [ ] **Step 4: Create `src/features/applications/read.ts`**

```ts
import { asc, desc, eq, gt, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import {
  applicationEvents,
  applicationRounds,
  applications,
  companyFacts,
  companyRecords,
  jobs,
  mailMessages,
  queueSnoozes,
  resumeVersions,
} from "@/db/schema";
import { companyMetrics } from "@/features/companies/metrics";
import type { ResearchFact } from "@/features/companies/research-data";
import { phaseOf, type CloseReason, type Phase } from "./phase";
import type { QueueRecord } from "./queue";

type EventRow = typeof applicationEvents.$inferSelect;
type RoundRow = typeof applicationRounds.$inferSelect;
type LinkedMail = { id: string; subject: string; classification: string; receivedAt: Date };

export type ApplicationRecord = Omit<QueueRecord, "events" | "rounds" | "linkedMail"> & {
  events: EventRow[];
  rounds: RoundRow[];
  linkedMail: LinkedMail[];
  jobId: string;
  city: string;
  jobUrl: string;
  applicationUrl: string | null;
  notes: string;
  appliedAt: Date | null;
  resumeVersionId: string | null;
  resume: { id: string; filename: string } | null;
  closedReason: CloseReason | null;
  phase: Phase;
  typicalRounds: number | null;
  linkedIds: string[];
  latest: { summary: string; at: Date } | null;
};

const normalize = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");

/** Research median round count per company name and alias; null when no research exists. */
export function typicalRoundsByName(
  companies: { name: string; aliases: string[]; facts: ResearchFact[] }[],
) {
  const counts = new Map<string, number>();
  for (const company of companies) {
    const rounds = companyMetrics(company.facts).typicalRounds;
    if (rounds === null) continue;
    for (const name of [company.name, ...company.aliases]) counts.set(normalize(name), rounds);
  }
  return (name: string) => counts.get(normalize(name)) ?? null;
}

/** Records on the same opening point at each other (spec §1.1). */
export function linkedRecordIds(rows: { id: string; jobId: string }[]) {
  const byJob = new Map<string, string[]>();
  for (const row of rows) byJob.set(row.jobId, [...(byJob.get(row.jobId) ?? []), row.id]);
  return (row: { id: string; jobId: string }) =>
    (byJob.get(row.jobId) ?? []).filter((id) => id !== row.id);
}

export async function readApplications() {
  const [rows, rounds, events, mail, snoozes, companies, facts] = await Promise.all([
    db
      .select({
        app: applications,
        job: jobs,
        version: { id: resumeVersions.id, filename: resumeVersions.originalFilename },
      })
      .from(applications)
      .innerJoin(jobs, eq(jobs.id, applications.jobId))
      .leftJoin(resumeVersions, eq(resumeVersions.id, applications.resumeVersionId))
      .orderBy(desc(applications.updatedAt)),
    db.select().from(applicationRounds).orderBy(asc(applicationRounds.position)),
    db.select().from(applicationEvents).orderBy(desc(applicationEvents.occurredAt)),
    db
      .select({
        id: mailMessages.id,
        applicationId: mailMessages.linkedApplicationId,
        subject: mailMessages.subject,
        classification: mailMessages.classification,
        receivedAt: mailMessages.receivedAt,
      })
      .from(mailMessages)
      .where(isNotNull(mailMessages.linkedApplicationId)),
    db.select().from(queueSnoozes).where(gt(queueSnoozes.until, new Date())),
    db
      .select({ id: companyRecords.id, name: companyRecords.name, aliases: companyRecords.aliases })
      .from(companyRecords)
      .where(eq(companyRecords.status, "ACTIVE")),
    db.select().from(companyFacts).where(eq(companyFacts.category, "INTERVIEW")),
  ]);
  const typical = typicalRoundsByName(
    companies.map((company) => ({
      ...company,
      facts: facts.filter((fact) => fact.companyId === company.id),
    })),
  );
  const linked = linkedRecordIds(rows.map(({ app }) => ({ id: app.id, jobId: app.jobId })));
  const records: ApplicationRecord[] = rows.map(({ app, job, version }) => {
    const own = events.filter((event) => event.applicationId === app.id);
    const sent = own.find((event) => event.eventType === "OUTREACH_SENT");
    const recipient = own.find(
      (event) => typeof event.payload.recipient === "string" && event.payload.recipient,
    )?.payload.recipient;
    const sentAt = app.appliedAt ?? sent?.occurredAt ?? null;
    return {
      id: app.id,
      jobId: job.id,
      company: job.company,
      role: job.title,
      city: job.location,
      jobUrl: job.canonicalUrl,
      source: app.source,
      status: app.status,
      contact: typeof recipient === "string" ? recipient : null,
      sentAt,
      appliedAt: app.appliedAt,
      nextActionAt: app.nextActionAt,
      nextActionNote: app.nextActionNote,
      rounds: rounds.filter((round) => round.applicationId === app.id),
      events: own,
      linkedMail: mail
        .filter((message) => message.applicationId === app.id)
        .map(({ applicationId: _ignored, ...message }) => message),
      applicationUrl: app.applicationUrl,
      notes: app.notes,
      resumeVersionId: app.resumeVersionId,
      resume: version,
      closedReason: app.closedReason,
      phase: phaseOf({ source: app.source, status: app.status, sent: sentAt !== null }),
      typicalRounds: typical(job.company),
      linkedIds: linked(app),
      latest: own[0] ? { summary: own[0].summary, at: own[0].occurredAt } : null,
    };
  });
  return { records, snoozes: new Map(snoozes.map((row) => [row.itemKey, row.until])) };
}
```

If ESLint flags `_ignored`, replace the `.map(...)` with an explicit object `({ id, subject, classification, receivedAt }) => ({ id, subject, classification, receivedAt })`.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/application-navigation.test.ts tests/application-read.test.ts && npm run typecheck && npm run lint`
Expected: PASS; clean.

- [ ] **Step 6: Commit**

```bash
git add src/features/applications/navigation.ts src/features/applications/read.ts tests/application-navigation.test.ts tests/application-read.test.ts
git commit -m "JOB_FINDER-9999: Load application records with rounds, history and research" -m "Resolve tabs, filters and legacy links, link records on the same opening and attach research round counts." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Outcome service and record actions

**Files:**

- Create: `src/features/applications/outcome-service.ts`, `src/features/applications/outcomes.ts`, `src/features/applications/record-actions.ts`

**Interfaces:**

- Consumes: Tasks 1–4; `jobStateForApplication` (`./domain`); `actionError`, `formString`, `ActionState` (`@/lib/actions`).
- Produces:
  - `type Tx` and `applyOutcome(tx, { applicationId, outcome, detail }, now): Promise<{ eventId; roundId; company }>` (server-only, not an action).
  - `recordOutcome(state, form)` action. Form fields: `id`, `outcome`, `kind`, `day`, `time`, `name`, `note`, `happenedOn`. Returns `{ success, redirect: "/applications/<id>" }`.
  - `setFollowUp` (`id`, `day`, `note`, optional `clear`), `snoozeQueueItem` (`key`, `title` → redirect `/applications?tab=next&snoozed=<key>&title=<title>`), `unsnoozeQueueItem` (`key` → redirect `/applications?tab=next`), `updateApplicationDetails` (`id`, `applicationUrl`, `resumeVersionId`, `notes`), `updateRound` (`id`, `name`, `day`, `time`, `notes`).

These are verified end to end in Tasks 8 and 9 (they need a database).

- [ ] **Step 1: Create `src/features/applications/outcome-service.ts`**

```ts
import { asc, eq } from "drizzle-orm";
import type { db } from "@/db";
import {
  activityLogs,
  applicationEvents,
  applicationRounds,
  applications,
  jobs,
} from "@/db/schema";
import { jobStateForApplication } from "./domain";
import { planOutcome, recordStateFrom, type OutcomeDetail, type OutcomeId } from "./phase";

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Spec §3.2. Locks the record, validates against its current state, then writes everything once. */
export async function applyOutcome(
  tx: Tx,
  input: { applicationId: string; outcome: OutcomeId; detail: OutcomeDetail },
  now: Date,
) {
  const [app] = await tx
    .select()
    .from(applications)
    .where(eq(applications.id, input.applicationId))
    .for("update");
  if (!app) throw new Error("This record no longer exists.");
  const [job] = await tx.select().from(jobs).where(eq(jobs.id, app.jobId));
  const rounds = await tx
    .select()
    .from(applicationRounds)
    .where(eq(applicationRounds.applicationId, app.id))
    .orderBy(asc(applicationRounds.position));
  const history = await tx
    .select({ type: applicationEvents.eventType })
    .from(applicationEvents)
    .where(eq(applicationEvents.applicationId, app.id));
  const plan = planOutcome(
    recordStateFrom(
      app,
      rounds,
      history.map((row) => row.type),
    ),
    input.outcome,
    input.detail,
  );
  const booked = rounds.find((round) => round.outcome === "SCHEDULED");
  let roundId = booked?.id ?? null;
  if (plan.round?.action === "insert") {
    const [round] = await tx
      .insert(applicationRounds)
      .values({
        applicationId: app.id,
        kind: plan.round.kind,
        name: plan.round.name,
        scheduledAt: plan.round.scheduledAt,
        position: rounds.length + 1,
      })
      .returning({ id: applicationRounds.id });
    roundId = round.id;
  } else if (plan.round && booked) {
    await tx
      .update(applicationRounds)
      .set(
        plan.round.action === "settle"
          ? { outcome: plan.round.outcome, updatedAt: now }
          : { scheduledAt: plan.round.scheduledAt, updatedAt: now },
      )
      .where(eq(applicationRounds.id, booked.id));
  }
  await tx
    .update(applications)
    .set({ status: plan.status, closedReason: plan.closedReason, updatedAt: now })
    .where(eq(applications.id, app.id));
  const [event] = await tx
    .insert(applicationEvents)
    .values({
      applicationId: app.id,
      eventType: plan.eventType,
      occurredAt: input.detail.happenedAt,
      summary: input.detail.note ? `${plan.summary}. ${input.detail.note}` : plan.summary,
      payload: {
        outcome: input.outcome,
        previousStatus: app.status,
        nextStatus: plan.status,
        roundId,
        note: input.detail.note,
      },
    })
    .returning({ id: applicationEvents.id });
  await tx
    .update(jobs)
    .set({ status: jobStateForApplication(plan.status, job.status), updatedAt: now })
    .where(eq(jobs.id, job.id));
  await tx.insert(activityLogs).values({
    action: "APPLICATION_OUTCOME_RECORDED",
    entityType: "APPLICATION",
    entityId: app.id,
    summary: `${job.company}: ${plan.summary}`,
  });
  return { eventId: event.id, roundId, company: job.company };
}
```

- [ ] **Step 2: Create `src/features/applications/outcomes.ts`**

```ts
"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { actionError, formString, type ActionState } from "@/lib/actions";
import { applyOutcome } from "./outcome-service";
import { outcomeDetail, outcomeMeta } from "./phase";

export async function recordOutcome(_state: ActionState, form: FormData): Promise<ActionState> {
  try {
    const applicationId = z.uuid().parse(formString(form, "id"));
    const now = new Date();
    const optional = (key: string) => formString(form, key) || undefined;
    const { id, detail } = outcomeDetail(
      {
        outcome: formString(form, "outcome") as never,
        kind: optional("kind") as never,
        day: optional("day"),
        time: optional("time"),
        name: formString(form, "name"),
        note: formString(form, "note"),
        happenedOn: optional("happenedOn"),
      },
      now,
    );
    await db.transaction((tx) => applyOutcome(tx, { applicationId, outcome: id, detail }, now));
    revalidatePath("/applications");
    revalidatePath(`/applications/${applicationId}`);
    revalidatePath("/companies");
    revalidatePath("/");
    // Drop ?outcome=… so the saved panel closes.
    return {
      success: `Saved: ${outcomeMeta[id].label}.`,
      redirect: `/applications/${applicationId}`,
    };
  } catch (error) {
    return actionError(error);
  }
}
```

(The `as never` casts hand raw strings to Zod, which validates them inside `outcomeDetail`.)

- [ ] **Step 3: Create `src/features/applications/record-actions.ts`**

```ts
"use server";
import { and, eq, lt } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import {
  activityLogs,
  applicationEvents,
  applicationRounds,
  applications,
  queueSnoozes,
  resumeVersions,
} from "@/db/schema";
import { actionError, formString, type ActionState } from "@/lib/actions";
import { addDays, istDateTime, istDayStart } from "./dates";
import { queueKeyPattern } from "./navigation";
import { SNOOZE_DAYS } from "./queue";

const httpUrl = z.union([
  z.literal(""),
  z
    .url()
    .refine((value) => ["http:", "https:"].includes(new URL(value).protocol), "Use an http(s) URL"),
]);
const day = z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]);
const queueKey = z.string().regex(queueKeyPattern, "Unknown queue item.");

function refresh(id?: string) {
  revalidatePath("/applications");
  if (id) revalidatePath(`/applications/${id}`);
  revalidatePath("/");
}

export async function setFollowUp(_state: ActionState, form: FormData): Promise<ActionState> {
  try {
    const clear = formString(form, "clear") === "1";
    const data = z.object({ id: z.uuid(), day, note: z.string().trim().max(300) }).parse({
      id: formString(form, "id"),
      day: clear ? "" : formString(form, "day"),
      note: formString(form, "note"),
    });
    const at = data.day ? istDateTime(data.day, "09:00") : null;
    if (data.day && !at) throw new Error("Use a valid follow-up date.");
    const [row] = await db
      .update(applications)
      .set({ nextActionAt: at, nextActionNote: at ? data.note : "", updatedAt: new Date() })
      .where(eq(applications.id, data.id))
      .returning({ id: applications.id });
    if (!row) throw new Error("This record no longer exists.");
    refresh(data.id);
    return { success: at ? "Follow-up saved." : "Follow-up cleared." };
  } catch (error) {
    return actionError(error);
  }
}

export async function snoozeQueueItem(_state: ActionState, form: FormData): Promise<ActionState> {
  try {
    const key = queueKey.parse(formString(form, "key"));
    const title = formString(form, "title").slice(0, 200);
    const now = new Date();
    const until = addDays(istDayStart(now), SNOOZE_DAYS);
    await db.transaction(async (tx) => {
      await tx.delete(queueSnoozes).where(lt(queueSnoozes.until, now));
      await tx
        .insert(queueSnoozes)
        .values({ itemKey: key, until })
        .onConflictDoUpdate({ target: queueSnoozes.itemKey, set: { until } });
    });
    revalidatePath("/applications");
    return {
      redirect: `/applications?tab=next&snoozed=${encodeURIComponent(key)}&title=${encodeURIComponent(title)}`,
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function unsnoozeQueueItem(_state: ActionState, form: FormData): Promise<ActionState> {
  try {
    const key = queueKey.parse(formString(form, "key"));
    await db.delete(queueSnoozes).where(eq(queueSnoozes.itemKey, key));
    revalidatePath("/applications");
    return { redirect: "/applications?tab=next" };
  } catch (error) {
    return actionError(error);
  }
}

export async function updateApplicationDetails(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const data = z
      .object({
        id: z.uuid(),
        applicationUrl: httpUrl,
        resumeVersionId: z.union([z.literal(""), z.uuid()]),
        notes: z.string().max(20000),
      })
      .parse({
        id: formString(form, "id"),
        applicationUrl: formString(form, "applicationUrl"),
        resumeVersionId: formString(form, "resumeVersionId"),
        notes: formString(form, "notes"),
      });
    await db.transaction(async (tx) => {
      const [previous] = await tx
        .select()
        .from(applications)
        .where(eq(applications.id, data.id))
        .for("update");
      if (!previous) throw new Error("This record no longer exists.");
      const outreachSent = await tx
        .select({ id: applicationEvents.id })
        .from(applicationEvents)
        .where(
          and(
            eq(applicationEvents.applicationId, previous.id),
            eq(applicationEvents.eventType, "OUTREACH_SENT"),
          ),
        )
        .limit(1);
      const resumeVersionId = data.resumeVersionId || null;
      if (
        (previous.appliedAt || outreachSent.length) &&
        resumeVersionId !== previous.resumeVersionId
      )
        throw new Error(
          "The resume used for a sent record stays fixed. Record a separate action for another file.",
        );
      if (resumeVersionId) {
        const [version] = await tx
          .select({ id: resumeVersions.id })
          .from(resumeVersions)
          .where(eq(resumeVersions.id, resumeVersionId));
        if (!version) throw new Error("Selected resume no longer exists.");
      }
      await tx
        .update(applications)
        .set({
          applicationUrl: data.applicationUrl || null,
          resumeVersionId,
          notes: data.notes,
          updatedAt: new Date(),
        })
        .where(eq(applications.id, previous.id));
      await tx.insert(activityLogs).values({
        action: "APPLICATION_UPDATED",
        entityType: "APPLICATION",
        entityId: previous.id,
        summary: "Updated application details",
      });
    });
    refresh(data.id);
    return { success: "Details saved." };
  } catch (error) {
    return actionError(error);
  }
}

export async function updateRound(_state: ActionState, form: FormData): Promise<ActionState> {
  try {
    const data = z
      .object({
        id: z.uuid(),
        name: z.string().trim().max(200),
        day,
        time: z.union([z.literal(""), z.string().regex(/^\d{2}:\d{2}$/)]),
        notes: z.string().trim().max(5000),
      })
      .parse({
        id: formString(form, "id"),
        name: formString(form, "name"),
        day: formString(form, "day"),
        time: formString(form, "time"),
        notes: formString(form, "notes"),
      });
    const scheduledAt = data.day ? istDateTime(data.day, data.time || "10:00") : null;
    if (data.day && !scheduledAt) throw new Error("Use a valid date and time in India time.");
    const [round] = await db
      .update(applicationRounds)
      .set({ name: data.name, scheduledAt, notes: data.notes, updatedAt: new Date() })
      .where(eq(applicationRounds.id, data.id))
      .returning({ applicationId: applicationRounds.applicationId });
    if (!round) throw new Error("This round no longer exists.");
    refresh(round.applicationId);
    return { success: "Round updated." };
  } catch (error) {
    return actionError(error);
  }
}
```

- [ ] **Step 4: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: clean. If `.for("update")` complains about the join-free select, it does not; the existing `updateApplication` uses the same call.

- [ ] **Step 5: Commit**

```bash
git add src/features/applications/outcome-service.ts src/features/applications/outcomes.ts src/features/applications/record-actions.ts
git commit -m "JOB_FINDER-9999: Record outcomes, follow-ups and snoozes" -m "Apply each outcome in one locked transaction and add actions for follow-up dates, queue snoozes, record details and round corrections." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Marks, tabs and the Records tab

**Files:**

- Create: `src/features/applications/views/marks.tsx`, `views/tabs.tsx`, `views/records.tsx`
- Replace: `src/app/applications/page.tsx` (Records + Next placeholder; Next arrives in Task 7)

**Interfaces:**

- Consumes: Tasks 2–4.
- Produces: `MethodIcon`, `CompanyMark`, `RoundLadder({ rounds, typical, wide })`, `PhaseBar({ phase, label, won })`, `QuietChip({ clock })` (client); `ApplicationsTabs({ active, counts })`; `RecordsView({ records, filter, q, now })`.

- [ ] **Step 1: Create `src/features/applications/views/marks.tsx`** (ported from `gallery/marks.tsx`; colours from tokens only):

```tsx
"use client";

import { useState } from "react";
import {
  Check,
  FileText,
  Hourglass,
  Mail,
  MessageSquare,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { familyFill } from "@/features/companies/format";
import { roundFamily, roundKindLabel } from "@/features/companies/metrics";
import { cn } from "@/lib/utils";
import { formatDayTime } from "../dates";
import { phases, type Phase } from "../phase";
import type { QueueRound } from "../queue";

const icons: Record<string, LucideIcon> = {
  DIRECT: FileText,
  REFERRAL: Users,
  COLD_EMAIL: Mail,
  LINKEDIN_MESSAGE: MessageSquare,
};
const outcomeWord = {
  SCHEDULED: "booked",
  PASSED: "cleared",
  FAILED: "not cleared",
  CANCELLED: "cancelled",
};

export function MethodIcon({ source, size = 12 }: { source: string; size?: number }) {
  const Icon = icons[source] ?? FileText;
  return <Icon size={size} aria-hidden className="shrink-0" />;
}

export function CompanyMark({ company, size = "md" }: { company: string; size?: "sm" | "md" }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-xl bg-secondary font-semibold text-secondary-foreground",
        size === "sm" ? "size-8 text-xs" : "size-10 text-sm",
      )}
    >
      {company.slice(0, 2)}
    </span>
  );
}

function Rail({ wide, done }: { wide: boolean; done: boolean }) {
  return (
    <span
      aria-hidden
      className={cn("h-0.5", wide ? "w-8" : "w-4", done ? "bg-muted-foreground/60" : "bg-border")}
    />
  );
}

/** Recorded rounds in family colours; dashed slots only from company research. */
export function RoundLadder({
  rounds,
  typical,
  wide = false,
}: {
  rounds: QueueRound[];
  typical: number | null;
  wide?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const extra = Math.max(0, (typical ?? 0) - rounds.length);
  if (!rounds.length && !extra)
    return <span className="text-xs text-muted-foreground">No rounds recorded</span>;
  const size = wide ? "size-7" : "size-5";
  const active = hover === null ? null : rounds[hover];
  return (
    <div className="relative">
      <div className="flex items-center" onMouseLeave={() => setHover(null)}>
        {rounds.map((round, index) => (
          <div key={round.id} className="flex items-center">
            {index > 0 && <Rail wide={wide} done={round.outcome !== "SCHEDULED"} />}
            <button
              type="button"
              onMouseEnter={() => setHover(index)}
              onFocus={() => setHover(index)}
              onBlur={() => setHover(null)}
              aria-label={`${roundKindLabel[round.kind]}: ${round.name || roundKindLabel[round.kind]}, ${outcomeWord[round.outcome]}`}
              className={cn(
                "grid shrink-0 place-items-center rounded-full border-0 p-0",
                size,
                round.outcome === "SCHEDULED"
                  ? "bg-transparent ring-2 ring-review ring-offset-2 ring-offset-card"
                  : round.outcome === "FAILED"
                    ? "bg-danger-soft text-destructive"
                    : round.outcome === "CANCELLED"
                      ? "bg-muted text-muted-foreground"
                      : cn(familyFill[roundFamily(round.kind)], "text-card"),
              )}
            >
              {round.outcome === "PASSED" ? (
                <Check size={wide ? 13 : 10} aria-hidden />
              ) : round.outcome === "FAILED" ? (
                <X size={wide ? 13 : 10} aria-hidden />
              ) : round.outcome === "SCHEDULED" ? (
                <span
                  className={cn(
                    "rounded-full",
                    wide ? "size-3.5" : "size-2.5",
                    familyFill[roundFamily(round.kind)],
                  )}
                />
              ) : null}
            </button>
          </div>
        ))}
        {extra > 0 && (
          <span
            className="flex items-center"
            title={`Typical loop: ${typical} rounds (company research)`}
          >
            {Array.from({ length: extra }, (_, index) => (
              <span key={index} className="flex items-center">
                {(rounds.length > 0 || index > 0) && <Rail wide={wide} done={false} />}
                <span
                  aria-hidden
                  className={cn("shrink-0 rounded-full border-2 border-dashed border-border", size)}
                />
              </span>
            ))}
            <span className="sr-only">Typical loop: {typical} rounds (company research)</span>
          </span>
        )}
      </div>
      {active && (
        <div className="absolute top-full left-0 z-10 mt-2 w-max max-w-64 rounded-xl bg-popover px-3 py-2 text-xs shadow-surface ring-1 ring-border">
          <p className="m-0 font-semibold">
            {roundKindLabel[active.kind]}
            {active.name ? ` · ${active.name}` : ""}
          </p>
          <p className="m-0 text-muted-foreground">
            {active.scheduledAt ? formatDayTime(active.scheduledAt) : "No date recorded"} ·{" "}
            {outcomeWord[active.outcome]}
          </p>
        </div>
      )}
    </div>
  );
}

export function PhaseBar({ phase, label, won }: { phase: Phase; label: string; won: boolean }) {
  const current = phases.indexOf(phase);
  const closed = phase === "Closed";
  return (
    <div className="min-w-0">
      <div className="flex gap-1" aria-hidden>
        {phases.slice(0, 4).map((name, index) => (
          <span
            key={name}
            className={cn(
              "h-1.5 flex-1 rounded-full",
              won
                ? "bg-success"
                : closed
                  ? index < 3
                    ? "bg-muted-foreground/40"
                    : "bg-destructive"
                  : index < current
                    ? "bg-primary/60"
                    : index === current
                      ? "bg-primary"
                      : "bg-muted",
            )}
          />
        ))}
      </div>
      <p
        data-testid="phase-label"
        className={cn(
          "m-0 mt-1.5 text-xs",
          won ? "text-success" : closed ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {label}
      </p>
    </div>
  );
}

export function QuietChip({ clock }: { clock: { days: number; threshold: number } | null }) {
  if (!clock) return null;
  const late = clock.days >= clock.threshold;
  return (
    <span
      title={`Follow up after ${clock.threshold} quiet days`}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs whitespace-nowrap tabular-nums",
        late ? "bg-warning-soft text-warning" : "bg-muted text-muted-foreground",
      )}
    >
      <Hourglass size={12} aria-hidden />
      {clock.days}d{late ? " quiet" : ` of ${clock.threshold}`}
    </span>
  );
}
```

- [ ] **Step 2: Create `src/features/applications/views/tabs.tsx`**

```tsx
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { Tab } from "../navigation";

const labels: { id: Tab; label: string }[] = [
  { id: "next", label: "Next" },
  { id: "records", label: "Records" },
  { id: "emails", label: "Emails" },
];

export function ApplicationsTabs({
  active,
  counts,
}: {
  active: Tab;
  counts: Record<Tab, number | null>;
}) {
  return (
    <nav
      aria-label="Applications"
      className="flex w-full gap-1 rounded-full bg-muted/60 p-1 sm:w-fit"
    >
      {labels.map((tab) => (
        <Link
          key={tab.id}
          href={`/applications?tab=${tab.id}`}
          aria-current={active === tab.id ? "page" : undefined}
          className={cn(
            "inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-full px-4 text-sm hover:no-underline sm:flex-none",
            active === tab.id
              ? "bg-card font-medium text-foreground shadow-surface"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {tab.label}
          {counts[tab.id] ? (
            <span
              className={cn(
                "rounded-full px-1.5 text-xs tabular-nums",
                active === tab.id ? "bg-selected text-selected-foreground" : "bg-muted",
              )}
            >
              {counts[tab.id]}
            </span>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}
```

- [ ] **Step 3: Create `src/features/applications/views/records.tsx`**

```tsx
import Link from "next/link";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { istDaysBetween } from "../dates";
import { filterLabel, matchesFilter, recordFilters, type RecordFilter } from "../navigation";
import { isOutreach, methodLabel } from "../phase";
import { silenceClock } from "../queue";
import type { ApplicationRecord } from "../read";
import { CompanyMark, MethodIcon, QuietChip, RoundLadder } from "./marks";

export function RecordsView({
  records,
  filter,
  q,
  now,
}: {
  records: ApplicationRecord[];
  filter: RecordFilter;
  q: string;
  now: Date;
}) {
  const shown = records.filter((record) => matchesFilter(record, filter, q, now));
  const byId = new Map(shown.map((record) => [record.id, record]));
  // Outreach for an opening sits under that opening's direct application.
  const parentOf = new Map<string, string>();
  for (const record of shown)
    if (isOutreach(record.source)) {
      const direct = record.linkedIds.find((id) => byId.get(id)?.source === "DIRECT");
      if (direct) parentOf.set(record.id, direct);
    }
  const parents = shown.filter((record) => !parentOf.has(record.id));
  const link = (name: RecordFilter) =>
    `/applications?tab=records&filter=${name}${q ? `&q=${encodeURIComponent(q)}` : ""}`;
  return (
    <div className="space-y-4 rounded-panel border border-border bg-card p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <nav aria-label="Filter records" className="flex flex-wrap gap-1.5">
          {recordFilters.map((name) => (
            <Link
              key={name}
              href={link(name)}
              aria-current={filter === name ? "page" : undefined}
              className={cn(
                "pressable inline-flex h-8 items-center gap-1.5 rounded-full border px-3.5 text-sm hover:no-underline",
                filter === name
                  ? "border-transparent bg-selected text-selected-foreground"
                  : "border-border text-foreground hover:bg-muted",
              )}
            >
              {filterLabel[name]}
              <span className="text-xs opacity-70 tabular-nums">
                {records.filter((record) => matchesFilter(record, name, "", now)).length}
              </span>
            </Link>
          ))}
        </nav>
        <form role="search" className="relative w-full sm:ml-auto sm:w-56">
          <input type="hidden" name="tab" value="records" />
          <input type="hidden" name="filter" value={filter} />
          <label htmlFor="records-q" className="sr-only">
            Search records
          </label>
          <Search
            size={15}
            aria-hidden
            className="absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
          />
          <input
            id="records-q"
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Company, role or person"
            className="!min-h-9 !rounded-full !py-1.5 !pl-9"
          />
        </form>
      </div>
      {parents.length ? (
        <ul className="m-0 list-none space-y-2 p-0">
          {parents.map((record) => {
            const children = shown.filter((other) => parentOf.get(other.id) === record.id);
            return (
              <li key={record.id} className="rounded-2xl bg-background/60 ring-1 ring-border">
                <RecordRow record={record} now={now} />
                {children.map((child) => (
                  <div key={child.id} className="ml-9 border-l-2 border-dashed border-border">
                    <RecordRow record={child} now={now} nested />
                  </div>
                ))}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="m-0 rounded-2xl border border-dashed border-border px-5 py-8 text-center text-sm text-muted-foreground">
          {records.length
            ? "No records match. Clear the search or pick another filter."
            : "No applications yet. Find an opening, then record what you sent."}
        </p>
      )}
    </div>
  );
}

function RecordRow({
  record,
  now,
  nested = false,
}: {
  record: ApplicationRecord;
  now: Date;
  nested?: boolean;
}) {
  const clock = silenceClock(record, now);
  const last = record.latest?.at ?? record.sentAt;
  const ago = last ? istDaysBetween(last, now) : null;
  const method = `${methodLabel[record.source] ?? "Record"}${record.contact ? ` · ${record.contact}` : ""}`;
  return (
    <div className="grid grid-cols-1 gap-3 px-4 py-3.5 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)] sm:items-center sm:gap-4">
      <div className="flex min-w-0 items-center gap-3">
        {nested ? (
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
            <MethodIcon source={record.source} size={14} />
          </span>
        ) : (
          <CompanyMark company={record.company} size="sm" />
        )}
        <div className="min-w-0">
          <Link
            href={`/applications/${record.id}`}
            className="block truncate font-medium text-foreground"
          >
            {nested ? method : record.company}
          </Link>
          <p className="m-0 truncate text-sm text-muted-foreground">
            {nested ? (record.latest?.summary ?? "") : record.role}
          </p>
          {!nested && (
            <p className="m-0 mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <MethodIcon source={record.source} />
              {method}
            </p>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {record.source === "DIRECT" &&
          (record.phase === "Preparing" ? (
            <span className="text-xs text-muted-foreground">Not sent yet</span>
          ) : (
            <RoundLadder rounds={record.rounds} typical={record.typicalRounds} />
          ))}
        <QuietChip clock={clock} />
      </div>
      {!nested && (
        <div className="min-w-0">
          <p
            className={cn(
              "m-0 truncate text-sm",
              record.phase === "Closed" && record.closedReason !== "ACCEPTED" && "text-destructive",
              (record.phase === "Decision" || record.closedReason === "ACCEPTED") &&
                "font-medium text-success",
            )}
          >
            {record.latest?.summary ?? "Nothing recorded yet"}
          </p>
          {ago !== null && (
            <p className="m-0 text-xs text-muted-foreground tabular-nums">
              {ago === 0 ? "Today" : `${ago}d ago`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Replace `src/app/applications/page.tsx`**

```tsx
import Link from "next/link";
import { Button, PageHeader, Panel } from "@/components/ui";
import { matchesFilter, resolveView } from "@/features/applications/navigation";
import { buildQueue } from "@/features/applications/queue";
import { readApplications } from "@/features/applications/read";
import { RecordsView } from "@/features/applications/views/records";
import { ApplicationsTabs } from "@/features/applications/views/tabs";
import { MailRefresh } from "@/features/mail/refresh";

export const dynamic = "force-dynamic";

export default async function Applications({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; filter?: string; view?: string; q?: string }>;
}) {
  const view = resolveView(await searchParams);
  const now = new Date();
  const { records, snoozes } = await readApplications();
  const items = buildQueue({ records, mail: [], snoozes, now });
  return (
    <div className="space-y-6">
      <PageHeader
        title="Applications"
        description="What needs you next, where each record stands, and recruiting mail."
        actions={
          <Button asChild>
            <Link href="/applications/new">Record an application</Link>
          </Button>
        }
      />
      <ApplicationsTabs
        active={view.tab}
        counts={{
          next: items.filter((item) => item.due !== "week").length,
          records: records.filter((record) => matchesFilter(record, "active", "", now)).length,
          emails: null,
        }}
      />
      {view.tab === "next" && <Panel>The Next queue arrives in the next task.</Panel>}
      {view.tab === "records" && (
        <RecordsView records={records} filter={view.filter} q={view.q} now={now} />
      )}
      {view.tab === "emails" && (
        <Panel>
          <MailRefresh />
          <Link href="/mail" className="mt-4 inline-block text-sm text-link">
            Review imported mail
          </Link>
        </Panel>
      )}
    </div>
  );
}
```

(The Next placeholder is replaced in Task 7 before this phase ships.)

- [ ] **Step 5: Verify in the browser**

Run: `npm run typecheck && npm run lint`, then start a dev server on a spare port (`APP_URL=http://127.0.0.1:3212 npx next dev --hostname 127.0.0.1 --port 3212`) and open `/applications?tab=records&filter=all`.
Expected: your real Oracle record shows as one row with "Applied directly", "No rounds recorded" (or dashed research slots if Oracle has interview research) and a quiet-days chip. Filters and search change the URL. No horizontal scroll at 390 px.

- [ ] **Step 6: Commit**

```bash
git add src/features/applications/views src/app/applications/page.tsx
git commit -m "JOB_FINDER-9999: Show application records with real interview rounds" -m "Add the tabbed Applications page and the round-ladder record list with filters, search, quiet-days chips and nested outreach." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The Next tab

**Files:**

- Create: `src/features/applications/views/next.tsx`
- Modify: `src/app/applications/page.tsx`

**Interfaces:**

- Consumes: `QueueItem`, `snoozeQueueItem`, `unsnoozeQueueItem`, `queueKeyPattern`, date formatters.
- Produces: `NextView({ items, now })`, `SnoozeToast({ snoozed })`.

- [ ] **Step 1: Create `src/features/applications/views/next.tsx`**

```tsx
import Link from "next/link";
import {
  BellOff,
  CalendarClock,
  Hourglass,
  Mail,
  Timer,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui";
import { formatDay, formatTime, formatWeekday } from "../dates";
import type { QueueItem, Reason } from "../queue";
import { snoozeQueueItem, unsnoozeQueueItem } from "../record-actions";

const reasonIcon: Record<Reason, LucideIcon> = {
  followup: CalendarClock,
  silence: Hourglass,
  round: Users,
  deadline: Timer,
  mail: Mail,
};

export function NextView({ items, now }: { items: QueueItem[]; now: Date }) {
  if (!items.length)
    return (
      <div className="rounded-panel border border-dashed border-border px-5 py-10 text-center">
        <h2 className="m-0 text-lg font-semibold">Nothing needs you right now</h2>
        <p className="m-0 mt-1 text-sm text-muted-foreground">
          Refresh your inboxes or record a new application.
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button variant="outline" asChild>
            <Link href="/applications?tab=emails">Refresh inboxes</Link>
          </Button>
          <Button asChild>
            <Link href="/applications/new">Record an application</Link>
          </Button>
        </div>
      </div>
    );
  const overdue = items.filter((item) => item.due === "overdue");
  const today = items.filter((item) => item.due === "today");
  const week = items.filter((item) => item.due === "week");
  return (
    <div className="space-y-5 rounded-panel border border-border bg-card p-4 sm:p-6">
      {overdue.length > 0 && (
        <section aria-labelledby="slipped" className="rounded-2xl bg-danger-soft p-4">
          <h2 id="slipped" className="m-0 mb-3 text-sm font-semibold text-destructive">
            {overdue.length} slipped past {overdue.length === 1 ? "its" : "their"} date
          </h2>
          <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
            {overdue.map((item) => (
              <li key={item.key} className="flex max-w-full items-center gap-1">
                <Link
                  href={item.primary.href}
                  title={`${item.title}. ${item.detail}`}
                  className="pressable inline-flex max-w-full items-center gap-2 rounded-full border border-destructive/40 bg-card px-3 py-1.5 text-sm text-foreground hover:border-destructive hover:no-underline"
                >
                  <span className="font-medium">{item.company ?? item.title}</span>
                  <span className="truncate text-muted-foreground">{item.primary.label}</span>
                </Link>
                <SnoozeButton item={item} />
              </li>
            ))}
          </ul>
        </section>
      )}
      <ol className="relative m-0 list-none p-0 pl-6">
        <span
          aria-hidden
          className="absolute top-2 bottom-2 left-[7px] w-0.5 rounded-full bg-border"
        />
        <li className="relative pb-3">
          <span
            aria-hidden
            className="absolute top-1 -left-6 size-4 rounded-full bg-review ring-4 ring-card"
          />
          <h2 className="m-0 text-sm font-semibold">Today · {formatWeekday(now)}</h2>
        </li>
        {today.length ? (
          today.map((item) => <AgendaRow key={item.key} item={item} />)
        ) : (
          <li className="py-2 text-sm text-muted-foreground">Nothing else today.</li>
        )}
        <li className="relative pt-4 pb-3">
          <span
            aria-hidden
            className="absolute top-5 -left-[22px] size-3 rounded-full bg-primary ring-4 ring-card"
          />
          <h2 className="m-0 text-sm font-semibold text-muted-foreground">Rest of the week</h2>
        </li>
        {week.length ? (
          week.map((item) => <AgendaRow key={item.key} item={item} />)
        ) : (
          <li className="py-2 text-sm text-muted-foreground">Nothing scheduled yet.</li>
        )}
      </ol>
    </div>
  );
}

function AgendaRow({ item }: { item: QueueItem }) {
  const Icon = reasonIcon[item.reason];
  const when =
    item.reason === "mail"
      ? "New mail"
      : item.due === "week"
        ? formatDay(item.dueAt)
        : item.reason === "round" || item.reason === "deadline"
          ? formatTime(item.dueAt)
          : "Due today";
  return (
    <li className="relative grid gap-1.5 py-2 sm:grid-cols-[5rem_minmax(0,1fr)] sm:gap-3">
      <span className="pt-0.5 text-sm text-muted-foreground tabular-nums">{when}</span>
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-2xl bg-background/60 px-4 py-3 ring-1 ring-border">
        <div className="min-w-0">
          <p className="m-0 flex items-center gap-2 font-medium">
            <Icon size={14} aria-hidden className="shrink-0 text-muted-foreground" />
            <span className="truncate">{item.title}</span>
          </p>
          <p className="m-0 truncate text-sm text-muted-foreground">{item.detail}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button size="sm" variant="outline" className="h-8 rounded-full px-3" asChild>
            <Link href={item.primary.href}>{item.primary.label}</Link>
          </Button>
          {item.secondary && (
            <Button size="sm" variant="ghost" className="h-8 rounded-full px-3" asChild>
              <Link href={item.secondary.href}>{item.secondary.label}</Link>
            </Button>
          )}
          {item.due !== "week" && <SnoozeButton item={item} />}
        </div>
      </div>
    </li>
  );
}

function SnoozeButton({ item }: { item: QueueItem }) {
  return (
    <ActionForm action={snoozeQueueItem} className="contents" pendingLabel="Snoozing">
      <input type="hidden" name="key" value={item.key} />
      <input type="hidden" name="title" value={item.title} />
      <Button
        size="icon"
        variant="ghost"
        className="size-8 rounded-full"
        aria-label={`Snooze ${item.title} for 2 days`}
        title="Snooze 2 days"
      >
        <BellOff size={14} aria-hidden />
      </Button>
    </ActionForm>
  );
}

export function SnoozeToast({ snoozed }: { snoozed?: { key: string; title: string } }) {
  if (!snoozed) return null;
  return (
    <div role="status" className="fixed inset-x-0 bottom-5 z-30 flex justify-center px-4">
      <div className="flex max-w-full items-center gap-3 rounded-2xl bg-foreground py-2 pr-2 pl-4 text-sm text-background shadow-surface">
        <span className="truncate">Snoozed for 2 days: {snoozed.title}</span>
        <ActionForm action={unsnoozeQueueItem} className="contents" pendingLabel="Restoring">
          <input type="hidden" name="key" value={snoozed.key} />
          <button className="shrink-0 rounded-full border-0 bg-transparent px-2 py-1 font-semibold text-background underline underline-offset-2">
            Undo
          </button>
        </ActionForm>
        <Link
          href="/applications?tab=next"
          aria-label="Close"
          className="grid size-8 place-items-center rounded-full text-background hover:no-underline"
        >
          <X size={14} aria-hidden />
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire it into the page.** In `src/app/applications/page.tsx`:

Extend the `searchParams` type with `snoozed?: string; title?: string`, read it once (`const params = await searchParams; const view = resolveView(params);`), import `queueKeyPattern` from navigation and `NextView, SnoozeToast` from `@/features/applications/views/next`, then replace the Next placeholder line with:

```tsx
{
  view.tab === "next" && <NextView items={items} now={now} />;
}
```

and add before the closing `</div>`:

```tsx
<SnoozeToast
  snoozed={
    params.snoozed && queueKeyPattern.test(params.snoozed)
      ? { key: params.snoozed, title: (params.title ?? "").slice(0, 200) }
      : undefined
  }
/>
```

- [ ] **Step 3: Verify in the browser**

Run: `npm run typecheck && npm run lint`, open `/applications` on the dev server.
Expected: with only the Oracle record (applied yesterday), Today shows "Nothing else today." and the week shows nothing. Temporarily set a follow-up via SQL to see a row, e.g. `docker exec jobops-postgres-1 psql -U jobops -d jobops -c "update applications set next_action_at = now(), next_action_note = 'Check Oracle portal'"`; the row appears under Today; snooze shows the toast and Undo restores it. Reset with `… set next_action_at = null, next_action_note = ''`.

- [ ] **Step 4: Commit**

```bash
git add src/features/applications/views/next.tsx src/app/applications/page.tsx
git commit -m "JOB_FINDER-9999: Add the Next agenda for applications" -m "Show slipped items, today and the rest of the week with one action each, and snooze with undo." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The record page

**Files:**

- Create: `src/features/applications/views/outcome-chips.tsx`, `views/follow-up.tsx`, `views/detail.tsx`
- Replace: `src/app/applications/[id]/page.tsx`
- Delete: `src/features/applications/form.tsx`
- Modify: `src/features/applications/actions.ts` (keep only `addApplicationNote`)
- Create: `tests/e2e/helpers/records.ts`
- Modify: `tests/e2e/simple-records.spec.ts`, `tests/e2e/workspace.spec.ts`
- Create: `tests/e2e/applications.spec.ts` (first test)

**Interfaces:**

- Consumes: everything above; `RecordForm` (`../record-form`), `addApplicationNote`, `displayDate`, `getDisplayPreferences`.
- Produces: `OutcomeChips({ recordId, outcomes, initial, today })`, `FollowUp({ recordId, day, label, note })`, `ApplicationDetail({ record, linked, versions, preferences, now, requested })`; e2e helper `seedRecord`, `istDay`.

- [ ] **Step 1: Write the failing e2e helper and test.** Create `tests/e2e/helpers/records.ts`:

```ts
import { db } from "../../../src/db";
import { applicationEvents, applications, jobs } from "../../../src/db/schema";

/** YYYY-MM-DD in India time, `offset` days from today. */
export const istDay = (offset = 0) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(
    new Date(Date.now() + offset * 86_400_000),
  );

export async function seedRecord(input: {
  company: string;
  source: "DIRECT" | "REFERRAL";
  sentDaysAgo: number | null;
  contact?: string;
  /** Simulates a stage set by the old dropdown. */
  status?: "APPLIED" | "TECHNICAL_INTERVIEW";
}) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const [job] = await db
    .insert(jobs)
    .values({
      company: input.company,
      title: "Backend Engineer",
      location: "Bengaluru",
      canonicalUrl: `https://example.invalid/jobs/${suffix}`,
      dedupeKey: `e2e-${suffix}`,
      source: "OTHER",
    })
    .returning();
  const sentAt =
    input.sentDaysAgo === null ? null : new Date(Date.now() - input.sentDaysAgo * 86_400_000);
  const direct = input.source === "DIRECT";
  const [app] = await db
    .insert(applications)
    .values({
      jobId: job.id,
      source: input.source,
      status: input.status ?? (direct && sentAt ? "APPLIED" : "PREPARING"),
      appliedAt: direct ? sentAt : null,
    })
    .returning();
  if (sentAt)
    await db.insert(applicationEvents).values({
      applicationId: app.id,
      eventType: direct ? "APPLICATION_SUBMITTED" : "OUTREACH_SENT",
      occurredAt: sentAt,
      summary: direct ? "Applied on the careers site" : `Asked ${input.contact ?? "a contact"}`,
      payload: input.contact ? { recipient: input.contact } : {},
    });
  return { jobId: job.id, applicationId: app.id };
}
```

Create `tests/e2e/applications.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { closeDatabase } from "../../src/db";
import { stubExternalSites } from "./helpers/external-sites";
import { istDay, seedRecord } from "./helpers/records";

test.beforeEach(async ({ page }) => {
  await stubExternalSites(page);
});
test.beforeEach(() => expect(new URL(process.env.DATABASE_URL!).pathname).toBe("/jobops_e2e"));
test.afterAll(() => closeDatabase());

test("recording outcomes walks an application from OA to an accepted offer", async ({ page }) => {
  const company = `Ladder Labs ${Date.now()}`;
  const { applicationId } = await seedRecord({ company, source: "DIRECT", sentDaysAgo: 2 });
  await page.goto(`/applications/${applicationId}`);
  const phase = page.getByTestId("phase-label");
  const history = page.getByRole("region", { name: "History" });
  const save = () => page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(phase).toHaveText("Applied");

  await page.getByRole("button", { name: "Got an OA", exact: true }).click();
  await page.getByLabel("Complete by (India time)").fill(istDay(3));
  await page.getByLabel("Name (optional)").fill("HackerRank");
  await save();
  await expect(history).toContainText("OA received");
  await expect(phase).toHaveText(/Interviewing · round 1/);

  await page.getByRole("button", { name: "Cleared the round", exact: true }).click();
  await save();
  await expect(history).toContainText("Cleared the OA round");

  await page.getByRole("button", { name: "Round scheduled", exact: true }).click();
  await page.getByLabel("Round", { exact: true }).selectOption("LLD");
  await page.getByLabel("Date (India time)").fill(istDay(5));
  await page.getByLabel("Time", { exact: true }).fill("11:00");
  await save();
  await expect(history).toContainText("LLD round scheduled");
  await expect(page.getByRole("button", { name: "Got an offer", exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Cleared the round", exact: true }).click();
  await save();
  await page.getByRole("button", { name: "Got an offer", exact: true }).click();
  await save();
  await expect(phase).toHaveText("Decision");
  await page.getByRole("button", { name: "Accepted the offer", exact: true }).click();
  await save();
  await expect(phase).toHaveText("Accepted");
  await expect(
    page.getByRole("region", { name: "Rounds" }).getByText("Cleared", { exact: true }),
  ).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Rejected", exact: true })).toHaveCount(0);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:e2e -- tests/e2e/applications.spec.ts`
Expected: FAIL — no `phase-label` on the old record page.

- [ ] **Step 3: Create `src/features/applications/views/outcome-chips.tsx`**

```tsx
"use client";

import { useState } from "react";
import {
  CalendarPlus,
  Check,
  CircleSlash,
  Hourglass,
  MailCheck,
  PartyPopper,
  Send,
  Undo2,
  X,
  type LucideIcon,
} from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui";
import { roundKindLabel } from "@/features/companies/metrics";
import { roundKinds } from "@/lib/round-kinds";
import { cn } from "@/lib/utils";
import { recordOutcome } from "../outcomes";
import { outcomeMeta, type OutcomeId } from "../phase";

const icons: Record<OutcomeId, LucideIcon> = {
  heard: MailCheck,
  replied: MailCheck,
  oa: CalendarPlus,
  scheduled: CalendarPlus,
  followup: Send,
  passed: Check,
  failed: X,
  rescheduled: Undo2,
  offer: PartyPopper,
  rejected: X,
  ghosted: Hourglass,
  withdrew: CircleSlash,
  accepted: PartyPopper,
  declined: CircleSlash,
  referred: Check,
  declinedReferral: X,
};

export function OutcomeChips({
  recordId,
  outcomes,
  initial,
  today,
}: {
  recordId: string;
  outcomes: OutcomeId[];
  initial: OutcomeId | null;
  today: string;
}) {
  const [open, setOpen] = useState<OutcomeId | null>(initial);
  if (!outcomes.length) return null;
  const needs = open ? outcomeMeta[open].needs : undefined;
  return (
    <div id="what-happened" className="scroll-mt-24">
      <h3 className="m-0 mb-2.5 text-base font-semibold">What happened?</h3>
      <div className="flex flex-wrap gap-2">
        {outcomes.map((id) => {
          const meta = outcomeMeta[id];
          const Icon = icons[id];
          return (
            <button
              key={id}
              type="button"
              aria-expanded={open === id}
              onClick={() => setOpen(open === id ? null : id)}
              className={cn(
                "pressable inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm",
                open === id
                  ? "border-transparent bg-primary text-primary-foreground"
                  : meta.tone === "good"
                    ? "border-transparent bg-selected text-selected-foreground hover:brightness-110"
                    : meta.tone === "bad"
                      ? "border-destructive/50 bg-transparent text-destructive hover:bg-danger-soft"
                      : "border-border bg-transparent text-foreground hover:bg-muted",
              )}
            >
              <Icon size={14} aria-hidden />
              {meta.label}
            </button>
          );
        })}
      </div>
      {open && (
        <ActionForm
          key={open}
          action={recordOutcome}
          className="mt-3 space-y-3 rounded-2xl bg-muted/50 p-4"
          pendingLabel="Saving"
        >
          <input type="hidden" name="id" value={recordId} />
          <input type="hidden" name="outcome" value={open} />
          <p className="m-0 font-medium">{outcomeMeta[open].label}</p>
          <div className="flex flex-wrap items-end gap-3">
            {needs === "round" && (
              <label className="w-40 text-sm">
                Round
                <select name="kind" className="mt-1" defaultValue="DSA">
                  {roundKinds.map((kind) => (
                    <option key={kind} value={kind}>
                      {roundKindLabel[kind]}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {needs && (
              <>
                <label className="w-48 text-sm">
                  {needs === "deadline" ? "Complete by (India time)" : "Date (India time)"}
                  <input className="mt-1" type="date" name="day" required />
                </label>
                <label className="w-32 text-sm">
                  Time
                  <input className="mt-1" type="time" name="time" />
                </label>
              </>
            )}
            {(needs === "round" || needs === "deadline") && (
              <label className="w-56 text-sm">
                Name (optional)
                <input
                  className="mt-1"
                  name="name"
                  maxLength={200}
                  placeholder={needs === "deadline" ? "HackerRank" : "Machine coding"}
                />
              </label>
            )}
            <label className="w-44 text-sm">
              When it happened
              <input
                className="mt-1"
                type="date"
                name="happenedOn"
                max={today}
                defaultValue={today}
              />
            </label>
          </div>
          <label className="block text-sm">
            Note (optional)
            <textarea name="note" rows={2} maxLength={2000} className="mt-1 !min-h-16" />
          </label>
          <div className="flex gap-2">
            <Button>Save</Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(null)}>
              Cancel
            </Button>
          </div>
        </ActionForm>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Create `src/features/applications/views/follow-up.tsx`**

```tsx
"use client";

import { useState } from "react";
import { CalendarClock } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui";
import { setFollowUp } from "../record-actions";

export function FollowUp({
  recordId,
  day,
  label,
  note,
}: {
  recordId: string;
  day: string | null;
  label: string | null;
  note: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <Button variant="outline" aria-expanded={open} onClick={() => setOpen(!open)}>
        <CalendarClock size={15} aria-hidden />
        {label ? `Follow up on ${label}` : "Set a follow-up"}
      </Button>
      {open && (
        <ActionForm
          action={setFollowUp}
          className="mt-3 flex flex-wrap items-end gap-3 rounded-2xl bg-muted/50 p-4"
        >
          <input type="hidden" name="id" value={recordId} />
          <label className="w-44 text-sm">
            Follow-up date
            <input className="mt-1" type="date" name="day" required defaultValue={day ?? ""} />
          </label>
          <label className="min-w-48 flex-1 text-sm">
            What to do
            <input
              className="mt-1"
              name="note"
              maxLength={300}
              defaultValue={note}
              placeholder="Check the portal for an update"
            />
          </label>
          <Button>Save follow-up</Button>
          {day && (
            <Button name="clear" value="1" variant="ghost" formNoValidate>
              Clear
            </Button>
          )}
        </ActionForm>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Create `src/features/applications/views/detail.tsx`**

```tsx
import Link from "next/link";
import { ExternalLink, FileText, Link2, Mail, NotebookPen } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { Button, Field } from "@/components/ui";
import { displayDate, type DisplayPreferences } from "@/features/candidate/preferences";
import { familyFill } from "@/features/companies/format";
import { roundFamily, roundKindLabel } from "@/features/companies/metrics";
import { cn } from "@/lib/utils";
import { addApplicationNote } from "../actions";
import { formatDay, formatDayTime, indiaDate, istClock, istDaysBetween } from "../dates";
import {
  availableOutcomes,
  historyTone,
  initialOutcome,
  isOutreach,
  methodLabel,
  phaseText,
  recordStateFrom,
} from "../phase";
import type { ApplicationRecord } from "../read";
import { updateApplicationDetails, updateRound } from "../record-actions";
import { RecordForm } from "../record-form";
import { FollowUp } from "./follow-up";
import { CompanyMark, PhaseBar, RoundLadder } from "./marks";
import { OutcomeChips } from "./outcome-chips";

type Choice = { id: string; label: string };

export function ApplicationDetail({
  record,
  linked,
  versions,
  preferences,
  now,
  requested,
}: {
  record: ApplicationRecord;
  linked: ApplicationRecord[];
  versions: Choice[];
  preferences: DisplayPreferences;
  now: Date;
  requested?: string;
}) {
  const outreach = isOutreach(record.source);
  const state = recordStateFrom(
    { source: record.source, status: record.status, appliedAt: record.appliedAt },
    record.rounds,
    record.events.map((event) => event.eventType),
  );
  const available = availableOutcomes(state);
  const history = [
    ...record.events.map((event) => ({
      key: event.id,
      at: event.occurredAt,
      text: event.summary,
      tone: historyTone(event.eventType) as "good" | "bad" | "neutral" | "mail",
      from: "",
      href: "",
    })),
    ...record.linkedMail.map((mail) => ({
      key: mail.id,
      at: mail.receivedAt,
      text: mail.subject,
      tone: "mail" as const,
      from: "",
      href: `/mail/${mail.id}`,
    })),
    ...linked.flatMap((other) =>
      other.events.map((event) => ({
        key: event.id,
        at: event.occurredAt,
        text: event.summary,
        tone: historyTone(event.eventType) as "good" | "bad" | "neutral" | "mail",
        from: methodLabel[other.source] ?? "Linked record",
        href: "",
      })),
    ),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <CompanyMark company={record.company} />
          <div className="min-w-0">
            <h1 className="m-0 text-2xl font-semibold tracking-tight">{record.company}</h1>
            <p className="m-0 text-muted-foreground">
              {outreach
                ? `${methodLabel[record.source]}${record.contact ? ` · ${record.contact}` : ""} · ${record.role}`
                : `${record.role}${record.city ? ` · ${record.city}` : ""}`}
            </p>
            {record.sentAt && (
              <p className="m-0 mt-1 text-sm text-muted-foreground">
                {outreach ? "Sent" : "Applied"} {displayDate(record.sentAt, preferences)}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="h-9 rounded-full px-4" asChild>
            <a href={record.jobUrl} target="_blank" rel="noreferrer">
              <ExternalLink size={14} aria-hidden />
              Job post
            </a>
          </Button>
          {record.applicationUrl && (
            <Button variant="outline" size="sm" className="h-9 rounded-full px-4" asChild>
              <a href={record.applicationUrl} target="_blank" rel="noreferrer">
                <ExternalLink size={14} aria-hidden />
                Application page
              </a>
            </Button>
          )}
          {record.resume && (
            <Button
              variant="outline"
              size="sm"
              className="h-9 max-w-full rounded-full px-4"
              asChild
            >
              <a href={`/api/resumes/${record.resume.id}/file?download=1`}>
                <FileText size={14} aria-hidden />
                <span className="truncate">{record.resume.filename}</span>
              </a>
            </Button>
          )}
        </div>
      </header>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-5">
          <section aria-label="Progress" className="rounded-3xl bg-card p-5 ring-1 ring-border">
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <PhaseBar
                phase={record.phase}
                won={record.closedReason === "ACCEPTED"}
                label={phaseText({
                  phase: record.phase,
                  source: record.source,
                  replied: state.replied,
                  closedReason: record.closedReason,
                  status: record.status,
                  rounds: record.rounds.length,
                  typical: record.typicalRounds,
                })}
              />
              {!outreach && (
                <RoundLadder rounds={record.rounds} typical={record.typicalRounds} wide />
              )}
            </div>
            <div className="mt-5 space-y-4">
              {record.phase === "Preparing" ? (
                <div>
                  <h2 className="m-0 mb-2 text-base font-semibold">Record it as sent</h2>
                  {outreach && (
                    <p className="text-sm text-muted-foreground">
                      <Link href={`/outreach?record=${record.id}`} className="text-link">
                        Open outreach prompt
                      </Link>{" "}
                      ·{" "}
                      <Link href={`/applications/new?jobId=${record.jobId}`} className="text-link">
                        Record a direct application
                      </Link>
                    </p>
                  )}
                  <RecordForm
                    jobChoices={[{ id: record.jobId, label: `${record.company} — ${record.role}` }]}
                    versionChoices={versions}
                    jobId={record.jobId}
                    method={record.source}
                    existing={{
                      id: record.id,
                      versionId: record.resumeVersionId,
                      url: record.applicationUrl,
                      notes: record.notes,
                      recipient: record.contact ?? "",
                    }}
                  />
                </div>
              ) : (
                <OutcomeChips
                  // A saved outcome redirects to this same route; a new key closes the panel.
                  key={record.events.length}
                  recordId={record.id}
                  outcomes={available}
                  initial={initialOutcome(available, requested)}
                  today={indiaDate(now)}
                />
              )}
              {record.phase !== "Closed" && (
                <FollowUp
                  key={record.nextActionAt?.getTime() ?? "none"}
                  recordId={record.id}
                  day={record.nextActionAt ? indiaDate(record.nextActionAt) : null}
                  label={record.nextActionAt ? formatDay(record.nextActionAt) : null}
                  note={record.nextActionNote}
                />
              )}
            </div>
          </section>
          {!outreach && (record.rounds.length > 0 || record.typicalRounds) && (
            <section aria-labelledby="rounds-heading">
              <h2 id="rounds-heading" className="m-0 mb-3 text-base font-semibold">
                Rounds
              </h2>
              <ol className="m-0 list-none space-y-2 p-0">
                {record.rounds.map((round, index) => (
                  <RoundRow key={round.id} round={round} index={index} now={now} />
                ))}
                {Array.from(
                  { length: Math.max(0, (record.typicalRounds ?? 0) - record.rounds.length) },
                  (_, index) => (
                    <li
                      key={`slot-${index}`}
                      className="flex items-center gap-3 rounded-2xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground"
                    >
                      <span className="w-6 tabular-nums">{record.rounds.length + index + 1}</span>
                      Not scheduled yet
                    </li>
                  ),
                )}
              </ol>
              {record.typicalRounds ? (
                <p className="m-0 mt-2 text-xs text-muted-foreground">
                  Typical loop: {record.typicalRounds} rounds (company research)
                </p>
              ) : null}
            </section>
          )}
          <section
            aria-labelledby="notes-heading"
            className="rounded-3xl bg-card p-4 ring-1 ring-border"
          >
            <h2
              id="notes-heading"
              className="m-0 mb-2 flex items-center gap-2 text-base font-semibold"
            >
              <NotebookPen size={15} aria-hidden />
              Notes
            </h2>
            <p className="m-0 text-sm whitespace-pre-wrap text-muted-foreground">
              {record.notes || "No notes yet."}
            </p>
            {record.phase !== "Preparing" && (
              <details className="mt-3">
                <summary className="text-sm">Edit details</summary>
                <ActionForm action={updateApplicationDetails} className="mt-3 space-y-4">
                  <input type="hidden" name="id" value={record.id} />
                  <input
                    type="hidden"
                    name="resumeVersionId"
                    value={record.resumeVersionId ?? ""}
                  />
                  <p className="m-0 text-sm">
                    Resume used: {record.resume?.filename ?? "No file recorded"}
                  </p>
                  <Field
                    label="Application URL"
                    name="applicationUrl"
                    type="url"
                    defaultValue={record.applicationUrl ?? ""}
                  />
                  <Field label="Notes" name="notes">
                    <textarea id="notes" name="notes" defaultValue={record.notes} />
                  </Field>
                  <Button variant="outline">Save details</Button>
                </ActionForm>
              </details>
            )}
          </section>
        </div>
        <aside className="min-w-0 space-y-5">
          {linked.length > 0 && (
            <section aria-label="Linked records" className="space-y-2">
              {linked.map((other) => (
                <Link
                  key={other.id}
                  href={`/applications/${other.id}`}
                  className="block rounded-3xl bg-selected/50 p-4 text-selected-foreground hover:no-underline"
                >
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <Link2 size={14} aria-hidden />
                    Linked: {methodLabel[other.source] ?? "Record"}
                    {other.contact ? ` · ${other.contact}` : ""}
                  </span>
                  <span className="mt-1 block text-sm">
                    {other.latest?.summary ?? "Nothing recorded yet"}
                  </span>
                </Link>
              ))}
            </section>
          )}
          <section aria-labelledby="history-heading">
            <h2 id="history-heading" className="m-0 mb-3 text-base font-semibold">
              History
            </h2>
            <ol className="m-0 list-none space-y-4 p-0">
              {history.map((entry) => (
                <li key={entry.key} className="grid grid-cols-[1.25rem_minmax(0,1fr)] gap-3">
                  <span
                    aria-hidden
                    className={cn(
                      "mt-0.5 grid size-5 place-items-center rounded-full",
                      entry.tone === "mail"
                        ? "bg-selected text-selected-foreground"
                        : entry.tone === "good"
                          ? "bg-success-soft text-success"
                          : entry.tone === "bad"
                            ? "bg-danger-soft text-destructive"
                            : "bg-muted text-muted-foreground",
                    )}
                  >
                    {entry.tone === "mail" ? (
                      <Mail size={11} />
                    ) : (
                      <span className="size-1.5 rounded-full bg-current" />
                    )}
                  </span>
                  <div className="min-w-0">
                    {entry.href ? (
                      <Link href={entry.href} className="text-sm">
                        {entry.text}
                      </Link>
                    ) : (
                      <p className="m-0 text-sm">{entry.text}</p>
                    )}
                    <p className="m-0 text-xs text-muted-foreground">
                      {displayDate(entry.at, preferences, true)}
                      {entry.from && ` · ${entry.from}`}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
            <ActionForm action={addApplicationNote} className="mt-5 space-y-3">
              <input type="hidden" name="id" value={record.id} />
              <label className="block text-sm">
                Add to history
                <textarea
                  name="summary"
                  rows={2}
                  required
                  maxLength={20000}
                  className="mt-1 !min-h-16"
                />
              </label>
              <Button variant="outline" size="sm" className="h-9 px-4">
                Add note
              </Button>
            </ActionForm>
          </section>
        </aside>
      </div>
    </div>
  );
}

function RoundRow({
  round,
  index,
  now,
}: {
  round: ApplicationRecord["rounds"][number];
  index: number;
  now: Date;
}) {
  const status =
    round.outcome === "PASSED"
      ? { text: "Cleared", tone: "bg-success-soft text-success" }
      : round.outcome === "FAILED"
        ? { text: "Not cleared", tone: "bg-danger-soft text-destructive" }
        : round.outcome === "CANCELLED"
          ? { text: "Cancelled", tone: "bg-muted text-muted-foreground" }
          : !round.scheduledAt
            ? { text: "Date not set", tone: "bg-muted text-muted-foreground" }
            : round.scheduledAt <= now
              ? { text: "Result due", tone: "bg-review text-review-foreground" }
              : istDaysBetween(now, round.scheduledAt) === 0
                ? { text: "Today", tone: "bg-review text-review-foreground" }
                : { text: "Upcoming", tone: "bg-selected text-selected-foreground" };
  const label = roundKindLabel[round.kind];
  return (
    <li
      className={cn(
        "rounded-2xl px-4 py-3 ring-1",
        round.outcome === "SCHEDULED" ? "bg-warning-soft/60 ring-review/50" : "bg-card ring-border",
      )}
    >
      <div className="flex items-center gap-3">
        <span className="w-6 text-sm text-muted-foreground tabular-nums">{index + 1}</span>
        <span
          aria-hidden
          className={cn("size-2.5 shrink-0 rounded-full", familyFill[roundFamily(round.kind)])}
        />
        <div className="min-w-0 flex-1">
          <p className="m-0 font-medium">
            {label}
            {round.name && round.name !== label ? ` · ${round.name}` : ""}
          </p>
          <p className="m-0 text-sm text-muted-foreground">
            {round.scheduledAt ? formatDayTime(round.scheduledAt) : "No date recorded"}
          </p>
        </div>
        <span className={cn("rounded-full px-2.5 py-0.5 text-xs", status.tone)}>{status.text}</span>
      </div>
      {round.notes && <p className="m-0 mt-2 pl-9 text-sm text-muted-foreground">{round.notes}</p>}
      <details className="mt-2 pl-9">
        <summary className="py-1 text-sm">Edit round</summary>
        <ActionForm action={updateRound} className="mt-2 space-y-3">
          <input type="hidden" name="id" value={round.id} />
          <div className="flex flex-wrap gap-3">
            <label className="w-48 text-sm">
              Round name
              <input className="mt-1" name="name" maxLength={200} defaultValue={round.name} />
            </label>
            <label className="w-40 text-sm">
              Round date
              <input
                className="mt-1"
                type="date"
                name="day"
                defaultValue={round.scheduledAt ? indiaDate(round.scheduledAt) : ""}
              />
            </label>
            <label className="w-32 text-sm">
              Round time
              <input
                className="mt-1"
                type="time"
                name="time"
                defaultValue={round.scheduledAt ? istClock(round.scheduledAt) : ""}
              />
            </label>
          </div>
          <label className="block text-sm">
            Round notes
            <textarea
              name="notes"
              rows={2}
              maxLength={5000}
              defaultValue={round.notes}
              className="mt-1 !min-h-16"
            />
          </label>
          <Button variant="outline">Save round</Button>
        </ActionForm>
      </details>
    </li>
  );
}
```

- [ ] **Step 6: Replace `src/app/applications/[id]/page.tsx`**

```tsx
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { resumes, resumeVersions } from "@/db/schema";
import { getDisplayPreferences } from "@/features/candidate/preferences";
import { readApplications } from "@/features/applications/read";
import { ApplicationDetail } from "@/features/applications/views/detail";

export const dynamic = "force-dynamic";

export default async function ApplicationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ outcome?: string }>;
}) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const query = await searchParams;
  const [{ records }, versions, preferences] = await Promise.all([
    readApplications(),
    db
      .select({ version: resumeVersions, family: resumes })
      .from(resumeVersions)
      .innerJoin(resumes, eq(resumeVersions.resumeId, resumes.id)),
    getDisplayPreferences(),
  ]);
  const record = records.find((row) => row.id === id);
  if (!record) notFound();
  return (
    <ApplicationDetail
      record={record}
      linked={records.filter((row) => record.linkedIds.includes(row.id))}
      versions={versions.map(({ version, family }) => ({
        id: version.id,
        label: `${family.name} / ${version.versionLabel} / ${version.originalFilename}`,
      }))}
      preferences={preferences}
      now={new Date()}
      requested={query.outcome}
    />
  );
}
```

- [ ] **Step 7: Remove the stage-dropdown code.** Delete `src/features/applications/form.tsx`. In `src/features/applications/actions.ts` delete `inputSchema`, `input`, `createApplication` and `updateApplication`, keeping the imports `addApplicationNote` needs (`z`, `revalidatePath`, `db`, `applicationEvents`, `activityLogs`, `actionError`, `formString`, `ActionState`). Run `grep -rn "createApplication\|updateApplication\|ApplicationForm" src` — expected: no matches.

- [ ] **Step 8: Update the existing browser tests that used the stage dropdown.**

In `tests/e2e/simple-records.spec.ts`, replace lines 33–55 (from `await page.getByRole("button", { name: "Save outreach record" }).click();` to the end of that test) with:

```ts
  await page.getByRole("button", { name: "Save outreach record" }).click();
  await expect(page).toHaveURL(/\/applications\/[0-9a-f-]+$/);
  const referralPath = new URL(page.url()).pathname;
  const history = page.getByRole("region", { name: "History" });
  await expect(history).toContainText("Referral recorded as sent");
  await expect(page.getByText("Sent", { exact: true })).toBeVisible();
  await page.goto(`/applications?tab=records&filter=all&q=${encodeURIComponent(company)}`);
  await expect(page.getByText("Applied directly")).toHaveCount(0);
  await expect(page.getByText(/Referral ask/).first()).toBeVisible();
  await page.goto(`/applications/new?jobId=${jobId}`);
  await page.getByLabel("Resume file used").selectOption({ index: 1 });
  await page.getByLabel("What happened?").selectOption("sent");
  await page.getByRole("button", { name: "Save application record" }).click();
  await expect(page).toHaveURL(/\/applications\/[0-9a-f-]+$/);
  await expect(history).toContainText("Direct application recorded as sent");
  await expect(page.getByLabel("Resume version used")).toHaveCount(0);
  await page.getByRole("button", { name: "Round scheduled", exact: true }).click();
  await page.getByLabel("Round", { exact: true }).selectOption("DSA");
  await page.getByLabel("Date (India time)").fill("2026-12-01");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(history).toContainText("DSA round scheduled");
  await expect(page.getByTestId("phase-label")).toHaveText(/Interviewing/);
  await page.goto(`/applications?tab=records&filter=interviewing&q=${encodeURIComponent(company)}`);
  await expect(page.getByRole("link", { name: company, exact: true })).toHaveCount(1);
  await page.goto(referralPath);
  await expect(page.getByText("Sent", { exact: true })).toBeVisible();
});
```

In the same file, in "a prepared action becomes sent…", replace `await expect(page.locator(".timeline")).toContainText("2026-09-01");` with `await expect(page.getByRole("region", { name: "History" })).toContainText("2026-09-01");`, and replace everything from `await page.getByLabel("Application stage", { exact: true }).selectOption("APPLIED");` to the end of the test with:

```ts
  await page.getByLabel("What happened?").selectOption("sent");
  await page.locator("summary").filter({ hasText: "Date, destination and notes" }).click();
  await page.getByLabel("Date sent (India time)").fill("2026-09-01");
  await page.getByRole("button", { name: "Save application record" }).click();
  await page.reload();
  await expect(page.getByText(/Applied 2026-09-01/)).toBeVisible();
  await expect(page.getByLabel("Date sent (India time)")).toHaveCount(0);
});
```

In `tests/e2e/workspace.spec.ts` ("linking imported mail appends history…"), replace `const previousStage = await page.getByLabel("Application stage").inputValue();` with `const previousPhase = await page.getByTestId("phase-label").innerText();`, replace `await expect(page.getByLabel("Application stage")).toHaveValue(previousStage);` with `await expect(page.getByTestId("phase-label")).toHaveText(previousPhase);`, and replace `page.locator(".timeline")` with `page.getByRole("region", { name: "History" })`.

- [ ] **Step 9: Run the browser tests**

Run: `npm run typecheck && npm run lint && npm test && npm run test:e2e -- tests/e2e/applications.spec.ts tests/e2e/simple-records.spec.ts tests/e2e/workspace.spec.ts tests/e2e/resumes.spec.ts`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add -A src/features/applications src/app/applications tests/e2e
git commit -m "JOB_FINDER-9999: Record application progress as outcomes" -m "Replace the stage dropdown with outcome chips, a rounds list, follow-up dates, linked records and one history on a two-column record page." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Next and Records end to end, Home links

**Files:**

- Modify: `tests/e2e/applications.spec.ts` (two tests), `tests/e2e/action-home.spec.ts` (phone list)
- Modify: `src/features/workspace/home.tsx:14,21,26`

**Interfaces:**

- Consumes: Tasks 6–8.

- [ ] **Step 1: Add the failing browser tests** to `tests/e2e/applications.spec.ts`:

```ts
test("a quiet referral shows up in Next and leaves once a follow-up is recorded", async ({
  page,
}) => {
  const company = `Quiet Co ${Date.now()}`;
  const { applicationId } = await seedRecord({
    company,
    source: "REFERRAL",
    sentDaysAgo: 6,
    contact: "Fictional Contact",
  });
  await page.goto("/applications");
  const slipped = page.getByRole("region", { name: /slipped past/ });
  const pill = slipped.getByRole("link", { name: new RegExp(`${company}.*Record follow-up`) });
  await expect(pill).toBeVisible();
  await pill.click();
  await expect(page).toHaveURL(new RegExp(`/applications/${applicationId}\\?outcome=followup`));
  await expect(page.getByRole("button", { name: "Sent a follow-up", exact: true })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("region", { name: "History" })).toContainText("Sent a follow-up");
  await page.goto("/applications");
  await expect(page.getByRole("link", { name: new RegExp(company) })).toHaveCount(0);
  await page.goto(`/applications?tab=records&filter=waiting&q=${encodeURIComponent(company)}`);
  await expect(page.getByRole("link", { name: company, exact: true })).toBeVisible();
  await expect(page.getByText("0d of 5")).toBeVisible();
});

test("a follow-up date appears today and snoozing hides it until undone", async ({ page }) => {
  const company = `Follow Up Co ${Date.now()}`;
  const note = `Check portal ${company}`;
  const { applicationId } = await seedRecord({ company, source: "DIRECT", sentDaysAgo: 1 });
  await page.goto(`/applications/${applicationId}`);
  await page.getByRole("button", { name: "Set a follow-up" }).click();
  await page.getByLabel("Follow-up date").fill(istDay(0));
  await page.getByLabel("What to do").fill(note);
  await page.getByRole("button", { name: "Save follow-up" }).click();
  await expect(page.getByRole("button", { name: /Follow up on/ })).toBeVisible();
  await page.goto("/applications");
  const row = page.getByRole("listitem").filter({ hasText: note });
  await expect(row).toHaveCount(1);
  await row.getByRole("button", { name: /Snooze/ }).click();
  await expect(page.getByRole("status").filter({ hasText: "Snoozed for 2 days" })).toContainText(
    note,
  );
  await expect(page.getByRole("listitem").filter({ hasText: note })).toHaveCount(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByRole("listitem").filter({ hasText: note })).toHaveCount(1);
});

test("a record staged by the old dropdown still offers the right next steps", async ({ page }) => {
  const company = `Legacy Stage Co ${Date.now()}`;
  const { applicationId } = await seedRecord({
    company,
    source: "DIRECT",
    sentDaysAgo: 10,
    status: "TECHNICAL_INTERVIEW",
  });
  await page.goto(`/applications/${applicationId}`);
  await expect(page.getByTestId("phase-label")).toHaveText("Interviewing");
  await expect(page.getByRole("button", { name: "Round scheduled", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Got an offer", exact: true })).toBeVisible();
  await page.goto(`/applications?tab=records&filter=interviewing&q=${encodeURIComponent(company)}`);
  await expect(page.getByText("No rounds recorded").first()).toBeVisible();
});
```

In `tests/e2e/action-home.spec.ts` ("core pages fit a phone…"), add `"/applications?tab=records&filter=all"` after `"/applications"` in the path list.

- [ ] **Step 2: Run them**

Run: `npm run test:e2e -- tests/e2e/applications.spec.ts tests/e2e/action-home.spec.ts`
Expected: PASS for the new tests (Tasks 5–8 already implement them). If the follow-up test fails because the row is not under Today, check that `setFollowUp` stores 09:00 IST of the chosen day; a run between 00:00 and 09:00 IST still lands in Today.

- [ ] **Step 3: Point Home at the new tabs.** In `src/features/workspace/home.tsx` change the three stat links:

```ts
      href: "/applications?tab=records&filter=active",
```

```ts
      href: "/applications?tab=records&filter=interviewing",
```

```ts
      href: "/applications?tab=records&filter=interviewing",
```

- [ ] **Step 4: Run the full suites**

Run: `npm run typecheck && npm run lint && npm test && npm run test:e2e`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e src/features/workspace/home.tsx
git commit -m "JOB_FINDER-9999: Cover the Next queue and records in browser tests" -m "Check that quiet outreach surfaces and clears, follow-ups snooze with undo, the records tab fits a phone, and Home links open the new tabs." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**Phase 1 is shippable here.** Ask the user to try it on their real data before Phase 2.

---

# Phase 2 — Emails tab

### Task 10: Mail triage rules

**Files:**

- Create: `src/features/mail/triage.ts`
- Test: `tests/mail-triage.test.ts`

**Interfaces:**

- Consumes: `MailClassification` (`@/services/mail/classifier`), `OutcomeId` (phase), `QueueMail` (queue).
- Produces: `Bucket`, `isJobAlert(sender)`, `bucketOf({ sender, classification, recordId })`, `suggestedOutcome: Record<MailClassification, OutcomeId | null>`, `linkHref(message, recordId)`, `TriageInput`, `queueMailFrom(messages)`.

- [ ] **Step 1: Write the failing tests** `tests/mail-triage.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { bucketOf, isJobAlert, linkHref, queueMailFrom } from "@/features/mail/triage";

const id = "00000000-0000-4000-8000-000000000123";
const record = "00000000-0000-4000-8000-000000000456";

describe("triage buckets", () => {
  it("recognises job-alert senders without trusting look-alike domains", () => {
    expect(isJobAlert("alerts@mailer.naukri.com")).toBe(true);
    expect(isJobAlert("jobs-noreply@linkedin.com")).toBe(true);
    expect(isJobAlert("hr@linkedin.com")).toBe(false);
    expect(isJobAlert("jobs@naukri.com.example")).toBe(false);
  });
  it("sorts updates, new roles and noise", () => {
    expect(
      bucketOf({ sender: "talent@razorpay.com", classification: "INTERVIEW", recordId: null }),
    ).toBe("updates");
    expect(
      bucketOf({ sender: "neha@inmobi.com", classification: "RECRUITER_OUTREACH", recordId: null }),
    ).toBe("roles");
    expect(
      bucketOf({
        sender: "neha@inmobi.com",
        classification: "RECRUITER_OUTREACH",
        recordId: record,
      }),
    ).toBe("updates");
    expect(
      bucketOf({
        sender: "careers@flipkart.com",
        classification: "APPLICATION_ACKNOWLEDGEMENT",
        recordId: record,
      }),
    ).toBe("noise");
    expect(
      bucketOf({ sender: "jobalerts@naukri.com", classification: "INTERVIEW", recordId: null }),
    ).toBe("noise");
  });
  it("links mail to its record with the suggested outcome", () => {
    expect(linkHref({ id, classification: "ASSESSMENT" }, record)).toBe(
      `/applications/${record}?mail=${id}&outcome=oa#what-happened`,
    );
    expect(linkHref({ id, classification: "UNKNOWN" }, record)).toBe(
      `/applications/${record}?mail=${id}#what-happened`,
    );
  });
  it("puts updates and new roles in Next, never noise", () => {
    const base = {
      sender: "x@example.invalid",
      senderName: "",
      receivedAt: new Date(),
      classification: "INTERVIEW" as const,
    };
    const items = queueMailFrom([
      {
        ...base,
        id,
        subject: "Interview",
        bucket: "updates",
        record: { id: record, company: "Uber" },
      },
      {
        ...base,
        id: record,
        subject: "New role",
        classification: "RECRUITER_OUTREACH",
        bucket: "roles",
        record: null,
      },
      {
        ...base,
        id: "00000000-0000-4000-8000-000000000789",
        subject: "Alert",
        bucket: "noise",
        record: null,
      },
    ]);
    expect(items.map((item) => [item.title, item.primary.label])).toEqual([
      ["Interview", "Link and update"],
      ["New role", "Save as opening"],
    ]);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/mail-triage.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/features/mail/triage.ts`**

```ts
import type { OutcomeId } from "@/features/applications/phase";
import type { QueueMail } from "@/features/applications/queue";
import type { MailClassification } from "@/services/mail/classifier";

export type Bucket = "updates" | "roles" | "noise";

const alertDomains = ["naukri.com", "instahyre.com", "foundit.in"];
const alertAddresses = ["jobs-noreply@linkedin.com", "jobalerts-noreply@linkedin.com"];
export function isJobAlert(sender: string) {
  const address = sender.trim().toLowerCase();
  const domain = address.split("@")[1] ?? "";
  return (
    alertAddresses.includes(address) ||
    alertDomains.some((name) => domain === name || domain.endsWith(`.${name}`))
  );
}

const updateKinds: MailClassification[] = [
  "INTERVIEW",
  "ASSESSMENT",
  "OFFER",
  "REJECTION",
  "FOLLOW_UP",
];
export function bucketOf(message: {
  sender: string;
  classification: MailClassification;
  recordId: string | null;
}): Bucket {
  if (isJobAlert(message.sender)) return "noise";
  if (updateKinds.includes(message.classification)) return "updates";
  if (message.classification === "RECRUITER_OUTREACH")
    return message.recordId ? "updates" : "roles";
  return "noise";
}

/** Acknowledgements are linked without an outcome; they are not a reply (spec §5.1). */
export const suggestedOutcome: Record<MailClassification, OutcomeId | null> = {
  ASSESSMENT: "oa",
  INTERVIEW: "scheduled",
  OFFER: "offer",
  REJECTION: "rejected",
  FOLLOW_UP: "heard",
  RECRUITER_OUTREACH: "heard",
  APPLICATION_ACKNOWLEDGEMENT: null,
  UNKNOWN: null,
};

export function linkHref(
  message: { id: string; classification: MailClassification },
  recordId: string,
) {
  const outcome = suggestedOutcome[message.classification];
  return `/applications/${recordId}?mail=${message.id}${outcome ? `&outcome=${outcome}` : ""}#what-happened`;
}

export type TriageInput = {
  id: string;
  subject: string;
  sender: string;
  senderName: string;
  receivedAt: Date;
  classification: MailClassification;
  bucket: Bucket;
  record: { id: string; company: string } | null;
};

export function queueMailFrom(messages: TriageInput[]): QueueMail[] {
  return messages
    .filter((message) => message.bucket !== "noise")
    .map((message) => ({
      id: message.id,
      title: message.subject,
      detail: message.record
        ? `${message.senderName || message.sender} · ${message.record.company}`
        : message.senderName || message.sender,
      receivedAt: message.receivedAt,
      primary:
        message.bucket === "roles"
          ? { label: "Save as opening", href: `/jobs/new?fromMail=${message.id}` }
          : message.record
            ? { label: "Link and update", href: linkHref(message, message.record.id) }
            : { label: "Choose record", href: `/mail/${message.id}` },
    }));
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/mail-triage.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/mail/triage.ts tests/mail-triage.test.ts
git commit -m "JOB_FINDER-9999: Sort recruiting mail into updates, new roles and noise" -m "Recognise job-alert senders, suggest an outcome per classification and feed actionable mail into the Next queue." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Emails tab with linking and dismissal

**Files:**

- Create: `src/features/mail/read.ts`, `src/features/mail/triage-actions.ts`, `src/features/applications/views/emails.tsx`, `src/features/applications/views/record-picker.tsx`
- Modify: `src/features/applications/outcome-service.ts` (add `resolveMail`, `mailMessageId`), `src/features/applications/outcomes.ts` (pass `mailId`), `views/outcome-chips.tsx` (mail banner), `views/detail.tsx`, `src/app/applications/[id]/page.tsx`, `src/app/applications/page.tsx`

**Interfaces:**

- Consumes: Task 10; `applyOutcome`.
- Produces: `resolveMail(tx, mailId, applicationId, now)`; `applyOutcome` input gains `mailMessageId?: string`; `TriageMessage`, `TriageData`, `readMailTriage(records)`; actions `dismissMail` (repeated `mailId`), `undoDismiss` (`mailId`), `linkMailOnly` (`mailId`, `recordId`); `EmailsView({ data, records, refresh, notice })`; `RecordPicker({ mailId, outcome, records })`; `OutcomeChips` gains `mailId?: string | null`; `ApplicationDetail` gains `mail?: { id; subject } | null`.

- [ ] **Step 1: Add mail resolution to the outcome service.** In `src/features/applications/outcome-service.ts`, extend the schema import with `mailEvents, mailMessages`, import `and` from drizzle-orm, and add:

```ts
/** Link a message to a record and close its review event. */
export async function resolveMail(tx: Tx, mailId: string, applicationId: string, now: Date) {
  const [message] = await tx
    .update(mailMessages)
    .set({ linkedApplicationId: applicationId, processedAt: now, attentionState: "DONE" })
    .where(eq(mailMessages.id, mailId))
    .returning({
      id: mailMessages.id,
      subject: mailMessages.subject,
      classification: mailMessages.classification,
      receivedAt: mailMessages.receivedAt,
    });
  if (!message) throw new Error("This message no longer exists.");
  await tx
    .update(mailEvents)
    .set({ status: "REVIEWED", linkedApplicationId: applicationId })
    .where(and(eq(mailEvents.mailMessageId, mailId), eq(mailEvents.status, "NEEDS_REVIEW")));
  return message;
}
```

Change the `applyOutcome` input type to `{ applicationId: string; outcome: OutcomeId; detail: OutcomeDetail; mailMessageId?: string }`, add `mailMessageId: input.mailMessageId ?? null` to the event `payload`, and after the event insert add:

```ts
if (input.mailMessageId) await resolveMail(tx, input.mailMessageId, app.id, now);
```

In `src/features/applications/outcomes.ts`, read the optional mail id and pass it through:

```ts
const mailId = formString(form, "mailId");
const mailMessageId = mailId ? z.uuid().parse(mailId) : undefined;
```

and call `applyOutcome(tx, { applicationId, outcome: id, detail, mailMessageId }, now)`.

- [ ] **Step 2: Create `src/features/mail/read.ts`**

```ts
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { mailEvents, mailMessages } from "@/db/schema";
import { bucketOf, type TriageInput } from "./triage";

export type TriageMessage = TriageInput & {
  snippet: string;
  record: { id: string; company: string; role: string } | null;
};
export type TriageData = {
  messages: TriageMessage[];
  handled: number;
  lastDismissedId: string | null;
};

export async function readMailTriage(
  records: { id: string; company: string; role: string }[],
): Promise<TriageData> {
  const byId = new Map(records.map((record) => [record.id, record]));
  const [open, handled, [lastDismissed]] = await Promise.all([
    db
      .select({ message: mailMessages, event: mailEvents })
      .from(mailEvents)
      .innerJoin(mailMessages, eq(mailMessages.id, mailEvents.mailMessageId))
      .where(eq(mailEvents.status, "NEEDS_REVIEW"))
      .orderBy(desc(mailMessages.receivedAt)),
    db.$count(mailEvents, inArray(mailEvents.status, ["REVIEWED", "DISMISSED"])),
    db
      .select({ id: mailMessages.id })
      .from(mailEvents)
      .innerJoin(mailMessages, eq(mailMessages.id, mailEvents.mailMessageId))
      .where(eq(mailEvents.status, "DISMISSED"))
      .orderBy(desc(mailMessages.processedAt))
      .limit(1),
  ]);
  const messages = open.map(({ message, event }) => {
    const suggested = event.details.suggestedApplicationId;
    const record = typeof suggested === "string" ? (byId.get(suggested) ?? null) : null;
    return {
      id: message.id,
      subject: message.subject,
      sender: message.sender,
      senderName: message.senderName,
      snippet: message.snippet,
      receivedAt: message.receivedAt,
      classification: message.classification,
      record,
      bucket: bucketOf({
        sender: message.sender,
        classification: message.classification,
        recordId: record?.id ?? null,
      }),
    };
  });
  return { messages, handled, lastDismissedId: lastDismissed?.id ?? null };
}
```

- [ ] **Step 3: Create `src/features/mail/triage-actions.ts`**

```ts
"use server";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import {
  activityLogs,
  applicationEvents,
  applications,
  mailEvents,
  mailMessages,
} from "@/db/schema";
import { resolveMail } from "@/features/applications/outcome-service";
import { actionError, formString, type ActionState } from "@/lib/actions";

function refresh(recordId?: string) {
  revalidatePath("/applications");
  if (recordId) revalidatePath(`/applications/${recordId}`);
  revalidatePath("/");
}

export async function dismissMail(_state: ActionState, form: FormData): Promise<ActionState> {
  try {
    const ids = z.array(z.uuid()).min(1).max(200).parse(form.getAll("mailId").map(String));
    const now = new Date();
    await db.transaction(async (tx) => {
      await tx
        .update(mailEvents)
        .set({ status: "DISMISSED" })
        .where(and(inArray(mailEvents.mailMessageId, ids), eq(mailEvents.status, "NEEDS_REVIEW")));
      await tx
        .update(mailMessages)
        .set({ attentionState: "DONE", processedAt: now })
        .where(inArray(mailMessages.id, ids));
      await tx.insert(activityLogs).values({
        action: "MAIL_DISMISSED",
        entityType: "MAIL",
        summary: `Dismissed ${ids.length} recruiting ${ids.length === 1 ? "message" : "messages"}`,
      });
    });
    refresh();
    return { success: ids.length === 1 ? "Dismissed." : `Dismissed ${ids.length} messages.` };
  } catch (error) {
    return actionError(error);
  }
}

export async function undoDismiss(_state: ActionState, form: FormData): Promise<ActionState> {
  try {
    const id = z.uuid().parse(formString(form, "mailId"));
    await db.transaction(async (tx) => {
      await tx
        .update(mailEvents)
        .set({ status: "NEEDS_REVIEW" })
        .where(and(eq(mailEvents.mailMessageId, id), eq(mailEvents.status, "DISMISSED")));
      await tx
        .update(mailMessages)
        .set({ attentionState: "OPEN", processedAt: null })
        .where(eq(mailMessages.id, id));
    });
    refresh();
    return { success: "Message restored." };
  } catch (error) {
    return actionError(error);
  }
}

/** Link without an outcome. An acknowledgement moves a fresh application to Acknowledged. */
export async function linkMailOnly(_state: ActionState, form: FormData): Promise<ActionState> {
  try {
    const data = z
      .object({ mailId: z.uuid(), recordId: z.uuid() })
      .parse({ mailId: formString(form, "mailId"), recordId: formString(form, "recordId") });
    await db.transaction(async (tx) => {
      const [app] = await tx
        .select()
        .from(applications)
        .where(eq(applications.id, data.recordId))
        .for("update");
      if (!app) throw new Error("Choose an existing record.");
      const now = new Date();
      const message = await resolveMail(tx, data.mailId, app.id, now);
      if (message.classification === "APPLICATION_ACKNOWLEDGEMENT" && app.status === "APPLIED") {
        await tx
          .update(applications)
          .set({ status: "ACKNOWLEDGED", updatedAt: now })
          .where(eq(applications.id, app.id));
        await tx.insert(applicationEvents).values({
          applicationId: app.id,
          eventType: "ACKNOWLEDGEMENT_RECEIVED",
          occurredAt: message.receivedAt,
          summary: `Application acknowledged: ${message.subject}`,
          payload: { mailMessageId: message.id },
        });
      }
      await tx.insert(activityLogs).values({
        action: "MAIL_LINKED",
        entityType: "MAIL",
        entityId: data.mailId,
        summary: "Linked recruiting mail to a record",
      });
    });
    refresh(data.recordId);
    return { success: "Message linked to your record." };
  } catch (error) {
    return actionError(error);
  }
}
```

- [ ] **Step 4: Create `src/features/applications/views/record-picker.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

export function RecordPicker({
  mailId,
  outcome,
  records,
}: {
  mailId: string;
  outcome: string | null;
  records: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [recordId, setRecordId] = useState("");
  return (
    <div className="flex w-full flex-wrap items-center gap-1.5">
      <label htmlFor={`pick-${mailId}`} className="sr-only">
        Record for this message
      </label>
      <select
        id={`pick-${mailId}`}
        value={recordId}
        onChange={(event) => setRecordId(event.target.value)}
        className="!min-h-8 flex-1 !py-1 text-sm"
      >
        <option value="">Choose a record</option>
        {records.map((record) => (
          <option key={record.id} value={record.id}>
            {record.label}
          </option>
        ))}
      </select>
      <Button
        size="sm"
        className="h-8 rounded-full px-3"
        disabled={!recordId}
        onClick={() =>
          router.push(
            `/applications/${recordId}?mail=${mailId}${outcome ? `&outcome=${outcome}` : ""}#what-happened`,
          )
        }
      >
        Link and update
      </Button>
    </div>
  );
}
```

- [ ] **Step 5: Create `src/features/applications/views/emails.tsx`**

```tsx
import Link from "next/link";
import type { ReactNode } from "react";
import { Archive, BriefcaseBusiness, Link2 } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui";
import type { TriageData, TriageMessage } from "@/features/mail/read";
import { linkHref, suggestedOutcome, type Bucket } from "@/features/mail/triage";
import { dismissMail, linkMailOnly, undoDismiss } from "@/features/mail/triage-actions";
import { formatDay } from "../dates";
import { RecordPicker } from "./record-picker";

const buckets: { id: Bucket; title: string; note: string }[] = [
  {
    id: "updates",
    title: "Updates on your records",
    note: "Link them so the queue and rounds stay current.",
  },
  {
    id: "roles",
    title: "New roles for you",
    note: "Recruiters reaching out. Save the ones worth a look.",
  },
  { id: "noise", title: "Probably noise", note: "Job alerts and automatic replies." },
];

export function EmailsView({
  data,
  records,
  refresh,
  notice,
}: {
  data: TriageData;
  records: { id: string; label: string }[];
  refresh: ReactNode;
  notice?: string;
}) {
  const open = data.messages.length;
  return (
    <div className="space-y-5">
      {notice && (
        <p
          role="status"
          className="m-0 rounded-2xl bg-selected px-4 py-3 text-sm text-selected-foreground"
        >
          {notice}
        </p>
      )}
      <div className="space-y-3 rounded-3xl bg-selected/60 px-5 py-4">
        <p className="m-0 text-selected-foreground">
          <strong className="tabular-nums">{open}</strong>{" "}
          {open === 1 ? "message needs" : "messages need"} a decision
        </p>
        {refresh}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {buckets.map((bucket) => {
          const rows = data.messages.filter((message) => message.bucket === bucket.id);
          return (
            <section
              key={bucket.id}
              aria-labelledby={`bucket-${bucket.id}`}
              className="flex min-w-0 flex-col rounded-3xl bg-card p-4 ring-1 ring-border"
            >
              <h2 id={`bucket-${bucket.id}`} className="m-0 text-base font-semibold">
                {bucket.title}{" "}
                <span className="font-normal text-muted-foreground tabular-nums">
                  {rows.length}
                </span>
              </h2>
              <p className="m-0 mt-0.5 text-xs text-muted-foreground">{bucket.note}</p>
              <ul className="m-0 mt-3 flex-1 list-none space-y-2 p-0">
                {rows.map((message) => (
                  <MailCard key={message.id} message={message} records={records} />
                ))}
                {!rows.length && (
                  <li className="rounded-2xl border border-dashed border-border px-3 py-5 text-center text-sm text-muted-foreground">
                    All clear
                  </li>
                )}
              </ul>
              {bucket.id === "noise" && rows.length > 1 && (
                <ActionForm action={dismissMail} className="mt-3" pendingLabel="Dismissing">
                  {rows.map((message) => (
                    <input key={message.id} type="hidden" name="mailId" value={message.id} />
                  ))}
                  <Button variant="ghost" size="sm" className="h-8 px-3">
                    <Archive size={14} aria-hidden />
                    Dismiss all {rows.length}
                  </Button>
                </ActionForm>
              )}
            </section>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <span>{data.handled} handled</span>
        {data.lastDismissedId && (
          <ActionForm action={undoDismiss} className="contents" pendingLabel="Restoring">
            <input type="hidden" name="mailId" value={data.lastDismissedId} />
            <button className="border-0 bg-transparent p-0 text-link hover:underline">
              Undo last dismiss
            </button>
          </ActionForm>
        )}
        <Link href="/mail/import" className="text-link">
          Import messages
        </Link>
      </div>
    </div>
  );
}

function MailCard({
  message,
  records,
}: {
  message: TriageMessage;
  records: { id: string; label: string }[];
}) {
  return (
    <li className="rounded-2xl bg-background/60 p-3 ring-1 ring-border">
      <p className="m-0 flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="truncate">{message.senderName || message.sender}</span>
        <span className="tabular-nums">{formatDay(message.receivedAt)}</span>
      </p>
      <Link
        href={`/mail/${message.id}`}
        className="mt-1.5 block text-sm font-medium text-foreground"
      >
        {message.subject}
      </Link>
      {message.record && (
        <p className="m-0 mt-1 flex items-center gap-1 text-xs text-link">
          <Link2 size={11} aria-hidden />
          Matches {message.record.company} · {message.record.role}
        </p>
      )}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {message.bucket === "updates" &&
          (message.record ? (
            <Button size="sm" className="h-8 rounded-full px-3" asChild>
              <Link href={linkHref(message, message.record.id)}>Link and update</Link>
            </Button>
          ) : (
            <RecordPicker
              mailId={message.id}
              outcome={suggestedOutcome[message.classification]}
              records={records}
            />
          ))}
        {message.bucket === "roles" && (
          <Button size="sm" className="h-8 rounded-full px-3" asChild>
            <Link href={`/jobs/new?fromMail=${message.id}`}>
              <BriefcaseBusiness size={14} aria-hidden />
              Save as opening
            </Link>
          </Button>
        )}
        {message.bucket === "noise" && message.record && (
          <ActionForm action={linkMailOnly} className="contents" pendingLabel="Linking">
            <input type="hidden" name="mailId" value={message.id} />
            <input type="hidden" name="recordId" value={message.record.id} />
            <Button size="sm" variant="outline" className="h-8 rounded-full px-3">
              Link
            </Button>
          </ActionForm>
        )}
        <ActionForm action={dismissMail} className="contents" pendingLabel="Dismissing">
          <input type="hidden" name="mailId" value={message.id} />
          <Button
            size="sm"
            variant={message.bucket === "noise" ? "outline" : "ghost"}
            className="h-8 rounded-full px-3"
          >
            Dismiss
          </Button>
        </ActionForm>
      </div>
    </li>
  );
}
```

- [ ] **Step 6: Show the mail being linked on the record page.**

In `views/outcome-chips.tsx` add a prop `mailId?: string | null` and, inside the form after the `outcome` hidden input:

```tsx
{
  mailId && <input type="hidden" name="mailId" value={mailId} />;
}
```

In `views/detail.tsx` add a `mail?: { id: string; subject: string } | null` prop, pass `mailId={mail?.id ?? null}` to `OutcomeChips`, and import `linkMailOnly` from `@/features/mail/triage-actions`. The banner and the link-only form live in the detail view (not the chips) so they also show on Preparing and Closed records. Render them at the top of the progress card's `space-y-4` block:

```tsx
{
  mail && (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-selected px-4 py-2.5 text-sm text-selected-foreground">
      <span>Linking mail: {mail.subject}</span>
      <ActionForm action={linkMailOnly} className="contents" pendingLabel="Linking">
        <input type="hidden" name="mailId" value={mail.id} />
        <input type="hidden" name="recordId" value={record.id} />
        <Button variant="ghost" size="sm" className="h-8 px-3">
          Link without recording an outcome
        </Button>
      </ActionForm>
    </div>
  );
}
```

In `src/app/applications/[id]/page.tsx`, accept `mail?: string` in `searchParams`, import `and` from drizzle-orm and `mailEvents, mailMessages` from the schema, and load the message only while it still needs review:

```ts
const mailId = z.uuid().safeParse(query.mail).success ? query.mail! : null;
const [mail] = mailId
  ? await db
      .select({ id: mailMessages.id, subject: mailMessages.subject })
      .from(mailMessages)
      .innerJoin(mailEvents, eq(mailEvents.mailMessageId, mailMessages.id))
      .where(and(eq(mailMessages.id, mailId), eq(mailEvents.status, "NEEDS_REVIEW")))
      .limit(1)
  : [];
```

then pass `mail={mail ?? null}` to `ApplicationDetail`.

- [ ] **Step 7: Use the Emails view and mail in the Next queue.** In `src/app/applications/page.tsx`: accept `notice?: string`, import `readMailTriage`, `queueMailFrom` and `EmailsView`, then:

```ts
const triage = await readMailTriage(records);
const items = buildQueue({ records, mail: queueMailFrom(triage.messages), snoozes, now });
```

set `emails: triage.messages.length` in the tab counts, and replace the Emails placeholder with:

```tsx
{
  view.tab === "emails" && (
    <EmailsView
      data={triage}
      records={records
        .filter((record) => record.phase !== "Closed")
        .map((record) => ({ id: record.id, label: `${record.company} — ${record.role}` }))}
      refresh={<MailRefresh compact />}
      notice={params.notice?.slice(0, 300)}
    />
  );
}
```

- [ ] **Step 8: Typecheck, lint and look**

Run: `npm run typecheck && npm run lint && npm test`. Import a sample through `/mail/import` on the dev server and open `/applications?tab=emails`.
Expected: the message lands in a bucket; Dismiss removes it and "Undo last dismiss" restores it.

- [ ] **Step 9: Commit**

```bash
git add src/features/mail src/features/applications src/app/applications
git commit -m "JOB_FINDER-9999: Triage recruiting mail in the Applications Emails tab" -m "Show updates, new roles and noise with one action each, link mail through the outcome chips or without an outcome, and dismiss with undo." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Save a recruiter mail as an opening

**Files:**

- Create: `src/features/mail/handled.ts`
- Modify: `src/app/jobs/new/page.tsx`, `src/features/jobs/actions.ts:45-76`

**Interfaces:**

- Produces: `markMailSaved(mailId, jobId)`; `/jobs/new?fromMail=<id>` prefill; `addJob` reads optional `fromMailId`.

- [ ] **Step 1: Create `src/features/mail/handled.ts`**

```ts
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { activityLogs, mailEvents, mailMessages } from "@/db/schema";

/** A recruiter mail saved as an opening leaves the Emails tab. */
export async function markMailSaved(mailId: string, jobId: string) {
  await db.transaction(async (tx) => {
    await tx
      .update(mailEvents)
      .set({ status: "REVIEWED" })
      .where(and(eq(mailEvents.mailMessageId, mailId), eq(mailEvents.status, "NEEDS_REVIEW")));
    await tx
      .update(mailMessages)
      .set({ attentionState: "DONE", processedAt: new Date() })
      .where(eq(mailMessages.id, mailId));
    await tx.insert(activityLogs).values({
      action: "MAIL_SAVED_AS_OPENING",
      entityType: "MAIL",
      entityId: mailId,
      summary: "Saved a recruiter message as an opening",
      metadata: { jobId },
    });
  });
}
```

- [ ] **Step 2: Let `addJob` mark the mail.** In `src/features/jobs/actions.ts`, import `z` is already present; import `markMailSaved` from `@/features/mail/handled`. At the top of `addJob`'s `try`, add:

```ts
const fromMailId = formString(form, "fromMailId");
form.delete("fromMailId");
```

and just before `revalidatePath("/jobs");` add:

```ts
if (z.uuid().safeParse(fromMailId).success) {
  await markMailSaved(fromMailId, summary.ids[0]);
  revalidatePath("/applications");
}
```

- [ ] **Step 3: Prefill the form.** Make `src/app/jobs/new/page.tsx` async with `searchParams: Promise<{ fromMail?: string }>`; import `eq` from drizzle-orm, `z` from zod, `db` and `mailMessages`. Load the message:

```ts
const { fromMail } = await searchParams;
const [mail] = z.uuid().safeParse(fromMail).success
  ? await db.select().from(mailMessages).where(eq(mailMessages.id, fromMail!)).limit(1)
  : [];
```

Inside `<ActionForm action={addJob}>`, before the company/role grid, add:

```tsx
{
  mail && (
    <>
      <input type="hidden" name="fromMailId" value={mail.id} />
      <p className="m-0 rounded-2xl bg-selected px-4 py-3 text-sm text-selected-foreground">
        Saving a role from mail: {mail.subject}. Add the company, role and the job link from the
        message or the company&apos;s careers page.
      </p>
    </>
  );
}
```

Give the description textarea `defaultValue={mail ? mail.bodyText || mail.snippet : undefined}` and the notes textarea `defaultValue={mail ? `From ${mail.senderName || mail.sender}: ${mail.subject}` : undefined}`.

- [ ] **Step 4: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/features/mail/handled.ts src/features/jobs/actions.ts src/app/jobs/new/page.tsx
git commit -m "JOB_FINDER-9999: Save recruiter mail as an opening" -m "Prefill the new-opening form from the message and clear it from the Emails tab once saved." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Retire the old inbox and cover Emails end to end

**Files:**

- Replace: `src/app/inbox/page.tsx`, `src/app/mail/page.tsx`, `src/app/mail/review/page.tsx`
- Modify: `src/app/mail/[id]/page.tsx`, `src/components/app-shell.tsx:108-118`, `src/features/workspace/home.tsx:136-139`, `src/features/mail/actions.ts` (import redirect, remove `reviewMailEvent`), `src/app/api/gmail/callback/route.ts` (redirect target)
- Delete: `src/features/mail/review-form.tsx`, `src/features/mail/attention-actions.ts`
- Modify: `tests/e2e/action-home.spec.ts`, `tests/e2e/workspace.spec.ts`, `tests/e2e/applications.spec.ts`

- [ ] **Step 1: Write the failing browser tests.** Append to `tests/e2e/applications.spec.ts` (import `db` from `../../src/db` and `mailEvents, mailMessages` from the schema):

```ts
async function seedMail(input: {
  subject: string;
  sender?: string;
  classification: "ASSESSMENT" | "RECRUITER_OUTREACH" | "UNKNOWN";
  recordId?: string;
}) {
  const [message] = await db
    .insert(mailMessages)
    .values({
      externalId: `e2e-${input.subject}`,
      sender: input.sender ?? "talent@example.invalid",
      senderName: "Talent Team",
      subject: input.subject,
      snippet: `${input.subject} details`,
      bodyText: `${input.subject} full message`,
      receivedAt: new Date(),
      classification: input.classification,
    })
    .returning();
  await db.insert(mailEvents).values({
    mailMessageId: message.id,
    type: input.classification,
    confidence: 0.9,
    details: input.recordId ? { suggestedApplicationId: input.recordId } : {},
  });
  return message.id;
}

test("linking an assessment mail books the OA and clears the message", async ({ page }) => {
  const company = `Mail Link Co ${Date.now()}`;
  const subject = `Assessment invite ${Date.now()}`;
  const { applicationId } = await seedRecord({ company, source: "DIRECT", sentDaysAgo: 3 });
  await seedMail({ subject, classification: "ASSESSMENT", recordId: applicationId });
  await page.goto("/applications");
  await expect(page.getByText(subject)).toBeVisible();
  await page.goto("/applications?tab=emails");
  const updates = page.getByRole("region", { name: /Updates on your records/ });
  await updates
    .getByRole("listitem")
    .filter({ hasText: subject })
    .getByRole("link", { name: "Link and update" })
    .click();
  await expect(page.getByText(`Linking mail: ${subject}`)).toBeVisible();
  await expect(page.getByRole("button", { name: "Got an OA", exact: true })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await page.getByLabel("Complete by (India time)").fill(istDay(4));
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const history = page.getByRole("region", { name: "History" });
  await expect(history).toContainText("OA received");
  await expect(history).toContainText(subject);
  await page.goto("/applications?tab=emails");
  await expect(page.getByRole("link", { name: subject })).toHaveCount(0);
});

test("a recruiter mail becomes a saved opening", async ({ page }) => {
  const subject = `SDE-3 role ${Date.now()}`;
  await seedMail({ subject, classification: "RECRUITER_OUTREACH" });
  await page.goto("/applications?tab=emails");
  const roles = page.getByRole("region", { name: /New roles for you/ });
  await roles
    .getByRole("listitem")
    .filter({ hasText: subject })
    .getByRole("link", { name: "Save as opening" })
    .click();
  await expect(page.getByLabel("Job description")).toHaveValue(`${subject} full message`);
  await page.getByLabel("Company").fill(`Mail Role Co ${Date.now()}`);
  await page.getByLabel("Role / title").fill("SDE-3 Backend");
  await page.getByLabel("Original job URL").fill(`https://example.invalid/roles/${Date.now()}`);
  await page.getByRole("button", { name: "Save job", exact: true }).click();
  await expect(page).toHaveURL(/\/jobs\/[0-9a-f-]+$/);
  await page.goto("/applications?tab=emails");
  await expect(page.getByRole("link", { name: subject })).toHaveCount(0);
});

test("noise can be cleared in one action", async ({ page }) => {
  const first = `Job alert one ${Date.now()}`;
  const second = `Job alert two ${Date.now()}`;
  await seedMail({ subject: first, classification: "UNKNOWN", sender: "alerts@naukri.com" });
  await seedMail({ subject: second, classification: "UNKNOWN", sender: "alerts@naukri.com" });
  await page.goto("/applications?tab=emails");
  const noise = page.getByRole("region", { name: /Probably noise/ });
  await noise.getByRole("button", { name: /Dismiss all \d+/ }).click();
  await expect(page.getByRole("link", { name: first })).toHaveCount(0);
  await expect(page.getByRole("link", { name: second })).toHaveCount(0);
});
```

Replace the first test in `tests/e2e/action-home.spec.ts` ("inbox surfaces dated actions…") with (add `mailEvents` to the schema import):

```ts
test("emails triage dismisses a message and undo restores it", async ({ page }) => {
  const subject = `Interview test ${Date.now()}`;
  const [mail] = await db
    .insert(mailMessages)
    .values({
      externalId: subject,
      sender: "fictional@example.invalid",
      subject,
      receivedAt: new Date(),
      classification: "INTERVIEW",
      snippet: "Please confirm availability for your interview.",
    })
    .returning();
  await db
    .insert(mailEvents)
    .values({ mailMessageId: mail.id, type: "INTERVIEW", confidence: 0.9 });
  await page.goto("/inbox");
  await expect(page).toHaveURL(/\/applications\?tab=emails$/);
  const updates = page.getByRole("region", { name: /Updates on your records/ });
  await expect(updates.getByRole("link", { name: subject })).toBeVisible();
  await updates
    .getByRole("listitem")
    .filter({ hasText: subject })
    .getByRole("button", { name: "Dismiss" })
    .click();
  await expect(updates.getByRole("link", { name: subject })).toHaveCount(0);
  await page.getByRole("button", { name: "Undo last dismiss" }).click();
  await expect(updates.getByRole("link", { name: subject })).toBeVisible();
  expect(
    (await db.select().from(mailMessages).where(eq(mailMessages.id, mail.id)))[0].attentionState,
  ).toBe("OPEN");
});
```

In the phone-width test, replace `"/inbox"` with `"/applications?tab=emails"`.

In `tests/e2e/workspace.spec.ts` ("linking imported mail…"), replace everything from `await expect(page).toHaveURL(/\/mail$/);` to the end of the test with:

```ts
  await expect(page).toHaveURL(/\/applications\?tab=emails$/);
  await page.getByRole("link", { name: subject, exact: true }).click();
  await expect(page).toHaveURL(/\/mail\/[0-9a-f-]+$/);
  await page.getByLabel("Record for this message").selectOption(applicationId);
  await page.getByRole("button", { name: "Link and update" }).click();
  await expect(page.getByText(`Linking mail: ${subject}`)).toBeVisible();
  await page.getByRole("button", { name: "Link without recording an outcome" }).click();
  await expect(page.getByText("Message linked to your record.", { exact: true })).toBeVisible();
  await page.goto(`/applications/${applicationId}`);
  await expect(page.getByTestId("phase-label")).toHaveText(previousPhase);
  await expect(page.getByRole("region", { name: "History" })).toContainText(subject);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm run test:e2e -- tests/e2e/applications.spec.ts tests/e2e/action-home.spec.ts tests/e2e/workspace.spec.ts`
Expected: FAIL — `/inbox` still renders the old page, `/mail/[id]` has no record picker.

- [ ] **Step 3: Redirect the old mail pages.** Replace each of `src/app/inbox/page.tsx`, `src/app/mail/page.tsx` and `src/app/mail/review/page.tsx` with:

```tsx
import { redirect } from "next/navigation";

export default function MailRedirect() {
  redirect("/applications?tab=emails");
}
```

(Name the function `InboxPage`, `MailPage` and `MailReviewPage` respectively.)

- [ ] **Step 4: Give `/mail/[id]` the triage actions.** In `src/app/mail/[id]/page.tsx`:

- Replace the header action with `<Link href="/applications?tab=emails" className="button-secondary">Back to Emails</Link>`.
- Replace the `MailReviewForm` import with `RecordPicker` (`@/features/applications/views/record-picker`), `ActionForm`, `Button`, `dismissMail` (`@/features/mail/triage-actions`) and `linkHref`, `suggestedOutcome` (`@/features/mail/triage`).
- Replace the `{events.map((event) => (<Panel title="Link this message to a record" …>))}` block with:

```tsx
<Panel title="What to do with this message">
  {events.some((event) => event.status === "NEEDS_REVIEW") ? (
    <div className="flex flex-wrap items-center gap-2">
      {suggested && (
        <Button asChild size="sm">
          <Link href={linkHref(message, suggested.id)}>Link to {suggested.company}</Link>
        </Button>
      )}
      <RecordPicker
        mailId={message.id}
        outcome={suggestedOutcome[message.classification]}
        records={applicationOptions.map((option) => ({
          id: option.id,
          label: `${option.company} — ${option.title}`,
        }))}
      />
      <Button asChild size="sm" variant="outline">
        <Link href={`/jobs/new?fromMail=${message.id}`}>Save as opening</Link>
      </Button>
      <ActionForm action={dismissMail} className="contents" pendingLabel="Dismissing">
        <input type="hidden" name="mailId" value={message.id} />
        <Button size="sm" variant="ghost">
          Dismiss
        </Button>
      </ActionForm>
    </div>
  ) : (
    <p className="m-0 text-sm text-muted-foreground">
      {message.linkedApplicationId ? (
        <>
          Linked to <Link href={`/applications/${message.linkedApplicationId}`}>its record</Link>.
        </>
      ) : events.some((event) => event.status === "DISMISSED") ? (
        "Dismissed."
      ) : (
        "Handled."
      )}
    </p>
  )}
</Panel>
```

with, after loading `events` and `applicationOptions`:

```ts
const suggestedId = events.find((event) => typeof event.details.suggestedApplicationId === "string")
  ?.details.suggestedApplicationId;
const suggested = applicationOptions.find((option) => option.id === suggestedId);
```

- [ ] **Step 5: Update links and remove dead code.**

- `src/components/app-shell.tsx`: change the inbox link to `href="/applications?tab=emails"` and `aria-label="Emails"`, and keep it highlighted only for `pathname.startsWith("/mail")`.
- `src/features/workspace/home.tsx`: change the "Refresh Inbox" link to `href="/applications?tab=emails"` with text `Refresh your inboxes`.
- `src/features/mail/actions.ts`: delete `eventTypes`, `suggestedStages` and `reviewMailEvent` (and now-unused imports); in `importMail` change `redirect: "/mail"` to `redirect: "/applications?tab=emails"`; replace every `revalidatePath("/mail")`/`revalidatePath("/inbox")` with `revalidatePath("/applications")`.
- `src/app/api/gmail/callback/route.ts`: redirect to `/applications?tab=emails&notice=…` instead of `/mail?notice=…`.
- Delete `src/features/mail/review-form.tsx` and `src/features/mail/attention-actions.ts`.
- Run `grep -rn "review-form\|attention-actions\|reviewMailEvent\|\"/inbox\"\|href=\"/mail\"" src` — expected: no matches.

- [ ] **Step 6: Run everything**

Run: `npm run typecheck && npm run lint && npm test && npm run test:e2e`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add -A src tests/e2e
git commit -m "JOB_FINDER-9999: Move recruiting mail into Applications" -m "Redirect the old inbox and mail review pages to the Emails tab, add triage actions to the message page and cover linking, saving and dismissing in browser tests." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**Phase 2 is shippable here.**

---

# Phase 3 — Three inboxes

### Task 14: One table for all mail connections

**Files:**

- Modify: `src/db/schema.ts` (`gmailConnections` → `mailConnections`, `mailMessages.accountEmail`)
- Generate: `drizzle/0007_mail_connections.sql`, `drizzle/0008_copy_gmail_connections.sql` (custom), `drizzle/0009_drop_gmail_connections.sql`
- Modify: `src/services/mail/gmail.ts`, `src/features/mail/actions.ts`, `src/features/mail/refresh.tsx`, `src/features/mail/import.ts`, `src/app/settings/page.tsx`, `scripts/demo-cleanup.ts`, `tests/demo-cleanup.test.ts`
- Test: `tests/mail-connections-schema.test.ts`

**Interfaces:**

- Produces: `mailConnections` (`provider`, `email`, tokens, `lastSyncedAt`, `lastRefreshedAt`, `lastRefreshedCount`, `lastError`; unique `(provider, email)`), `mailMessages.accountEmail`, `importMailRecords(records, provider: "IMPORT" | "GMAIL" | "OUTLOOK", accountEmail?: string)`, cursor keys `mailCursor:<id>`.

- [ ] **Step 1: Write the failing test** `tests/mail-connections-schema.test.ts`:

```ts
import { expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import * as schema from "@/db/schema";

it("stores connections per provider and email, and which inbox received each message", () => {
  const config = getTableConfig(schema.mailConnections);
  expect(config.name).toBe("mail_connections");
  expect(config.columns.map((column) => column.name)).toEqual(
    expect.arrayContaining([
      "provider",
      "email",
      "last_refreshed_at",
      "last_refreshed_count",
      "last_error",
    ]),
  );
  expect(
    config.indexes.find((index) => index.config.name === "mail_connections_provider_email_idx")
      ?.config.unique,
  ).toBe(true);
  expect(getTableConfig(schema.mailMessages).columns.map((column) => column.name)).toContain(
    "account_email",
  );
  expect("gmailConnections" in schema).toBe(false);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/mail-connections-schema.test.ts`
Expected: FAIL — `mailConnections` undefined.

- [ ] **Step 3: Add the new table alongside the old one.** In `src/db/schema.ts`, add `accountEmail: text("account_email"),` to `mailMessages` after `recipient`, and add after `gmailConnections` (keep that table for now):

```ts
export const mailConnections = pgTable(
  "mail_connections",
  {
    id: id(),
    provider: text("provider").notNull().default("GMAIL"),
    email: text("email").notNull(),
    encryptedAccessToken: text("encrypted_access_token").notNull(),
    encryptedRefreshToken: text("encrypted_refresh_token"),
    tokenExpiresAt: date("token_expires_at"),
    lastSyncedAt: date("last_synced_at"),
    lastRefreshedAt: date("last_refreshed_at"),
    lastRefreshedCount: integer("last_refreshed_count"),
    lastError: text("last_error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("mail_connections_provider_email_idx").on(t.provider, t.email),
    check("mail_connections_provider", sql`${t.provider} IN ('GMAIL', 'OUTLOOK')`),
  ],
);
```

Run: `npm run db:generate -- --name mail_connections`
Expected: `0007_mail_connections.sql` with `CREATE TABLE "mail_connections"` and `ALTER TABLE "mail_messages" ADD COLUMN "account_email"`. No prompt.

- [ ] **Step 4: Copy existing rows and cursors.** Run `npx drizzle-kit generate --custom --name copy_gmail_connections` and put this in the created `0008_copy_gmail_connections.sql`:

```sql
INSERT INTO "mail_connections" ("id", "provider", "email", "encrypted_access_token", "encrypted_refresh_token", "token_expires_at", "last_synced_at", "created_at", "updated_at")
SELECT "id", 'GMAIL', "email", "encrypted_access_token", "encrypted_refresh_token", "token_expires_at", "last_synced_at", "created_at", "updated_at"
FROM "gmail_connections"
ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE "settings" SET "key" = 'mailCursor:' || substring("key" from 13) WHERE "key" LIKE 'gmailCursor:%';
```

- [ ] **Step 5: Move code to `mailConnections`.**

- `src/services/mail/gmail.ts`: import `and` and `mailConnections` (drop `gmailConnections`). In `exchangeGoogleCode`, look up the existing row with `and(eq(mailConnections.provider, "GMAIL"), eq(mailConnections.email, profile.emailAddress))`, add `provider: "GMAIL" as const` to `values`, and use `.onConflictDoUpdate({ target: [mailConnections.provider, mailConnections.email], set: values })`. Change the `connectionToken` and `readRecruitingMail` parameter types to `typeof mailConnections.$inferSelect` and the token update to `mailConnections`.
- `src/features/mail/import.ts`: change the signature to `importMailRecords(records: MailImportRecords, provider: "IMPORT" | "GMAIL" | "OUTLOOK", accountEmail?: string)` and insert `{ ...record, externalId, provider, accountEmail: accountEmail ?? null, classification: classification.type }`.
- `src/features/mail/actions.ts`: replace `gmailConnections` with `mailConnections`, cursor key `` `mailCursor:${id}` ``, and pass `connection.email` to `importMailRecords(…, "GMAIL", connection.email)`.
- `src/features/mail/refresh.tsx` and `src/app/settings/page.tsx`: select from `mailConnections` (`where(eq(mailConnections.provider, "GMAIL"))` in refresh).
- `scripts/demo-cleanup.ts` and `tests/demo-cleanup.test.ts`: replace `gmail_connections` with `mail_connections` (one table name and two test lines).

- [ ] **Step 6: Drop the old table.** Delete the `gmailConnections` table from `src/db/schema.ts`, then run `npm run db:generate -- --name drop_gmail_connections`.
      Expected: `0009_drop_gmail_connections.sql` containing only `DROP TABLE "gmail_connections"`.

- [ ] **Step 7: Ask the user, then migrate.** Tell the user that `0009` drops `gmail_connections` (currently 0 rows) after `0008` copies it, and wait for a yes. Then run `npm run db:migrate`.
      Expected: three migrations applied.

- [ ] **Step 8: Run the suites**

Run: `npx vitest run tests/mail-connections-schema.test.ts && npm run typecheck && npm run lint && npm test && npm run test:e2e`
Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add src/db/schema.ts drizzle src/services/mail src/features/mail src/app/settings/page.tsx scripts/demo-cleanup.ts tests/demo-cleanup.test.ts tests/mail-connections-schema.test.ts
git commit -m "JOB_FINDER-9999: Store Gmail and Outlook connections in one table" -m "Replace gmail_connections with mail_connections keyed by provider and email, keep refresh cursors, and record which inbox received each message." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Mail provider interface with Gmail behind it

**Files:**

- Create: `src/services/mail/providers/types.ts`, `oauth.ts`, `gmail.ts`, `connections.ts`, `index.ts`, `oauth.test.ts`, `gmail.test.ts`
- Create: `src/features/mail/refresh-service.ts`
- Create: `src/app/api/mail/[provider]/connect/route.ts`, `src/app/api/mail/[provider]/callback/route.ts`
- Delete: `src/services/mail/gmail.ts`, `src/services/mail/gmail.test.ts`, `src/app/api/gmail/`
- Modify: `src/services/mail/crypto.ts` (+ `crypto.test.ts`), `src/features/mail/actions.ts`, `src/features/mail/refresh.tsx`, `src/app/settings/page.tsx`, `.env.example`

**Interfaces:**

- Produces:
  - `ProviderId = "GMAIL" | "OUTLOOK"`, `TokenSet`, `Cursor`, `MailConnection`, `MailProvider { id; slug; label; configuration(); authorizeUrl(state, challenge); exchangeCode(code, verifier); refreshTokens(refreshToken); listRecruitingMail(accessToken, connection, cursor?) }`.
  - `oauthConfiguration(prefix: "GOOGLE" | "MICROSOFT", callbackPath): { configured; missing: string[]; clientId; clientSecret; redirectUri }`.
  - `gmail: MailProvider`, `GMAIL_READONLY_SCOPE`.
  - `saveConnection(provider, email, tokens)`, `accessTokenFor(connection)`.
  - `providers` (by slug), `providerFor(id)`, `providerBySlug(slug)`.
  - `refreshConnection(connection): Promise<{ imported; duplicates; more }>`.

- [ ] **Step 1: Write the failing tests.**

`src/services/mail/providers/oauth.test.ts`:

```ts
import { afterEach, expect, it, vi } from "vitest";
import { oauthConfiguration } from "./oauth";

const key = Buffer.alloc(32, 8).toString("base64");
afterEach(() => vi.unstubAllEnvs());

it("lists exactly what is missing", () => {
  vi.stubEnv("APP_URL", "http://127.0.0.1:3210");
  for (const name of [
    "MICROSOFT_CLIENT_ID",
    "MICROSOFT_CLIENT_SECRET",
    "MICROSOFT_REDIRECT_URI",
    "MAIL_TOKEN_ENCRYPTION_KEY",
    "GMAIL_TOKEN_ENCRYPTION_KEY",
  ])
    vi.stubEnv(name, "");
  expect(oauthConfiguration("MICROSOFT", "/api/mail/outlook/callback").missing).toEqual([
    "MICROSOFT_CLIENT_ID",
    "MICROSOFT_CLIENT_SECRET",
    "MICROSOFT_REDIRECT_URI",
    "MAIL_TOKEN_ENCRYPTION_KEY",
  ]);
});

it("requires the provider's own same-origin callback", () => {
  vi.stubEnv("APP_URL", "http://127.0.0.1:3210");
  vi.stubEnv("MICROSOFT_CLIENT_ID", "id");
  vi.stubEnv("MICROSOFT_CLIENT_SECRET", "secret");
  vi.stubEnv("MAIL_TOKEN_ENCRYPTION_KEY", key);
  vi.stubEnv("MICROSOFT_REDIRECT_URI", "http://127.0.0.1:3210/api/mail/outlook/callback");
  expect(oauthConfiguration("MICROSOFT", "/api/mail/outlook/callback").configured).toBe(true);
  vi.stubEnv("MICROSOFT_REDIRECT_URI", "http://127.0.0.1:3210/api/mail/gmail/callback");
  expect(oauthConfiguration("MICROSOFT", "/api/mail/outlook/callback").configured).toBe(false);
  vi.stubEnv("APP_URL", "http://jobops.example");
  vi.stubEnv("MICROSOFT_REDIRECT_URI", "http://jobops.example/api/mail/outlook/callback");
  expect(oauthConfiguration("MICROSOFT", "/api/mail/outlook/callback").configured).toBe(false);
});
```

`src/services/mail/providers/gmail.test.ts` (moved from `src/services/mail/gmail.test.ts`):

```ts
import { afterEach, expect, it, vi } from "vitest";
import { gmail, GMAIL_READONLY_SCOPE } from "./gmail";

function configure(origin = "http://127.0.0.1:3210") {
  vi.stubEnv("APP_URL", origin);
  vi.stubEnv("GOOGLE_CLIENT_ID", "test-client");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-secret");
  vi.stubEnv("GOOGLE_REDIRECT_URI", `${origin}/api/mail/gmail/callback`);
  vi.stubEnv("MAIL_TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 8).toString("base64"));
}
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("signs in with PKCE and only the read-only scope", () => {
  configure();
  const url = gmail.authorizeUrl("state-1", "challenge-1");
  expect(url.searchParams.get("scope")).toBe(GMAIL_READONLY_SCOPE);
  expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  expect(url.searchParams.get("redirect_uri")).toBe(
    "http://127.0.0.1:3210/api/mail/gmail/callback",
  );
});

it("rejects additional OAuth scopes before reading account data", async () => {
  configure();
  const request = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        access_token: "test-access",
        scope: `${GMAIL_READONLY_SCOPE} https://www.googleapis.com/auth/gmail.send`,
      }),
      { status: 200 },
    ),
  );
  vi.stubGlobal("fetch", request);
  await expect(gmail.exchangeCode("code", "verifier")).rejects.toThrow(
    "permissions other than gmail.readonly",
  );
  expect(request).toHaveBeenCalledTimes(1);
  expect(
    ((request.mock.calls[0][1] as RequestInit).body as URLSearchParams).get("code_verifier"),
  ).toBe("verifier");
});
```

Add to `src/services/mail/crypto.test.ts`:

```ts
it("reads the old Gmail key name when the shared key is unset", () => {
  vi.stubEnv("MAIL_TOKEN_ENCRYPTION_KEY", "");
  vi.stubEnv("GMAIL_TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 3).toString("base64"));
  expect(decryptToken(encryptToken("secret"))).toBe("secret");
});
```

(Use the file's existing `vi`/`encryptToken`/`decryptToken` imports; add any that are missing.)

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/services/mail`
Expected: FAIL — provider modules missing; crypto test fails because only the old name is read.

- [ ] **Step 3: Rename the encryption key with a fallback.** In `src/services/mail/crypto.ts` change the first two lines of `encryptionKey` to:

```ts
const value = process.env.MAIL_TOKEN_ENCRYPTION_KEY || process.env.GMAIL_TOKEN_ENCRYPTION_KEY || "";
```

and replace "GMAIL_TOKEN_ENCRYPTION_KEY" with "MAIL_TOKEN_ENCRYPTION_KEY" and "Gmail" with "mail" in its error messages ("Reconnect the inbox." instead of "Reconnect Gmail.").

- [ ] **Step 4: Create `src/services/mail/providers/types.ts`**

```ts
import type { z } from "zod";
import type { mailConnections } from "@/db/schema";
import type { mailImportSchema } from "@/features/mail/import";

/** Raw records before Zod parsing; `receivedAt` is still an ISO string here. */
type MailImportInput = z.input<typeof mailImportSchema>;
export type ProviderId = "GMAIL" | "OUTLOOK";
export type TokenSet = { accessToken: string; refreshToken: string | null; expiresAt: Date };
export type Cursor = { pageToken?: string; query?: string; next?: string; startedAt?: string };
export type MailConnection = typeof mailConnections.$inferSelect;
export type MailProvider = {
  id: ProviderId;
  slug: "gmail" | "outlook";
  label: string;
  configuration(): {
    configured: boolean;
    missing: string[];
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  };
  authorizeUrl(state: string, codeChallenge: string): URL;
  exchangeCode(code: string, verifier: string): Promise<{ email: string; tokens: TokenSet }>;
  refreshTokens(refreshToken: string): Promise<TokenSet>;
  listRecruitingMail(
    accessToken: string,
    connection: Pick<MailConnection, "lastSyncedAt">,
    cursor?: Cursor,
  ): Promise<{ messages: MailImportInput; nextCursor?: Cursor }>;
};
```

- [ ] **Step 5: Create `src/services/mail/providers/oauth.ts`**

```ts
import { isLoopback } from "@/lib/security";
import { validEncryptionKey } from "../crypto";

/** Same-origin, exact-path callback; HTTP only on loopback. */
export function oauthConfiguration(prefix: "GOOGLE" | "MICROSOFT", callbackPath: string) {
  const clientId = process.env[`${prefix}_CLIENT_ID`] ?? "";
  const clientSecret = process.env[`${prefix}_CLIENT_SECRET`] ?? "";
  const redirectUri = process.env[`${prefix}_REDIRECT_URI`] ?? "";
  let safeRedirect = false;
  try {
    const callback = new URL(redirectUri);
    const app = new URL(process.env.APP_URL ?? "http://127.0.0.1:3210");
    safeRedirect =
      callback.origin === app.origin &&
      callback.pathname === callbackPath &&
      !callback.search &&
      !callback.hash &&
      !callback.username &&
      !callback.password &&
      (callback.protocol === "https:" ||
        (callback.protocol === "http:" && isLoopback(callback.hostname)));
  } catch {
    /* Missing configuration is an expected import-only mode. */
  }
  const missing = [
    ...(clientId ? [] : [`${prefix}_CLIENT_ID`]),
    ...(clientSecret ? [] : [`${prefix}_CLIENT_SECRET`]),
    ...(safeRedirect ? [] : [`${prefix}_REDIRECT_URI`]),
    ...(validEncryptionKey() ? [] : ["MAIL_TOKEN_ENCRYPTION_KEY"]),
  ];
  return { configured: !missing.length, missing, clientId, clientSecret, redirectUri };
}
```

- [ ] **Step 6: Create `src/services/mail/providers/gmail.ts`** by moving the HTTP parts of `src/services/mail/gmail.ts` (token exchange, refresh, `gmailRequest`, `textBody`, message listing). Persistence moves to `connections.ts`.

```ts
import { classifyMail } from "../classifier";
import { oauthConfiguration } from "./oauth";
import type { Cursor, MailProvider, TokenSet } from "./types";

export const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
};
const readonlyScope = (scope?: string) =>
  Boolean(scope && scope.split(" ").every((value) => value === GMAIL_READONLY_SCOPE));

async function token(body: Record<string, string>, refreshing: boolean): Promise<TokenSet> {
  const config = gmail.configuration();
  if (!config.configured)
    throw new Error(`Gmail is not configured. Set ${config.missing.join(", ")}.`);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      ...body,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new Error(
      refreshing
        ? "Google could not renew Gmail read-only access. Reconnect Gmail."
        : "Google could not connect this account. Verify the redirect URI and try Connect Gmail again.",
    );
  const data = (await response.json()) as TokenResponse;
  if (
    !data.access_token ||
    (refreshing ? data.scope && !readonlyScope(data.scope) : !readonlyScope(data.scope))
  )
    throw new Error(
      "Google returned permissions other than gmail.readonly. Revoke this app in your Google account and reconnect with read-only consent.",
    );
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresAt: new Date(Date.now() + (data.expires_in ?? 3600) * 1000),
  };
}

async function gmailRequest<T>(path: string, accessToken: string): Promise<T> {
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok)
    throw new Error(
      response.status === 401
        ? "Gmail authorization expired. Reconnect Gmail."
        : response.status === 429
          ? "Gmail rate limit reached. Wait a few minutes and retry."
          : "Gmail could not be read. Check your Google API configuration and retry.",
    );
  return (await response.json()) as T;
}

type GmailPart = {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailPart[];
  headers?: { name: string; value: string }[];
};
type GmailMessage = {
  id: string;
  threadId?: string;
  snippet?: string;
  internalDate?: string;
  payload?: GmailPart;
};
function textBody(part?: GmailPart): string {
  if (!part) return "";
  if (part.mimeType === "text/plain" && part.body?.data)
    return Buffer.from(part.body.data, "base64url").toString("utf8");
  return (part.parts ?? []).map(textBody).filter(Boolean).join("\n");
}

export const gmail: MailProvider = {
  id: "GMAIL",
  slug: "gmail",
  label: "Gmail",
  configuration: () => oauthConfiguration("GOOGLE", "/api/mail/gmail/callback"),
  authorizeUrl(state, challenge) {
    const config = gmail.configuration();
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: "code",
      scope: GMAIL_READONLY_SCOPE,
      access_type: "offline",
      prompt: "consent",
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
      include_granted_scopes: "false",
    }).toString();
    return url;
  },
  async exchangeCode(code, verifier) {
    const tokens = await token(
      {
        grant_type: "authorization_code",
        code,
        code_verifier: verifier,
        redirect_uri: gmail.configuration().redirectUri,
      },
      false,
    );
    const profile = await gmailRequest<{ emailAddress?: string }>("profile", tokens.accessToken);
    if (!profile.emailAddress)
      throw new Error("Google did not return an account email. Reconnect Gmail.");
    return { email: profile.emailAddress.toLowerCase(), tokens };
  },
  refreshTokens: (refreshToken) =>
    token({ grant_type: "refresh_token", refresh_token: refreshToken }, true),
  async listRecruitingMail(accessToken, connection, cursor?: Cursor) {
    const since = connection.lastSyncedAt
      ? Math.floor((connection.lastSyncedAt.getTime() - 86_400_000) / 1000)
      : Math.floor((Date.now() - 30 * 86_400_000) / 1000);
    const query =
      cursor?.query ??
      `after:${since} -in:sent -in:drafts {application interview assessment recruiter recruiting "job offer" "career opportunity" "thank you for applying"}`;
    const params = new URLSearchParams({ q: query, maxResults: "100" });
    if (cursor?.pageToken) params.set("pageToken", cursor.pageToken);
    const list = await gmailRequest<{ messages?: { id: string }[]; nextPageToken?: string }>(
      `messages?${params}`,
      accessToken,
    );
    const ids = list.messages ?? [];
    const messages = [];
    for (let index = 0; index < ids.length; index += 5) {
      const chunk = await Promise.all(
        ids
          .slice(index, index + 5)
          .map((row) =>
            gmailRequest<GmailMessage>(
              `messages/${encodeURIComponent(row.id)}?format=full`,
              accessToken,
            ),
          ),
      );
      for (const message of chunk) {
        const header = (name: string) =>
          message.payload?.headers?.find((entry) => entry.name.toLowerCase() === name.toLowerCase())
            ?.value ?? "";
        const subject = header("Subject") || "(No subject)";
        const bodyText = textBody(message.payload).slice(0, 100000);
        if (!classifyMail({ subject, bodyText, snippet: message.snippet }).relevant) continue;
        const from = header("From");
        const address = from.match(/<([^>]+)>/);
        messages.push({
          externalId: message.id,
          threadId: message.threadId,
          sender: address?.[1] ?? from,
          senderName: address ? from.split("<")[0].trim().replace(/^"|"$/g, "") : "",
          recipient: header("To"),
          subject,
          snippet: message.snippet ?? "",
          bodyText,
          receivedAt: new Date(Number(message.internalDate ?? Date.now())).toISOString(),
        });
      }
    }
    return {
      messages,
      nextCursor: list.nextPageToken ? { pageToken: list.nextPageToken, query } : undefined,
    };
  },
};
```

- [ ] **Step 7: Create `src/services/mail/providers/index.ts` and `connections.ts`**

`index.ts`:

```ts
import { gmail } from "./gmail";
import type { MailProvider } from "./types";

export const providers: MailProvider[] = [gmail];
export const providerFor = (id: string) =>
  providers.find((provider) => provider.id === id) ?? gmail;
export const providerBySlug = (slug: string) =>
  providers.find((provider) => provider.slug === slug) ?? null;
```

`connections.ts`:

```ts
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { mailConnections } from "@/db/schema";
import { decryptToken, encryptToken } from "../crypto";
import { providerFor } from "./index";
import type { MailConnection, ProviderId, TokenSet } from "./types";

export async function saveConnection(provider: ProviderId, email: string, tokens: TokenSet) {
  const values = {
    provider,
    email,
    encryptedAccessToken: encryptToken(tokens.accessToken),
    ...(tokens.refreshToken ? { encryptedRefreshToken: encryptToken(tokens.refreshToken) } : {}),
    tokenExpiresAt: tokens.expiresAt,
    lastError: null,
    updatedAt: new Date(),
  };
  await db
    .insert(mailConnections)
    .values(values)
    .onConflictDoUpdate({ target: [mailConnections.provider, mailConnections.email], set: values });
}

/** Reuses the access token until a minute before expiry, then refreshes and stores it. */
export async function accessTokenFor(connection: MailConnection) {
  if (!connection.tokenExpiresAt || connection.tokenExpiresAt.getTime() > Date.now() + 60_000)
    return decryptToken(connection.encryptedAccessToken);
  const provider = providerFor(connection.provider);
  if (!connection.encryptedRefreshToken)
    throw new Error(`${connection.email} has no refresh token. Reconnect ${provider.label}.`);
  const tokens = await provider.refreshTokens(decryptToken(connection.encryptedRefreshToken));
  await db
    .update(mailConnections)
    .set({
      encryptedAccessToken: encryptToken(tokens.accessToken),
      ...(tokens.refreshToken ? { encryptedRefreshToken: encryptToken(tokens.refreshToken) } : {}),
      tokenExpiresAt: tokens.expiresAt,
      updatedAt: new Date(),
    })
    .where(eq(mailConnections.id, connection.id));
  return tokens.accessToken;
}
```

- [ ] **Step 8: Create `src/features/mail/refresh-service.ts`**

```ts
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { mailConnections, settings } from "@/db/schema";
import { accessTokenFor } from "@/services/mail/providers/connections";
import { providerFor } from "@/services/mail/providers";
import type { Cursor, MailConnection } from "@/services/mail/providers/types";
import { importMailRecords, mailImportSchema } from "./import";

const MAX_PAGES = 4;

/** Reads up to four pages per inbox and keeps a cursor so the next refresh continues. */
export async function refreshConnection(connection: MailConnection) {
  const provider = providerFor(connection.provider);
  const cursorKey = `mailCursor:${connection.id}`;
  const [stored] = await db.select().from(settings).where(eq(settings.key, cursorKey));
  let cursor = (stored?.value as Cursor | undefined) ?? undefined;
  const startedAt = cursor?.startedAt ? new Date(cursor.startedAt) : new Date();
  const token = await accessTokenFor(connection);
  let imported = 0;
  let duplicates = 0;
  let pages = 0;
  do {
    const page = await provider.listRecruitingMail(token, connection, cursor);
    if (page.messages.length) {
      const result = await importMailRecords(
        mailImportSchema.parse(page.messages),
        provider.id,
        connection.email,
      );
      imported += result.imported;
      duplicates += result.duplicates;
    }
    cursor = page.nextCursor
      ? { ...page.nextCursor, startedAt: startedAt.toISOString() }
      : undefined;
    pages++;
  } while (cursor && pages < MAX_PAGES);
  await db.transaction(async (tx) => {
    if (cursor)
      await tx
        .insert(settings)
        .values({ key: cursorKey, value: cursor })
        .onConflictDoUpdate({
          target: settings.key,
          set: { value: cursor, updatedAt: new Date() },
        });
    else await tx.delete(settings).where(eq(settings.key, cursorKey));
    await tx
      .update(mailConnections)
      .set({
        ...(cursor ? {} : { lastSyncedAt: startedAt }),
        lastRefreshedAt: new Date(),
        lastRefreshedCount: imported,
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(mailConnections.id, connection.id));
  });
  return { imported, duplicates, more: Boolean(cursor) };
}
```

- [ ] **Step 9: Create the OAuth routes and remove the Gmail-only ones.**

`src/app/api/mail/[provider]/connect/route.ts`:

```ts
import { createHash, randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { providerBySlug } from "@/services/mail/providers";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider: slug } = await params;
  const provider = providerBySlug(slug);
  const back = (notice: string) =>
    NextResponse.redirect(
      new URL(
        `/applications?tab=emails&notice=${encodeURIComponent(notice)}`,
        process.env.APP_URL ?? request.url,
      ),
    );
  if (!provider) return back("Unknown mail provider.");
  const config = provider.configuration();
  if (!config.configured)
    return back(`${provider.label} is not configured. Set ${config.missing.join(", ")}.`);
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const response = NextResponse.redirect(
    provider.authorizeUrl(state, createHash("sha256").update(verifier).digest("base64url")),
  );
  const cookie = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: config.redirectUri.startsWith("https:"),
    maxAge: 600,
    path: `/api/mail/${provider.slug}`,
  };
  response.cookies.set("jobops_mail_state", state, cookie);
  response.cookies.set("jobops_mail_verifier", verifier, cookie);
  return response;
}
```

`src/app/api/mail/[provider]/callback/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db";
import { activityLogs } from "@/db/schema";
import { actionError } from "@/lib/actions";
import { equalCredential } from "@/lib/security";
import { providerBySlug } from "@/services/mail/providers";
import { saveConnection } from "@/services/mail/providers/connections";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider: slug } = await params;
  const provider = providerBySlug(slug);
  const state = request.nextUrl.searchParams.get("state") ?? "";
  const storedState = request.cookies.get("jobops_mail_state")?.value ?? "";
  const verifier = request.cookies.get("jobops_mail_verifier")?.value ?? "";
  const code = request.nextUrl.searchParams.get("code");
  let message = "The inbox connection could not be verified. Try connecting again.";
  if (
    provider &&
    state &&
    verifier &&
    code &&
    equalCredential(state, storedState) &&
    !request.nextUrl.searchParams.has("error")
  ) {
    try {
      const { email, tokens } = await provider.exchangeCode(code, verifier);
      await saveConnection(provider.id, email, tokens);
      await db.insert(activityLogs).values({
        action: "MAIL_CONNECTED",
        entityType: "MAIL",
        summary: `${provider.label} read-only connection established for ${email}`,
      });
      message = `${email} connected with read-only access. Refresh when you want new mail.`;
    } catch (error) {
      message = actionError(error).error ?? "The inbox could not be connected. Try again.";
    }
  }
  const response = NextResponse.redirect(
    new URL(
      `/applications?tab=emails&notice=${encodeURIComponent(message)}`,
      process.env.APP_URL ?? request.url,
    ),
  );
  const path = `/api/mail/${provider?.slug ?? slug}`;
  response.cookies.set("jobops_mail_state", "", { maxAge: 0, path });
  response.cookies.set("jobops_mail_verifier", "", { maxAge: 0, path });
  return response;
}
```

Delete `src/app/api/gmail/`, `src/services/mail/gmail.ts` and `src/services/mail/gmail.test.ts`.

- [ ] **Step 10: Point remaining callers at the providers.**

- `src/features/mail/actions.ts` `syncGmail`: replace its body after loading `connection` with `const result = await refreshConnection(connection);` and return `{ success: `${result.imported} recruiting messages imported; ${result.duplicates} duplicates skipped.${result.more ? " More messages remain. Refresh again to continue." : ""}` }`; remove the `readRecruitingMail`/cursor code and unused imports.
- `src/features/mail/refresh.tsx` and `src/app/settings/page.tsx`: replace `gmailConfiguration()` with `gmail.configuration()` from `@/services/mail/providers/gmail`, and `/api/gmail/connect` with `/api/mail/gmail/connect`.
- `.env.example`: set `GOOGLE_REDIRECT_URI=http://127.0.0.1:3210/api/mail/gmail/callback` and rename the key line to `MAIL_TOKEN_ENCRYPTION_KEY=` (comment: "Generate a 32-byte key as documented in README before connecting an inbox.").
- Run `grep -rn "api/gmail\|services/mail/gmail\|gmailConfiguration\|exchangeGoogleCode" src tests scripts` — expected: no matches.

- [ ] **Step 11: Run the suites**

Run: `npx vitest run src/services/mail && npm run typecheck && npm run lint && npm test && npm run test:e2e`
Expected: all pass.

- [ ] **Step 12: Commit**

```bash
git add -A src .env.example tests
git commit -m "JOB_FINDER-9999: Put Gmail behind a mail provider interface" -m "Move Gmail OAuth and listing behind MailProvider, share token storage and a multi-page refresh, rename the encryption key with a fallback and serve OAuth from /api/mail/<provider>." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: Outlook through Microsoft Graph

**Files:**

- Create: `src/services/mail/providers/outlook.ts`, `src/services/mail/providers/outlook.test.ts`
- Modify: `src/services/mail/providers/index.ts`, `.env.example`

**Interfaces:**

- Produces: `outlook: MailProvider`, `OUTLOOK_SCOPES`, `readOnlyScopes(scope?)`.

- [ ] **Step 1: Write the failing tests** `src/services/mail/providers/outlook.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { outlook, readOnlyScopes } from "./outlook";

const origin = "http://127.0.0.1:3210";
function configure() {
  vi.stubEnv("APP_URL", origin);
  vi.stubEnv("MICROSOFT_CLIENT_ID", "test-client");
  vi.stubEnv("MICROSOFT_CLIENT_SECRET", "test-secret");
  vi.stubEnv("MICROSOFT_REDIRECT_URI", `${origin}/api/mail/outlook/callback`);
  vi.stubEnv("MAIL_TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 8).toString("base64"));
}
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const connection = { lastSyncedAt: new Date("2026-10-02T00:00:00Z") };

describe("Outlook read-only OAuth", () => {
  it("signs in personal accounts with PKCE and read-only scopes", () => {
    configure();
    const url = outlook.authorizeUrl("state-1", "challenge-1");
    expect(url.origin + url.pathname).toBe(
      "https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize",
    );
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: "test-client",
      response_type: "code",
      scope: "offline_access User.Read Mail.Read",
      state: "state-1",
      code_challenge: "challenge-1",
      code_challenge_method: "S256",
      prompt: "select_account",
      redirect_uri: `${origin}/api/mail/outlook/callback`,
    });
  });
  it("accepts read scopes and rejects any write scope", () => {
    expect(
      readOnlyScopes(
        "https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/User.Read offline_access",
      ),
    ).toBe(true);
    expect(readOnlyScopes("Mail.Read Mail.ReadWrite")).toBe(false);
    expect(readOnlyScopes("Mail.Send")).toBe(false);
    expect(readOnlyScopes(undefined)).toBe(false);
  });
  it("refuses a token with write permissions before reading the account", async () => {
    configure();
    const request = vi
      .fn()
      .mockResolvedValue(json({ access_token: "a", scope: "Mail.Read Mail.Send" }));
    vi.stubGlobal("fetch", request);
    await expect(outlook.exchangeCode("code", "verifier")).rejects.toThrow("beyond read-only mail");
    expect(request).toHaveBeenCalledTimes(1);
    expect(
      ((request.mock.calls[0][1] as RequestInit).body as URLSearchParams).get("code_verifier"),
    ).toBe("verifier");
  });
  it("uses the user principal name when a personal account has no mail field", async () => {
    configure();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          json({
            access_token: "a",
            refresh_token: "r",
            expires_in: 3600,
            scope: "User.Read Mail.Read",
          }),
        )
        .mockResolvedValueOnce(json({ mail: null, userPrincipalName: "Person@Outlook.in" })),
    );
    const result = await outlook.exchangeCode("code", "verifier");
    expect(result.email).toBe("person@outlook.in");
    expect(result.tokens).toMatchObject({ accessToken: "a", refreshToken: "r" });
  });
});

describe("Outlook recruiting mail", () => {
  const message = (patch: Record<string, unknown> = {}) => ({
    id: "AAMk-moved-id",
    internetMessageId: "<abc@mail.example>",
    conversationId: "conv-1",
    subject: "Interview invitation for SDE-2",
    bodyPreview: "We would like to schedule an interview",
    body: { content: "We would like to schedule your interview with our team." },
    from: { emailAddress: { name: "Talent Team", address: "talent@example.invalid" } },
    toRecipients: [{ emailAddress: { address: "person@outlook.in" } }],
    receivedDateTime: "2026-10-03T03:30:00Z",
    ...patch,
  });
  it("reads the inbox since the last sync with plain-text bodies", async () => {
    configure();
    const request = vi.fn().mockResolvedValue(json({ value: [] }));
    vi.stubGlobal("fetch", request);
    await outlook.listRecruitingMail("token", connection);
    const [url, options] = request.mock.calls[0] as [string, RequestInit];
    expect(url.startsWith("https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?")).toBe(
      true,
    );
    expect(decodeURIComponent(url)).toContain(
      "$filter=receivedDateTime ge 2026-10-01T00:00:00.000Z",
    );
    expect((options.headers as Record<string, string>).Prefer).toBe(
      'outlook.body-content-type="text"',
    );
  });
  it("dedupes on the internet message id, which survives folder moves", async () => {
    configure();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ value: [message()] })));
    const { messages } = await outlook.listRecruitingMail("token", connection);
    expect(messages).toEqual([
      expect.objectContaining({
        externalId: "<abc@mail.example>",
        threadId: "conv-1",
        sender: "talent@example.invalid",
        senderName: "Talent Team",
        recipient: "person@outlook.in",
        receivedAt: "2026-10-03T03:30:00Z",
      }),
    ]);
  });
  it("skips unrelated mail and follows the next page link", async () => {
    configure();
    const next = "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$skip=50";
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        json({
          value: [
            message({
              subject: "Your electricity bill",
              bodyPreview: "Amount due",
              body: { content: "Amount due" },
            }),
          ],
          "@odata.nextLink": next,
        }),
      )
      .mockResolvedValueOnce(json({ value: [] }));
    vi.stubGlobal("fetch", request);
    const first = await outlook.listRecruitingMail("token", connection);
    expect(first.messages).toEqual([]);
    expect(first.nextCursor).toEqual({ next });
    await outlook.listRecruitingMail("token", connection, first.nextCursor);
    expect(request.mock.calls[1][0]).toBe(next);
  });
  it("refuses page links outside Microsoft Graph", async () => {
    configure();
    vi.stubGlobal("fetch", vi.fn());
    await expect(
      outlook.listRecruitingMail("token", connection, { next: "https://evil.example/steal" }),
    ).rejects.toThrow("Unexpected Microsoft Graph address");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/services/mail/providers/outlook.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/services/mail/providers/outlook.ts`**

```ts
import { classifyMail } from "../classifier";
import { oauthConfiguration } from "./oauth";
import type { MailProvider, TokenSet } from "./types";

const AUTHORITY = "https://login.microsoftonline.com/consumers/oauth2/v2.0";
const GRAPH = "https://graph.microsoft.com/v1.0";
export const OUTLOOK_SCOPES = ["offline_access", "User.Read", "Mail.Read"];
const allowed = new Set(["offline_access", "openid", "profile", "email", "user.read", "mail.read"]);

/** True only when every granted scope is one of the read-only scopes we asked for. */
export function readOnlyScopes(scope?: string) {
  const values = (scope ?? "").split(" ").filter(Boolean);
  return (
    values.length > 0 &&
    values.every((value) =>
      allowed.has(value.replace(/^https:\/\/graph\.microsoft\.com\//i, "").toLowerCase()),
    )
  );
}

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
};
async function token(body: Record<string, string>): Promise<TokenSet> {
  const config = outlook.configuration();
  if (!config.configured)
    throw new Error(`Outlook is not configured. Set ${config.missing.join(", ")}.`);
  const response = await fetch(`${AUTHORITY}/token`, {
    method: "POST",
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      scope: OUTLOOK_SCOPES.join(" "),
      ...body,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new Error(
      body.grant_type === "refresh_token"
        ? "Microsoft could not renew Outlook read access. Reconnect Outlook."
        : "Microsoft could not connect this account. Verify the redirect URI and try Connect Outlook again.",
    );
  const data = (await response.json()) as TokenResponse;
  if (!data.access_token || !readOnlyScopes(data.scope))
    throw new Error(
      "Microsoft returned permissions beyond read-only mail. Remove JobOps from your Microsoft account's app permissions and reconnect.",
    );
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresAt: new Date(Date.now() + (data.expires_in ?? 3600) * 1000),
  };
}

async function graph<T>(url: string, accessToken: string): Promise<T> {
  if (!url.startsWith(`${GRAPH}/`)) throw new Error("Unexpected Microsoft Graph address.");
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, Prefer: 'outlook.body-content-type="text"' },
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok)
    throw new Error(
      response.status === 401
        ? "Outlook access expired. Reconnect Outlook."
        : response.status === 429
          ? "Outlook rate limit reached. Wait a few minutes and retry."
          : "Outlook mail could not be read. Retry in a moment.",
    );
  return (await response.json()) as T;
}

type GraphMessage = {
  id: string;
  internetMessageId?: string;
  conversationId?: string;
  subject?: string;
  bodyPreview?: string;
  body?: { content?: string };
  from?: { emailAddress?: { name?: string; address?: string } };
  toRecipients?: { emailAddress?: { address?: string } }[];
  receivedDateTime: string;
};

export const outlook: MailProvider = {
  id: "OUTLOOK",
  slug: "outlook",
  label: "Outlook",
  configuration: () => oauthConfiguration("MICROSOFT", "/api/mail/outlook/callback"),
  authorizeUrl(state, challenge) {
    const config = outlook.configuration();
    const url = new URL(`${AUTHORITY}/authorize`);
    url.search = new URLSearchParams({
      client_id: config.clientId,
      response_type: "code",
      redirect_uri: config.redirectUri,
      response_mode: "query",
      scope: OUTLOOK_SCOPES.join(" "),
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
      // Lets the second Outlook account be picked instead of reusing the first.
      prompt: "select_account",
    }).toString();
    return url;
  },
  async exchangeCode(code, verifier) {
    const tokens = await token({
      grant_type: "authorization_code",
      code,
      code_verifier: verifier,
      redirect_uri: outlook.configuration().redirectUri,
    });
    const me = await graph<{ mail?: string | null; userPrincipalName?: string }>(
      `${GRAPH}/me?$select=mail,userPrincipalName`,
      tokens.accessToken,
    );
    const email = (me.mail || me.userPrincipalName || "").toLowerCase();
    if (!email) throw new Error("Microsoft did not return an account email. Reconnect Outlook.");
    return { email, tokens };
  },
  refreshTokens: (refreshToken) =>
    token({ grant_type: "refresh_token", refresh_token: refreshToken }),
  async listRecruitingMail(accessToken, connection, cursor) {
    const since = connection.lastSyncedAt
      ? new Date(connection.lastSyncedAt.getTime() - 86_400_000)
      : new Date(Date.now() - 30 * 86_400_000);
    const first =
      `${GRAPH}/me/mailFolders/inbox/messages` +
      `?$filter=${encodeURIComponent(`receivedDateTime ge ${since.toISOString()}`)}` +
      `&$orderby=${encodeURIComponent("receivedDateTime desc")}` +
      `&$select=id,internetMessageId,conversationId,subject,bodyPreview,body,from,toRecipients,receivedDateTime` +
      `&$top=50`;
    const page = await graph<{ value: GraphMessage[]; "@odata.nextLink"?: string }>(
      cursor?.next ?? first,
      accessToken,
    );
    const messages = page.value.flatMap((message) => {
      const subject = message.subject || "(No subject)";
      const bodyText = (message.body?.content ?? "").slice(0, 100000);
      if (!classifyMail({ subject, bodyText, snippet: message.bodyPreview }).relevant) return [];
      return [
        {
          // Graph's id changes when a message moves folders; the Message-ID header does not.
          externalId: message.internetMessageId || message.id,
          threadId: message.conversationId,
          sender: message.from?.emailAddress?.address || "unknown@outlook.invalid",
          senderName: message.from?.emailAddress?.name ?? "",
          recipient: (message.toRecipients ?? [])
            .map((recipient) => recipient.emailAddress?.address)
            .filter(Boolean)
            .join(", "),
          subject,
          snippet: (message.bodyPreview ?? "").slice(0, 2000),
          bodyText,
          receivedAt: message.receivedDateTime,
        },
      ];
    });
    return {
      messages,
      nextCursor: page["@odata.nextLink"] ? { next: page["@odata.nextLink"] } : undefined,
    };
  },
};
```

- [ ] **Step 4: Register it.** In `src/services/mail/providers/index.ts` import `outlook` and set `export const providers: MailProvider[] = [gmail, outlook];`. Add to `.env.example`:

```
# Optional Outlook (personal accounts) read-only OAuth; see README.
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
MICROSOFT_REDIRECT_URI=http://127.0.0.1:3210/api/mail/outlook/callback
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/services/mail && npm run typecheck && npm run lint`
Expected: PASS. If the electricity-bill message is classified relevant, the classifier's `relevant` flag is broader than expected; read `src/services/mail/classifier.ts` and pick a subject/body that matches no rule (for example "Weekend plans").

- [ ] **Step 6: Commit**

```bash
git add src/services/mail/providers .env.example
git commit -m "JOB_FINDER-9999: Read personal Outlook inboxes through Microsoft Graph" -m "Sign in personal Microsoft accounts with PKCE and read-only scopes, read the inbox since the last sync in plain text, and dedupe on the Message-ID header." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 17: Refresh all inboxes, inbox status and setup docs

**Files:**

- Create: `src/features/mail/refresh-summary.ts`, `src/features/applications/views/inboxes.tsx`
- Test: `tests/mail-refresh.test.ts`
- Modify: `src/features/applications/dates.ts` (+ `relativeTime`), `tests/application-dates.test.ts`, `src/features/mail/actions.ts` (`refreshAllInboxes`, `disconnectInbox`; remove `syncGmail`, `disconnectGmail`), `src/features/mail/read.ts` (+ `accountEmail`), `src/features/applications/views/emails.tsx` (account tag, `accountIndex` prop), `src/app/applications/page.tsx`, `src/app/settings/page.tsx`, `scripts/e2e.ts`, `README.md`, `tests/e2e/applications.spec.ts`
- Delete: `src/features/mail/refresh.tsx`

**Interfaces:**

- Produces: `summarizeRefresh(results)`, `relativeTime(date, now)`, `refreshAllInboxes` action, `disconnectInbox` action (`connectionId`), `InboxStatus({ connections, configs, now })`, `RefreshAllButton({ disabled })`, `accountTone(index)`.

- [ ] **Step 1: Write the failing tests.** `tests/mail-refresh.test.ts`:

```ts
import { expect, it } from "vitest";
import { summarizeRefresh } from "@/features/mail/refresh-summary";

const ok = (imported: number, more = false) => ({
  status: "fulfilled" as const,
  value: { imported, more },
});
const failed = (message: string) => ({ status: "rejected" as const, reason: new Error(message) });

it("reports new mail across inboxes", () =>
  expect(
    summarizeRefresh([
      { email: "a@gmail.com", result: ok(2) },
      { email: "b@outlook.in", result: ok(1) },
    ]),
  ).toEqual({ success: "Refreshed 2 of 2 inboxes · 3 new." }));

it("keeps going when one inbox fails and names it", () => {
  const summary = summarizeRefresh([
    { email: "a@gmail.com", result: ok(2, true) },
    { email: "c@outlook.com", result: failed("Outlook access expired. Reconnect Outlook.") },
  ]);
  expect(summary.success).toBe(
    "Refreshed 1 of 2 inboxes · 2 new. More messages remain; refresh again to continue. Needs attention: c@outlook.com: Outlook access expired. Reconnect Outlook.",
  );
});

it("fails only when every inbox fails", () =>
  expect(
    summarizeRefresh([{ email: "a@gmail.com", result: failed("Gmail rate limit reached.") }]),
  ).toEqual({
    error: "No inbox refreshed. a@gmail.com: Gmail rate limit reached.",
  }));
```

Add to `tests/application-dates.test.ts` (import `relativeTime`):

```ts
it("describes refresh times briefly", () => {
  const now = new Date("2026-10-03T10:30:00+05:30");
  expect(relativeTime(new Date("2026-10-03T10:29:40+05:30"), now)).toBe("just now");
  expect(relativeTime(new Date("2026-10-03T10:05:00+05:30"), now)).toBe("25 min ago");
  expect(relativeTime(new Date("2026-10-03T08:40:00+05:30"), now)).toMatch(/^today at 8:40/);
  expect(relativeTime(new Date("2026-10-01T08:40:00+05:30"), now)).toBe("1 Oct");
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/mail-refresh.test.ts tests/application-dates.test.ts`
Expected: FAIL — `summarizeRefresh` and `relativeTime` missing.

- [ ] **Step 3: Implement the helpers.**

`src/features/mail/refresh-summary.ts`:

```ts
import { actionError, type ActionState } from "@/lib/actions";

type Result = PromiseSettledResult<{ imported: number; more: boolean }>;

/** One inbox failing never hides what the others imported (spec §4.4). */
export function summarizeRefresh(results: { email: string; result: Result }[]): ActionState {
  const done = results.flatMap((row) =>
    row.result.status === "fulfilled" ? [row.result.value] : [],
  );
  const failures = results.flatMap((row) =>
    row.result.status === "rejected"
      ? [`${row.email}: ${actionError(row.result.reason).error ?? "Refresh failed."}`]
      : [],
  );
  if (!done.length) return { error: `No inbox refreshed. ${failures.join(" ")}` };
  const imported = done.reduce((sum, row) => sum + row.imported, 0);
  return {
    success: [
      `Refreshed ${done.length} of ${results.length} inboxes · ${imported} new.`,
      done.some((row) => row.more) ? "More messages remain; refresh again to continue." : "",
      failures.length ? `Needs attention: ${failures.join(" ")}` : "",
    ]
      .filter(Boolean)
      .join(" "),
  };
}
```

Append to `src/features/applications/dates.ts`:

```ts
export function relativeTime(value: Date, now: Date) {
  const minutes = Math.floor((now.getTime() - value.getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (indiaDate(value) === indiaDate(now)) return `today at ${formatTime(value)}`;
  return formatDay(value);
}
```

- [ ] **Step 4: Add the actions.** In `src/features/mail/actions.ts` remove `syncGmail` and `disconnectGmail` and add (import `mailConnections`, `refreshConnection`, `summarizeRefresh`, `settings`):

```ts
export async function refreshAllInboxes(_previous: ActionState): Promise<ActionState> {
  try {
    const connections = await db.select().from(mailConnections);
    if (!connections.length) throw new Error("Connect Gmail or Outlook before refreshing.");
    const settled = await Promise.allSettled(
      connections.map((connection) => refreshConnection(connection)),
    );
    await Promise.all(
      settled.map((result, index) =>
        result.status === "rejected"
          ? db
              .update(mailConnections)
              .set({
                lastError: actionError(result.reason).error ?? "Refresh failed.",
                lastRefreshedAt: new Date(),
                updatedAt: new Date(),
              })
              .where(eq(mailConnections.id, connections[index].id))
          : null,
      ),
    );
    revalidatePath("/applications");
    revalidatePath("/");
    return summarizeRefresh(
      connections.map((connection, index) => ({ email: connection.email, result: settled[index] })),
    );
  } catch (error) {
    return actionError(error);
  }
}

export async function disconnectInbox(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const id = z.uuid().parse(formString(form, "connectionId"));
    await db.transaction(async (tx) => {
      const [removed] = await tx
        .delete(mailConnections)
        .where(eq(mailConnections.id, id))
        .returning({ email: mailConnections.email });
      if (!removed) throw new Error("This inbox is already disconnected.");
      await tx.delete(settings).where(eq(settings.key, `mailCursor:${id}`));
      await tx.insert(activityLogs).values({
        action: "MAIL_DISCONNECTED",
        entityType: "MAIL",
        summary: `Local credentials removed for ${removed.email}. Imported messages retained.`,
      });
    });
    revalidatePath("/applications");
    revalidatePath("/settings");
    return {
      success:
        "Credentials removed locally. Also remove JobOps from your Google or Microsoft account permissions.",
    };
  } catch (error) {
    return actionError(error);
  }
}
```

(`useActionState` passes `(state, formData)`; an action that ignores the form can omit the second parameter.)

- [ ] **Step 5: Create `src/features/applications/views/inboxes.tsx`**

```tsx
import { RefreshCw } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui";
import { refreshAllInboxes } from "@/features/mail/actions";
import { cn } from "@/lib/utils";
import { relativeTime } from "../dates";

const tones = ["bg-chart-coding", "bg-chart-design", "bg-chart-people", "bg-chart-other"];
export const accountTone = (index: number) => tones[index % tones.length];

type Connection = {
  id: string;
  provider: string;
  email: string;
  lastRefreshedAt: Date | null;
  lastRefreshedCount: number | null;
  lastError: string | null;
};
type Config = { slug: string; label: string; configured: boolean; missing: string[] };

export function RefreshAllButton({ disabled }: { disabled: boolean }) {
  return (
    <ActionForm action={refreshAllInboxes} className="contents" pendingLabel="Refreshing inboxes">
      <Button variant="outline" className="h-10 bg-card" disabled={disabled}>
        <RefreshCw size={15} aria-hidden />
        Refresh all inboxes
      </Button>
    </ActionForm>
  );
}

export function InboxStatus({
  connections,
  configs,
  now,
}: {
  connections: Connection[];
  configs: Config[];
  now: Date;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <RefreshAllButton disabled={!connections.length} />
        {configs.map((config) =>
          config.configured ? (
            <Button key={config.slug} variant="ghost" size="sm" className="h-9 px-3" asChild>
              <a href={`/api/mail/${config.slug}/connect`}>Connect {config.label}</a>
            </Button>
          ) : (
            <span key={config.slug} className="inline-flex flex-wrap items-center gap-2 text-xs">
              <Button variant="ghost" size="sm" className="h-9 px-3" disabled>
                Connect {config.label}
              </Button>
              <span className="text-selected-foreground/80">
                Set {config.missing.join(", ")} in .env
              </span>
            </span>
          ),
        )}
      </div>
      {connections.length > 0 && (
        <ul className="m-0 flex list-none flex-wrap gap-x-6 gap-y-2 p-0 text-sm">
          {connections.map((connection, index) => (
            <li key={connection.id} className="flex min-w-0 items-center gap-2">
              <span
                aria-hidden
                className={cn("size-2 shrink-0 rounded-full", accountTone(index))}
              />
              <span className="truncate font-medium text-selected-foreground">
                {connection.email}
              </span>
              {connection.lastError ? (
                <span className="text-destructive">
                  {connection.lastError}{" "}
                  <a
                    href={`/api/mail/${connection.provider === "OUTLOOK" ? "outlook" : "gmail"}/connect`}
                    className="text-link"
                  >
                    Reconnect
                  </a>
                </span>
              ) : (
                <span className="text-selected-foreground/80 tabular-nums">
                  {connection.lastRefreshedAt
                    ? `Refreshed ${relativeTime(connection.lastRefreshedAt, now)} · ${connection.lastRefreshedCount ?? 0} new`
                    : "Not refreshed yet"}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Wire it into Emails.**

- `src/features/mail/read.ts`: add `accountEmail: string | null` to `TriageMessage` and `accountEmail: message.accountEmail` to each mapped message.
- `views/emails.tsx`: accept `accountIndex: Record<string, number>`; pass it to `MailCard`; at the start of the card's first line render the inbox when known:

```tsx
{
  message.accountEmail && (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span
        aria-hidden
        className={cn(
          "size-2 shrink-0 rounded-full",
          accountTone(accountIndex[message.accountEmail] ?? 3),
        )}
      />
      <span className="truncate">{message.accountEmail}</span>
    </span>
  );
}
```

(import `cn` and `accountTone` from `./inboxes`).

- `src/app/applications/page.tsx`: load connections and provider configs, and pass the new refresh slot:

```ts
// Only what the view shows: no tokens, no client secrets in props.
const connections = await db
  .select({
    id: mailConnections.id,
    provider: mailConnections.provider,
    email: mailConnections.email,
    lastRefreshedAt: mailConnections.lastRefreshedAt,
    lastRefreshedCount: mailConnections.lastRefreshedCount,
    lastError: mailConnections.lastError,
  })
  .from(mailConnections)
  .orderBy(asc(mailConnections.createdAt));
const configs = providers.map((provider) => {
  const { configured, missing } = provider.configuration();
  return { slug: provider.slug, label: provider.label, configured, missing };
});
```

(import `asc` from drizzle-orm, `db`, `mailConnections`, `providers` from `@/services/mail/providers`, and `InboxStatus` from the views.)

```tsx
          refresh={<InboxStatus connections={connections} configs={configs} now={now} />}
          accountIndex={Object.fromEntries(connections.map((connection, index) => [connection.email, index]))}
```

Remove the `MailRefresh` import and delete `src/features/mail/refresh.tsx`.

- `src/app/settings/page.tsx`: load `db.select({ id: mailConnections.id, provider: mailConnections.provider, email: mailConnections.email, lastRefreshedAt: mailConnections.lastRefreshedAt }).from(mailConnections)` as `connections` and `await getDisplayPreferences()` as `display` (import from `@/features/candidate/preferences`; import `disconnectInbox` and `Button`), drop the `gmail.configuration()` call, and replace the `<section id="mail-integration">…</section>` block with:

```tsx
<section id="mail-integration">
  <Panel title="Mail connections">
    <p className="muted">
      Inbox access is read-only. Connect and refresh inboxes from Applications → Emails.
    </p>
    {connections.length ? (
      <ul className="m-0 mt-4 list-none space-y-3 p-0">
        {connections.map((connection) => (
          <li key={connection.id} className="flex flex-wrap items-center justify-between gap-3">
            <span>
              <strong>{connection.email}</strong>{" "}
              <span className="muted">
                · {connection.provider === "OUTLOOK" ? "Outlook" : "Gmail"} · last refreshed{" "}
                {displayDate(connection.lastRefreshedAt, display, true)}
              </span>
            </span>
            <ActionForm action={disconnectInbox} className="contents" pendingLabel="Disconnecting">
              <input type="hidden" name="connectionId" value={connection.id} />
              <Button variant="destructive" size="sm">
                Disconnect
              </Button>
            </ActionForm>
          </li>
        ))}
      </ul>
    ) : (
      <p className="mt-4">No inbox connected.</p>
    )}
    <div className="actions mt-5">
      <Link href="/applications?tab=emails" className="button-secondary">
        Connect or refresh inboxes
      </Link>
    </div>
  </Panel>
</section>
```

- `scripts/e2e.ts`: in `environment` set `GOOGLE_REDIRECT_URI: ""`, `MICROSOFT_CLIENT_ID: ""`, `MICROSOFT_CLIENT_SECRET: ""`, `MICROSOFT_REDIRECT_URI: ""`, `MAIL_TOKEN_ENCRYPTION_KEY: ""` (keep `GMAIL_TOKEN_ENCRYPTION_KEY: ""`).

- [ ] **Step 7: Add the browser check** to `tests/e2e/applications.spec.ts`:

```ts
test("the Emails tab says what each inbox needs before it can connect", async ({ page }) => {
  await page.goto("/applications?tab=emails");
  await expect(page.getByRole("button", { name: "Connect Gmail" })).toBeDisabled();
  await expect(
    page.getByText(
      "Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI, MAIL_TOKEN_ENCRYPTION_KEY in .env",
    ),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Connect Outlook" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Refresh all inboxes" })).toBeDisabled();
});
```

- [ ] **Step 8: Update `README.md`.**

- Environment table: replace the three Gmail rows with

| Variable                                         | Purpose                                                                                                           |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`       | Optional Gmail web OAuth client                                                                                   |
| `GOOGLE_REDIRECT_URI`                            | Same-origin `/api/mail/gmail/callback`                                                                            |
| `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` | Optional Outlook (personal accounts) OAuth client                                                                 |
| `MICROSOFT_REDIRECT_URI`                         | Same-origin `/api/mail/outlook/callback`                                                                          |
| `MAIL_TOKEN_ENCRYPTION_KEY`                      | Base64-encoded 32 random bytes; encrypts stored inbox tokens (the old `GMAIL_TOKEN_ENCRYPTION_KEY` is still read) |

- Replace "## Gmail read-only setup" with "## Inbox read-only setup" containing:

**Gmail.** Create a Google Cloud project and enable the Gmail API. Configure the OAuth consent screen as External, add `https://www.googleapis.com/auth/gmail.readonly`, then **publish the app to "In production"**. An unverified app is fine for your own account; you click past Google's warning once. Left in "Testing", Google expires refresh tokens after 7 days and refresh stops working every week. Create an OAuth **web application** client with the redirect URI `http://127.0.0.1:3210/api/mail/gmail/callback`.

**Outlook (personal accounts).** In the Microsoft Entra admin center (free with a personal Microsoft account), create an app registration with supported account types **"Personal Microsoft accounts only"** and a **Web** redirect URI `http://127.0.0.1:3210/api/mail/outlook/callback`. Add a client secret and the delegated Microsoft Graph permissions `Mail.Read`, `User.Read` and `offline_access`. One registration serves every Outlook address; connect each one from Applications → Emails ("Connect Outlook" asks which account to use).

Then open **Applications → Emails**, connect each inbox once, and use **Refresh all inboxes** whenever you want new mail. Access is read-only; tokens are AES-256-GCM encrypted in PostgreSQL. Nothing is ever sent.

- Replace the README's other "Inbox"/"Gmail" workflow mentions (lines ~148, ~161, ~172, ~228, ~241, ~257, ~271) with the Applications → Emails wording and "inbox tokens" instead of "Gmail tokens".

- [ ] **Step 9: Run everything**

Run: `npx vitest run tests/mail-refresh.test.ts tests/application-dates.test.ts && npm run typecheck && npm run lint && npm test && npm run test:e2e && npm run build`
Expected: all pass; build succeeds.

- [ ] **Step 10: Commit**

```bash
git add -A src scripts README.md tests
git commit -m "JOB_FINDER-9999: Refresh all inboxes from the Emails tab" -m "Refresh every connected inbox in parallel, show per-inbox status with reconnect, tag mail with the inbox that received it, and document Gmail and Outlook setup." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**Phase 3 is complete.** Ask the user to connect their Gmail and both Outlook accounts following the README and run one refresh; live OAuth cannot be exercised in tests.
