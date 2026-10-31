# Applications That Keep Up With Mail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clear outcome emails (acknowledgement, rejection, offer) update their application on their own, with Undo. Asking emails (assessment, interview) stay open. `/applications` becomes a grouped list showing how far each application got, and each row opens in place.

**Architecture:**

- A pure rule (`decideMailEffect`) decides what an email does to an application.
- One transactional writer (`autoApplyMail`) applies that decision through the existing services (`linkMailToRecord`, `applyOutcome`). It is called from every path that can make an email eligible.
- An idempotent catch-up runs once at server start through `src/instrumentation.ts`.
- The page reuses the lane grouping and next-step logic (`buildLanes` with `by: "application"`), a new journey derivation, and the company timeline components for the story.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Drizzle ORM on PostgreSQL 17, Zod 4, Vitest, Playwright, Tailwind 4 tokens.

**Spec:** `docs/superpowers/specs/2026-11-01-applications-mail-sync-design.md`. Read it before starting a task; this plan argues from it.

## Global Constraints

- Run the app only through Docker: `docker compose up -d --build` from `jobops/`. Never start host dev servers.
- Run commands from `jobops/`. Integration tests: `npm run test:db`, which runs only against `jobops_e2e`. Browser tests: `npm run test:e2e`, port 3211, `jobops_e2e`. Never point tests at personal data.
- Dates and day comparisons are India calendar days (Asia/Kolkata), using the helpers in `src/features/applications/dates.ts`.
- Colours: existing tokens only (`tag-*`, `success`, `warning`, `danger-soft`, `selected`, `primary` …). No palette literals in components.
- No LLM calls, and nothing is ever sent on the user's behalf.
- Copy is sentence case and in plain words. Button labels from the spec: "Mark rejected", "Undo", "Not applying", "Record application", "I followed up", "Edit details".
- Commits: only when the user says yes. At each commit step, propose `JOB_FINDER-9999: <summary>` (no conventional prefixes) ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- `mail_events.details` markers this plan introduces: `autoApplied: "acknowledge" | "rejected" | "offer"` and `autoUndone: true`. Application event payload markers: `auto: true`, `previousStatus`, `previousClosedReason`, `previousJobStatus`.
- Prerequisite: the edit-tag work (`docs/superpowers/specs/2026-11-01-edit-tag-design.md`, migration `drizzle/0016_interview_rejection.sql`) is uncommitted in this same checkout. It must be committed by its owner before Task 1 starts, because both touch `lanes.ts`, `triage.ts` and `tags.ts`. This plan assumes its names: tags `applicationRejected` and `interviewRejected`, and classification `INTERVIEW_REJECTION`. Its snackbar Undo is a retag, so Task 4's retag handling covers it.
- Plan-level decision, extending spec §1 condition 6: an outcome email never auto-applies while the application has a booked (`SCHEDULED`) round, because Undo cannot restore a settled round. It asks instead.

## Review Focus

- **The same email fetched again, rescanned or moved between folders.** It must never apply twice. Test in Task 4: `does not apply an email twice when its page is ingested again`.
- **An email received at 1:30 am India time on the day the application was sent** (still the previous day in UTC). It counts as on or after the sent day. Test in Task 2: `compares India calendar days, not UTC`.
- **A re-application:** a company with an old rejected application and a new live one. The email applies to the live one. Test in Task 2: `ignores closed applications when counting live ones`.
- **Undo after the user recorded something newer, or after the application was deleted.** It is refused with a clear message and nothing changes. Test in Task 3: `refuses undo once a newer outcome exists`.
- **Retagging an auto-rejected email as an acknowledgement.** The status ends at Acknowledged, not Rejected. Test in Task 4: `retagging rejection to acknowledgement undoes then acknowledges`.

---

### Task 1: Offer can be recorded from Applied

**Files:**

- Modify: `src/features/applications/phase.ts` (`availableOutcomes`)
- Test: `tests/application-phase.test.ts`

**Interfaces:**

- Produces: `availableOutcomes(state)` returns `["heard", "oa", "scheduled", "offer", "followup", "rejected", "ghosted", "withdrew"]` for a direct application in the Applied phase with no booked round.

- [ ] **Step 1: Write the failing tests**

