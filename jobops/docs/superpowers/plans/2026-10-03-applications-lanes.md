# Applications Lanes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Next/Records/Emails tabs on `/applications` with one calendar showing a lane per company: what happened, a derived status and the next step, with matched mail on its lane and leftover mail in an Emails drawer.

**Architecture:** A pure model (`features/applications/lanes.ts`) groups the existing `ApplicationRecord`s by company and derives dots, status, next step, groups, the time window and chart positions. A client chart draws `laneViews()` output. The expanded lane is rendered on the server from `?open=<recordId>` and reuses the existing outcome chips, follow-up and record-as-sent controls, which gain a safe `returnTo`. Mail triage, providers, the queue rules and the database stay unchanged.

**Tech Stack:** Next.js App Router (React 19, server components and actions), TypeScript, Drizzle/PostgreSQL, Tailwind 4 theme tokens, lucide-react, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-03-applications-lanes-design.md` (read with `docs/superpowers/specs/2026-10-03-applications-redesign-design.md` §2, §3, §5 for outcome and queue rules that stay in force).

## Global Constraints

- Run every command from `jobops/`. Unit checks: `npm test`, `npm run typecheck`, `npm run lint`, `npx prettier --check <files>`.
- Use the app through Docker only. Rebuild with `docker compose up -d --build app`; the app serves http://127.0.0.1:3210. Do not start host dev servers.
- `npm run test:e2e` starts a temporary host `next dev` on port 3211 against the marked `jobops_e2e` database. **Ask the user before running it** (project rule: no host servers unless explicitly requested).
- No schema changes, no migrations, no AI calls, nothing sent, and no mail linked without the user's click.
- Day maths and display in Asia/Kolkata, through `features/applications/dates.ts`.
- Styling: shared Tailwind theme tokens only (`bg-selected`, `bg-review`, `bg-success-soft`, `bg-danger-soft`, `bg-muted`, `text-link`, `bg-scrim`, `chart-*`). No palette literals. No tinted urgency panels (they render brown in dark mode); urgency colour lives in dots, text and buttons. Google blue for primary controls, red for destructive, yellow for review.
- Copy: plain words. Provider env var names appear only inside the drawer's "Setup details" fold-out.
- Commits: only when the user approves. Message format `JOB_FINDER-9999: <summary>` (no `feat`/`fix` prefixes), ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never stage `../AGENTS.md` unless the user asks.
- `open=<recordId>` opens the lane containing that record with that role selected (spec §1).

## Review Focus

1. **Stale or hostile URLs**: `?open=` with a deleted record id, a non-UUID, or `mail=` for a message that belongs to another record must render the lanes (no expansion, or a readable mail error), never a 500. Pinned in Task 7 (unit) and Task 9 (browser).
2. **Months-old open history**: an open record from May must not squash the chart; the window clamps at 12 weeks and older dots join one "Earlier" stack at the left edge. Pinned in Task 3.
3. **Same-minute events** (submitted + automatic acknowledgement): one numbered stack, with a readout listing both. Pinned in Task 3.
4. **Records with no dates** (Preparing, no events): an empty track with no `NaN%` positions. Pinned in Tasks 3 and 6.
5. **Long names and many lanes on a 390 px phone**: the page never scrolls sideways; the chart scrolls inside its card with the company column fixed. Pinned in Task 9.

---

## File map

| Path | Status | Responsibility |
| --- | --- | --- |
| `src/features/applications/lanes.ts` | new | Pure lane model: company keys, status, dots, next step, groups, window, stacks, chart views |
| `src/features/applications/return-to.ts` | new | `safeReturnTo`, `withNotice` for post-action destinations |
| `src/features/applications/navigation.ts` | rewrite | `laneHref`, `resolveLanesView` (old tab code removed in Task 8) |
| `src/features/applications/read.ts` | modify | Adds `companyKey`, `companyName` to `ApplicationRecord` |
| `src/features/applications/dates.ts` | modify | Adds `formatWhen` |
| `src/features/applications/views/lane-marks.tsx` | new | `StatusPill`, `DotIcon`, `dueStyle` |
| `src/features/applications/views/timeline.tsx` | new | Vertical timeline list shared by lanes and the record page |
| `src/features/applications/views/lanes.tsx` | new | Client calendar chart |
| `src/features/applications/views/lane-detail.tsx` | new | Server-rendered expanded lane |
| `src/features/applications/views/emails-drawer.tsx` | new | Client `<dialog>` drawer shell and header button |
| `src/features/applications/views/mail-sections.tsx` | new (Task 10) | Drawer contents |
| `src/app/applications/page.tsx` | rewrite | Lanes page |
| `src/features/applications/views/{next,records,tabs,emails}.tsx` | delete | Old tabs |
| `tests/lane-fixtures.ts` | new | Shared unit-test builders |

---

# Phase 1: Lanes

### Task 1: Company keys and lane status

**Files:**
- Create: `src/features/applications/lanes.ts`
- Create: `tests/lane-fixtures.ts`
- Create: `tests/application-lanes.test.ts`
- Modify: `src/features/applications/read.ts`
- Modify: `tests/application-records-view.test.ts` (fixture only; the file is deleted in Task 8)

**Interfaces:**
- Consumes: `silenceClock(record, now)` from `queue.ts`; `recordStateFrom`, `isOutreach`, `methodLabel`, `Phase` from `phase.ts`; `formatDay` from `dates.ts`; `roundKindLabel` from `features/companies/metrics`.
- Produces:
  - `normalizeCompany(value: string): string`
  - `companyResolver(companies: { name: string; aliases: string[] }[]): (company: string) => { companyKey: string; companyName: string }`
  - `type LaneSource` (a `Pick` of `ApplicationRecord` incl. `jobId`, `companyKey`, `companyName`)
  - `type StatusTone = "preparing" | "applied" | "quiet" | "interviewing" | "offer" | "closed"`, `type LaneStatus = { tone: StatusTone; label: string }`
  - `recordStatus(record: LaneSource, now: Date): LaneStatus`
  - `activityOf(record: LaneSource): number`, `leadOf<T extends LaneSource>(records: T[]): T`
  - `laneStatus(records: LaneSource[], now: Date, pendingMail?: boolean): LaneStatus`
  - `ApplicationRecord` gains `companyKey: string; companyName: string`.

- [ ] **Step 1: Create the shared test builders** `tests/lane-fixtures.ts`:

```ts
import type { LaneSource } from "@/features/applications/lanes";

export const NOW = new Date("2026-10-03T10:30:00+05:30");
export const at = (value: string) => new Date(`${value}+05:30`);
let sequence = 0;
export const uid = () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`;

export const record = (patch: Partial<LaneSource> = {}): LaneSource => ({
  id: uid(),
  jobId: uid(),
  company: "Oracle",
  companyKey: "oracle",
  companyName: "Oracle",
  role: "Senior Engineer",
  city: "Hyderabad",
  source: "DIRECT",
  status: "APPLIED",
  contact: null,
  sentAt: at("2026-10-02T18:30:00"),
  nextActionAt: null,
  nextActionNote: "",
  rounds: [],
  events: [],
  linkedMail: [],
  closedReason: null,
  phase: "Applied",
  typicalRounds: null,
  ...patch,
});

export function event(
  applicationId: string,
  eventType: string,
  occurredAt: Date,
  patch: { summary?: string; payload?: Record<string, unknown> } = {},
): LaneSource["events"][number] {
  return {
    id: uid(),
    applicationId,
    eventType,
    source: "MANUAL",
    summary: patch.summary ?? eventType,
    payload: patch.payload ?? {},
    confidence: null,
    occurredAt,
    createdAt: occurredAt,
  };
}

export function round(
  applicationId: string,
  patch: Partial<LaneSource["rounds"][number]> = {},
): LaneSource["rounds"][number] {
  return {
    id: uid(),
    applicationId,
    kind: "DSA",
    name: "",
    scheduledAt: null,
    outcome: "SCHEDULED",
    position: 1,
    notes: "",
    createdAt: NOW,
    updatedAt: NOW,
    ...patch,
  };
}
```

- [ ] **Step 2: Write the failing tests** `tests/application-lanes.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  companyResolver,
  laneStatus,
  leadOf,
  normalizeCompany,
  recordStatus,
  type LaneSource,
} from "@/features/applications/lanes";
import { NOW, at, record, round, uid } from "./lane-fixtures";

describe("company keys", () => {
  it("normalizes case and spacing and maps listed aliases onto the company record", () => {
    const resolve = companyResolver([{ name: "Microsoft", aliases: ["Microsoft India", "MSFT"] }]);
    expect(normalizeCompany("  Level   AI ")).toBe("level ai");
    expect(resolve("microsoft india")).toEqual({ companyKey: "microsoft", companyName: "Microsoft" });
    expect(resolve(" MSFT")).toEqual({ companyKey: "microsoft", companyName: "Microsoft" });
    expect(resolve("Level  AI ")).toEqual({ companyKey: "level ai", companyName: "Level AI" });
  });
});

describe("record status", () => {
  it.each<[string, LaneSource, string, string]>([
    ["preparing", record({ phase: "Preparing", status: "PREPARING", sentAt: null }), "preparing", "Not sent yet"],
    ["sent today", record({ sentAt: at("2026-10-03T09:00:00") }), "applied", "Applied · today"],
    ["sent yesterday", record({ sentAt: at("2026-10-02T18:30:00") }), "applied", "Applied · yesterday"],
    ["below threshold", record({ sentAt: at("2026-09-29T10:00:00") }), "applied", "Applied · 4 days"],
    ["quiet direct", record({ sentAt: at("2026-09-20T12:00:00") }), "quiet", "Quiet for 13 days"],
    [
      "outreach below threshold",
      record({ source: "COLD_EMAIL", sentAt: at("2026-09-30T10:00:00") }),
      "applied",
      "Cold email · 3 of 5 days",
    ],
    [
      "quiet outreach",
      record({ source: "REFERRAL", sentAt: at("2026-09-26T21:00:00") }),
      "quiet",
      "Referral ask · 7 days quiet",
    ],
    [
      "offer with a decision date",
      record({ phase: "Decision", status: "OFFER", nextActionAt: at("2026-10-08T09:00:00") }),
      "offer",
      "Offer · decide by 8 Oct",
    ],
    ["offer without a date", record({ phase: "Decision", status: "OFFER" }), "offer", "Offer received"],
  ])("%s", (_name, input, tone, label) => {
    expect(recordStatus(input, NOW)).toEqual({ tone, label });
  });

  it("calls a replied outreach record replied instead of counting quiet days", () => {
    const id = uid();
    expect(
      recordStatus(
        record({
          id,
          source: "REFERRAL",
          sentAt: at("2026-09-20T10:00:00"),
          events: [
            {
              id: uid(),
              applicationId: id,
              eventType: "REPLY_RECEIVED",
              source: "MANUAL",
              summary: "Replied",
              payload: {},
              confidence: null,
              occurredAt: at("2026-09-22T10:00:00"),
              createdAt: at("2026-09-22T10:00:00"),
            },
          ],
        }),
        NOW,
      ),
    ).toEqual({ tone: "applied", label: "Referral ask · replied" });
  });

  it("counts recorded rounds and adds the research loop only when it covers them", () => {
    const id = uid();
    const interviewing = (typicalRounds: number | null) =>
      record({
        id,
        phase: "Interviewing",
        status: "TECHNICAL_INTERVIEW",
        typicalRounds,
        rounds: [
          round(id, { kind: "ONLINE_ASSESSMENT", outcome: "PASSED", position: 1 }),
          round(id, { outcome: "SCHEDULED", position: 2, scheduledAt: at("2026-10-03T16:00:00") }),
          round(id, { outcome: "CANCELLED", position: 3 }),
        ],
      });
    expect(recordStatus(interviewing(4), NOW)).toEqual({
      tone: "interviewing",
      label: "Interviewing · round 2 of 4",
    });
    expect(recordStatus(interviewing(1), NOW).label).toBe("Interviewing · round 2");
    expect(
      recordStatus(record({ phase: "Interviewing", status: "TECHNICAL_INTERVIEW" }), NOW).label,
    ).toBe("Interviewing");
  });

  it("names how a closed record ended", () => {
    const id = uid();
    const closed = (patch: Partial<LaneSource>) =>
      recordStatus(record({ phase: "Closed", status: "REJECTED", ...patch }), NOW);
    expect(
      closed({
        id,
        closedReason: "REJECTED",
        rounds: [
          round(id, { kind: "ONLINE_ASSESSMENT", outcome: "PASSED", position: 1 }),
          round(id, { kind: "DSA", outcome: "FAILED", position: 2 }),
        ],
      }),
    ).toEqual({ tone: "closed", label: "Rejected after DSA" });
    expect(closed({ closedReason: "REJECTED" }).label).toBe("Rejected");
    expect(closed({ status: "CLOSED", closedReason: "NO_REPLY" }).label).toBe("Closed, no reply");
    expect(closed({ status: "WITHDRAWN", closedReason: "WITHDREW" }).label).toBe("Withdrew");
    expect(closed({ status: "CLOSED", closedReason: "ACCEPTED" })).toEqual({
      tone: "offer",
      label: "Accepted the offer",
    });
    expect(closed({ status: "CLOSED", closedReason: "DECLINED" }).label).toBe("Declined the offer");
    expect(closed({ status: "WITHDRAWN", closedReason: null }).label).toBe("Withdrew");
  });
});

describe("lead and lane status", () => {
  it("leads with the furthest-along open record and counts other open roles, not outreach for the same role", () => {
    const applied = record({ jobId: "job-a", role: "SDE II, Fabric", sentAt: at("2026-10-01T10:00:00") });
    const interviewing = record({
      jobId: "job-b",
      role: "SDE II, Storage",
      phase: "Interviewing",
      status: "TECHNICAL_INTERVIEW",
    });
    const referral = record({
      jobId: "job-b",
      role: "SDE II, Storage",
      source: "REFERRAL",
      sentAt: at("2026-10-01T10:00:00"),
    });
    const rejected = record({ jobId: "job-c", phase: "Closed", status: "REJECTED", closedReason: "REJECTED" });
    const records = [applied, rejected, interviewing, referral];
    expect(leadOf(records).id).toBe(interviewing.id);
    expect(laneStatus(records, NOW)).toEqual({ tone: "interviewing", label: "Interviewing · +1 role" });
  });

  it("marks new email only while the lead is Applied, and leads closed lanes with the latest record", () => {
    expect(laneStatus([record({ sentAt: at("2026-10-02T18:30:00") })], NOW, true).label).toBe(
      "Applied · yesterday · new email",
    );
    const older = record({ phase: "Closed", status: "CLOSED", closedReason: "NO_REPLY", sentAt: at("2026-09-01T10:00:00") });
    const newer = record({ phase: "Closed", status: "REJECTED", closedReason: "REJECTED", sentAt: at("2026-09-20T10:00:00") });
    expect(leadOf([older, newer]).id).toBe(newer.id);
    expect(laneStatus([older, newer], NOW, true)).toEqual({ tone: "closed", label: "Rejected" });
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run tests/application-lanes.test.ts`
Expected: FAIL, `Failed to resolve import "@/features/applications/lanes"`.

- [ ] **Step 4: Create `src/features/applications/lanes.ts`**

```ts
import { roundKindLabel } from "@/features/companies/metrics";
import { formatDay } from "./dates";
import { isOutreach, methodLabel, recordStateFrom, type Phase } from "./phase";
import { silenceClock } from "./queue";
import type { ApplicationRecord } from "./read";

/* ---------- Company keys (spec §2.1) ---------- */

export const normalizeCompany = (value: string) =>
  value.trim().toLocaleLowerCase().replace(/\s+/g, " ");

/** Maps a job's company text onto its lane; listed names and aliases join the company record. */
export function companyResolver(companies: { name: string; aliases: string[] }[]) {
  const canonical = new Map<string, string>();
  for (const company of companies)
    for (const name of [company.name, ...company.aliases])
      canonical.set(normalizeCompany(name), company.name);
  return (company: string) => {
    const name = canonical.get(normalizeCompany(company)) ?? company.trim().replace(/\s+/g, " ");
    return { companyKey: normalizeCompany(name), companyName: name };
  };
}

/* ---------- Status (spec §2.2) ---------- */

export type LaneSource = Pick<
  ApplicationRecord,
  | "id"
  | "jobId"
  | "company"
  | "companyKey"
  | "companyName"
  | "role"
  | "city"
  | "source"
  | "status"
  | "contact"
  | "sentAt"
  | "nextActionAt"
  | "nextActionNote"
  | "rounds"
  | "events"
  | "linkedMail"
  | "closedReason"
  | "phase"
  | "typicalRounds"
>;
export type StatusTone = "preparing" | "applied" | "quiet" | "interviewing" | "offer" | "closed";
export type LaneStatus = { tone: StatusTone; label: string };

const dayWord = (days: number) =>
  days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days`;

function closedStatus(record: LaneSource): LaneStatus {
  switch (record.closedReason) {
    case "ACCEPTED":
      return { tone: "offer", label: "Accepted the offer" };
    case "DECLINED":
      return { tone: "closed", label: "Declined the offer" };
    case "NO_REPLY":
      return { tone: "closed", label: "Closed, no reply" };
    case "WITHDREW":
      return { tone: "closed", label: "Withdrew" };
  }
  if (record.closedReason === "REJECTED" || record.status === "REJECTED") {
    const settled = record.rounds
      .filter((round) => round.outcome === "PASSED" || round.outcome === "FAILED")
      .at(-1);
    return {
      tone: "closed",
      label: settled ? `Rejected after ${roundKindLabel[settled.kind]}` : "Rejected",
    };
  }
  return { tone: "closed", label: record.status === "WITHDRAWN" ? "Withdrew" : "Closed" };
}

/** One record's status in plain words, derived from recorded facts only. */
export function recordStatus(record: LaneSource, now: Date): LaneStatus {
  if (record.phase === "Preparing") return { tone: "preparing", label: "Not sent yet" };
  if (record.phase === "Closed") return closedStatus(record);
  if (record.phase === "Decision")
    return {
      tone: "offer",
      label: record.nextActionAt
        ? `Offer · decide by ${formatDay(record.nextActionAt)}`
        : "Offer received",
    };
  if (record.phase === "Interviewing") {
    const rounds = record.rounds.filter((round) => round.outcome !== "CANCELLED").length;
    if (!rounds) return { tone: "interviewing", label: "Interviewing" };
    const of =
      record.typicalRounds && record.typicalRounds >= rounds ? ` of ${record.typicalRounds}` : "";
    return { tone: "interviewing", label: `Interviewing · round ${rounds}${of}` };
  }
  const outreach = isOutreach(record.source);
  const method = methodLabel[record.source] ?? "Outreach";
  if (outreach && recordStateFrom({ ...record, appliedAt: record.sentAt }, record.rounds, []).replied)
    return { tone: "applied", label: `${method} · replied` };
  const clock = silenceClock(record, now);
  if (!clock) return { tone: "applied", label: outreach ? method : "Applied" };
  if (clock.days >= clock.threshold)
    return {
      tone: "quiet",
      label: outreach ? `${method} · ${clock.days} days quiet` : `Quiet for ${clock.days} days`,
    };
  return {
    tone: "applied",
    label: outreach
      ? `${method} · ${clock.days} of ${clock.threshold} days`
      : `Applied · ${dayWord(clock.days)}`,
  };
}

const phaseRank: Record<Phase, number> = {
  Decision: 4,
  Interviewing: 3,
  Applied: 2,
  Preparing: 1,
  Closed: 0,
};
const timeOf = (value: Date | null) =>
  value && Number.isFinite(value.getTime()) ? value.getTime() : 0;

/** The latest dated thing that happened on a record. */
export function activityOf(record: LaneSource) {
  return Math.max(
    timeOf(record.sentAt),
    ...record.events.map((event) => timeOf(event.occurredAt)),
    ...record.linkedMail.map((mail) => timeOf(mail.receivedAt)),
  );
}

/** The furthest-along open record; when every record is closed, the most recently active one. */
export function leadOf<T extends LaneSource>(records: T[]): T {
  return [...records].sort(
    (a, b) => phaseRank[b.phase] - phaseRank[a.phase] || activityOf(b) - activityOf(a),
  )[0];
}