```ts
it("offers Got an offer from Applied", () => {
  expect(availableOutcomes(appliedState)).toContain("offer");
});
it("keeps offer out while a round is booked", () => {
  expect(availableOutcomes({ ...interviewingState, rounds: [bookedRound] })).not.toContain("offer");
});
```

- [ ] **Step 2: Run `npx vitest run tests/application-phase.test.ts`.** Expected: the first test FAILS.
- [ ] **Step 3: Add `"offer"` after `"scheduled"` in the Applied branch of `availableOutcomes`.** Update any snapshot or render test that lists the Applied chips (search `tests/` for `"scheduled", "followup"`).
- [ ] **Step 4: Run `npx vitest run`.** Expected: PASS.
- [ ] **Step 5: Propose commit `JOB_FINDER-9999: Let an offer be recorded straight from Applied`.**

### Task 2: The email rule (pure)

**Files:**

- Create: `src/features/mail/auto-apply-rule.ts`
- Test: `src/features/mail/auto-apply-rule.test.ts`

**Interfaces:**

- Consumes: `isOutreach`, `type Phase`, `type OutcomeId` (`phase.ts`); `istDaysBetween` (`applications/dates.ts`); `type MailClassification` (`mail/tags.ts`).
- Produces:

```ts
export type RuleApplication = {
  id: string;
  source: string;
  previousJob: boolean;
  sentAt: Date | null;
  phase: Phase;
  outcomes: OutcomeId[]; // availableOutcomes(state)
  bookedRound: boolean;
};
export type RuleMail = {
  classification: MailClassification;
  receivedAt: Date;
  companyKey: string | null;
  /** Stored link, suggestedApplicationId and mail_tracking.applicationIds. */
  namedApplicationIds: string[];
  /** The user or another rule acted on it, or the rule already applied or was undone. */
  blocked: boolean;
};
export type MailEffect =
  | { kind: "acknowledge"; applicationId: string }
  | { kind: "outcome"; applicationId: string; outcome: "rejected" | "offer" }
  | { kind: "ask"; applicationId: string | null }
  | { kind: "none" };
export function decideMailEffect(mail: RuleMail, applications: RuleApplication[]): MailEffect;
```

The rule, from spec §1:

- **Live:** not a previous job, not outreach (`isOutreach`), `sentAt` set, and phase neither `Closed` nor `Preparing`.
- **Relevant:** at least one live application exists, and `istDaysBetween(earliestLiveSentAt, receivedAt) >= 0`.
- **Single:** exactly one live application.
- **Eligible:** single, and no id in `namedApplicationIds` differs from it.
- **Classifications:**
  - Acknowledgement is `APPLICATION_ACKNOWLEDGEMENT`.
  - Clear outcomes: `REJECTION` and `INTERVIEW_REJECTION` → `rejected`, `OFFER` → `offer`.
  - Asking: `INTERVIEW`, `ASSESSMENT`, `INTERVIEW_UPDATE`.
  - Every other classification → `none`.

| Case                                                                                   | Effect                                                  |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `blocked`, no `companyKey`, or not relevant                                            | `none`                                                  |
| Acknowledgement and eligible                                                           | `acknowledge`                                           |
| Clear outcome, eligible, outcome in `outcomes`, `!bookedRound`                         | `outcome`                                               |
| Asking and eligible                                                                    | `ask(single.id)`                                        |
| Any of the three groups, relevant but not eligible (or outcome not allowed, or booked) | `ask(single?.id ?? null)` when single, else `ask(null)` |

- [ ] **Step 1: Write the failing tests** (one `it` each, with fixtures built in the test file):
  - `acknowledges for the only live application`: expects `{ kind: "acknowledge", applicationId: "a1" }`.
  - `rejects for the only live application`: expects `{ kind: "outcome", applicationId: "a1", outcome: "rejected" }`.
  - `asks for an assessment`: expects `{ kind: "ask", applicationId: "a1" }`.
  - `asks which role when two live applications exist`: expects `{ kind: "ask", applicationId: null }`.
  - `ignores closed applications when counting live ones`: one `Closed` and one `Applied` → `outcome` for the Applied id.
  - `ignores outreach and previous jobs`: a `REFERRAL_ASK` plus one direct → applies to the direct one. Only a previous job → `none`.
  - `leaves mail older than every live application alone`: received 2021-06-04, sent 2026-10-02 → `none`.
  - `compares India calendar days, not UTC`: `sentAt` 2026-10-02T04:00Z, `receivedAt` 2026-10-01T20:00Z (2 Oct 01:30 IST) → `acknowledge`.
  - `asks when another application is named`: `namedApplicationIds: ["a2"]` with single `a1` → `ask("a1")`.
  - `asks when the outcome is not allowed`: `outcomes` without `"offer"` → `ask`.
  - `asks instead of applying while a round is booked`: `bookedRound: true` with a rejection → `ask`.
  - `does nothing when blocked`: → `none`.
  - `rejects after an interview too`: `INTERVIEW_REJECTION` → `{ kind: "outcome", outcome: "rejected" }`.
  - `does nothing for recruiter and other mail`: `RECRUITER_OUTREACH` → `none`.
- [ ] **Step 2: Run `npx vitest run src/features/mail/auto-apply-rule.test.ts`.** Expected: FAIL (module missing).
- [ ] **Step 3: Implement `decideMailEffect` in `src/features/mail/auto-apply-rule.ts`.** No database imports.
- [ ] **Step 4: Run it again.** Expected: PASS.
- [ ] **Step 5: Propose commit `JOB_FINDER-9999: Decide what an email does to its application`.**

### Task 3: Apply an effect, and undo an automatic outcome

**Files:**

- Modify: `src/features/applications/outcome-service.ts` (`applyOutcome`)
- Create: `src/features/mail/auto-apply.ts`
- Test: `tests/mail-auto-apply.integration.test.ts` (fixtures in the style of `tests/mail-handle.integration.test.ts`)

**Interfaces:**

- Consumes: `MailEffect` (Task 2); `linkMailToRecord`, `lockMail`, `type MailTx` (`handling-service.ts`); `applyOutcome` (`outcome-service.ts`).
- Produces:

```ts
// outcome-service.ts: input gains `auto?: true`. The payload always gains
// previousClosedReason and previousJobStatus; with auto it also gains auto: true.
export async function applyOutcome(tx: Tx, input: { …existing; auto?: true }, now: Date);

// auto-apply.ts
export async function applyMailEffect(tx: MailTx, messageId: string, effect: MailEffect, now: Date): Promise<void>;
export async function undoAutoOutcome(tx: MailTx, messageId: string, now: Date): Promise<void>;
export async function autoOutcomeEvent(tx: MailTx, messageId: string): Promise<{ eventId: string; applicationId: string; undoable: boolean } | null>;
```

Behaviour:

- `applyMailEffect` starts from a clean slate: it sets the email `OPEN`, and clears `linkedApplicationId` when the link carries an `autoApplied` marker. Then:
  - `acknowledge` → `linkMailToRecord`, then set `autoApplied: "acknowledge"` on the email's `mail_events`.
  - `outcome` → `applyOutcome({ applicationId, outcome, mailMessageId, auto: true, detail: { name: "", note: "", happenedAt: receivedAt clamped to now } })`, then set `autoApplied: outcome`.
  - `ask` → keep it `OPEN`, and set `suggestedApplicationId` on every event when `applicationId` is not null.
  - `none` → no writes.
- `autoOutcomeEvent` finds the application event whose `payload.mailMessageId` is the email and whose `payload.auto` is true. `undoable` is false when another event on that application with a `payload.outcome` has a later `createdAt`.
- `undoAutoOutcome` throws `ApiError("This outcome can no longer be undone. Correct it on the application.", 409)` when there is no undoable event. Otherwise it deletes the event, restores `status`, `closedReason` and `jobs.status` from the payload, sets `autoUndone: true` (keeping `autoApplied`) on the email's events, leaves the email linked and `DONE`, and inserts the activity log `MAIL_OUTCOME_UNDONE`.