/** The lead's status, with " · new email" and " · +K role(s)" for other open openings. */
export function laneStatus(records: LaneSource[], now: Date, pendingMail = false): LaneStatus {
  const lead = leadOf(records);
  const status = recordStatus(lead, now);
  const otherJobs = new Set(
    records
      .filter((record) => record.phase !== "Closed" && record.jobId !== lead.jobId)
      .map((record) => record.jobId),
  ).size;
  const mail = pendingMail && lead.phase === "Applied" ? " · new email" : "";
  const more = otherJobs ? ` · +${otherJobs} ${otherJobs === 1 ? "role" : "roles"}` : "";
  return { tone: status.tone, label: `${status.label}${mail}${more}` };
}
```

- [ ] **Step 5: Give records their company key.** In `src/features/applications/read.ts`:
  1. Add `import { companyResolver, normalizeCompany } from "./lanes";` after the `phase` import.
  2. Delete the line `const normalize = (value: string) => value.trim().toLocaleLowerCase().replace(/\s+/g, " ");` and replace the two `normalize(` calls in `typicalRoundsByName` with `normalizeCompany(`.
  3. In `export type ApplicationRecord = …`, add after `jobId: string;`:

```ts
  companyKey: string;
  companyName: string;
```

  4. In `readApplications`, after `const linked = linkedRecordIds(…);` add `const resolve = companyResolver(companies);`, and in the returned record object add `...resolve(job.company),` right after `company: job.company,`.

- [ ] **Step 6: Keep the old view fixture compiling.** In `tests/application-records-view.test.ts`, inside the `record` builder add after `company: "Oracle",`:

```ts
  companyKey: "oracle",
  companyName: "Oracle",
```

- [ ] **Step 7: Run the tests, typecheck and lint**

Run: `npx vitest run tests/application-lanes.test.ts && npm run typecheck && npm run lint`
Expected: all tests in the file PASS; typecheck and lint exit 0.

- [ ] **Step 8: Run the whole unit suite**

Run: `npm test`
Expected: PASS (no other file depends on the new fields).

- [ ] **Step 9: Commit** (after the user approves)

```bash
npx prettier --write src/features/applications/lanes.ts src/features/applications/read.ts tests/lane-fixtures.ts tests/application-lanes.test.ts tests/application-records-view.test.ts
git add src/features/applications/lanes.ts src/features/applications/read.ts tests/lane-fixtures.ts tests/application-lanes.test.ts tests/application-records-view.test.ts
git commit -m "JOB_FINDER-9999: Group application records into company lanes with derived status

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Lane dots, next steps and grouping

**Files:**
- Modify: `src/features/applications/lanes.ts`
- Modify: `src/features/applications/navigation.ts` (add `laneHref`)
- Modify: `tests/lane-fixtures.ts`
- Modify: `tests/application-lanes.test.ts`

**Interfaces:**
- Consumes: Task 1 exports; `buildQueue`, `silenceClock`, `QueueItem`, `Due` from `queue.ts`; `suggestedOutcome`, `TriageInput` from `features/mail/triage`; `historyTone`, `OutcomeId` from `phase.ts`.
- Produces:
  - `laneHref(recordId: string, extra?: { mail?: string | null; outcome?: string | null }): string` in `navigation.ts`
  - `type DotTone = "sent" | "mail" | "good" | "bad" | "note" | "upcoming" | "pending"`
  - `type LaneDot = { key; at: Date; tone: DotTone; label; detail; recordId; role: string | null; via: string | null; mailId: string | null; outcome: OutcomeId | null }`
  - `type PendingMail = { id; recordId; subject; classification; receivedAt: Date; outcome: OutcomeId | null }`
  - `pendingMailFrom(messages: TriageInput[]): PendingMail[]`
  - `laneDots(records: LaneSource[], pending: PendingMail[], now: Date): LaneDot[]`
  - `type LaneNext = { recordId; due: Due | null; at: Date | null; when; text; action; href }`
  - `recordNext(record, items: QueueItem[], pending: PendingMail[], now): LaneNext | null`
  - `type LaneRole = { recordId; role; city; source; phase: Phase; status: LaneStatus; next: LaneNext | null }`
  - `type LaneGroup = "needs" | "active" | "closed"`
  - `type Lane = { key; company; leadId; roles: LaneRole[]; status: LaneStatus; dots: LaneDot[]; next: LaneNext | null; group: LaneGroup; lastActivity: number }`
  - `buildLanes(input: { records: LaneSource[]; items: QueueItem[]; pending: PendingMail[]; now: Date }): Lane[]` (sorted needs → active → closed)
  - `clip(text: string, max: number): string`
  - Test helper `lanesFor(records, pending?, mail?)` in `tests/lane-fixtures.ts`.

- [ ] **Step 1: Add the test helper.** In `tests/lane-fixtures.ts` replace the first line with:

```ts
import { buildLanes, type LaneSource, type PendingMail } from "@/features/applications/lanes";
import { buildQueue, type QueueMail } from "@/features/applications/queue";
```

and append:

```ts
export const lanesFor = (
  records: LaneSource[],
  pending: PendingMail[] = [],
  mail: QueueMail[] = [],
) =>
  buildLanes({
    records,
    items: buildQueue({ records, mail, snoozes: new Map(), now: NOW }),
    pending,
    now: NOW,
  });
```

- [ ] **Step 2: Write the failing tests.** In `tests/application-lanes.test.ts` extend the lanes import to also import `laneDots` and `pendingMailFrom`, change the fixtures import to `import { NOW, at, event, lanesFor, record, round, uid } from "./lane-fixtures";`, and append:

```ts
describe("lane dots", () => {
  it("uses short labels, skips mail an event already points at, and adds rounds, follow-ups and pending mail", () => {
    const id = uid();
    const mailId = uid();
    const ackId = uid();
    const pendingId = uid();
    const source = record({
      id,
      phase: "Interviewing",
      status: "ASSESSMENT",
      nextActionAt: at("2026-10-05T09:00:00"),
      nextActionNote: "Check the portal",
      events: [
        event(id, "APPLICATION_SUBMITTED", at("2026-09-24T09:00:00"), {
          summary: "Submission confirmation verified on Ashby: Success",
        }),
        event(id, "ASSESSMENT_RECEIVED", at("2026-09-26T10:00:00"), {
          payload: { mailMessageId: mailId },
        }),
        event(id, "MANUAL_NOTE", at("2026-09-27T10:00:00"), { summary: "Asked about the team" }),
      ],
      linkedMail: [
        { id: mailId, subject: "HackerRank invite", classification: "ASSESSMENT", receivedAt: at("2026-09-26T09:59:00") },
        { id: ackId, subject: "We received it", classification: "APPLICATION_ACKNOWLEDGEMENT", receivedAt: at("2026-09-24T09:05:00") },
      ],
      rounds: [
        round(id, { kind: "ONLINE_ASSESSMENT", scheduledAt: at("2026-10-07T23:59:00"), name: "HackerRank" }),
      ],
    });
    const dots = laneDots(
      [source],
      [
        {
          id: pendingId,
          recordId: id,
          subject: "Round 2 confirmed",
          classification: "INTERVIEW",
          receivedAt: at("2026-10-03T09:12:00"),
          outcome: "scheduled",
        },
      ],
      NOW,
    );
    expect(dots.map((dot) => [dot.tone, dot.label])).toEqual([
      ["sent", "Applied"],
      ["mail", "Automatic “we received it”"],
      ["mail", "Got an OA"],
      ["note", "Note"],
      ["pending", "Interview email · not added yet"],
      ["upcoming", "Check the portal"],
      ["upcoming", "OA closes"],
    ]);
    expect(dots[0].detail).toBe("Submission confirmation verified on Ashby: Success");
    expect(dots[2].mailId).toBe(mailId);
    expect(dots[3].detail).toBe("Asked about the team");
    expect(dots[4]).toMatchObject({ mailId: pendingId, outcome: "scheduled", recordId: id });
    expect(dots.every((dot) => dot.role === null && dot.via === null)).toBe(true);
  });

  it("tags roles when a company has several openings, tags outreach by method, and falls back to the sent date", () => {
    const direct = record({ jobId: "job-a", role: "SDE II, Fabric", sentAt: at("2026-10-01T10:00:00") });
    const referral = record({
      jobId: "job-b",
      role: "SDE II, Storage",
      source: "REFERRAL",
      sentAt: at("2026-09-30T10:00:00"),
    });
    expect(laneDots([direct, referral], [], NOW).map((dot) => [dot.label, dot.role, dot.via])).toEqual([
      ["Reached out", "SDE II, Storage", "Referral ask"],
      ["Applied", "SDE II, Fabric", null],
    ]);
  });
});

describe("pending mail", () => {
  it("keeps matched updates and acknowledgements with their suggested outcome", () => {
    const base = { subject: "s", sender: "a@example.invalid", senderName: "", receivedAt: NOW };
    const pending = pendingMailFrom([
      { ...base, id: "1", classification: "ASSESSMENT", bucket: "updates", record: { id: "r1", company: "X" } },
      {
        ...base,
        id: "2",
        classification: "APPLICATION_ACKNOWLEDGEMENT",
        bucket: "noise",
        record: { id: "r1", company: "X" },
      },
      { ...base, id: "3", classification: "INTERVIEW", bucket: "updates", record: null },
      { ...base, id: "4", classification: "RECRUITER_OUTREACH", bucket: "roles", record: null },
    ]);
    expect(pending.map((mail) => [mail.id, mail.outcome])).toEqual([
      ["1", "oa"],
      ["2", null],
    ]);
  });
});

describe("next steps and groups", () => {
  it("turns quiet records, booked rounds and matched mail into lane actions, mail first", () => {
    const quiet = record({ company: "Flipkart", companyKey: "flipkart", companyName: "Flipkart", sentAt: at("2026-09-20T12:00:00") });
    const id = uid();
    const booked = record({
      id,
      company: "Razorpay",
      companyKey: "razorpay",
      companyName: "Razorpay",
      phase: "Interviewing",
      status: "TECHNICAL_INTERVIEW",
      rounds: [round(id, { scheduledAt: at("2026-10-03T16:00:00"), position: 2 })],
    });
    const invited = record({ company: "Zscaler", companyKey: "zscaler", companyName: "Zscaler", sentAt: at("2026-09-24T09:00:00") });
    const mail = {
      id: uid(),
      recordId: invited.id,
      subject: "Zscaler has invited you to an online assessment",
      classification: "ASSESSMENT",
      receivedAt: at("2026-10-02T18:40:00"),
      outcome: "oa" as const,
    };
    const lanes = lanesFor(
      [quiet, booked, invited],
      [mail],
      [{ id: mail.id, title: mail.subject, detail: "", receivedAt: mail.receivedAt, primary: { label: "Link", href: "/" } }],
    );
    const next = Object.fromEntries(lanes.map((lane) => [lane.company, lane.next]));
    expect(next.Flipkart).toMatchObject({
      due: "overdue",
      when: "6 days late",
      action: "I followed up",
      href: `/applications?open=${quiet.id}&outcome=followup`,
    });
    expect(next.Razorpay).toMatchObject({ due: "today", when: "Today, 4:00 pm", action: "Open", href: `/applications?open=${id}` });
    expect(next.Zscaler).toMatchObject({
      due: "today",
      when: "New email",
      action: "Link it",
      href: `/applications?open=${invited.id}&mail=${mail.id}&outcome=oa`,
    });
    expect(lanes.map((lane) => [lane.company, lane.group])).toEqual([
      ["Flipkart", "needs"],
      ["Zscaler", "needs"],
      ["Razorpay", "needs"],
    ]);
  });

  it("falls back to the quiet-clock date or the send step, and closed lanes have nothing next", () => {
    const fresh = record({ sentAt: at("2026-10-02T18:30:00") });
    const draft = record({ companyKey: "quizizz", companyName: "Quizizz", phase: "Preparing", status: "PREPARING", sentAt: null });
    const closed = record({ companyKey: "nutanix", companyName: "Nutanix", phase: "Closed", status: "REJECTED", closedReason: "REJECTED" });
    const lanes = lanesFor([closed, fresh, draft]);
    const byCompany = Object.fromEntries(lanes.map((lane) => [lane.company, lane]));
    expect(byCompany.Oracle.next).toMatchObject({
      due: null,
      when: "Fri, 9 Oct",
      text: "Follow up if it stays quiet",
      action: "Open",
    });
    expect(byCompany.Quizizz.next).toMatchObject({ due: null, when: "Not sent", text: "Finish and send it" });
    expect(byCompany.Nutanix.next).toBeNull();
    expect(lanes.map((lane) => [lane.company, lane.group])).toEqual([
      ["Oracle", "active"],
      ["Quizizz", "active"],
      ["Nutanix", "closed"],
    ]);
  });

  it("merges a company's roles into one lane and names the role in its next step", () => {
    const a = record({
      company: "Microsoft",
      companyKey: "microsoft",
      companyName: "Microsoft",
      jobId: "job-a",
      role: "SDE II, Fabric",
      sentAt: at("2026-10-02T10:00:00"),
    });
    const b = record({
      company: "Microsoft",
      companyKey: "microsoft",
      companyName: "Microsoft",
      jobId: "job-b",
      role: "SDE II, Storage",
      source: "REFERRAL",
      sentAt: at("2026-09-26T21:00:00"),
    });
    const lanes = lanesFor([a, b]);
    expect(lanes).toHaveLength(1);
    const [lane] = lanes;
    expect(lane.leadId).toBe(a.id);
    expect(lane.roles.map((role) => role.recordId)).toEqual([a.id, b.id]);
    expect(lane.status.label).toBe("Applied · yesterday · +1 role");
    expect(lane.next).toMatchObject({
      due: "overdue",
      text: "SDE II, Storage: No reply from Microsoft",
      action: "I followed up",
    });
    expect(lane.group).toBe("needs");
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run tests/application-lanes.test.ts`
Expected: FAIL, `laneDots is not a function` / `buildLanes` missing.

- [ ] **Step 4: Add `laneHref`.** Append to `src/features/applications/navigation.ts`:

```ts
/** The Applications page with the lane holding this record expanded (spec §1). */
export function laneHref(
  recordId: string,
  extra: { mail?: string | null; outcome?: string | null } = {},
) {
  const query = new URLSearchParams({ open: recordId });
  if (extra.mail) query.set("mail", extra.mail);
  if (extra.outcome) query.set("outcome", extra.outcome);
  return `/applications?${query}`;
}
```

- [ ] **Step 5: Replace the import block of `lanes.ts`** with:

```ts
import { roundKindLabel } from "@/features/companies/metrics";
import { suggestedOutcome, type TriageInput } from "@/features/mail/triage";
import {
  addDays,
  formatDay,
  formatTime,
  formatWeekday,
  istDayStart,
  istDaysBetween,
} from "./dates";
import { laneHref } from "./navigation";
import {
  historyTone,
  isOutreach,
  methodLabel,
  recordStateFrom,
  type OutcomeId,
  type Phase,
} from "./phase";
import { silenceClock, type Due, type QueueItem } from "./queue";
import type { ApplicationRecord } from "./read";
```

- [ ] **Step 6: Append dots, next steps and `buildLanes` to `lanes.ts`**

```ts
/* ---------- Dots (spec §2.3) ---------- */

export type DotTone = "sent" | "mail" | "good" | "bad" | "note" | "upcoming" | "pending";
export type LaneDot = {
  key: string;
  at: Date;
  tone: DotTone;
  label: string;
  detail: string;
  recordId: string;
  role: string | null;
  via: string | null;
  mailId: string | null;
  outcome: OutcomeId | null;
};
export type PendingMail = {
  id: string;
  recordId: string;
  subject: string;
  classification: string;
  receivedAt: Date;
  outcome: OutcomeId | null;
};

const sentEvents = new Set([
  "APPLICATION_SENT",
  "APPLICATION_SUBMITTED",
  "OUTREACH_SENT",
  "FOLLOW_UP_SENT",
]);
const replyEvents = new Set([
  "REPLY_RECEIVED",
  "ASSESSMENT_RECEIVED",
  "INTERVIEW_REQUESTED",
  "INTERVIEW_SCHEDULED",
  "ROUND_RESCHEDULED",
]);
const eventLabel: Record<string, string> = {
  APPLICATION_CREATED: "Saved the opening",
  APPLICATION_SENT: "Applied",
  APPLICATION_SUBMITTED: "Applied",
  OUTREACH_SENT: "Reached out",
  FOLLOW_UP_SENT: "Sent a follow-up",
  REPLY_RECEIVED: "Heard back",
  ASSESSMENT_RECEIVED: "Got an OA",
  INTERVIEW_REQUESTED: "Interview requested",
  INTERVIEW_SCHEDULED: "Round scheduled",
  ROUND_PASSED: "Cleared the round",
  ROUND_FAILED: "Didn't clear the round",
  ROUND_RESCHEDULED: "Round rescheduled",
  OFFER_RECEIVED: "Got an offer",
  OFFER_ACCEPTED: "Accepted the offer",
  OFFER_DECLINED: "Declined the offer",
  REJECTION_RECEIVED: "Rejected",
  CLOSED_NO_REPLY: "Closed, no reply",
  WITHDRAWN: "Withdrew",
  REFERRAL_SUBMITTED: "Referral submitted",
  REFERRAL_DECLINED: "Referral declined",
  MANUAL_NOTE: "Note",
  MAIL_UNLINKED: "Email unlinked",
};
const mailLabel: Record<string, string> = {
  INTERVIEW: "Interview email",
  ASSESSMENT: "Assessment invite",
  OFFER: "Offer email",
  REJECTION: "Rejection email",
  FOLLOW_UP: "Recruiter reply",
  RECRUITER_OUTREACH: "Recruiter email",
  APPLICATION_ACKNOWLEDGEMENT: "Automatic “we received it”",
  UNKNOWN: "Email",
};

/** Single-line text clipped with an ellipsis. */
export function clip(text: string, max: number) {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

/** First match wins: bad, sent, reply (mail only when it came from mail), good, note. */
export function eventTone(eventType: string, fromMail: boolean): DotTone {
  if (historyTone(eventType) === "bad") return "bad";
  if (sentEvents.has(eventType)) return "sent";
  if (replyEvents.has(eventType)) return fromMail ? "mail" : "note";
  return historyTone(eventType) === "good" ? "good" : "note";
}

/** Open mail the triage matched to a record: updates and acknowledgements (spec §3). */
export function pendingMailFrom(messages: TriageInput[]): PendingMail[] {
  return messages.flatMap((message) =>
    message.record &&
    (message.bucket === "updates" || message.classification === "APPLICATION_ACKNOWLEDGEMENT")
      ? [
          {
            id: message.id,
            recordId: message.record.id,
            subject: message.subject,
            classification: message.classification,
            receivedAt: message.receivedAt,
            outcome: suggestedOutcome[message.classification],
          },
        ]
      : [],
  );
}

export function laneDots(records: LaneSource[], pending: PendingMail[], now: Date): LaneDot[] {
  const severalJobs = new Set(records.map((record) => record.jobId)).size > 1;
  const dots: LaneDot[] = [];
  for (const record of records) {
    const base = {
      recordId: record.id,
      role: severalJobs ? record.role : null,
      via: isOutreach(record.source) ? (methodLabel[record.source] ?? null) : null,
      mailId: null,
      outcome: null,
    };
    const referenced = new Set(
      record.events
        .map((event) => event.payload.mailMessageId)
        .filter((value): value is string => typeof value === "string"),
    );
    for (const event of record.events) {
      const mailId =
        typeof event.payload.mailMessageId === "string" ? event.payload.mailMessageId : null;
      const summary = clip(event.summary, 80);
      const label = eventLabel[event.eventType] ?? summary;
      dots.push({
        ...base,
        key: `event:${event.id}`,
        at: event.occurredAt,
        tone: eventTone(event.eventType, mailId !== null),
        label,
        detail: label === summary ? "" : clip(event.summary, 160),
        mailId,
      });
    }
    for (const mail of record.linkedMail) {
      if (referenced.has(mail.id)) continue;
      dots.push({
        ...base,
        key: `mail:${mail.id}`,
        at: mail.receivedAt,
        tone: "mail",
        label: mailLabel[mail.classification] ?? "Email",
        detail: clip(mail.subject, 160),
        mailId: mail.id,
      });
    }
    if (!record.events.length && record.sentAt)
      dots.push({
        ...base,
        key: `sent:${record.id}`,
        at: record.sentAt,
        tone: "sent",
        label: isOutreach(record.source) ? "Reached out" : "Applied",
        detail: "",
      });
    for (const round of record.rounds) {
      if (round.outcome !== "SCHEDULED" || !round.scheduledAt) continue;
      dots.push({
        ...base,
        key: `round:${round.id}`,
        at: round.scheduledAt,
        tone: "upcoming",
        label:
          round.kind === "ONLINE_ASSESSMENT"
            ? "OA closes"
            : `Round ${round.position} · ${roundKindLabel[round.kind]}`,
        detail: round.name,
      });
    }
    if (record.nextActionAt && record.phase !== "Closed" && record.nextActionAt > now)
      dots.push({
        ...base,
        key: `followup:${record.id}`,
        at: record.nextActionAt,
        tone: "upcoming",
        label: record.nextActionNote ? clip(record.nextActionNote, 80) : "Follow up",
        detail: "Your follow-up date",
      });
  }
  for (const mail of pending) {
    const record = records.find((item) => item.id === mail.recordId);
    if (!record) continue;
    dots.push({
      key: `pending:${mail.id}`,
      at: mail.receivedAt,
      tone: "pending",
      label: `${mailLabel[mail.classification] ?? "Email"} · not added yet`,
      detail: clip(mail.subject, 160),
      recordId: record.id,
      role: severalJobs ? record.role : null,
      via: null,
      mailId: mail.id,
      outcome: mail.outcome,
    });
  }
  return dots
    .filter((dot) => Number.isFinite(dot.at.getTime()))
    .sort((a, b) => a.at.getTime() - b.at.getTime());
}

/* ---------- Next step (spec §2.4) ---------- */

export type LaneNext = {
  recordId: string;
  due: Due | null;
  at: Date | null;
  when: string;
  text: string;
  action: string;
  href: string;
};
export type LaneRole = {
  recordId: string;
  role: string;
  city: string;
  source: string;
  phase: Phase;
  status: LaneStatus;
  next: LaneNext | null;
};
export type LaneGroup = "needs" | "active" | "closed";
export type Lane = {
  key: string;
  company: string;
  leadId: string;
  roles: LaneRole[];
  status: LaneStatus;
  dots: LaneDot[];
  next: LaneNext | null;
  group: LaneGroup;
  lastActivity: number;
};

function whenText(item: QueueItem, now: Date) {
  if (item.reason === "mail") return "New email";
  const timed = item.reason === "round" || item.reason === "deadline";
  if (item.due === "overdue") {
    const days = Math.max(1, istDaysBetween(item.dueAt, now));
    return `${days} ${days === 1 ? "day" : "days"} late`;
  }
  if (item.due === "today") return timed ? `Today, ${formatTime(item.dueAt)}` : "Today";
  return timed ? `${formatWeekday(item.dueAt)}, ${formatTime(item.dueAt)}` : formatWeekday(item.dueAt);
}

/** Matched mail first (linking it usually settles the rest), else the first queue item, else a fallback. */
export function recordNext(
  record: LaneSource,
  items: QueueItem[],
  pending: PendingMail[],
  now: Date,
): LaneNext | null {
  const mine = pending.filter((mail) => mail.recordId === record.id);
  const item =
    items.find((entry) => entry.reason === "mail" && mine.some((mail) => entry.key === `mail:${mail.id}`)) ??
    items.find((entry) => entry.recordId === record.id);
  const href = laneHref(record.id);
  if (item) {
    const base = { recordId: record.id, due: item.due, at: item.dueAt, when: whenText(item, now) };
    if (item.reason === "mail") {
      const mail = mine.find((entry) => item.key === `mail:${entry.id}`)!;
      return {
        ...base,
        text: clip(mail.subject, 120),
        action: "Link it",
        href: laneHref(record.id, { mail: mail.id, outcome: mail.outcome }),
      };
    }
    if (item.reason === "silence")
      return {
        ...base,
        text: item.title,
        action: "I followed up",
        href: laneHref(record.id, { outcome: "followup" }),
      };
    const settle = (item.reason === "round" || item.reason === "deadline") && item.dueAt <= now;
    return { ...base, text: item.title, action: settle ? "Record result" : "Open", href };
  }
  if (record.phase === "Closed") return null;
  if (record.phase === "Preparing")
    return { recordId: record.id, due: null, at: null, when: "Not sent", text: "Finish and send it", action: "Open", href };
  const clock = silenceClock(record, now);
  if (!clock) return null;
  const at = addDays(istDayStart(clock.since), clock.threshold);
  return {
    recordId: record.id,
    due: null,
    at,
    when: formatWeekday(at),
    text: "Follow up if it stays quiet",
    action: "Open",
    href,
  };
}

const dueRank: Record<Due, number> = { overdue: 0, today: 1, week: 2 };
const nextRank = (next: LaneNext | null) => (!next ? 4 : next.due ? dueRank[next.due] : 3);
const nextTime = (next: LaneNext | null) => next?.at?.getTime() ?? Number.MAX_SAFE_INTEGER;
const groupRank: Record<LaneGroup, number> = { needs: 0, active: 1, closed: 2 };

/** One lane per company key, sorted needs → active → closed (spec §2.5). */
export function buildLanes(input: {
  records: LaneSource[];
  items: QueueItem[];
  pending: PendingMail[];
  now: Date;
}): Lane[] {
  const { now } = input;
  const byKey = new Map<string, LaneSource[]>();
  for (const record of input.records)
    byKey.set(record.companyKey, [...(byKey.get(record.companyKey) ?? []), record]);
  const lanes: Lane[] = [];
  for (const [key, records] of byKey) {
    const lead = leadOf(records);
    const latest = [...records].sort((a, b) => activityOf(b) - activityOf(a))[0];
    const pending = input.pending.filter((mail) => records.some((record) => record.id === mail.recordId));
    const openJobs = new Set(records.filter((record) => record.phase !== "Closed").map((record) => record.jobId));
    const roles: LaneRole[] = records
      .map((record) => ({
        recordId: record.id,
        role: record.role,
        city: record.city,
        source: record.source,
        phase: record.phase,
        status: recordStatus(record, now),
        next: recordNext(record, input.items, input.pending, now),
      }))
      .sort(
        (a, b) =>
          Number(b.recordId === lead.id) - Number(a.recordId === lead.id) ||
          phaseRank[b.phase] - phaseRank[a.phase],
      );
    const next =
      roles
        .flatMap((role) =>
          role.next
            ? [openJobs.size > 1 ? { ...role.next, text: `${role.role}: ${role.next.text}` } : role.next]
            : [],
        )
        .sort((a, b) => nextRank(a) - nextRank(b) || nextTime(a) - nextTime(b))[0] ?? null;
    const closed = records.every((record) => record.phase === "Closed");
    lanes.push({
      key,
      company: latest.companyName,
      leadId: lead.id,
      roles,
      status: laneStatus(records, now, pending.length > 0),
      dots: laneDots(records, pending, now),
      next,
      group: closed ? "closed" : next?.due === "overdue" || next?.due === "today" ? "needs" : "active",
      lastActivity: Math.max(0, ...records.map(activityOf)),
    });
  }
  return lanes.sort(
    (a, b) =>
      groupRank[a.group] - groupRank[b.group] ||
      (a.group === "closed" ? 0 : nextRank(a.next) - nextRank(b.next) || nextTime(a.next) - nextTime(b.next)) ||
      b.lastActivity - a.lastActivity,
  );
}
```

- [ ] **Step 7: Run the tests, typecheck and lint**

Run: `npx vitest run tests/application-lanes.test.ts && npm run typecheck && npm run lint`
Expected: PASS; exit 0. If `formatDay` is reported unused, it is still used by `recordStatus`; any other unused import means a step was skipped.

- [ ] **Step 8: Commit** (after the user approves)

```bash
npx prettier --write src/features/applications/lanes.ts src/features/applications/navigation.ts tests/lane-fixtures.ts tests/application-lanes.test.ts
git add src/features/applications/lanes.ts src/features/applications/navigation.ts tests/lane-fixtures.ts tests/application-lanes.test.ts
git commit -m "JOB_FINDER-9999: Derive lane dots and next steps from events, rounds and matched mail

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Calendar window, stacked dots and chart views

**Files:**
- Modify: `src/features/applications/lanes.ts`
- Create: `tests/application-lane-window.test.ts`

**Interfaces:**
- Consumes: `Lane`, `LaneDot`, `DotTone`, `LaneStatus`, `LaneNext`, `LaneGroup` (Task 2); `indiaDate`, `formatDay`, `formatTime`, `istDayStart` from `dates.ts`.
- Produces:
  - `type LaneWindow = { start: number; end: number; ticks: number[] }`
  - `laneWindow(lanes: Lane[], now: Date): LaneWindow`
  - `positionOf(window: LaneWindow, at: number): number` (0–100)
  - `type DotStack = { pct: number; earlier: boolean; dots: LaneDot[]; lead: LaneDot }`
  - `stackDots(dots: LaneDot[], window: LaneWindow, gap?: number): DotStack[]`
  - `dayLabel(at: Date, now: Date): string`
  - `type StackView = { key; pct; tone: DotTone; count; label; lines: string[] }`
  - `type LaneView = { key; company; leadId; status; group; next; stacks: StackView[]; line: { from; to } | null; dashed: { from; to } | null }`
  - `type ChartView = { lanes: LaneView[]; today: number; ticks: { pct: number; label: string | null }[] }`
  - `laneViews(lanes: Lane[], window: LaneWindow, now: Date): ChartView`

The spec's daily ticks cannot occur with the 14-day minimum, so ticks are every 3 days up to 21 days and on Mondays beyond.

- [ ] **Step 1: Write the failing tests** `tests/application-lane-window.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { laneViews, laneWindow, stackDots } from "@/features/applications/lanes";
import { NOW, at, event, lanesFor, record, round, uid } from "./lane-fixtures";

describe("lane window", () => {
  it("runs from two days before the oldest open dot to a week after today, at least two weeks wide", () => {
    const fresh = laneWindow(lanesFor([record({ sentAt: at("2026-10-02T18:30:00") })]), NOW);
    expect(new Date(fresh.end)).toEqual(at("2026-10-11T00:00:00"));
    expect(new Date(fresh.start)).toEqual(at("2026-09-27T00:00:00"));
    const old = laneWindow(lanesFor([record({ sentAt: at("2026-08-28T10:00:00") })]), NOW);
    expect(new Date(old.start)).toEqual(at("2026-08-26T00:00:00"));
  });

  it("clamps months-old open history to twelve weeks with one Earlier stack, ignoring closed lanes", () => {
    const ancient = record({ companyKey: "a", companyName: "A", sentAt: at("2026-05-01T10:00:00") });
    const closedOld = record({
      companyKey: "b",
      companyName: "B",
      phase: "Closed",
      status: "REJECTED",
      closedReason: "REJECTED",
      sentAt: at("2026-03-01T10:00:00"),
    });
    const lanes = lanesFor([ancient, closedOld]);
    const window = laneWindow(lanes, NOW);
    expect(new Date(window.start)).toEqual(at("2026-07-19T00:00:00"));
    const lane = lanes.find((item) => item.company === "A")!;
    expect(stackDots(lane.dots, window)[0]).toMatchObject({ pct: 0, earlier: true });
    const view = laneViews(lanes, window, NOW).lanes.find((item) => item.company === "A")!;
    expect(view.stacks[0].label.startsWith("Earlier: ")).toBe(true);
  });

  it("ticks every three days up to three weeks and on Mondays beyond", () => {
    const short = laneWindow(lanesFor([record({ sentAt: at("2026-10-02T18:30:00") })]), NOW);
    expect(short.ticks.map((tick) => new Date(tick))).toEqual(
      ["2026-09-28", "2026-10-01", "2026-10-04", "2026-10-07", "2026-10-10"].map((day) => at(`${day}T00:00:00`)),
    );
    const long = laneWindow(lanesFor([record({ sentAt: at("2026-08-28T10:00:00") })]), NOW);
    expect(long.ticks.map((tick) => new Date(tick))).toEqual(
      ["2026-08-31", "2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28", "2026-10-05"].map((day) =>
        at(`${day}T00:00:00`),
      ),
    );
  });
});

describe("stacked dots and chart views", () => {
  it("stacks dots minutes apart, leads with the more important one and reads out both", () => {
    const id = uid();
    const source = record({
      id,
      sentAt: at("2026-09-20T12:00:00"),
      events: [event(id, "APPLICATION_SUBMITTED", at("2026-09-20T12:00:00"), { summary: "Applied" })],
      linkedMail: [
        { id: uid(), subject: "We got it", classification: "APPLICATION_ACKNOWLEDGEMENT", receivedAt: at("2026-09-20T12:05:00") },
      ],
    });
    const lanes = lanesFor([source]);
    const view = laneViews(lanes, laneWindow(lanes, NOW), NOW);
    const [lane] = view.lanes;
    expect(lane.stacks).toHaveLength(1);
    expect(lane.stacks[0]).toMatchObject({ count: 2, tone: "mail" });
    expect(lane.stacks[0].lines).toEqual([
      "Applied, 20 Sept",
      "Automatic “we received it”, 20 Sept (We got it)",
    ]);
    expect(lane.line).toEqual({ from: lane.stacks[0].pct, to: view.today });
    expect(lane.dashed).toBeNull();
  });

  it("dashes the booked future, leaves dateless lanes empty and hides tick labels beside Today", () => {
    const id = uid();
    const booked = record({
      id,
      companyKey: "uber",
      companyName: "Uber",
      phase: "Interviewing",
      status: "TECHNICAL_INTERVIEW",
      sentAt: at("2026-09-28T10:00:00"),
      rounds: [round(id, { kind: "LLD", scheduledAt: at("2026-10-06T11:00:00"), position: 3 })],
    });
    const empty = record({ companyKey: "quizizz", companyName: "Quizizz", phase: "Preparing", status: "PREPARING", sentAt: null });
    const lanes = lanesFor([booked, empty]);
    const view = laneViews(lanes, laneWindow(lanes, NOW), NOW);
    const uber = view.lanes.find((lane) => lane.company === "Uber")!;
    expect(uber.dashed).toEqual({ from: view.today, to: expect.any(Number) });
    expect(uber.stacks.at(-1)).toMatchObject({ tone: "upcoming", lines: ["Round 3 · LLD, 6 Oct"] });
    expect(view.lanes.find((lane) => lane.company === "Quizizz")).toMatchObject({
      stacks: [],
      line: null,
      dashed: null,
    });
    expect(view.ticks.some((tick) => tick.label === null)).toBe(true);
    expect(
      view.ticks.filter((tick) => tick.label === null).every((tick) => Math.abs(tick.pct - view.today) <= 5),
    ).toBe(true);
    expect(JSON.stringify(view)).not.toContain("NaN");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/application-lane-window.test.ts`
Expected: FAIL, `laneWindow is not a function`.

- [ ] **Step 3: Add `indiaDate` to the `./dates` import of `lanes.ts`**, giving:

```ts
import {
  addDays,
  formatDay,
  formatTime,
  formatWeekday,
  indiaDate,
  istDayStart,
  istDaysBetween,
} from "./dates";
```

- [ ] **Step 4: Append the window, stacks and views to `lanes.ts`**

```ts
/* ---------- Calendar (spec §2.6) ---------- */

const DAY = 86_400_000;
const IST_OFFSET = 19_800_000;
export type LaneWindow = { start: number; end: number; ticks: number[] };

/** Two days before the oldest open dot to the end of the 7th IST day after today; 2–12 weeks wide. */
export function laneWindow(lanes: Lane[], now: Date): LaneWindow {
  const today = istDayStart(now).getTime();
  const end = today + 8 * DAY;
  const times = lanes
    .filter((lane) => lane.group !== "closed")
    .flatMap((lane) => lane.dots.map((dot) => dot.at.getTime()));
  const first = istDayStart(new Date(Math.min(today, ...times))).getTime() - 2 * DAY;
  const start = Math.max(end - 84 * DAY, Math.min(end - 14 * DAY, first));
  const step = (end - start) / DAY <= 21 ? 3 : 7;
  const ticks: number[] = [];
  let tick = start + DAY;
  if (step === 7) while (new Date(tick + IST_OFFSET).getUTCDay() !== 1) tick += DAY;
  for (; tick < end; tick += step * DAY) ticks.push(tick);
  return { start, end, ticks };
}

export const positionOf = (window: LaneWindow, at: number) =>
  Math.min(100, Math.max(0, ((at - window.start) / (window.end - window.start)) * 100));

export type DotStack = { pct: number; earlier: boolean; dots: LaneDot[]; lead: LaneDot };
const dotWeight: Record<DotTone, number> = {
  pending: 6,
  upcoming: 5,
  bad: 4,
  good: 3,
  mail: 2,
  sent: 1,
  note: 0,
};

/** Dots closer than `gap` percent share a stack; anything before the window is one Earlier stack. */
export function stackDots(dots: LaneDot[], window: LaneWindow, gap = 4.5): DotStack[] {
  const stacks: Omit<DotStack, "lead">[] = [];
  for (const dot of dots) {
    const time = dot.at.getTime();
    const earlier = time < window.start;
    const pct = positionOf(window, time);
    const last = stacks.at(-1);
    if (last && last.earlier === earlier && (earlier || pct - last.pct < gap)) last.dots.push(dot);
    else stacks.push({ pct, earlier, dots: [dot] });
  }
  return stacks.map((stack) => ({
    ...stack,
    lead: stack.dots.reduce((best, dot) => (dotWeight[dot.tone] > dotWeight[best.tone] ? dot : best)),
  }));
}

/** "Today", "Today, 4:00 pm" for later today, else "3 Oct". */
export function dayLabel(at: Date, now: Date) {
  if (indiaDate(at) === indiaDate(now)) return at > now ? `Today, ${formatTime(at)}` : "Today";
  return formatDay(at);
}

export type StackView = {
  key: string;
  pct: number;
  tone: DotTone;
  count: number;
  label: string;
  lines: string[];
};
export type LaneView = {
  key: string;
  company: string;
  leadId: string;
  status: LaneStatus;
  group: LaneGroup;
  next: LaneNext | null;
  stacks: StackView[];
  line: { from: number; to: number } | null;
  dashed: { from: number; to: number } | null;
};
export type ChartView = {
  lanes: LaneView[];
  today: number;
  ticks: { pct: number; label: string | null }[];
};

function dotLine(dot: LaneDot, now: Date) {
  const scope = [dot.role, dot.via].filter(Boolean).join(" · ");
  return `${scope ? `${scope} · ` : ""}${dot.label}, ${dayLabel(dot.at, now)}${dot.detail ? ` (${dot.detail})` : ""}`;
}

/** Plain, serializable chart data for the client component. */
export function laneViews(lanes: Lane[], window: LaneWindow, now: Date): ChartView {
  const today = positionOf(window, now.getTime());
  return {
    today,
    ticks: window.ticks.map((tick) => {
      const pct = positionOf(window, tick);
      return { pct, label: Math.abs(pct - today) > 5 ? formatDay(new Date(tick)) : null };
    }),
    lanes: lanes.map((lane) => {
      const past = lane.dots.filter((dot) => dot.at <= now);
      const future = lane.dots.filter((dot) => dot.at > now);
      const first = lane.dots[0];
      return {
        key: lane.key,
        company: lane.company,
        leadId: lane.leadId,
        status: lane.status,
        group: lane.group,
        next: lane.next,
        stacks: stackDots(lane.dots, window).map((stack) => {
          const lines = stack.dots.map((dot) => dotLine(dot, now));
          return {
            key: stack.dots[0].key,
            pct: stack.pct,
            tone: stack.lead.tone,
            count: stack.dots.length,
            lines,
            label: `${stack.earlier ? "Earlier: " : ""}${lines.join("; ")}`,
          };
        }),
        line:
          first && past.length
            ? {
                from: positionOf(window, first.at.getTime()),
                to: lane.group === "closed" ? positionOf(window, past.at(-1)!.at.getTime()) : today,
              }
            : null,
        dashed: future.length
          ? { from: today, to: positionOf(window, future.at(-1)!.at.getTime()) }
          : null,
      };
    }),
  };
}
```

- [ ] **Step 5: Run the tests, typecheck and lint**

Run: `npx vitest run tests/application-lane-window.test.ts tests/application-lanes.test.ts && npm run typecheck && npm run lint`
Expected: PASS; exit 0.

- [ ] **Step 6: Commit** (after the user approves)

```bash
npx prettier --write src/features/applications/lanes.ts tests/application-lane-window.test.ts
git add src/features/applications/lanes.ts tests/application-lane-window.test.ts
git commit -m "JOB_FINDER-9999: Fit lanes onto one calendar window with stacked dots

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Return to the lane after in-place actions

**Files:**
- Create: `src/features/applications/return-to.ts`
- Modify: `src/features/applications/outcomes.ts`
- Modify: `src/features/applications/record-actions.ts` (`recordAsSent`)
- Modify: `src/features/mail/triage-actions.ts` (`linkMailOnly`)
- Modify: `src/features/applications/views/outcome-chips.tsx` (`OutcomeChips`, `PreparingControl`)
- Create: `tests/application-return-to.test.ts`
- Create: `tests/lane-return-actions.test.ts`
- Modify: `tests/application-outcome-actions.test.ts`

**Interfaces:**
- Produces:
  - `safeReturnTo(value: string | null | undefined): string | null`: only `/applications` or `/applications/…` paths; keeps the query.
  - `withNotice(path: string, notice: string): string`
  - Form field `returnTo` accepted by `recordOutcome`, `recordAsSent`, `linkMailOnly`.
  - Optional prop `returnTo?: string` on `OutcomeChips` and `PreparingControl`.

- [ ] **Step 1: Write the failing tests** `tests/application-return-to.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { safeReturnTo, withNotice } from "@/features/applications/return-to";

describe("return paths", () => {
  it("keeps Applications paths with their query", () => {
    const lane = "/applications?open=00000000-0000-4000-8000-000000000001";
    expect(safeReturnTo(lane)).toBe(lane);
    expect(safeReturnTo("/applications/00000000-0000-4000-8000-000000000001")).toBe(
      "/applications/00000000-0000-4000-8000-000000000001",
    );
  });

  it.each([
    "",
    "https://evil.example/applications",
    "//evil.example/applications",
    "/\\evil.example",
    "/settings",
    "/applicationsevil",
    "javascript:alert(1)",
    "/applications/../settings",
  ])("rejects %j", (value) => {
    expect(safeReturnTo(value)).toBeNull();
  });

  it("adds a notice without losing the lane", () => {
    expect(withNotice("/applications?open=abc", "Message linked.")).toBe(
      "/applications?open=abc&notice=Message+linked.",
    );
  });
});
```

`tests/lane-return-actions.test.ts`:

```ts
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  markRecordSent: vi.fn(),
  linkMailToRecord: vi.fn(),
  dismissMessages: vi.fn(),
  revalidate: vi.fn(),
  redirect: vi.fn(),
}));
vi.mock("@/db", () => ({ db: { transaction: mocks.transaction } }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/features/applications/outcome-service", () => ({
  markRecordSent: mocks.markRecordSent,
  updateRecordDetails: vi.fn(),
  updateRecordRound: vi.fn(),
}));
vi.mock("@/features/mail/handling-service", () => ({
  linkMailToRecord: mocks.linkMailToRecord,
  dismissMessages: mocks.dismissMessages,
  restoreDismissal: vi.fn(),
  unlinkMailFromRecord: vi.fn(),
}));

import { recordAsSent } from "@/features/applications/record-actions";
import { linkMailOnly } from "@/features/mail/triage-actions";

const recordId = "00000000-0000-4000-8000-000000000001";
const mailId = "00000000-0000-4000-8000-000000000002";
const lane = `/applications?open=${recordId}`;
const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};
beforeEach(() => {
  mocks.transaction.mockImplementation(async (callback) => callback({}));
  mocks.linkMailToRecord.mockResolvedValue(true);
});
afterEach(() => vi.resetAllMocks());

it("returns to the lane after recording a record as sent, and to the record otherwise", async () => {
  expect(
    await recordAsSent({}, form({ id: recordId, sentDate: "2026-10-02", humanConfirmed: "on", returnTo: lane })),
  ).toEqual({ success: "Recorded as sent.", redirect: lane });
  expect(
    await recordAsSent({}, form({ id: recordId, sentDate: "", humanConfirmed: "on", returnTo: "//evil.example" })),
  ).toEqual({ success: "Recorded as sent.", redirect: `/applications/${recordId}` });
});

it("links mail and returns to the lane with the notice", async () => {
  await linkMailOnly({}, form({ mailId, recordId, returnTo: lane }));
  expect(mocks.redirect).toHaveBeenCalledWith(
    `/applications?open=${recordId}&notice=Message+linked+to+your+record.`,
  );
});
```

Append to `tests/application-outcome-actions.test.ts`:

```ts
it("returns to a lane for a safe Applications path and ignores anything else", async () => {
  const lane = `/applications?open=${id}`;
  expect(await recordOutcome({}, form({ id, outcome: "heard", returnTo: lane }))).toEqual({
    success: "Saved: Heard back.",
    redirect: lane,
  });
  expect(
    await recordOutcome({}, form({ id, outcome: "heard", returnTo: "https://evil.example" })),
  ).toEqual({ success: "Saved: Heard back.", redirect: `/applications/${id}` });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/application-return-to.test.ts tests/lane-return-actions.test.ts tests/application-outcome-actions.test.ts`
Expected: FAIL; `return-to` missing and the new redirect assertions differ.

- [ ] **Step 3: Create `src/features/applications/return-to.ts`**

```ts
const BASE = "http://jobops.invalid";

/** Only same-app Applications paths may follow an action; anything else falls back. */
export function safeReturnTo(value: string | null | undefined): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\"))
    return null;
  let url: URL;
  try {
    url = new URL(value, BASE);
  } catch {
    return null;
  }
  if (url.origin !== BASE) return null;
  if (url.pathname !== "/applications" && !url.pathname.startsWith("/applications/")) return null;
  return `${url.pathname}${url.search}`;
}

export function withNotice(path: string, notice: string) {
  const url = new URL(path, BASE);
  url.searchParams.set("notice", notice);
  return `${url.pathname}${url.search}`;
}
```

- [ ] **Step 4: Use it in the actions.**
  - `src/features/applications/outcomes.ts`: add `import { safeReturnTo } from "./return-to";` and replace `redirect: \`/applications/${applicationId}\`,` with `redirect: safeReturnTo(formString(form, "returnTo")) ?? \`/applications/${applicationId}\`,`.
  - `src/features/applications/record-actions.ts`: add `import { safeReturnTo } from "./return-to";` and in `recordAsSent` replace `return { success: "Recorded as sent.", redirect: \`/applications/${data.id}\` };` with:

```ts
    return {
      success: "Recorded as sent.",
      redirect: safeReturnTo(formString(form, "returnTo")) ?? `/applications/${data.id}`,
    };
```

  - `src/features/mail/triage-actions.ts`: add `import { safeReturnTo, withNotice } from "@/features/applications/return-to";` and in `linkMailOnly` replace the `destination = formString(form, "returnTo") === "record" ? … : emailsNotice(notice);` statement with:

```ts
    const returnTo = formString(form, "returnTo");
    const back = safeReturnTo(returnTo);
    destination =
      returnTo === "record"
        ? `/applications/${recordId}?notice=${encodeURIComponent(notice)}`
        : back
          ? withNotice(back, notice)
          : emailsNotice(notice);
```

- [ ] **Step 5: Pass it from the controls.** In `src/features/applications/views/outcome-chips.tsx`:
  - `OutcomeChips`: add `returnTo` to the destructured props and `returnTo?: string;` to its prop type; inside the `ActionForm` after `<input type="hidden" name="outcome" value={open} />` add `{returnTo && <input type="hidden" name="returnTo" value={returnTo} />}`.
  - `PreparingControl`: add `returnTo` / `returnTo?: string;` the same way; after `<input type="hidden" name="id" value={recordId} />` add `{returnTo && <input type="hidden" name="returnTo" value={returnTo} />}`.

- [ ] **Step 6: Run the tests, typecheck and lint**

Run: `npx vitest run tests/application-return-to.test.ts tests/lane-return-actions.test.ts tests/application-outcome-actions.test.ts && npm run typecheck && npm run lint`
Expected: PASS; exit 0.

- [ ] **Step 7: Commit** (after the user approves)

```bash
npx prettier --write src/features/applications/return-to.ts src/features/applications/outcomes.ts src/features/applications/record-actions.ts src/features/mail/triage-actions.ts src/features/applications/views/outcome-chips.tsx tests/application-return-to.test.ts tests/lane-return-actions.test.ts tests/application-outcome-actions.test.ts
git add src/features/applications/return-to.ts src/features/applications/outcomes.ts src/features/applications/record-actions.ts src/features/mail/triage-actions.ts src/features/applications/views/outcome-chips.tsx tests/application-return-to.test.ts tests/lane-return-actions.test.ts tests/application-outcome-actions.test.ts
git commit -m "JOB_FINDER-9999: Let in-place outcome and mail actions return to the Applications lane

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Lane marks and the shared timeline

**Files:**
- Modify: `src/features/applications/dates.ts` (add `formatWhen`)
- Create: `src/features/applications/views/lane-marks.tsx`
- Create: `src/features/applications/views/timeline.tsx`
- Create: `tests/application-timeline.test.ts`

**Interfaces:**
- Consumes: `DotTone`, `LaneStatus`, `StatusTone` (lanes.ts); `Due` (queue.ts).
- Produces:
  - `formatWhen(value: Date, now: Date): string`: "Today, 9:12 am" or "20 Sept, 4:19 pm".
  - `StatusPill({ status }: { status: LaneStatus })`, with `data-testid="lane-status"`
  - `DotIcon({ tone, size }: { tone: DotTone; size?: "sm" | "md" })`
  - `dueStyle: Record<Due | "none", { dot: string; text: string }>`
  - `type TimelineEntry = { key; at: Date; tone: DotTone; label; detail; tags: string[]; href?: string; extra?: ReactNode }`
  - `Timeline({ entries, now })`: renders an `<ol>`; callers wrap it in their own labelled section.

- [ ] **Step 1: Write the failing tests** `tests/application-timeline.test.ts`:

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { formatWhen } from "@/features/applications/dates";
import { StatusPill } from "@/features/applications/views/lane-marks";
import { Timeline } from "@/features/applications/views/timeline";

const NOW = new Date("2026-10-03T10:30:00+05:30");

it("formats times against today in India time", () => {
  expect(formatWhen(new Date("2026-10-03T09:12:00+05:30"), NOW)).toBe("Today, 9:12 am");
  expect(formatWhen(new Date("2026-09-20T16:19:00+05:30"), NOW)).toBe("20 Sept, 4:19 pm");
});

it("lists newest first with a Today divider between booked and past entries", () => {
  const html = renderToStaticMarkup(
    createElement(Timeline, {
      now: NOW,
      entries: [
        { key: "a", at: new Date("2026-09-20T12:00:00+05:30"), tone: "sent", label: "Applied", detail: "", tags: [] },
        {
          key: "b",
          at: new Date("2026-10-06T11:00:00+05:30"),
          tone: "upcoming",
          label: "Round 3 · LLD",
          detail: "Low-level design",
          tags: ["SDE II"],
        },
        {
          key: "c",
          at: new Date("2026-10-03T09:12:00+05:30"),
          tone: "mail",
          label: "Round confirmed",
          detail: "",
          tags: [],
          href: "/mail/x",
        },
      ],
    }),
  );
  const order = ["Round 3 · LLD", "Today<", "Round confirmed", "Applied"].map((text) => html.indexOf(text));
  expect(order.every((index, position) => index > -1 && (position === 0 || index > order[position - 1]))).toBe(true);
  expect(html).toContain('href="/mail/x"');
  expect(html).toContain("SDE II");
  expect(html).toContain("Low-level design");
});

it("shows an empty history plainly", () => {
  expect(renderToStaticMarkup(createElement(Timeline, { now: NOW, entries: [] }))).toContain(
    "Nothing recorded yet.",
  );
});

it("marks quiet records with the review dot and a test id", () => {
  const html = renderToStaticMarkup(
    createElement(StatusPill, { status: { tone: "quiet", label: "Quiet for 13 days" } }),
  );
  expect(html).toContain('data-testid="lane-status"');
  expect(html).toContain("bg-review");
  expect(html).toContain("Quiet for 13 days");
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/application-timeline.test.ts`
Expected: FAIL; `formatWhen` and the views are missing.

- [ ] **Step 3: Add `formatWhen`** to `src/features/applications/dates.ts` after `formatWeekday`:

```ts
/** "Today, 9:12 am" for the current IST day, else "20 Sept, 4:19 pm". */
export const formatWhen = (value: Date, now: Date) =>
  indiaDate(value) === indiaDate(now) ? `Today, ${time.format(value)}` : formatDayTime(value);
```

- [ ] **Step 4: Create `src/features/applications/views/lane-marks.tsx`**

```tsx
import { Bookmark, CalendarClock, Check, Mail, Send, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DotTone, LaneStatus, StatusTone } from "../lanes";
import type { Due } from "../queue";

const statusTone: Record<StatusTone, { pill: string; dot: string | null }> = {
  interviewing: { pill: "bg-selected text-selected-foreground", dot: "bg-primary" },
  offer: { pill: "bg-success-soft text-success", dot: "bg-success" },
  quiet: { pill: "bg-muted text-foreground", dot: "bg-review" },
  applied: { pill: "bg-muted text-foreground", dot: "bg-muted-foreground" },
  preparing: { pill: "border border-dashed border-border text-muted-foreground", dot: null },
  closed: { pill: "bg-muted text-destructive", dot: "bg-destructive" },
};

export function StatusPill({ status }: { status: LaneStatus }) {
  const tone = statusTone[status.tone];
  return (
    <span
      data-testid="lane-status"
      className={cn(
        "inline-flex min-h-7 max-w-full items-center gap-2 rounded-full px-3 text-xs font-medium whitespace-nowrap",
        tone.pill,
      )}
    >
      {tone.dot && <span aria-hidden className={cn("size-2 shrink-0 rounded-full", tone.dot)} />}
      <span className="truncate">{status.label}</span>
    </span>
  );
}

const dotTone: Record<DotTone, { icon: LucideIcon; className: string }> = {
  sent: { icon: Send, className: "bg-muted text-foreground" },
  mail: { icon: Mail, className: "bg-selected text-selected-foreground" },
  good: { icon: Check, className: "bg-success-soft text-success" },
  bad: { icon: X, className: "bg-danger-soft text-destructive" },
  note: { icon: Bookmark, className: "bg-muted text-muted-foreground" },
  upcoming: {
    icon: CalendarClock,
    className: "border-2 border-dashed border-review bg-card text-foreground",
  },
  pending: { icon: Mail, className: "bg-primary text-primary-foreground ring-4 ring-primary/25" },
};

export function DotIcon({ tone, size = "md" }: { tone: DotTone; size?: "sm" | "md" }) {
  const { icon: Icon, className } = dotTone[tone];
  return (
    <span
      aria-hidden
      className={cn(
        "relative z-10 grid shrink-0 place-items-center rounded-full",
        size === "sm" ? "size-6" : "size-8",
        className,
      )}
    >
      <Icon size={size === "sm" ? 12 : 14} strokeWidth={2.25} />
    </span>
  );
}

/** Colour lives in the dot and text; panels stay neutral. */
export const dueStyle: Record<Due | "none", { dot: string; text: string }> = {
  overdue: { dot: "bg-destructive", text: "text-destructive" },
  today: { dot: "bg-review", text: "text-foreground" },
  week: { dot: "bg-primary", text: "text-muted-foreground" },
  none: { dot: "bg-muted-foreground", text: "text-muted-foreground" },
};
```

- [ ] **Step 5: Create `src/features/applications/views/timeline.tsx`**

```tsx
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { formatWhen } from "../dates";
import type { DotTone } from "../lanes";
import { DotIcon } from "./lane-marks";

export type TimelineEntry = {
  key: string;
  at: Date;
  tone: DotTone;
  label: string;
  detail: string;
  tags: string[];
  href?: string;
  extra?: ReactNode;
};

/** Newest first, with a Today divider between what is booked and what happened. */
export function Timeline({ entries, now }: { entries: TimelineEntry[]; now: Date }) {
  const ordered = [...entries].sort((a, b) => b.at.getTime() - a.at.getTime());
  if (!ordered.length)
    return <p className="m-0 text-sm text-muted-foreground">Nothing recorded yet.</p>;
  return (
    <ol className="relative m-0 flex list-none flex-col gap-3 p-0 before:absolute before:top-3 before:bottom-3 before:left-3 before:w-0.5 before:-translate-x-1/2 before:bg-border">
      {ordered.map((entry, index) => {
        const upcoming = entry.at > now;
        const divider = upcoming && ordered[index + 1] !== undefined && ordered[index + 1].at <= now;
        return (
          <li key={entry.key} className="relative">
            <div className="flex gap-3">
              <DotIcon tone={entry.tone} size="sm" />
              <div className="min-w-0 flex-1 pt-0.5 [overflow-wrap:anywhere]">
                <div className="flex items-baseline justify-between gap-3">
                  <p className={cn("m-0 text-sm", upcoming && "font-medium")}>
                    {entry.href ? <Link href={entry.href}>{entry.label}</Link> : entry.label}
                    {entry.tags.map((tag) => (
                      <span
                        key={tag}
                        className="ml-2 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-secondary-foreground"
                      >
                        {tag}
                      </span>
                    ))}
                  </p>
                  <span
                    className={cn(
                      "shrink-0 text-xs tabular-nums",
                      upcoming ? "font-semibold text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {formatWhen(entry.at, now)}
                  </span>
                </div>
                {entry.detail && (
                  <p className="m-0 text-xs text-muted-foreground">{entry.detail}</p>
                )}
                {entry.extra}
              </div>
            </div>
            {divider && (
              <div className="mt-3 flex items-center gap-2 pl-9 text-[11px] font-semibold text-muted-foreground">
                Today
                <span aria-hidden className="h-0.5 flex-1 rounded-full bg-review" />
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
```

- [ ] **Step 6: Run the tests, typecheck and lint**

Run: `npx vitest run tests/application-timeline.test.ts && npm run typecheck && npm run lint`
Expected: PASS; exit 0.

- [ ] **Step 7: Commit** (after the user approves)

```bash
npx prettier --write src/features/applications/dates.ts src/features/applications/views/lane-marks.tsx src/features/applications/views/timeline.tsx tests/application-timeline.test.ts
git add src/features/applications/dates.ts src/features/applications/views/lane-marks.tsx src/features/applications/views/timeline.tsx tests/application-timeline.test.ts
git commit -m "JOB_FINDER-9999: Add lane status marks and a shared vertical timeline

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The lanes chart

**Files:**
- Create: `src/features/applications/views/lanes.tsx`
- Create: `tests/application-lanes-chart.test.ts`

**Interfaces:**
- Consumes: `ChartView`, `LaneView` (Task 3); `laneHref` (Task 2); `StatusPill`, `DotIcon`, `dueStyle` (Task 5); `CompanyMark` from `views/marks.tsx`.
- Produces: `LanesChart(props: ChartView & { openKey: string | null; detail: ReactNode })` (client). Accessible structure for later tests:
  - each lane is `role="group"` named by its company
  - the company cell is a link to `laneHref(leadId)`, or to `/applications` when that lane is open
  - dots are buttons named by their readout lines
  - the next cell is a link named `"<action>: <text>"`
  - the scroll container has `data-testid="lanes-chart"`

- [ ] **Step 1: Write the failing test** `tests/application-lanes-chart.test.ts`:

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { laneViews, laneWindow } from "@/features/applications/lanes";
import { LanesChart } from "@/features/applications/views/lanes";
import { NOW, at, event, lanesFor, record, uid } from "./lane-fixtures";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

function chart() {
  const id = uid();
  const quiet = record({
    id,
    company: "Flipkart",
    companyKey: "flipkart",
    companyName: "Flipkart",
    sentAt: at("2026-09-20T12:00:00"),
    events: [event(id, "APPLICATION_SUBMITTED", at("2026-09-20T12:00:00"), { summary: "Applied" })],
    linkedMail: [
      { id: uid(), subject: "We got it", classification: "APPLICATION_ACKNOWLEDGEMENT", receivedAt: at("2026-09-20T12:05:00") },
    ],
  });
  const draft = record({ companyKey: "quizizz", companyName: "Quizizz", phase: "Preparing", status: "PREPARING", sentAt: null });
  const closed = record({ companyKey: "nutanix", companyName: "Nutanix", phase: "Closed", status: "REJECTED", closedReason: "REJECTED" });
  const lanes = lanesFor([quiet, draft, closed]);
  return { quiet, closed, lanes, view: laneViews(lanes, laneWindow(lanes, NOW), NOW) };
}

it("draws each open company as a labelled lane with status, dots, Today and its next step", () => {
  const { quiet, view } = chart();
  const html = renderToStaticMarkup(createElement(LanesChart, { ...view, openKey: null, detail: null }));
  expect(html).toContain('role="group" aria-label="Flipkart"');
  expect(html).toContain("Quiet for 13 days");
  expect(html).toContain(">Today<");
  expect(html).toContain(`href="/applications?open=${quiet.id}&amp;outcome=followup"`);
  expect(html).toContain('aria-label="Applied, 20 Sept; Automatic “we received it”, 20 Sept (We got it)"');
  expect(html).toContain('data-testid="lanes-chart"');
  expect(html).toContain("Closed · 1");
  expect(html).not.toContain('aria-label="Nutanix"');
  expect(html).not.toContain("NaN");
});

it("shows a closed lane when it is the open one, with its detail underneath", () => {
  const { lanes, view } = chart();
  const nutanix = lanes.find((lane) => lane.company === "Nutanix")!;
  const html = renderToStaticMarkup(
    createElement(LanesChart, { ...view, openKey: nutanix.key, detail: createElement("p", null, "DETAIL") }),
  );
  expect(html).toContain('aria-label="Nutanix"');
  expect(html).toContain("DETAIL");
  expect(html).toContain('href="/applications" aria-expanded="true"');
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/application-lanes-chart.test.ts`
Expected: FAIL, `Failed to resolve import "@/features/applications/views/lanes"`.

- [ ] **Step 3: Create `src/features/applications/views/lanes.tsx`**

```tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChartView, LaneView } from "../lanes";
import { laneHref } from "../navigation";
import { CompanyMark } from "./marks";
import { DotIcon, StatusPill, dueStyle } from "./lane-marks";

const columns = "grid grid-cols-[12.5rem_minmax(0,1fr)_10.5rem]";

export function LanesChart({
  lanes,
  today,
  ticks,
  openKey,
  detail,
}: ChartView & { openKey: string | null; detail: ReactNode }) {
  const router = useRouter();
  const [readout, setReadout] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(() =>
    lanes.some((lane) => lane.key === openKey && lane.group === "closed"),
  );
  const closed = lanes.filter((lane) => lane.group === "closed").length;
  const visible = lanes.filter((lane) => lane.group !== "closed" || showClosed);
  return (
    <div className="flex flex-col gap-4">
      <p aria-live="polite" className="m-0 min-h-6 text-sm [overflow-wrap:anywhere]">
        {readout ?? (
          <span className="text-muted-foreground">
            Hover a dot to read it. Select a company to open its whole timeline.
          </span>
        )}
      </p>
      <div
        data-testid="lanes-chart"
        className="@container overflow-x-auto rounded-3xl border border-border bg-card"
        onMouseLeave={() => setReadout(null)}
      >
        <div className="min-w-[50rem]">
          <div className={cn(columns, "border-b border-border")}>
            <span className="sticky left-0 z-20 bg-card p-3 text-xs font-medium text-muted-foreground">
              Company
            </span>
            <div aria-hidden className="relative h-11">
              {ticks.map(
                (tick) =>
                  tick.label && (
                    <span
                      key={tick.pct}
                      className="absolute top-3.5 -translate-x-1/2 text-[11px] whitespace-nowrap text-muted-foreground"
                      style={{ left: `${tick.pct}%` }}
                    >
                      {tick.label}
                    </span>
                  ),
              )}
              <span
                className="absolute bottom-0 -translate-x-1/2 rounded-t-md bg-review px-2 text-[11px] font-semibold text-review-foreground"
                style={{ left: `${today}%` }}
              >
                Today
              </span>
            </div>
            <span className="p-3 text-xs font-medium text-muted-foreground">Next</span>
          </div>
          {visible.map((lane) => {
            const open = lane.key === openKey;
            return (
              <div
                key={lane.key}
                role="group"
                aria-label={lane.company}
                className="border-b border-border last:border-0"
              >
                <div className={cn(columns, "items-center")}>
                  <Link
                    href={open ? "/applications" : laneHref(lane.leadId)}
                    scroll={false}
                    aria-expanded={open}
                    className={cn(
                      "sticky left-0 z-20 flex min-w-0 flex-col items-start gap-1.5 p-3 text-foreground hover:no-underline",
                      open ? "bg-muted" : "bg-card hover:bg-muted",
                    )}
                  >
                    <span className="flex w-full min-w-0 items-center gap-2.5">
                      <CompanyMark company={lane.company} size="sm" />
                      <span className="truncate text-sm font-semibold">{lane.company}</span>
                    </span>
                    <StatusPill status={lane.status} />
                  </Link>
                  <Track
                    lane={lane}
                    today={today}
                    ticks={ticks}
                    onRead={setReadout}
                    onOpen={() => router.push(laneHref(lane.leadId), { scroll: false })}
                  />
                  <NextCell lane={lane} />
                </div>
                {open && detail && (
                  <div className="sticky left-0 w-[100cqw] border-t border-border">{detail}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {closed > 0 && (
        <button
          type="button"
          aria-expanded={showClosed}
          onClick={() => setShowClosed((value) => !value)}
          className="pressable inline-flex items-center gap-1.5 self-start rounded-full px-3 py-1.5 text-sm font-semibold text-muted-foreground hover:bg-muted"
        >
          Closed · {closed}
          <ChevronDown
            size={15}
            aria-hidden
            className={cn("transition-transform", showClosed && "rotate-180")}
          />
        </button>
      )}
    </div>
  );
}

function Track({
  lane,
  today,
  ticks,
  onRead,
  onOpen,
}: {
  lane: LaneView;
  today: number;
  ticks: ChartView["ticks"];
  onRead: (text: string | null) => void;
  onOpen: () => void;
}) {
  return (
    <div className={cn("relative h-16", lane.group === "closed" && "opacity-60")}>
      {ticks.map((tick) => (
        <span
          key={tick.pct}
          aria-hidden
          className="absolute inset-y-0 w-px bg-border/60"
          style={{ left: `${tick.pct}%` }}
        />
      ))}
      <span
        aria-hidden
        className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-review"
        style={{ left: `${today}%` }}
      />
      {lane.line && (
        <span
          aria-hidden
          className="absolute top-1/2 h-0.5 -translate-y-1/2 bg-muted-foreground/50"
          style={{ left: `${lane.line.from}%`, width: `${lane.line.to - lane.line.from}%` }}
        />
      )}
      {lane.dashed && (
        <span
          aria-hidden
          className="absolute top-1/2 -translate-y-1/2 border-t-2 border-dashed border-muted-foreground/50"
          style={{ left: `${lane.dashed.from}%`, width: `${lane.dashed.to - lane.dashed.from}%` }}
        />
      )}
      {lane.stacks.map((stack) => {
        const read = () => onRead(`${lane.company} · ${stack.lines.join(" · ")}`);
        return (
          <button
            key={stack.key}
            type="button"
            aria-label={stack.label}
            onMouseEnter={read}
            onFocus={read}
            onBlur={() => onRead(null)}
            onClick={onOpen}
            className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full outline-offset-2 focus-visible:outline-2 focus-visible:outline-primary"
            style={{ left: `${stack.pct}%` }}
          >
            <DotIcon tone={stack.tone} size="sm" />
            {stack.count > 1 && (
              <span className="absolute -top-2 -right-2 z-20 grid size-4 place-items-center rounded-full bg-foreground text-[10px] font-semibold text-background">
                {stack.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function NextCell({ lane }: { lane: LaneView }) {
  const next = lane.next;
  if (!next)
    return (
      <span className="p-3 text-xs text-muted-foreground">
        {lane.group === "closed" ? "Done" : "Nothing due"}
      </span>
    );
  const style = dueStyle[next.due ?? "none"];
  return (
    <div className="flex min-w-0 flex-col items-start gap-0.5 p-3">
      <span className={cn("flex items-center gap-1.5 text-xs font-semibold", style.text)}>
        <span aria-hidden className={cn("size-2 shrink-0 rounded-full", style.dot)} />
        {next.when}
      </span>
      <Link
        href={next.href}
        scroll={false}
        aria-label={`${next.action}: ${next.text}`}
        className="text-left text-xs font-medium text-link"
      >
        {next.action}
      </Link>
    </div>
  );
}
```

- [ ] **Step 4: Run the test, typecheck and lint**

Run: `npx vitest run tests/application-lanes-chart.test.ts && npm run typecheck && npm run lint`
Expected: PASS; exit 0. If the `aria-expanded` assertion fails because React orders attributes differently, assert `toContain('aria-expanded="true"')` and `toContain('href="/applications"')` separately.

- [ ] **Step 5: Commit** (after the user approves)

```bash
npx prettier --write src/features/applications/views/lanes.tsx tests/application-lanes-chart.test.ts
git add src/features/applications/views/lanes.tsx tests/application-lanes-chart.test.ts
git commit -m "JOB_FINDER-9999: Draw company lanes on one calendar with a readout and closed toggle

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The lanes page, expanded lane and Emails drawer

**Files:**
- Modify: `src/features/applications/navigation.ts` (add `resolveLanesView`)
- Create: `src/features/applications/views/lane-detail.tsx`
- Create: `src/features/applications/views/emails-drawer.tsx`
- Modify: `src/features/applications/views/emails.tsx` (one column inside the drawer)
- Rewrite: `src/app/applications/page.tsx`
- Create: `tests/application-lanes-view.test.ts`

**Interfaces:**
- Consumes: everything above; `readApplications`, `readMailTriage`, `readOpenMail`, `queueMailFrom`, `buildQueue`, `InboxStatus`, `EmailsView`, `OutcomeChips`, `PreparingControl`, `FollowUp`, `linkMailOnly`.
- Produces:
  - `type LanesView = { open: string | null; mail: string | null; outcome: string | undefined; emails: boolean; notice: string | undefined }`
  - `resolveLanesView(params: { open?: string; mail?: string; outcome?: string; emails?: string; tab?: string; notice?: string }): LanesView`
  - `LaneDetail(props)` (server): `section` named `"<company> timeline"`, roles `nav` named `"Roles"`, history `section` named `"History"`.
  - `EmailsDrawer({ count, connected, initialOpen, children })` (client): a `<dialog>` named "Emails"; closing removes `emails`, `tab` and `notice` from the URL.

- [ ] **Step 1: Write the failing test** `tests/application-lanes-view.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resolveLanesView } from "@/features/applications/navigation";

const id = "00000000-0000-4000-8000-000000000001";

describe("lanes view", () => {
  it("opens a lane only for a record id and keeps mail and outcome with it", () => {
    expect(resolveLanesView({ open: id, mail: "m", outcome: "oa" })).toEqual({
      open: id,
      mail: "m",
      outcome: "oa",
      emails: false,
      notice: undefined,
    });
    expect(resolveLanesView({ open: "../../etc", mail: "m", outcome: "oa" })).toMatchObject({
      open: null,
      mail: null,
      outcome: undefined,
    });
  });

  it("opens the drawer for ?emails=1 and the old ?tab=emails link, ignoring other old tabs", () => {
    expect(resolveLanesView({ emails: "1" }).emails).toBe(true);
    expect(resolveLanesView({ tab: "emails" }).emails).toBe(true);
    expect(resolveLanesView({ tab: "records" })).toEqual({
      open: null,
      mail: null,
      outcome: undefined,
      emails: false,
      notice: undefined,
    });
  });

  it("clips notices to 300 characters", () => {
    expect(resolveLanesView({ notice: "x".repeat(400) }).notice).toHaveLength(300);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/application-lanes-view.test.ts`
Expected: FAIL, `resolveLanesView is not a function`.

- [ ] **Step 3: Add `resolveLanesView`** to `src/features/applications/navigation.ts`: add `import { z } from "zod";` at the top and append:

```ts
export type LanesView = {
  open: string | null;
  mail: string | null;
  outcome: string | undefined;
  emails: boolean;
  notice: string | undefined;
};

/** `?open=<recordId>` expands a lane; `?emails=1` (or the old `?tab=emails`) opens the drawer. */
export function resolveLanesView(params: {
  open?: string;
  mail?: string;
  outcome?: string;
  emails?: string;
  tab?: string;
  notice?: string;
}): LanesView {
  const open = params.open && z.uuid().safeParse(params.open).success ? params.open : null;
  return {
    open,
    mail: open && params.mail !== undefined ? params.mail : null,
    outcome: open ? params.outcome : undefined,
    emails: params.emails === "1" || params.tab === "emails",
    notice: params.notice ? params.notice.slice(0, 300) : undefined,
  };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/application-lanes-view.test.ts`
Expected: PASS.

- [ ] **Step 5: Create `src/features/applications/views/lane-detail.tsx`**

```tsx
import Link from "next/link";
import { X } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui";
import { linkMailOnly } from "@/features/mail/triage-actions";
import { cn } from "@/lib/utils";
import { formatDay, indiaDate } from "../dates";
import type { Lane, LaneNext } from "../lanes";
import { laneHref } from "../navigation";
import {
  availableOutcomes,
  canEditPlannedRecord,
  initialOutcome,
  isOutreach,
  methodLabel,
  recordStateFrom,
} from "../phase";
import type { ApplicationRecord } from "../read";
import { FollowUp } from "./follow-up";
import { dueStyle } from "./lane-marks";
import { OutcomeChips, PreparingControl } from "./outcome-chips";
import { Timeline } from "./timeline";

export function LaneDetail({
  lane,
  record,
  now,
  requested,
  mail,
  mailIntent,
  mailError,
}: {
  lane: Lane;
  record: ApplicationRecord;
  now: Date;
  requested?: string;
  mail: { id: string; subject: string; classification: string } | null;
  mailIntent?: string;
  mailError?: string;
}) {
  const here = laneHref(record.id);
  const role = lane.roles.find((item) => item.recordId === record.id);
  const state = recordStateFrom(
    record,
    record.rounds,
    record.events.map((event) => event.eventType),
  );
  const available = availableOutcomes(state);
  const ack = mail?.classification === "APPLICATION_ACKNOWLEDGEMENT";
  return (
    <section
      aria-label={`${lane.company} timeline`}
      className="grid gap-5 p-4 md:grid-cols-[minmax(0,1fr)_20rem]"
    >
      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p className="m-0 min-w-0 text-sm text-muted-foreground [overflow-wrap:anywhere]">
            {[record.role, record.city, methodLabel[record.source] ?? "Applied directly", record.contact]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <span className="flex items-center gap-1">
            <Link href={`/applications/${record.id}`} className="text-sm font-medium text-link">
              Open record
            </Link>
            <Link
              href="/applications"
              scroll={false}
              aria-label={`Close ${lane.company}`}
              className="grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-muted"
            >
              <X size={16} aria-hidden />
            </Link>
          </span>
        </div>
        {lane.roles.length > 1 && (
          <nav aria-label="Roles" className="flex flex-wrap gap-2">
            {lane.roles.map((item) => (
              <Link
                key={item.recordId}
                href={laneHref(item.recordId)}
                scroll={false}
                aria-current={item.recordId === record.id ? "true" : undefined}
                className={cn(
                  "pressable inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-full border px-3 text-sm hover:no-underline",
                  item.recordId === record.id
                    ? "border-transparent bg-selected text-selected-foreground"
                    : "border-border text-foreground hover:bg-muted",
                )}
              >
                <span className="truncate">
                  {item.role}
                  {isOutreach(item.source) ? ` (${methodLabel[item.source]})` : ""}
                </span>
                <span className="shrink-0 text-xs opacity-80"> · {item.status.label}</span>
              </Link>
            ))}
          </nav>
        )}
        <section aria-label="History">
          <Timeline
            now={now}
            entries={lane.dots.map((dot) => ({
              key: dot.key,
              at: dot.at,
              tone: dot.tone,
              label: dot.label,
              detail: dot.detail,
              tags: [dot.role, dot.via].filter((tag): tag is string => Boolean(tag)),
              href: dot.mailId && dot.tone !== "pending" ? `/mail/${dot.mailId}` : undefined,
              extra:
                dot.tone === "pending" && dot.mailId ? (
                  <Link
                    href={laneHref(dot.recordId, { mail: dot.mailId, outcome: dot.outcome })}
                    scroll={false}
                    className="text-xs font-medium text-link"
                  >
                    {dot.outcome ? "Link it" : "Add to timeline"}
                  </Link>
                ) : undefined,
            }))}
          />
        </section>
      </div>
      <div className="flex min-w-0 flex-col gap-4">
        {role?.next && <NextBox next={role.next} />}
        {mail && (
          <div className="flex flex-col gap-2 rounded-2xl bg-selected px-4 py-3 text-sm text-selected-foreground [overflow-wrap:anywhere]">
            <p className="m-0">Linking mail: {mail.subject}</p>
            <ActionForm action={linkMailOnly} feedback="inverse" pendingLabel="Linking">
              <input type="hidden" name="mailId" value={mail.id} />
              <input type="hidden" name="recordId" value={record.id} />
              <input type="hidden" name="returnTo" value={here} />
              <Button variant="ghost" size="sm">
                {ack ? "Add to timeline" : "Link without recording an outcome"}
              </Button>
            </ActionForm>
          </div>
        )}
        <PreparingControl
          key={`sent-${record.id}`}
          recordId={record.id}
          active={canEditPlannedRecord(state)}
          today={indiaDate(now)}
          returnTo={here}
        />
        <OutcomeChips
          key={`outcomes-${record.id}`}
          recordId={record.id}
          outcomes={ack ? [] : available}
          initial={mailError || ack ? null : initialOutcome(available, requested)}
          mailId={mailIntent}
          mailError={mailError}
          selectionKey={mailIntent}
          requested={requested}
          today={indiaDate(now)}
          booked={record.rounds.find((round) => round.outcome === "SCHEDULED")}
          returnTo={here}
        />
        {record.phase !== "Closed" && (
          <FollowUp
            key={`follow-up-${record.id}`}
            recordId={record.id}
            day={record.nextActionAt ? indiaDate(record.nextActionAt) : null}
            label={record.nextActionAt ? formatDay(record.nextActionAt) : null}
            note={record.nextActionNote}
          />
        )}
      </div>
    </section>
  );
}

function NextBox({ next }: { next: LaneNext }) {
  const style = dueStyle[next.due ?? "none"];
  return (
    <div className="rounded-2xl bg-muted p-4">
      <p className={cn("m-0 flex items-center gap-2 text-xs font-semibold", style.text)}>
        <span aria-hidden className={cn("size-2 shrink-0 rounded-full", style.dot)} />
        {next.when}
      </p>
      <p className="m-0 mt-1 text-sm [overflow-wrap:anywhere]">{next.text}</p>
    </div>
  );
}
```

- [ ] **Step 6: Create `src/features/applications/views/emails-drawer.tsx`**

```tsx
"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Inbox, Mail, X } from "lucide-react";
import { Button } from "@/components/ui";

export function EmailsDrawer({
  count,
  connected,
  initialOpen,
  children,
}: {
  count: number;
  connected: boolean;
  initialOpen: boolean;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  useEffect(() => {
    if (initialOpen && !dialog.current?.open) dialog.current?.showModal();
  }, [initialOpen]);
  function onClose() {
    if (!["emails", "tab", "notice"].some((key) => params.has(key))) return;
    const next = new URLSearchParams(params);
    for (const key of ["emails", "tab", "notice"]) next.delete(key);
    router.replace(next.size ? `${pathname}?${next}` : pathname, { scroll: false });
  }
  return (
    <>
      <Button variant="outline" aria-haspopup="dialog" onClick={() => dialog.current?.showModal()}>
        {connected ? <Mail size={16} aria-hidden /> : <Inbox size={16} aria-hidden />}
        {connected ? "Emails" : "Connect inboxes"}
        {count > 0 && (
          <>
            <span
              aria-hidden
              className="grid min-w-5 place-items-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground"
            >
              {count}
            </span>
            <span className="sr-only">, {count} need a decision</span>
          </>
        )}
      </Button>
      <dialog
        ref={dialog}
        onClose={onClose}
        onClick={(event) => {
          if (event.target === dialog.current) dialog.current?.close();
        }}
        aria-label="Emails"
        className="mt-0 mr-0 ml-auto h-dvh max-h-none w-[min(30rem,100vw)] max-w-none overflow-y-auto border-l border-border bg-card p-0 text-foreground shadow-surface backdrop:bg-scrim"
      >
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-card px-5 py-4">
          <h2 className="m-0 text-lg font-semibold">Emails</h2>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="Close emails"
            onClick={() => dialog.current?.close()}
          >
            <X size={18} aria-hidden />
          </Button>
        </header>
        <div className="p-5">{children}</div>
      </dialog>
    </>
  );
}
```

- [ ] **Step 7: Fit the old Emails view into the drawer.** In `src/features/applications/views/emails.tsx` change `<div className="grid gap-4 lg:grid-cols-3">` to `<div className="grid gap-4">`. (Task 10 replaces this view.)

- [ ] **Step 8: Rewrite `src/app/applications/page.tsx`**

```tsx
import Link from "next/link";
import { asc } from "drizzle-orm";
import { z } from "zod";
import { Button, EmptyState, PageHeader } from "@/components/ui";
import { db } from "@/db";
import { mailConnections } from "@/db/schema";
import { buildLanes, laneViews, laneWindow, pendingMailFrom } from "@/features/applications/lanes";
import { resolveLanesView } from "@/features/applications/navigation";
import { buildQueue } from "@/features/applications/queue";
import { readApplications } from "@/features/applications/read";
import { EmailsView } from "@/features/applications/views/emails";
import { EmailsDrawer } from "@/features/applications/views/emails-drawer";
import { InboxStatus } from "@/features/applications/views/inboxes";
import { LaneDetail } from "@/features/applications/views/lane-detail";
import { LanesChart } from "@/features/applications/views/lanes";
import { readMailTriage, readOpenMail } from "@/features/mail/read";
import { queueMailFrom } from "@/features/mail/triage";
import { providers } from "@/services/mail/providers";

export const dynamic = "force-dynamic";

export default async function Applications({
  searchParams,
}: {
  searchParams: Promise<{
    open?: string;
    mail?: string;
    outcome?: string;
    emails?: string;
    tab?: string;
    notice?: string;
  }>;
}) {
  const view = resolveLanesView(await searchParams);
  const now = new Date();
  const { records, snoozes } = await readApplications();
  const triage = await readMailTriage(records);
  // Public projection only: encrypted tokens and OAuth secrets never reach client props.
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
    .orderBy(asc(mailConnections.createdAt), asc(mailConnections.id));
  const configs = providers.map((provider) => {
    const { configured, missing } = provider.configuration();
    return { slug: provider.slug, label: provider.label, configured, missing };
  });
  const items = buildQueue({ records, mail: queueMailFrom(triage.messages), snoozes, now });
  const lanes = buildLanes({ records, items, pending: pendingMailFrom(triage.messages), now });
  const chart = laneViews(lanes, laneWindow(lanes, now), now);
  const openRecord = view.open ? records.find((record) => record.id === view.open) : undefined;
  const openLane = openRecord ? lanes.find((lane) => lane.key === openRecord.companyKey) : undefined;
  let mail = null;
  let mailError: string | undefined;
  if (openRecord && view.mail !== null) {
    if (!z.uuid().safeParse(view.mail).success)
      mailError = "The source message link is invalid. Open Emails to choose a message.";
    else {
      try {
        mail = await readOpenMail(view.mail, openRecord.id);
      } catch (error) {
        mailError =
          error instanceof Error ? error.message : "The source message could not be loaded.";
      }
    }
  }
  const decisions = triage.messages.filter(
    (message) => message.bucket === "roles" || (message.bucket === "updates" && !message.record),
  ).length;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Applications"
        description="Every company on one calendar: what happened, where it stands and what to do next."
        actions={
          <>
            <EmailsDrawer
              count={decisions}
              connected={connections.length > 0}
              initialOpen={view.emails}
            >
              <EmailsView
                data={triage}
                records={records.map((record) => ({
                  id: record.id,
                  label: `${record.companyName} · ${record.role}`,
                }))}
                refresh={
                  <InboxStatus
                    connections={connections}
                    configs={configs}
                    now={now}
                    count={triage.messages.length}
                  />
                }
                accountIndex={Object.fromEntries(
                  connections.map((connection, index) => [connection.email, index]),
                )}
                notice={view.emails ? view.notice : undefined}
              />
            </EmailsDrawer>
            <Button asChild>
              <Link href="/applications/new">Record an application</Link>
            </Button>
          </>
        }
      />
      {view.notice && !view.emails && (
        <p
          role="status"
          className="m-0 rounded-2xl bg-foreground px-4 py-3 text-sm text-background shadow-surface"
        >
          {view.notice}
        </p>
      )}
      {records.length ? (
        <LanesChart
          {...chart}
          openKey={openLane?.key ?? null}
          detail={
            openLane && openRecord ? (
              <LaneDetail
                lane={openLane}
                record={openRecord}
                now={now}
                requested={view.outcome}
                mail={mail}
                mailIntent={view.mail ?? undefined}
                mailError={mailError}
              />
            ) : null
          }
        />
      ) : (
        <EmptyState
          title="No applications yet"
          description="Find an opening, then record the application or referral you sent."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="outline" asChild>
                <Link href="/find">Find openings</Link>
              </Button>
              <Button asChild>
                <Link href="/applications/new">Record an application</Link>
              </Button>
            </div>
          }
        />
      )}
    </div>
  );
}
```

- [ ] **Step 9: Typecheck, lint and run the unit suite**

Run: `npm run typecheck && npm run lint && npm test`
Expected: exit 0. The old `next.tsx`, `records.tsx` and `tabs.tsx` files still compile but are now unused; Task 8 removes them.

- [ ] **Step 10: Look at it in Docker.** Run `docker compose up -d --build app`, wait until `curl -sf -o /dev/null http://127.0.0.1:3210/applications` succeeds, then save this as `<scratchpad>/lanes-shot.mjs`:

```js
import { chromium } from "@playwright/test";
const out = process.argv[2];
const browser = await chromium.launch();
for (const [width, tag] of [[1440, "desktop"], [390, "phone"]]) {
  const page = await (await browser.newContext({ viewport: { width, height: 900 } })).newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("http://127.0.0.1:3210/applications", { waitUntil: "load" });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${out}/lanes-${tag}.png`, fullPage: true });
  const first = page.getByRole("group").first().getByRole("link").first();
  await first.click();
  await page.waitForURL(/open=/);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/lane-open-${tag}.png`, fullPage: true });
  await page.goto("http://127.0.0.1:3210/applications?emails=1", { waitUntil: "load" });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/drawer-${tag}.png` });
  console.log(tag, "errors:", errors, "overflow:", await page.evaluate(() => document.documentElement.scrollWidth > innerWidth));
}
await browser.close();
```

Copy it into `jobops/.lanes-shot.mjs` (so `@playwright/test` resolves), run `node .lanes-shot.mjs <scratchpad>`, then delete `.lanes-shot.mjs`. Check the PNGs:
- lanes show Level AI and Oracle with "Applied · today"-style statuses, a Today line and a Next column
- the open lane shows History, the chips and the follow-up control
- the drawer opens from the right
- the phone run prints `overflow: false`
- no page errors

- [ ] **Step 11: Commit** (after the user approves)

```bash
npx prettier --write src/features/applications/navigation.ts src/features/applications/views/lane-detail.tsx src/features/applications/views/emails-drawer.tsx src/features/applications/views/emails.tsx src/app/applications/page.tsx tests/application-lanes-view.test.ts
git add src/features/applications/navigation.ts src/features/applications/views/lane-detail.tsx src/features/applications/views/emails-drawer.tsx src/features/applications/views/emails.tsx src/app/applications/page.tsx tests/application-lanes-view.test.ts
git commit -m "JOB_FINDER-9999: Replace the Applications tabs with company lanes and an Emails drawer

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Remove the old tabs and snooze, and point links at lanes

**Files:**
- Delete: `src/features/applications/views/next.tsx`, `src/features/applications/views/records.tsx`, `src/features/applications/views/tabs.tsx`
- Delete: `tests/application-next.test.ts`, `tests/application-records-view.test.ts`, `tests/application-navigation.test.ts`
- Create: `tests/application-marks.test.ts`
- Rewrite: `src/features/applications/navigation.ts`
- Modify: `src/features/applications/record-actions.ts`
- Modify: `src/features/workspace/home.tsx`
- Modify: `src/components/app-shell.tsx`

**Interfaces:**
- Produces: `navigation.ts` exports only `laneHref`, `LanesView`, `resolveLanesView`. `record-actions.ts` no longer exports `snoozeQueueItem` / `unsnoozeQueueItem`.

- [ ] **Step 1: Keep the round-ladder test.** Create `tests/application-marks.test.ts`:

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { RoundLadder } from "@/features/applications/views/marks";

it("labels research slots without inventing recorded rounds", () => {
  const html = renderToStaticMarkup(createElement(RoundLadder, { rounds: [], typical: 16 }));
  expect(html).toContain('aria-label="Typical loop: 16 rounds (company research)"');
  expect(html.match(/border-2 border-dashed/g)).toHaveLength(16);
  expect(html).not.toContain("<button");
});
```

- [ ] **Step 2: Delete the old views and their tests**

```bash
git rm src/features/applications/views/next.tsx src/features/applications/views/records.tsx src/features/applications/views/tabs.tsx tests/application-next.test.ts tests/application-records-view.test.ts tests/application-navigation.test.ts
```

- [ ] **Step 3: Rewrite `src/features/applications/navigation.ts`**

```ts
import { z } from "zod";

/** The Applications page with the lane holding this record expanded (spec §1). */
export function laneHref(
  recordId: string,
  extra: { mail?: string | null; outcome?: string | null } = {},
) {
  const query = new URLSearchParams({ open: recordId });
  if (extra.mail) query.set("mail", extra.mail);
  if (extra.outcome) query.set("outcome", extra.outcome);
  return `/applications?${query}`;
}

export type LanesView = {
  open: string | null;
  mail: string | null;
  outcome: string | undefined;
  emails: boolean;
  notice: string | undefined;
};

/** `?open=<recordId>` expands a lane; `?emails=1` (or the old `?tab=emails`) opens the drawer. */
export function resolveLanesView(params: {
  open?: string;
  mail?: string;
  outcome?: string;
  emails?: string;
  tab?: string;
  notice?: string;
}): LanesView {
  const open = params.open && z.uuid().safeParse(params.open).success ? params.open : null;
  return {
    open,
    mail: open && params.mail !== undefined ? params.mail : null,
    outcome: open ? params.outcome : undefined,
    emails: params.emails === "1" || params.tab === "emails",
    notice: params.notice ? params.notice.slice(0, 300) : undefined,
  };
}
```

- [ ] **Step 4: Remove the snooze actions.** In `src/features/applications/record-actions.ts` delete the functions `snoozeQueueItem` and `unsnoozeQueueItem`, the `const queueKey = …` line, and the imports that become unused: `lt` (keep `eq`), `queueSnoozes` (keep `applications`), `queueKeyPattern`, `SNOOZE_DAYS`, and `addDays`/`istDayStart` (keep `istDateTime`). Run `npm run lint` to confirm nothing unused remains. The `queue_snoozes` table and its rows stay (spec §7).

- [ ] **Step 5: Point Home and the header at the new page**

```bash
sed -i '' 's#"/applications?tab=records&filter=active"#"/applications"#; s#"/applications?tab=records&filter=interviewing"#"/applications"#g; s#"/applications?tab=emails"#"/applications?emails=1"#g' src/features/workspace/home.tsx
sed -i '' 's#href="/applications?tab=emails"#href="/applications?emails=1"#' src/components/app-shell.tsx
```

Then in `src/components/app-shell.tsx` change the `emailsActive` condition `(pathname === "/applications" && searchParams.get("tab") === "emails")` to:

```ts
    (pathname === "/applications" &&
      (searchParams.get("emails") === "1" || searchParams.get("tab") === "emails"))
```

- [ ] **Step 6: Check nothing points at removed code**

Run: `grep -rn "views/next\|views/records\|views/tabs\|resolveView\|matchesFilter\|queueKeyPattern\|snoozeQueueItem\|tab=records\|tab=next" src tests --include=*.ts --include=*.tsx | grep -v "tests/e2e"`
Expected: no output.

- [ ] **Step 7: Typecheck, lint and run the unit suite**

Run: `npm run typecheck && npm run lint && npm test`
Expected: exit 0.

- [ ] **Step 8: Commit** (after the user approves)

```bash
npx prettier --write src/features/applications/navigation.ts src/features/applications/record-actions.ts src/features/workspace/home.tsx src/components/app-shell.tsx tests/application-marks.test.ts
git add -A src/features/applications/views src/features/applications/navigation.ts src/features/applications/record-actions.ts src/features/workspace/home.tsx src/components/app-shell.tsx tests/application-marks.test.ts tests/application-next.test.ts tests/application-records-view.test.ts tests/application-navigation.test.ts
git commit -m "JOB_FINDER-9999: Remove the Next, Records and snooze views and point links at lanes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Lanes in browser tests

**Files:**
- Modify: `tests/e2e/helpers/records.ts`
- Create: `tests/e2e/application-lanes.spec.ts`
- Delete: `tests/e2e/application-next.spec.ts`, `tests/e2e/application-records.spec.ts`
- Modify: `tests/e2e/applications.spec.ts`, `tests/e2e/simple-records.spec.ts`, `tests/e2e/action-home.spec.ts`

**Interfaces:**
- Consumes: the accessible structure from Tasks 6 and 7.
- Produces: `seedRecord` accepts `title?: string`.

- [ ] **Step 1: Let fixtures choose the role title.** In `tests/e2e/helpers/records.ts` add `title?: string;` to the `seedRecord` input type and replace `title: "Backend Engineer",` with `title: input.title ?? "Backend Engineer",`.

- [ ] **Step 2: Create `tests/e2e/application-lanes.spec.ts`**

```ts
import { expect, test, type Page } from "@playwright/test";
import { closeDatabase } from "../../src/db";
import { stubExternalSites } from "./helpers/external-sites";
import { cleanupRecords, istDay, seedRecord } from "./helpers/records";
import { cleanupMailFixtures, guardMailFixtures, seedMail } from "./helpers/task13-mail";

test.beforeEach(async ({ page }) => {
  await stubExternalSites(page);
});
test.beforeEach(guardMailFixtures);
test.afterEach(async () => {
  await cleanupMailFixtures();
  await cleanupRecords();
});
test.afterAll(() => closeDatabase());

const lane = (page: Page, company: string) =>
  page.getByRole("group", { name: company, exact: true });

test("lanes show each company's status and put the ones that need you first", async ({ page }) => {
  const stamp = Date.now();
  const quiet = `Quiet Lane ${stamp}`;
  const fresh = `Fresh Lane ${stamp}`;
  await seedRecord({ company: fresh, source: "DIRECT", sentDaysAgo: 1 });
  await seedRecord({ company: quiet, source: "DIRECT", sentDaysAgo: 9 });
  await page.goto("/applications");
  await expect(page.getByRole("tab")).toHaveCount(0);
  await expect(lane(page, quiet).getByTestId("lane-status")).toHaveText("Quiet for 9 days");
  await expect(lane(page, quiet).getByRole("link", { name: /^I followed up/ })).toBeVisible();
  await expect(lane(page, fresh).getByTestId("lane-status")).toHaveText("Applied · yesterday");
  const names = await page
    .getByRole("group")
    .evaluateAll((groups) => groups.map((group) => group.getAttribute("aria-label")));
  expect(names.indexOf(quiet)).toBeGreaterThan(-1);
  expect(names.indexOf(quiet)).toBeLessThan(names.indexOf(fresh));
  await expect(page.getByText("Today", { exact: true }).first()).toBeVisible();
});

test("opening a lane records an OA without leaving the page", async ({ page }) => {
  const company = `OA Lane ${Date.now()}`;
  const { applicationId } = await seedRecord({ company, source: "DIRECT", sentDaysAgo: 2 });
  await page.goto("/applications");
  await lane(page, company).getByRole("link", { name: new RegExp(`^${company}`) }).click();
  await expect(page).toHaveURL(new RegExp(`/applications\\?open=${applicationId}$`));
  const detail = page.getByRole("region", { name: `${company} timeline` });
  await detail.getByRole("button", { name: "Got an OA", exact: true }).click();
  await detail.getByLabel("Complete by (India time)").fill(istDay(3));
  await detail.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved: Got an OA." })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/applications\\?open=${applicationId}$`));
  await expect(lane(page, company).getByTestId("lane-status")).toHaveText("Interviewing · round 1");
  await expect(lane(page, company).getByRole("button", { name: /OA closes/ })).toBeVisible();
});

test("two roles at one company share a lane and the role switcher scopes outcomes", async ({ page }) => {
  const company = `Two Roles ${Date.now()}`;
  const first = await seedRecord({ company, title: "Backend Engineer", source: "DIRECT", sentDaysAgo: 1 });
  const second = await seedRecord({ company, title: "Platform Engineer", source: "DIRECT", sentDaysAgo: 3 });
  await page.goto("/applications");
  await expect(lane(page, company)).toHaveCount(1);
  await expect(lane(page, company).getByTestId("lane-status")).toHaveText("Applied · yesterday · +1 role");
  await page.goto(`/applications?open=${first.applicationId}`);
  const roles = page.getByRole("navigation", { name: "Roles" });
  await roles.getByRole("link", { name: /Platform Engineer/ }).click();
  await expect(page).toHaveURL(new RegExp(`open=${second.applicationId}$`));
  const detail = page.getByRole("region", { name: `${company} timeline` });
  await detail.getByRole("button", { name: "Rejected", exact: true }).click();
  await detail.getByRole("button", { name: "Save", exact: true }).click();
  await expect(roles.getByRole("link", { name: /Platform Engineer.*Rejected/ })).toBeVisible();
  await expect(lane(page, company).getByTestId("lane-status")).toHaveText("Applied · yesterday");
});

test("a matched assessment email waits on its lane until Link it adds the OA", async ({ page }) => {
  const company = `Mail Lane ${Date.now()}`;
  const subject = `${company} assessment invite`;
  const { applicationId } = await seedRecord({ company, source: "DIRECT", sentDaysAgo: 2 });
  const mailId = await seedMail({ subject, classification: "ASSESSMENT", recordId: applicationId });
  await page.goto("/applications");
  await expect(lane(page, company).getByTestId("lane-status")).toHaveText("Applied · 2 days · new email");
  await expect(lane(page, company).getByRole("button", { name: /Assessment invite · not added yet/ })).toBeVisible();
  await lane(page, company).getByRole("link", { name: /^Link it/ }).click();
  await expect(page).toHaveURL(new RegExp(`open=${applicationId}&mail=${mailId}&outcome=oa$`));
  const detail = page.getByRole("region", { name: `${company} timeline` });
  await expect(detail.getByRole("button", { name: "Got an OA", exact: true })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await detail.getByLabel("Complete by (India time)").fill(istDay(4));
  await detail.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/applications\\?open=${applicationId}$`));
  await expect(lane(page, company).getByRole("button", { name: /not added yet/ })).toHaveCount(0);
  await expect(lane(page, company).getByRole("button", { name: /OA closes/ })).toBeVisible();
});

test("old and stale links still land somewhere useful, and phones scroll the chart not the page", async ({
  page,
}) => {
  const company = `Phone Lane ${"Long name ".repeat(4)}${Date.now()}`;
  await seedRecord({ company, source: "DIRECT", sentDaysAgo: 4 });
  await page.goto("/applications?tab=records&filter=active");
  await expect(lane(page, company)).toBeVisible();
  await page.goto("/applications?open=00000000-0000-4000-8000-00000000dead");
  await expect(lane(page, company)).toBeVisible();
  await expect(page.getByRole("region", { name: /timeline$/ })).toHaveCount(0);
  await page.goto("/applications?open=not-a-uuid&mail=x");
  await expect(lane(page, company)).toBeVisible();
  await page.goto("/applications?tab=emails");
  await expect(page.getByRole("dialog", { name: "Emails" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Emails" })).toBeHidden();
  await expect(page).toHaveURL(/\/applications$/);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/applications");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  expect(
    await page.getByTestId("lanes-chart").evaluate((element) => element.scrollWidth > element.clientWidth),
  ).toBe(true);
});
```

- [ ] **Step 3: Remove the specs for deleted views**

```bash
git rm tests/e2e/application-next.spec.ts tests/e2e/application-records.spec.ts
```

- [ ] **Step 4: Update `tests/e2e/applications.spec.ts`.**
  - Replace the whole test `"a quiet referral shows up in Next and leaves once a follow-up is recorded"` with:

```ts
test("a quiet referral asks for a follow-up on its lane and recording one restarts its clock", async ({
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
  const row = page.getByRole("group", { name: company, exact: true });
  await expect(row.getByTestId("lane-status")).toHaveText("Referral ask · 6 days quiet");
  await row.getByRole("link", { name: /^I followed up/ }).click();
  await expect(page).toHaveURL(new RegExp(`open=${applicationId}&outcome=followup$`));
  await expect(page.getByRole("button", { name: "Sent a follow-up", exact: true })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(row.getByTestId("lane-status")).toHaveText("Referral ask · 0 of 5 days");
  // The lane stays open after saving, so match the dot (named "…, Today"), not the chip.
  await expect(row.getByRole("button", { name: /Sent a follow-up, Today/ })).toBeVisible();
});
```

  - Replace the whole test `"a follow-up date appears today and snoozing hides it until undone"` with:

```ts
test("a follow-up date for today puts the company under Needs you", async ({ page }) => {
  const company = `Follow Up Co ${Date.now()}`;
  const note = `Check portal ${company}`;
  const { applicationId } = await seedRecord({ company, source: "DIRECT", sentDaysAgo: 1 });
  await page.goto(`/applications/${applicationId}`);
  await page.getByRole("button", { name: "Set a follow-up", exact: true }).click();
  await page.getByLabel("Follow-up date").fill(istDay());
  await page.getByLabel("What to do").fill(note);
  await page.getByRole("button", { name: "Save follow-up", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Follow up on/ })).toBeVisible();
  await page.goto("/applications");
  const row = page.getByRole("group", { name: company, exact: true });
  await expect(row.getByText("Today", { exact: true })).toBeVisible();
  await expect(row.getByRole("link", { name: `Open: ${note}` })).toBeVisible();
});
```

  - In `"a record staged by the old dropdown still offers the right next steps"` replace the last three lines (from `await page.goto(\`/applications?tab=records…`) with:

```ts
  await page.goto("/applications");
  await expect(
    page.getByRole("group", { name: company, exact: true }).getByTestId("lane-status"),
  ).toHaveText("Interviewing");
```

- [ ] **Step 5: Update `tests/e2e/simple-records.spec.ts`.** Replace

```ts
  await page.goto(`/applications?tab=records&filter=all&q=${encodeURIComponent(company)}`);
  await expect(page.getByText("Applied directly", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/Referral ask/).first()).toBeVisible();
```

with

```ts
  await page.goto("/applications");
  await expect(
    page.getByRole("group", { name: company, exact: true }).getByTestId("lane-status"),
  ).toHaveText(/^Referral ask/);
```

and replace

```ts
  await page.goto(`/applications?tab=records&filter=interviewing&q=${encodeURIComponent(company)}`);
  await expect(page.getByRole("link", { name: company, exact: true })).toHaveCount(1);
```

with

```ts
  await page.goto("/applications");
  const lane = page.getByRole("group", { name: company, exact: true });
  await expect(lane).toHaveCount(1);
  await expect(lane.getByTestId("lane-status")).toHaveText("Interviewing · round 1");
```

- [ ] **Step 6: Update `tests/e2e/action-home.spec.ts`** for the new links (the `/inbox` redirect and Emails regions change in phase 2):
  - `"/applications?tab=records&filter=active"` → `"/applications"`
  - the two `"/applications?tab=emails"` href expectations → `"/applications?emails=1"`
  - `"/applications?tab=records&filter=interviewing"` → `"/applications"`
  - in the phone path list, `"/applications?tab=records&filter=all"` → `"/applications?open=00000000-0000-4000-8000-000000000000"` and `"/applications?tab=emails"` → `"/applications?emails=1"`

- [ ] **Step 7: Ask the user, then run the browser tests**

Ask: "Task 9 needs `npm run test:e2e`, which starts a temporary host server on port 3211 against the isolated `jobops_e2e` database. OK to run it?" After a yes:

Run: `npm run test:e2e -- tests/e2e/application-lanes.spec.ts tests/e2e/applications.spec.ts tests/e2e/simple-records.spec.ts tests/e2e/action-home.spec.ts`
Expected: PASS. The Emails tests in `applications.spec.ts` still pass because the old Emails view is inside the drawer, and `?tab=emails` opens it.

- [ ] **Step 8: Commit** (after the user approves)

```bash
npx prettier --write tests/e2e/application-lanes.spec.ts tests/e2e/helpers/records.ts tests/e2e/applications.spec.ts tests/e2e/simple-records.spec.ts tests/e2e/action-home.spec.ts
git add tests/e2e/application-lanes.spec.ts tests/e2e/helpers/records.ts tests/e2e/applications.spec.ts tests/e2e/simple-records.spec.ts tests/e2e/action-home.spec.ts tests/e2e/application-next.spec.ts tests/e2e/application-records.spec.ts
git commit -m "JOB_FINDER-9999: Cover company lanes in browser tests

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

# Phase 2: Mail and drawer

### Task 10: Drawer contents

**Files:**
- Create: `src/features/applications/views/mail-sections.tsx`
- Modify: `src/features/applications/views/inboxes.tsx`
- Modify: `src/app/applications/page.tsx`
- Delete: `src/features/applications/views/emails.tsx`
- Create: `tests/application-emails-panel.test.ts`
- Modify: `tests/inbox-status.test.ts`

**Interfaces:**
- Consumes: `TriageData`, `TriageMessage` (`features/mail/read`); `dismissMail`, `linkMailOnly`, `undoDismiss`; `RecordPicker`; `accountTone`.
- Produces: `EmailsPanel({ data, records, inboxes, notice, accountIndex })` (server). It renders four sections:
  - `"Inboxes"`
  - `"Replies we couldn't match"`, with a record picker on each card
  - `"New roles"`, with Save as opening
  - `"Job alerts and auto-replies"`, with Dismiss, **Clear all** and "Undo last dismiss"

  It also renders "N handled" and **Import messages**. Matched updates are not listed (they are on lanes).

- [ ] **Step 1: Write the failing tests** `tests/application-emails-panel.test.ts`:

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import type { TriageMessage } from "@/features/mail/read";
import { EmailsPanel } from "@/features/applications/views/mail-sections";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/features/mail/triage-actions", () => ({
  dismissMail: vi.fn(),
  linkMailOnly: vi.fn(),
  undoDismiss: vi.fn(),
}));

const message = (patch: Partial<TriageMessage>): TriageMessage => ({
  id: crypto.randomUUID(),
  subject: "Subject",
  sender: "talent@example.invalid",
  senderName: "Talent",
  receivedAt: new Date("2026-10-02T10:00:00+05:30"),
  classification: "UNKNOWN",
  bucket: "noise",
  record: null,
  snippet: "",
  accountEmail: "me@gmail.com",
  ...patch,
});

it("lists only mail that is not on a lane, with one action per kind", () => {
  const html = renderToStaticMarkup(
    createElement(EmailsPanel, {
      data: {
        messages: [
          message({ subject: "Matched OA", classification: "ASSESSMENT", bucket: "updates", record: { id: "r1", company: "Zscaler", role: "SDE" } }),
          message({ subject: "Unmatched interview", classification: "INTERVIEW", bucket: "updates" }),
          message({ subject: "InMobi pitch", classification: "RECRUITER_OUTREACH", bucket: "roles" }),
          message({ subject: "12 new jobs", sender: "jobalerts@naukri.com" }),
          message({ subject: "We received it", classification: "APPLICATION_ACKNOWLEDGEMENT" }),
        ],
        handled: 3,
        lastDismissedId: null,
        lastDismissalToken: null,
      },
      records: [{ id: "r1", label: "Zscaler · SDE" }],
      inboxes: createElement("p", null, "INBOXES"),
      notice: "Dismissed 1 message.",
      accountIndex: { "me@gmail.com": 0 },
    }),
  );
  expect(html).not.toContain("Matched OA");
  expect(html).toContain("Replies we couldn&#x27;t match");
  expect(html).toContain("Unmatched interview");
  expect(html).toContain("Record for this message");
  expect(html).toContain('href="/jobs/new?fromMail=');
  expect(html).toContain("Job alerts and auto-replies");
  expect(html).toContain("Clear all");
  expect(html).toContain("3 handled");
  expect(html).toContain('href="/mail/import"');
  expect(html).toContain("INBOXES");
  expect(html).toContain("Dismissed 1 message.");
});
```

Append to `tests/inbox-status.test.ts`:

```ts
it("explains an unconfigured provider in plain words and keeps the variables in Setup details", () => {
  const html = renderToStaticMarkup(
    createElement(InboxStatus, {
      connections: [],
      configs: [{ slug: "gmail", label: "Gmail", configured: false, missing: ["GOOGLE_CLIENT_ID"] }],
      now: new Date(),
      count: 0,
    }),
  );
  expect(html).toContain("Gmail isn&#x27;t set up on this computer yet.");
  expect(html).toMatch(/<details[^>]*><summary[^>]*>Setup details<\/summary>/);
  expect(html).toContain("Set GOOGLE_CLIENT_ID in .env");
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/application-emails-panel.test.ts tests/inbox-status.test.ts`
Expected: FAIL; `mail-sections` is missing and the plain sentence is absent.

- [ ] **Step 3: Plain setup guidance.** In `src/features/applications/views/inboxes.tsx` replace the unconfigured branch's `<p id={\`${config.slug}-configuration\`} …>Set {config.missing.join(", ")} in .env</p>` with:

```tsx
              <p
                id={`${config.slug}-configuration`}
                className="m-0 text-xs text-muted-foreground"
              >
                {config.label} isn&apos;t set up on this computer yet.
              </p>
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer">Setup details</summary>
                <p className="m-0 mt-1 [overflow-wrap:anywhere]">
                  Set {config.missing.join(", ")} in .env, then restart the app. See README ›
                  Inbox setup.
                </p>
              </details>
```

- [ ] **Step 4: Create `src/features/applications/views/mail-sections.tsx`**

```tsx
import Link from "next/link";
import type { ReactNode } from "react";
import { Archive, BriefcaseBusiness } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui";
import type { TriageData, TriageMessage } from "@/features/mail/read";
import { suggestedOutcome } from "@/features/mail/triage";
import { dismissMail, linkMailOnly, undoDismiss } from "@/features/mail/triage-actions";
import { cn } from "@/lib/utils";
import { formatDay } from "../dates";
import { accountTone } from "./inboxes";
import { RecordPicker } from "./record-picker";

type Records = { id: string; label: string }[];

export function EmailsPanel({
  data,
  records,
  inboxes,
  notice,
  accountIndex,
}: {
  data: TriageData;
  records: Records;
  inboxes: ReactNode;
  notice?: string;
  accountIndex: Record<string, number>;
}) {
  const unmatched = data.messages.filter((message) => message.bucket === "updates" && !message.record);
  const roles = data.messages.filter((message) => message.bucket === "roles");
  const noise = data.messages.filter((message) => message.bucket === "noise");
  const card = (message: TriageMessage) => (
    <MailCard key={message.id} message={message} records={records} accountIndex={accountIndex} />
  );
  return (
    <div className="flex flex-col gap-6">
      {notice && (
        <p
          role="status"
          className="m-0 rounded-2xl bg-foreground px-4 py-3 text-sm text-background shadow-surface"
        >
          {notice}
        </p>
      )}
      <section aria-label="Inboxes">{inboxes}</section>
      <MailSection
        id="unmatched"
        title="Replies we couldn't match"
        note="Interview or assessment mail that matched none of your records. Pick the company."
        rows={unmatched.map(card)}
      />
      <MailSection
        id="roles"
        title="New roles"
        note="Recruiters pitching roles. Save the ones worth a look."
        rows={roles.map(card)}
      />
      <MailSection
        id="noise"
        title="Job alerts and auto-replies"
        note="Not counted in the Emails badge."
        rows={noise.map(card)}
        footer={
          noise.length > 1 && (
            <ActionForm feedback="inverse" action={dismissMail} pendingLabel="Dismissing">
              <input type="hidden" name="bucket" value="noise" />
              <Button variant="ghost" size="sm" className="h-8 px-3">
                <Archive size={14} aria-hidden />
                Clear all
              </Button>
            </ActionForm>
          )
        }
      />
      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <span>{data.handled} handled</span>
        {data.lastDismissedId && (
          <ActionForm feedback="inverse" action={undoDismiss} className="contents" pendingLabel="Restoring">
            <input type="hidden" name="mailId" value={data.lastDismissedId} />
            <input type="hidden" name="dismissal" value={data.lastDismissalToken ?? ""} />
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

function MailSection({
  id,
  title,
  note,
  rows,
  footer,
}: {
  id: string;
  title: string;
  note: string;
  rows: ReactNode[];
  footer?: ReactNode;
}) {
  return (
    <section aria-labelledby={`mail-${id}`} className="flex flex-col gap-2">
      <h3 id={`mail-${id}`} className="m-0 text-sm font-semibold">
        {title} <span className="font-normal text-muted-foreground tabular-nums">· {rows.length}</span>
      </h3>
      <p className="m-0 text-xs text-muted-foreground">{note}</p>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {rows}
        {!rows.length && <li className="text-sm text-muted-foreground">Nothing here.</li>}
      </ul>
      {footer}
    </section>
  );
}

function MailCard({
  message,
  records,
  accountIndex,
}: {
  message: TriageMessage;
  records: Records;
  accountIndex: Record<string, number>;
}) {
  return (
    <li className="rounded-2xl bg-background/60 p-3 ring-1 ring-border">
      {message.accountEmail && (
        <p className="m-0 mb-1 flex min-w-0 items-start gap-1.5 text-xs text-muted-foreground">
          <span
            aria-hidden
            className={cn("mt-1 size-2 shrink-0 rounded-full", accountTone(accountIndex[message.accountEmail] ?? 3))}
          />
          <span className="min-w-0 [overflow-wrap:anywhere]">{message.accountEmail}</span>
        </p>
      )}
      <p className="m-0 flex items-start justify-between gap-2 text-xs text-muted-foreground">
        <span className="min-w-0 [overflow-wrap:anywhere]">{message.senderName || message.sender}</span>
        <span className="shrink-0 tabular-nums">{formatDay(message.receivedAt)}</span>
      </p>
      <Link
        href={`/mail/${message.id}`}
        className="mt-1.5 block text-sm font-medium text-foreground [overflow-wrap:anywhere]"
      >
        {message.subject}
      </Link>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {message.bucket === "updates" && (
          <RecordPicker mailId={message.id} outcome={suggestedOutcome[message.classification]} records={records} />
        )}
        {message.bucket === "roles" && (
          <Button size="sm" className="h-8 rounded-full px-3" asChild>
            <Link href={`/jobs/new?fromMail=${message.id}`}>
              <BriefcaseBusiness size={14} aria-hidden />
              Save as opening
            </Link>
          </Button>
        )}
        {message.classification === "APPLICATION_ACKNOWLEDGEMENT" && message.record && (
          <ActionForm feedback="inverse" action={linkMailOnly} className="contents" pendingLabel="Linking">
            <input type="hidden" name="mailId" value={message.id} />
            <input type="hidden" name="recordId" value={message.record.id} />
            <Button size="sm" variant="outline" className="h-8 rounded-full px-3">
              Link
            </Button>
          </ActionForm>
        )}
        <ActionForm feedback="inverse" action={dismissMail} className="contents" pendingLabel="Dismissing">
          <input type="hidden" name="mailId" value={message.id} />
          <Button size="sm" variant="ghost" className="h-8 rounded-full px-3">
            Dismiss
          </Button>
        </ActionForm>
      </div>
    </li>
  );
}
```

- [ ] **Step 5: Use it on the page.** In `src/app/applications/page.tsx`:
  - replace `import { EmailsView } from "@/features/applications/views/emails";` with `import { EmailsPanel } from "@/features/applications/views/mail-sections";`
  - replace the `<EmailsView … />` element with:

```tsx
              <EmailsPanel
                data={triage}
                records={records.map((record) => ({
                  id: record.id,
                  label: `${record.companyName} · ${record.role}`,
                }))}
                inboxes={
                  <InboxStatus
                    connections={connections}
                    configs={configs}
                    now={now}
                    count={decisions}
                  />
                }
                accountIndex={Object.fromEntries(
                  connections.map((connection, index) => [connection.email, index]),
                )}
                notice={view.emails ? view.notice : undefined}
              />
```

  - then `git rm src/features/applications/views/emails.tsx`.

- [ ] **Step 6: Run the tests, typecheck and lint**

Run: `npx vitest run tests/application-emails-panel.test.ts tests/inbox-status.test.ts && npm run typecheck && npm run lint && npm test`
Expected: PASS; exit 0. `grep -rn "views/emails\"" src tests` prints nothing.

- [ ] **Step 7: Look at the drawer in Docker** with `docker compose up -d --build app` and the Task 7 screenshot script. Confirm:
- the drawer shows Inboxes, the three sections and the import link
- an unconfigured provider reads "Gmail isn't set up on this computer yet." with a closed Setup details fold-out

- [ ] **Step 8: Commit** (after the user approves)

```bash
npx prettier --write src/features/applications/views/mail-sections.tsx src/features/applications/views/inboxes.tsx src/app/applications/page.tsx tests/application-emails-panel.test.ts tests/inbox-status.test.ts
git add src/features/applications/views/mail-sections.tsx src/features/applications/views/inboxes.tsx src/app/applications/page.tsx src/features/applications/views/emails.tsx tests/application-emails-panel.test.ts tests/inbox-status.test.ts
git commit -m "JOB_FINDER-9999: Sort leftover mail in the Emails drawer with plain setup guidance

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Link elsewhere or dismiss matched mail from its lane

**Files:**
- Modify: `src/features/applications/views/lane-detail.tsx`
- Modify: `src/features/applications/views/record-picker.tsx`
- Modify: `src/features/mail/triage.ts` (`linkHref`)
- Modify: `src/features/mail/triage-actions.ts` (`dismissMail`)
- Modify: `src/app/applications/page.tsx` (pass record options to the detail)
- Modify: `tests/mail-triage.test.ts`, `tests/lane-return-actions.test.ts`

**Interfaces:**
- Consumes: `laneHref`, `safeReturnTo`, `withNotice`.
- Produces:
  - `linkHref(message, recordId)` returns `laneHref(recordId, { mail, outcome })`.
  - `RecordPicker` navigates to the lane URL.
  - `dismissMail` accepts `returnTo`.
  - `LaneDetail` takes `records: { id: string; label: string }[]` and offers **Link elsewhere** and **Dismiss** on pending-mail entries.

- [ ] **Step 1: Write the failing tests.** In `tests/mail-triage.test.ts` change the three `linkHref` expectations to:

```ts
    expect(linkHref({ id, classification: "ASSESSMENT" }, record)).toBe(
      `/applications?open=${record}&mail=${id}&outcome=oa`,
    );
    expect(linkHref({ id, classification: "UNKNOWN" }, record)).toBe(
      `/applications?open=${record}&mail=${id}`,
    );
    expect(linkHref({ id, classification: "APPLICATION_ACKNOWLEDGEMENT" }, record)).toBe(
      `/applications?open=${record}&mail=${id}`,
    );
```

In `tests/lane-return-actions.test.ts` change the triage import to `import { dismissMail, linkMailOnly } from "@/features/mail/triage-actions";` and append:

```ts
it("dismisses from a lane and returns there", async () => {
  mocks.dismissMessages.mockResolvedValue(1);
  await dismissMail({}, form({ mailId, returnTo: lane }));
  expect(mocks.redirect).toHaveBeenCalledWith(
    `/applications?open=${recordId}&notice=Dismissed+1+message.`,
  );
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/mail-triage.test.ts tests/lane-return-actions.test.ts`
Expected: FAIL on the new URLs.

- [ ] **Step 3: Lane URLs everywhere a record is chosen.**
  - `src/features/mail/triage.ts`: add `import { laneHref } from "@/features/applications/navigation";` and make `linkHref` return `laneHref(recordId, { mail: message.id, outcome: suggestedOutcome[message.classification] });`.
  - `src/features/applications/views/record-picker.tsx`: add `import { laneHref } from "@/features/applications/navigation";` and change the button's `router.push(…)` argument to `laneHref(recordId, { mail: mailId, outcome })`.
  - `src/features/mail/triage-actions.ts`: in `dismissMail` change `destination = emailsNotice(…)` to:

```ts
    const notice = count
      ? `Dismissed ${count} ${count === 1 ? "message" : "messages"}.`
      : "These messages have already been handled.";
    const back = safeReturnTo(formString(form, "returnTo"));
    destination = back ? withNotice(back, notice) : emailsNotice(notice);
```

- [ ] **Step 4: Actions on pending entries.** In `lane-detail.tsx`:
  - add `records: { id: string; label: string }[];` to the props, plus the imports `import { dismissMail } from "@/features/mail/triage-actions";` (merge with the existing `linkMailOnly` import) and `import { RecordPicker } from "./record-picker";`
  - replace the `extra:` value with:

```tsx
              extra:
                dot.tone === "pending" && dot.mailId ? (
                  <div className="mt-1.5 flex flex-col gap-1.5">
                    <div className="flex flex-wrap items-center gap-3">
                      <Link
                        href={laneHref(dot.recordId, { mail: dot.mailId, outcome: dot.outcome })}
                        scroll={false}
                        className="text-xs font-medium text-link"
                      >
                        {dot.outcome ? "Link it" : "Add to timeline"}
                      </Link>
                      <ActionForm action={dismissMail} feedback="inverse" className="contents" pendingLabel="Dismissing">
                        <input type="hidden" name="mailId" value={dot.mailId} />
                        <input type="hidden" name="returnTo" value={here} />
                        <button className="border-0 bg-transparent p-0 text-xs font-medium text-muted-foreground hover:underline">
                          Dismiss
                        </button>
                      </ActionForm>
                    </div>
                    <details className="text-xs">
                      <summary className="cursor-pointer text-muted-foreground">Link elsewhere</summary>
                      <div className="mt-1.5">
                        <RecordPicker
                          mailId={dot.mailId}
                          outcome={dot.outcome}
                          records={records.filter((option) => option.id !== dot.recordId)}
                        />
                      </div>
                    </details>
                  </div>
                ) : undefined,
```

  - In `src/app/applications/page.tsx`, compute `const recordOptions = records.map((record) => ({ id: record.id, label: \`${record.companyName} · ${record.role}\` }));` once, use it for `EmailsPanel records={recordOptions}`, and pass `records={recordOptions}` to `<LaneDetail>`.

- [ ] **Step 5: Run the tests, typecheck and lint**

Run: `npx vitest run tests/mail-triage.test.ts tests/lane-return-actions.test.ts && npm run typecheck && npm run lint && npm test`
Expected: PASS; exit 0.

- [ ] **Step 6: Commit** (after the user approves)

```bash
npx prettier --write src/features/applications/views/lane-detail.tsx src/features/applications/views/record-picker.tsx src/features/mail/triage.ts src/features/mail/triage-actions.ts src/app/applications/page.tsx tests/mail-triage.test.ts tests/lane-return-actions.test.ts
git add src/features/applications/views/lane-detail.tsx src/features/applications/views/record-picker.tsx src/features/mail/triage.ts src/features/mail/triage-actions.ts src/app/applications/page.tsx tests/mail-triage.test.ts tests/lane-return-actions.test.ts
git commit -m "JOB_FINDER-9999: Link or dismiss matched mail from its company lane

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Point every Emails link at the drawer

**Files:**
- Modify (mechanical):
  - `src/app/inbox/page.tsx`
  - `src/app/mail/page.tsx`
  - `src/app/mail/review/page.tsx`
  - `src/app/mail/[id]/page.tsx`
  - `src/app/api/mail/[provider]/callback/route.ts`
  - `src/app/api/mail/[provider]/connect/route.ts`
  - `src/app/jobs/new/page.tsx`
  - `src/features/mail/mail-connections.tsx`
  - `src/features/mail/actions.ts`
  - `src/features/mail/triage-actions.ts`
  - `src/features/workspace/home-gallery/hero.tsx`
  - `src/features/simple-preview/workspace.tsx`
  - `src/features/applications/views/outcome-chips.tsx`
- Modify: `tests/lane-return-actions.test.ts`

**Interfaces:**
- Produces: no `?tab=emails` remains in `src`; every Emails destination is `/applications?emails=1` (with `&notice=` where one exists).

- [ ] **Step 1: Write the failing test.** Append to `tests/lane-return-actions.test.ts`:

```ts
it("returns to the Emails drawer when dismissing without a lane", async () => {
  mocks.dismissMessages.mockResolvedValue(1);
  await dismissMail({}, form({ mailId }));
  expect(mocks.redirect).toHaveBeenCalledWith("/applications?emails=1&notice=Dismissed%201%20message.");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/lane-return-actions.test.ts`
Expected: FAIL; the destination still contains `tab=emails`.

- [ ] **Step 3: Replace the links**

```bash
grep -rl "applications?tab=emails" src | xargs sed -i '' 's#/applications?tab=emails&notice=#/applications?emails=1\&notice=#g; s#/applications?tab=emails#/applications?emails=1#g'
```

- [ ] **Step 4: Check**

Run: `grep -rn "tab=emails" src`
Expected: only `src/features/applications/navigation.ts` (the legacy translation) and `src/components/app-shell.tsx` (legacy active state).

- [ ] **Step 5: Run the tests, typecheck and lint**

Run: `npx vitest run tests/lane-return-actions.test.ts && npm run typecheck && npm run lint && npm test`
Expected: PASS; exit 0.

- [ ] **Step 6: Commit** (after the user approves)

```bash
npx prettier --write $(git diff --name-only -- src tests)
git add -u src tests
git commit -m "JOB_FINDER-9999: Point every Emails link at the drawer

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Mail on lanes and the drawer in browser tests

**Files:**
- Modify:
  - `tests/e2e/applications.spec.ts` (Emails tests, about lines 325–410)
  - `tests/e2e/action-home.spec.ts`
  - `tests/e2e/mail-reader.spec.ts`
  - `tests/e2e/inbox-ui.spec.ts`
  - `tests/e2e/workspace.spec.ts`
  - `tests/e2e/mail-triage.spec.ts`
- Modify: `tests/e2e/application-lanes.spec.ts`

**Interfaces:**
- Consumes: the region and button names from Tasks 10 and 11.

Name changes to apply throughout:

| Old | New |
| --- | --- |
| `/applications?tab=emails` (goto and `toHaveURL`) | `/applications?emails=1` |
| region `/Updates on your records/` (unmatched mail) | region `"Replies we couldn't match"` (`getByRole("region", { name: "Replies we couldn't match" })`) |
| region `/New roles for you/` | region `/^New roles/` |
| region `/Probably noise/` | region `/^Job alerts and auto-replies/` |
| button `/Dismiss all \d+/` | button `"Clear all"` |
| `searchParams.get("tab")` is `"emails"` | `searchParams.get("emails")` is `"1"` |
| matched update linked from the Emails tab | lane `Link it` (see Step 2) |

`<section aria-labelledby>` with a heading is exposed as a region named by the heading text, which includes the `· N` count. Use a regex anchored at the start (`/^Replies we couldn't match/`).

- [ ] **Step 1: Apply the URL renames**

```bash
sed -i '' 's#/applications?tab=emails#/applications?emails=1#g; s#\\/applications\\?tab=emails#\\/applications\\?emails=1#g' tests/e2e/applications.spec.ts tests/e2e/action-home.spec.ts tests/e2e/mail-reader.spec.ts tests/e2e/inbox-ui.spec.ts tests/e2e/workspace.spec.ts tests/e2e/mail-triage.spec.ts
```

In `tests/e2e/mail-reader.spec.ts`, also replace `expect(destination.searchParams.get("tab")).toBe("emails");` with `expect(destination.searchParams.get("emails")).toBe("1");`, and change the `/mail/${update}` "Link and update" href expectation to `` `/applications?open=${applicationId}&mail=${update}&outcome=heard` ``.

- [ ] **Step 2: Matched mail starts from the lane.** In `tests/e2e/applications.spec.ts`, the test that seeds a record named `Mail Link Co ${Date.now()}` (held in `company`) and a matched mail opens Emails, then clicks **Link and update** inside the "Updates on your records" region. Replace that `goto` and the whole click chain (from `page.getByRole("region", { name: /Updates on your records/ })` through `.click()`) with:

```ts
  await page.goto("/applications");
  await page
    .getByRole("group", { name: company, exact: true })
    .getByRole("link", { name: /^Link it/ })
    .click();
```

Keep the rest of that test: `Linking mail: ${subject}` is still shown in the lane detail. If it later navigates to the record page for History, keep that navigation as is.

- [ ] **Step 3: Region renames.** In `applications.spec.ts`, `action-home.spec.ts` and any other spec using the old names, apply the table above:
- `action-home`'s INTERVIEW mail is unmatched, so it uses `/^Replies we couldn't match/`
- the roles test uses `/^New roles/`
- the noise test uses `/^Job alerts and auto-replies/` and clicks `"Clear all"`

The `Dismissed N messages` status text is unchanged.

- [ ] **Step 4: Plain setup text.** In `tests/e2e/applications.spec.ts` (lines ~396–405) and `tests/e2e/mail-reader.spec.ts` (~line 214), replace each `toHaveAccessibleDescription("Set … in .env")` with:

```ts
  ).toHaveAccessibleDescription("Gmail isn't set up on this computer yet.");
```

(use `"Outlook isn't set up on this computer yet."` for the Outlook button) and add:

```ts
  await page.getByText("Setup details").first().click();
  await expect(page.getByText(/Set GOOGLE_CLIENT_ID, .* in \.env, then restart the app\./)).toBeVisible();
```

- [ ] **Step 5: Add drawer and lane coverage** to `tests/e2e/application-lanes.spec.ts`:

```ts
test("the Emails drawer links an unmatched reply into its lane and clears alerts", async ({ page }) => {
  const company = `Drawer Lane ${Date.now()}`;
  const subject = `${company} interview`;
  const { applicationId } = await seedRecord({ company, source: "DIRECT", sentDaysAgo: 3 });
  await seedMail({ subject, classification: "INTERVIEW" });
  await seedMail({ subject: `${company} alert one`, sender: "jobalerts@naukri.com", classification: "UNKNOWN" });
  await seedMail({ subject: `${company} alert two`, sender: "jobalerts@naukri.com", classification: "UNKNOWN" });
  await page.goto("/applications");
  await page.getByRole("button", { name: /^Emails/ }).click();
  const drawer = page.getByRole("dialog", { name: "Emails" });
  const unmatched = drawer.getByRole("region", { name: /^Replies we couldn't match/ });
  const card = unmatched.getByRole("listitem").filter({ hasText: subject });
  await card.getByLabel("Record for this message").selectOption(applicationId);
  await card.getByRole("button", { name: "Link and update", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`open=${applicationId}&mail=`));
  await expect(page.getByText(`Linking mail: ${subject}`)).toBeVisible();
  await page.goto("/applications?emails=1");
  await drawer
    .getByRole("region", { name: /^Job alerts and auto-replies/ })
    .getByRole("button", { name: "Clear all", exact: true })
    .click();
  await expect(page.getByRole("status").filter({ hasText: /Dismissed \d+ messages/ })).toBeVisible();
  await expect(drawer.getByText(`${company} alert one`)).toHaveCount(0);
});

test("a wrongly matched email can be dismissed from its lane", async ({ page }) => {
  const company = `Dismiss Lane ${Date.now()}`;
  const { applicationId } = await seedRecord({ company, source: "DIRECT", sentDaysAgo: 2 });
  await seedMail({ subject: `${company} offer`, classification: "OFFER", recordId: applicationId });
  await page.goto(`/applications?open=${applicationId}`);
  const history = page.getByRole("region", { name: `${company} timeline` }).getByRole("region", { name: "History" });
  await history.getByRole("button", { name: "Dismiss", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`open=${applicationId}&notice=`));
  await expect(page.getByRole("status").filter({ hasText: "Dismissed 1 message." })).toBeVisible();
  await expect(
    page.getByRole("group", { name: company, exact: true }).getByRole("button", { name: /not added yet/ }),
  ).toHaveCount(0);
});
```

- [ ] **Step 6: Ask the user, then run the browser suite**

Ask first (host server on :3211, `jobops_e2e`). Then run: `npm run test:e2e`
Expected: PASS. For any failure in `inbox-ui.spec.ts` that counts account addresses (`toHaveCount(2)`): a seeded **matched** update is now on a lane rather than in the drawer, so lower the expected count by one per matched update and add a lane assertion for that message's pending dot. Make no other changes without understanding the failure.

- [ ] **Step 7: Commit** (after the user approves)

```bash
npx prettier --write tests/e2e
git add -u tests/e2e
git commit -m "JOB_FINDER-9999: Cover mail on lanes and the Emails drawer in browser tests

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

# Phase 3: Record page

### Task 14: Record history on the shared timeline, readable dates, collapsed notes

**Files:**
- Modify: `src/features/applications/views/detail.tsx`
- Create: `src/features/applications/views/notes-text.tsx`
- Create: `tests/application-notes-text.test.ts`
- Modify: `tests/e2e/applications.spec.ts`

**Interfaces:**
- Consumes: `Timeline` (Task 5), `eventTone`, `clip` (Task 2).
- Produces: `NotesText({ text }: { text: string })` (client); the record page keeps its `History` region, the `phase-label` test id and the "Add to history" form.

- [ ] **Step 1: Write the failing test** `tests/application-notes-text.test.ts`:

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { NotesText } from "@/features/applications/views/notes-text";

it("clamps long notes to four lines behind Show all", () => {
  const html = renderToStaticMarkup(createElement(NotesText, { text: "line\n".repeat(12) }));
  expect(html).toContain("line-clamp-4");
  expect(html).toContain("Show all");
});

it("shows short notes in full and says when there are none", () => {
  expect(renderToStaticMarkup(createElement(NotesText, { text: "Short note" }))).not.toContain("Show all");
  expect(renderToStaticMarkup(createElement(NotesText, { text: "" }))).toContain("No notes yet.");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/application-notes-text.test.ts`
Expected: FAIL; the module is missing.

- [ ] **Step 3: Create `src/features/applications/views/notes-text.tsx`**

```tsx
"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export function NotesText({ text }: { text: string }) {
  const [all, setAll] = useState(false);
  if (!text) return <p className="m-0 text-sm text-muted-foreground">No notes yet.</p>;
  const long = text.split("\n").length > 4 || text.length > 320;
  return (
    <div className="flex flex-col items-start gap-1">
      <p
        className={cn(
          "m-0 text-sm whitespace-pre-wrap text-muted-foreground [overflow-wrap:anywhere]",
          long && !all && "line-clamp-4",
        )}
      >
        {text}
      </p>
      {long && (
        <button
          type="button"
          aria-expanded={all}
          onClick={() => setAll((value) => !value)}
          className="pressable rounded-full px-2 py-0.5 text-xs font-medium text-link hover:bg-muted"
        >
          {all ? "Show less" : "Show all"}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Use it and the shared timeline in `detail.tsx`.**
  - Add imports: `import { clip, eventTone, type DotTone } from "../lanes";`, `import { NotesText } from "./notes-text";`, `import { Timeline } from "./timeline";`. Remove imports that become unused (`historyTone`, `Mail`, `displayDate` if unused; run lint).
  - Replace the `const history = [...]` block with:

```tsx
  const linkedMailIds = new Set(
    record.events
      .map((event) => event.payload.mailMessageId)
      .filter((value): value is string => typeof value === "string"),
  );
  const history = [
    ...record.events.map((event) => ({
      key: event.id,
      at: event.occurredAt,
      tone: eventTone(event.eventType, typeof event.payload.mailMessageId === "string") as DotTone,
      label: event.summary,
      detail: "",
      tags: [] as string[],
    })),
    ...record.linkedMail
      .filter((mail) => !linkedMailIds.has(mail.id))
      .map((mail) => ({
        key: mail.id,
        at: mail.receivedAt,
        tone: "mail" as DotTone,
        label: clip(mail.subject, 200),
        detail: "",
        tags: [] as string[],
        href: `/mail/${mail.id}`,
      })),
    ...linked
      .filter((other) => isOutreach(other.source))
      .flatMap((other) =>
        other.events.map((event) => ({
          key: event.id,
          at: event.occurredAt,
          tone: eventTone(event.eventType, false),
          label: event.summary,
          detail: "",
          tags: [methodLabel[other.source] ?? "Linked record"],
        })),
      ),
  ];
```

  - In the History section, replace the whole `<ol className="m-0 list-none space-y-4 p-0">…</ol>` with `<Timeline entries={history} now={now} />`.
  - In the Notes section, replace `<p className="m-0 text-sm whitespace-pre-wrap text-muted-foreground [overflow-wrap:anywhere]">{record.notes || "No notes yet."}</p>` with `<NotesText text={record.notes} />`.

- [ ] **Step 5: Add a browser check.** Append to `tests/e2e/applications.spec.ts`:

```ts
test("record history uses readable India-time dates and long notes collapse", async ({ page }) => {
  const company = `Readable Co ${Date.now()}`;
  const { applicationId } = await seedRecord({ company, source: "DIRECT", sentDaysAgo: 0 });
  await page.goto(`/applications/${applicationId}`);
  const history = page.getByRole("region", { name: "History" });
  await expect(history).toContainText(/Today, \d{1,2}:\d{2} (am|pm)/);
  await expect(history).not.toContainText("Asia/Kolkata");
  await page.getByRole("button", { name: "Edit details" }).click();
  await page.getByLabel("Notes").fill("A long note line\n".repeat(10));
  await page.getByRole("button", { name: "Save details", exact: true }).click();
  await expect(page.getByRole("button", { name: "Show all", exact: true })).toBeVisible();
});
```

(`Edit details` is a `<summary>`; if `getByRole("button")` does not find it, use `page.getByText("Edit details", { exact: true }).click()`.)

- [ ] **Step 6: Run the unit suite, typecheck and lint**

Run: `npx vitest run tests/application-notes-text.test.ts && npm run typecheck && npm run lint && npm test`
Expected: PASS; exit 0.

- [ ] **Step 7: Ask the user, then run the browser tests** for the record page:

Run: `npm run test:e2e -- tests/e2e/applications.spec.ts tests/e2e/mail-triage.spec.ts tests/e2e/simple-records.spec.ts`
Expected: PASS. Earlier tests assert `History` contents by summary text; those summaries are unchanged.

- [ ] **Step 8: Final look in Docker.** Run `docker compose up -d --build app` and the Task 7 screenshot script, plus a shot of `/applications/<a real record id>`. Confirm:
- the record page shows "Today, 4:19 pm"-style dates
- long notes show four lines and **Show all**

- [ ] **Step 9: Commit** (after the user approves)

```bash
npx prettier --write src/features/applications/views/detail.tsx src/features/applications/views/notes-text.tsx tests/application-notes-text.test.ts tests/e2e/applications.spec.ts
git add src/features/applications/views/detail.tsx src/features/applications/views/notes-text.tsx tests/application-notes-text.test.ts tests/e2e/applications.spec.ts
git commit -m "JOB_FINDER-9999: Show record history on the shared timeline with readable dates

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Spec coverage

| Spec | Task |
| --- | --- |
| §1 page, params, legacy links, empty state | 7, 8, 12 |
| §2.1 grouping by company and aliases | 1 |
| §2.2 lead and status labels | 1 |
| §2.3 dots | 2 |
| §2.4 next column and actions | 2, 6 |
| §2.5 order and groups, closed toggle | 2, 6 |
| §2.6 window, ticks, stacks, readout, phone | 3, 6, 9 |
| §2.7 expanded lane, role switcher, chips, follow-up | 4, 7 |
| §3 mail on lanes: Link it / Add to timeline / Link elsewhere / Dismiss | 2, 7, 11 |
| §4 Emails drawer | 7, 10 |
| §5 record page | 14 |
| §6 routes and links | 8, 12 |
| §7 code layout and removals | 7, 8, 10 |
| §8 errors and edge cases | 3, 7, 9 |
| §9 testing | every task; browser in 9, 13, 14 |