- [ ] **Step 1: Write the failing integration tests:**
  - `acknowledge links the email and moves Applied to Acknowledged`.
  - `outcome records Rejected with auto payload and links the email`: checks `status = "REJECTED"`, `closedReason = "REJECTED"`, `payload.auto === true`, `payload.previousStatus === "APPLIED"`, and email `DONE` and linked.
  - `ask reopens recovered mail and suggests the application`.
  - `undo restores status, closed reason and job status and keeps the email linked`.
  - `refuses undo once a newer outcome exists`: after a manual `followup` outcome, `undoAutoOutcome` rejects with 409 and the status stays `REJECTED`.
- [ ] **Step 2: Run `npm run test:db -- tests/mail-auto-apply.integration.test.ts`.** Expected: FAIL.
- [ ] **Step 3: Extend `applyOutcome`, and implement `applyMailEffect`, `autoOutcomeEvent` and `undoAutoOutcome`.**
- [ ] **Step 4: Run it again, then `npx vitest run`.** Expected: PASS, with the existing outcome tests still green.
- [ ] **Step 5: Propose commit `JOB_FINDER-9999: Apply an email's effect and undo automatic outcomes`.**

### Task 4: Run the rule wherever an email can become eligible

**Files:**

- Modify: `src/features/mail/auto-apply.ts` (add `ruleInputs`, `autoApplyMail`)
- Modify: `src/features/mail/ingest.ts` (after the events update for imported, kept mail)
- Modify: `src/features/mail/include.ts` (after the message update)
- Modify: `src/features/mail/handle-service.ts` (`updateMail`: retag and company placement)
- Test: `tests/mail-auto-apply.integration.test.ts`, plus the existing `tests/mail-ingest.integration.test.ts` and `tests/mail-handle.integration.test.ts` must stay green.

**Interfaces:**

- Consumes: Tasks 2–3; `type MailContext` (`mail/context.ts`); `recordStateFrom`, `phaseOf`, `availableOutcomes` (`phase.ts`).
- Produces:

```ts
export async function ruleInputs(
  tx: MailTx,
  messageId: string,
  context: MailContext,
): Promise<{ mail: RuleMail; applications: RuleApplication[] }>;
export async function autoApplyMail(
  tx: MailTx,
  messageId: string,
  context: MailContext,
  now: Date,
): Promise<MailEffect>;
```

How it fits:

- `ruleInputs` loads the company's applications. It takes their ids from `context.applications` where `company === companyKey`, then builds state from their rows, events, rounds and linked mail inside `tx`.
- `blocked` is true when any of these hold:
  - the email is linked without an `autoApplied` marker,
  - an event has `justInfo` or `triageDismissal`,
  - a non-auto application event references the email,
  - `autoApplied` is set (still applied, or undone).
- In `ingestPage`, call `autoApplyMail` only when `imported.imported`, after the previous-job rule. Recovered mail is stored `DONE` first, and the rule may reopen or apply it.
- In `updateMail`, when the classification changes:
  1. If `autoOutcomeEvent` is undoable, call `undoAutoOutcome`.
  2. If the auto outcome is still applied but not undoable, leave every marker in place.
  3. Otherwise, clear `autoApplied` and `autoUndone`.
  4. After the tag and company writes, call `autoApplyMail` when the tag or the company changed.
  5. Do all of this before the early `return` that fires when the link and company are unchanged.
- An explicit `application` placement is the user's link, so the rule stays blocked.

- [ ] **Step 1: Write the failing integration tests:**
  - `fetching a rejection for a single-application company marks it Rejected`, through `ingestPage` with `recoveredBefore` after the email, so it is history.
  - `fetching an assessment keeps it open with a suggestion`.
  - `does not apply an email twice when its page is ingested again`: ingest the same page twice; there is one `REJECTION_RECEIVED` event.
  - `including a dropped rejection applies it`, through `includeMail`.
  - `placing an unplaced acknowledgement at the company acknowledges`, through `updateMail({ company })`.
  - `retagging rejection to acknowledgement undoes then acknowledges`: the status ends `ACKNOWLEDGED`, and no auto rejection event remains.
  - `retagging after Undo re-runs the rule when the tag changes`.
  - `marked Just info is never auto-applied`.
- [ ] **Step 2: Run `npm run test:db -- tests/mail-auto-apply.integration.test.ts`.** Expected: the new tests FAIL.
- [ ] **Step 3: Implement `ruleInputs` and `autoApplyMail`, and wire the three call sites.**
- [ ] **Step 4: Run `npm run test:db`.** Expected: all integration tests PASS.
- [ ] **Step 5: Propose commit `JOB_FINDER-9999: Update applications from mail on fetch, include, place and retag`.**

### Task 5: One-time catch-up at server start

**Files:**

- Create: `src/features/mail/catch-up.ts`
- Create: `src/instrumentation.ts`
- Test: `tests/mail-catch-up.integration.test.ts`

**Interfaces:**

- Consumes: `autoApplyMail`, `ruleInputs` (Task 4); `loadMailContext`; the `settings` table.
- Produces:

```ts
export const CATCH_UP_KEY = "mailSyncCatchUp";
export const CATCH_UP_VERSION = 1;
export async function catchUpMailSync(
  now?: Date,
): Promise<{ skipped: boolean; applied: number; asked: number }>;
```

How it works:

- It skips when `settings[CATCH_UP_KEY].value.version >= 1`.
- Otherwise it walks kept emails with a `company_key`, ordered by `received_at` ascending. It only considers emails that are `OPEN`, or `DONE` with `mail_tracking.recovered = true` and not `blocked`. Each email gets its own transaction calling `autoApplyMail`.
- At the end it writes `{ version: 1, ranAt, applied, asked }` to the settings key.
- `register()` runs only when `process.env.NEXT_RUNTIME === "nodejs"`. It imports the module dynamically, and catches and logs errors as `Mail catch-up failed` without stopping the server.

- [ ] **Step 1: Write the failing integration tests:**
  - `applies an acknowledgement before a later rejection`: Weave's shape ends `REJECTED`, with an `ACKNOWLEDGEMENT_RECEIVED` event dated 3 Oct.
  - `leaves emails the user handled alone`: a Just info rejection stays as it is.
  - `is idempotent`: a second call returns `{ skipped: true }`, and the event count is unchanged.
- [ ] **Step 2: Run `npm run test:db -- tests/mail-catch-up.integration.test.ts`.** Expected: FAIL.
- [ ] **Step 3: Implement `catchUpMailSync` and `src/instrumentation.ts`.**
- [ ] **Step 4: Run `npm run test:db`.** Expected: PASS.
- [ ] **Step 5: Propose commit `JOB_FINDER-9999: Catch existing mail up with its applications once`.**

### Task 6: Undo from the email on Mail and in the story

**Files:**

- Modify: `src/features/mail/mail-item.ts` (`MailItem` gains `autoOutcome`)
- Modify: `src/features/mail/mail-list.ts` (select it)
- Modify: `src/features/mail/workspace-actions.ts` (add `undoAutoOutcomeAction`)
- Modify: `src/features/timeline/handling.tsx` (`HandledLine`)
- Test: `tests/mail-list.integration.test.ts`, `tests/timeline-render.test.ts`

**Interfaces:**

- Consumes: `autoOutcomeEvent`, `undoAutoOutcome` (Task 3).
- Produces:
  - `MailItem.autoOutcome: { undoable: boolean } | null`.
  - `undoAutoOutcomeAction(_state: ActionState, form: FormData): Promise<ActionState>`, which reads `id`. Afterwards it revalidates `/mail`, `/applications` and `/companies`.
  - `HandledLine` shows `Recorded from this email: Rejected`. When undoable, it adds an Undo button that submits `undoAutoOutcomeAction`. The existing Just info Undo is unchanged.

- [ ] **Step 1: Write the failing tests:**
  - `lists autoOutcome for an auto-applied email` (integration): `{ undoable: true }`, and after a newer outcome, `{ undoable: false }`.
  - `HandledLine offers Undo for an undoable automatic outcome` (render): the markup contains "Recorded from this email: Rejected" and a button named "Undo".
- [ ] **Step 2: Run `npm run test:db -- tests/mail-list.integration.test.ts` and `npx vitest run tests/timeline-render.test.ts`.** Expected: FAIL.
- [ ] **Step 3: Implement the field, the action and the `HandledLine` branch.**
- [ ] **Step 4: Run both again.** Expected: PASS.
- [ ] **Step 5: Propose commit `JOB_FINDER-9999: Undo an automatic outcome from its email`.**

### Task 7: One status and next-step vocabulary

**Files:**

- Modify: `src/features/applications/read.ts` (`ApplicationRecord.postedAt: Date | null` from `jobs.postedAt`)
- Modify: `src/features/applications/lanes.ts` (`LaneSource` gains `postedAt`; `recordStatus`, `whenText`, the Preparing branch of `recordNext`, and `buildLanes` grouping)
- Modify: `src/features/companies/status.ts`, `src/features/companies/status-pill.tsx` (new `rejected` tone)
- Test: `tests/application-lanes.test.ts`, `tests/company-status.test.ts`, `tests/timeline-index.test.ts` (update their expectations)

**Interfaces:**

- Produces:
  - `StatusTone` gains `"rejected"`, styled `bg-danger-soft text-destructive`. `closedStatus` uses it for Rejected.
  - Status labels:
    - `Not sent` (was "Not sent yet").
    - `Applied` or `Acknowledged`, inside the silence clock.
    - `Quiet N days` (was "Quiet for N days").
    - `Online assessment`, when the only unsettled round is `ONLINE_ASSESSMENT`. Other interview labels are unchanged.
  - `whenText`:
    - overdue → `Overdue since 9 Oct`;
    - today → `Today` or `Today, 3:00 pm`;
    - later → `By Tue 3 Nov` (untimed) or `Tue 3 Nov, 3:00 pm` (timed).
  - Preparing `recordNext`, with the deadline at `postedAt` + 14 India days inclusive:
    - unknown `postedAt` → text `Check the posting date`, when `Posting date unknown`;
    - inside the window → text `Apply by Wed 4 Nov`, action `Record application`;
    - past it → text `Posting is 18 days old`, action `Not applying`.
  - `buildLanes`: a lane with a Preparing record goes in group `needs`.

- [ ] **Step 1: Update or add the failing tests** with those exact strings. Include `Quiet 29 days`, `Overdue since 9 Oct`, `Apply by Wed 4 Nov` (posted 21 Oct, now 31 Oct) and `Posting is 18 days old`.
- [ ] **Step 2: Run `npx vitest run tests/application-lanes.test.ts tests/company-status.test.ts tests/timeline-index.test.ts`.** Expected: FAIL.
- [ ] **Step 3: Implement the changes listed under Produces.**
- [ ] **Step 4: Run `npx vitest run`.** Expected: PASS.
- [ ] **Step 5: Propose commit `JOB_FINDER-9999: Share one status and next-step wording across pages`.**

### Task 8: Not applying

**Files:**

- Modify: `src/features/applications/outcome-service.ts` (add `closeUnsentRecord`)
- Modify: `src/features/applications/record-actions.ts` (add `notApplying`)
- Modify: `src/features/applications/lanes.ts` (`closedStatus`: an unsent record closed as `WITHDREW` reads `Not applying`)
- Test: `tests/application-outcome-actions.test.ts`; integration in `tests/mail-auto-apply.integration.test.ts`, or a new `tests/application-close.integration.test.ts`

**Interfaces:**

- Produces:
  - `closeUnsentRecord(tx: Tx, data: { id: string }, now: Date): Promise<void>`. It throws `"This record has already been sent or closed. Refresh the page."` unless the record is Preparing and unsent. Otherwise it sets `status: "CLOSED"`, `closedReason: "WITHDREW"`, adds a `WITHDRAWN` event with summary `Not applying`, updates `jobs.status` through `jobStateForApplication`, and writes the activity log `APPLICATION_NOT_APPLYING`.
  - `notApplying(_state: ActionState, form: FormData): Promise<ActionState>`, which reads `id`.

- [ ] **Step 1: Write the failing tests:** `closes an unsent record as Not applying`, and `refuses Not applying once sent`.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement both.**
- [ ] **Step 4: Run `npx vitest run` and `npm run test:db`.** Expected: PASS.
- [ ] **Step 5: Propose commit `JOB_FINDER-9999: Close an unsent application as Not applying`.**

### Task 9: Journey and story read models

**Files:**

- Create: `src/features/applications/journey.ts`
- Create: `src/features/applications/story.ts`
- Test: `tests/application-journey.test.ts` (fixtures from `tests/lane-fixtures.ts`), `tests/application-story.integration.test.ts`

**Interfaces:**

- Consumes: `ApplicationRecord` (with `postedAt`, Task 7); `listMail`, `loadMailContext`; `timelineEntries`, `type TimelineDay`; `suggestHandling`, `timelineRole`.
- Produces:

```ts
export type JourneyStep = {
  label: string;
  at: Date | null;
  state: "reached" | "stopped" | "ahead" | "faded";
  tone: "applied" | "interviewing" | "offer" | "bad" | "muted";
};
export type Journey = { kind: "application" | "outreach"; steps: JourneyStep[] };
export function journeyOf(record: ApplicationRecord): Journey;

export async function readApplicationStory(
  record: ApplicationRecord,
  siblings: ApplicationRecord[],
  now: Date,
): Promise<{ days: TimelineDay[]; handling: Record<string, Handling> }>;
```

Journey rules (spec §4):

- **Application steps:** Sent, Acknowledged, Interviewing, Offer. Outreach steps: Sent, Replied, Referred.
- **Reached:** a step is reached when it or any later step is reached. Its date is the earliest evidence (dates under spec §4), or null when no evidence exists.
- **Stopped:**
  - Closed as `REJECTED` (or `REFERRAL_DECLINED` for outreach): the first unreached step becomes `stopped`, with tone `bad`. Its label is `Rejected` (or `Not able to refer`), and its date is the closing event's `occurredAt`.
  - Withdrawn, closed with no reply, or Not applying: same, but tone `muted` and label `Closed`.
  - Accepted or declined: no stop.
- **Faded:** steps after a stop.
- **Never sent:** first step label `Not sent`.

Story rules (spec §5):

- **Mail:** the company's mail (`listMail({ company, attention: "all" })`, first page), kept when either:
  - `application.id === record.id`, or
  - `application === null` and it was received on or after the record's earliest event.
- **Steps:** come from `timelineEntries` with the record's events and rounds.
- **Handling:** for open mail, from `suggestHandling` with `siblings.map(timelineRole)`.

- [ ] **Step 1: Write the failing tests:**
  - `journey marks Rejected in place of the next step` (Northwind shape: Sent 2 Oct, Acknowledged 3 Oct, Rejected 7 Oct, Offer faded).
  - `journey shows Not sent for an unsent record`.
  - `journey shows a muted Closed for Not applying`.
  - `outreach journey uses Sent, Replied, Referred`.
  - `story keeps linked mail and newer unlinked company mail` (integration): excludes unlinked mail older than the record, and mail linked to a sibling.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement `journeyOf` and `readApplicationStory`.**
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: Propose commit `JOB_FINDER-9999: Derive each application's journey and story`.**

### Task 10: The new Applications page

**Files:**

- Create: `src/features/applications/views/journey-track.tsx`. Port `Journey` from `src/features/applications/sync-gallery/parts.tsx`, driven by the `Journey` type; sizes `"row" | "large"`.
- Create: `src/features/applications/views/application-list.tsx`. Groups and rows per gallery layout C; port `NextStep` and `Monogram` from the gallery.
- Create: `src/features/applications/views/application-detail.tsx`. The expanded row per gallery layout B:
  - story through `CompanyTimeline` with `roles=[]`,
  - next-step card,
  - `OutcomeChips` (`views/outcome-chips.tsx`),
  - follow-up (`views/follow-up.tsx`),
  - facts,
  - an `Edit details` link to `/applications/<id>`.
- Modify: `src/app/applications/page.tsx` (rewrite on these views)
- Modify: `src/app/applications/[id]/page.tsx`. Redirect to `/applications?open=<id>&outcome=…&mail=…` when `outcome` or `mail` is present. Otherwise keep the edit forms and add a `Back to Applications` link to `/applications?open=<id>`.
- Test: `tests/application-list-render.test.ts` (render style of `tests/timeline-render.test.ts`), `tests/e2e/applications.spec.ts` (rewrite)

**Interfaces:**

- Consumes: `buildLanes({ …, by: "application" })` (status, next, group); `journeyOf`; `readApplicationStory`; `resolveLanesView` (`navigation.ts`) for `open`, `mail`, `outcome`, `notice`; `notApplying` (Task 8).
- Produces:
  - `ApplicationList({ lanes, journeys, openId, detail })`.
  - `ApplicationDetail({ record, lane, journey, story, requested, mail, records })`.
  - Each row is a `Link` to `?open=<id>` with `scroll={false}`. Pressing the open row links to `/applications`.
  - Closed starts collapsed (a `details` element with its count) when it has more than 5 rows.

- [ ] **Step 1: Write the failing render tests:**
  - `groups rows as Needs you, Waiting on them, Closed with counts`.
  - `shows the journey dates and one next step per row`.
  - `opens the requested row in place`.
  - `shows Not applying for an unsent record past 14 days`.
- [ ] **Step 2: Run `npx vitest run tests/application-list-render.test.ts`.** Expected: FAIL.
- [ ] **Step 3: Implement the three views and the page, and redirect the old deep links.** Stack identity, journey and next step at phone width; the journey stays four columns.
- [ ] **Step 4: Run `npx vitest run`, `npm run lint` and `npm run typecheck`.** Expected: PASS.
- [ ] **Step 5: Rewrite `tests/e2e/applications.spec.ts`:**
  - `a fetched rejection shows Rejected on Applications, Mail and the company page`;
  - `an assessment email asks on its row and records with a date`;
  - `a row expands and collapses and a deep link opens it`.
    Run `npm run test:e2e -- applications`. Expected: PASS.
- [ ] **Step 6: Propose commit `JOB_FINDER-9999: Show applications as journeys that open in place`.**

### Task 11: Remove stale code (user-approved list first)

**Files:** candidates from spec §6. Confirm each with `grep -rn` before listing it:

- `src/features/applications/views/lanes.tsx`, `lane-detail.tsx`, `lane-marks.tsx`, `timeline.tsx`, and `marks.tsx` if unused.
- In `src/features/applications/lanes.ts`: `laneWindow`, `laneViews`, `stackDots`, `laneDots`, `dayLabel`, and their types. Keep `dots` on `Lane` only if Mail still reads it; otherwise drop the field.
- `src/app/gallery/applications/`, `src/features/applications/gallery/`, and the Applications option in `src/features/mail/feed-gallery/`.
- The `emails` and `tab` redirect in `src/app/applications/page.tsx`, if nothing links to it.
- Tests that only cover removed code: `tests/application-lane-window.test.ts`, `application-lanes-chart.test.ts`, `application-lanes-view.test.ts`, `application-marks.test.ts`, `application-timeline.test.ts`. Check each.
- In `AGENTS.md` product scope: notes pointing at removed galleries or the calendar lanes.

- [ ] **Step 1: Run `npx tsc --noEmit` and grep for imports of each candidate. Write the confirmed list in chat for the user, and wait for their OK.**
- [ ] **Step 2: Delete the approved files and exports, and update `AGENTS.md`.**
- [ ] **Step 3: Run `npm run lint`, `npm run typecheck`, `npx vitest run` and `npm run test:db`.** Expected: PASS.
- [ ] **Step 4: Propose commit `JOB_FINDER-9999: Remove the calendar lanes and superseded galleries`.**

### Task 12: Ship to the user's Docker app and verify on real data

- [ ] **Step 1: Back up the personal database.** Run `docker compose exec -T postgres pg_dump -U jobops jobops > backups/jobops-2026-11-01-before-mail-sync.sql`, and confirm the file is non-empty. `backups/` is git-ignored.
- [ ] **Step 2: Run `npm run build`, then `docker compose up -d --build`.** Expected: the app is healthy, and the logs show no `Mail catch-up failed`.
- [ ] **Step 3: Check the data with `psql`:**
  - Oracle's application is `REJECTED`;
  - Weave's has an acknowledgement on 3 Oct and is `REJECTED` on 7 Oct;
  - ServiceNow's is `ACKNOWLEDGED`;
  - `settings.mailSyncCatchUp.version = 1`;
  - Amazon's emails are unchanged.
- [ ] **Step 4: Check in the browser pane:**
  - `/applications` groups match the data;
  - Oracle's row expands with the rejection and Undo;
  - `/mail?company=oracle` no longer says Quiet.
- [ ] **Step 5: Report the results to the user.** Offer to keep or remove `/gallery/applications-sync`.
