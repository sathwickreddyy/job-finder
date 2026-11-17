# Company Application Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track every application on its company page: a row per application that opens to its facts, readable notes, a tracker of only what happened, and its own mail-and-rounds timeline, with every application link landing there.

**Architecture:** A new company loader (`readCompanyApplications`) assembles per-application rows from the existing application reader, the existing per-application company timeline (`readCompanyTimeline(key, { application })`), round questions and stored résumé scores. The company page's first tab renders those rows; companies without a company record get the same tab on a minimal page. `/applications/<id>` becomes the one link every surface uses, and it redirects to the company page with that row open.

**Tech Stack:** Next.js 16 App Router, React 19, Drizzle/Postgres, zod 4, Tailwind 4 container queries, Vitest, Playwright (`npm run test:e2e` against `jobops_e2e`).

**Spec:** `jobops/docs/superpowers/specs/2026-11-16-company-application-tracking-design.md`

## Global Constraints

- Docker-only runtime; check pages with `docker compose up -d --build app` from the repo root at `http://127.0.0.1:3210`. Browser tests use `jobops_e2e`, never personal data.
- Never commit `jobops/data/`. Commit key `JOB_FINDER-9999: <summary>`, no conventional prefixes, footer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- The tracker shows only recorded data: no `typicalLoop`, no "Expected" steps anywhere.
- No Move control on any page; misplaced mail is fixed through the existing mail `link` / `unlink` actions.
- Every timeline card shows a time; a timestamp at exactly 00:00:00.000 India time shows and sorts as 12:00 pm. Stored times never change.
- Recorded cards use one icon and the label "Recorded"; the time sits under the pill.
- Keep the question editor, question library, mail popup and question API unchanged.
- Text truncates with a full-text `title`; no horizontal page scroll at 390px.
- Notes, round notes and question text keep their existing limits (`NOTES_MAX` = 100 000 for application notes).
- Follow the AGENTS.md documentation maintenance rule in the task that changes behaviour.

## Deviations from the spec (rulings)

- The minimal page has no "Add company" button: JobOps has no company-create page, only the company API. The banner tells the user to ask Claude Code or Codex. Cost if wrong: one extra step to add a company.
- A `?mail=` link without an outcome opens the email popup over the open row; with an outcome it opens + Add step with that email as the source, as the old in-place view did.

## Review Focus

1. A sent application with no acknowledgement and no rounds: tracker is Applied → + Add step → Offer / Rejected; no Interview scheduled step, no empty timeline gaps. (Task 1 test.)
2. A round with no `scheduledAt`: its step reads "Date not set" and its card sits at the round's `createdAt`. (Tasks 1 and 3 tests.)
3. A timestamp at 00:00 UTC (05:30 India time) is not a date-only value and keeps its time; only 00:00 India time becomes 12:00 pm. (Task 3 test.)
4. A company key with spaces or non-ASCII letters ("level ai", "société générale") round-trips through `encodeURIComponent` to the minimal company page and back. (Task 6 test.)
5. Free-form or empty notes, and template notes missing a section, render as plain Markdown or with only the sections present, never an empty heading. (Task 4 test.)

---

## File Structure

- `src/features/applications/named-steps.ts`: tracker steps (rewritten: no predictions, Interview scheduled per round, final Offer / Rejected, step anchors).
- `src/features/applications/views/named-steps.tsx`: tracker view; steps link to their timeline anchors; optional `add` slot.
- `src/features/applications/dates.ts`: `noonIfDateOnly`.
- `src/db/schema.ts`, `drizzle/0022_round_interviewer.sql`: `application_rounds.interviewer`.
- `src/features/timeline/entries.ts`, `timeline.tsx`, new `round-card.tsx`: round entries, Recorded pill with time, requisition tag, round card.
- New `src/features/applications/views/notes/` (`sections.ts`, `notes-view.tsx`, `notes-fold.tsx`): readable notes.
- `src/features/resumes/fit/dials.tsx` (export `Ring`, `band`), new `score-dials.tsx`.
- New `src/app/api/v1/applications/[id]/notes/route.ts`; `src/proxy.ts`.
- New `src/features/companies/applications.ts` (loader) and `src/features/companies/views/` (`applications-tab.tsx`, `application-row.tsx`, `row-dialogs.tsx`, `minimal-company.tsx`).
- `src/features/companies/detail.tsx`, `src/app/companies/[slug]/page.tsx`: tabs and minimal page.
- `src/features/applications/navigation.ts`, `src/app/applications/[id]/page.tsx`, `src/app/applications/page.tsx`, `views/application-list.tsx`: links and redirect.
- Deleted: `views/detail.tsx`, `views/application-detail.tsx`, `views/page/header.tsx`, `views/page/rail.tsx`, `src/features/timeline/company-panel.ts`, and the untracked `src/features/interview-notes-gallery/` and `src/app/gallery/` restored for review.

---

### Task 1: Tracker steps from what happened

**Files:**

- Modify: `src/features/applications/named-steps.ts`, `src/features/applications/views/named-steps.tsx`, `src/features/applications/read.ts` (drop `typicalLoop`), `tests/lane-fixtures.ts`
- Test: `tests/application-named-steps.test.ts`, `tests/application-list-render.test.ts`

**Interfaces:**

- Produces: `type NamedStep = { key: string; label: string; detail: string; state: "done" | "current" | "ahead" | "stopped" | "faded"; tone: ...; target: string | null }`. Keys: `"applied"`, `"acknowledged"`, `` `scheduled-${roundId}` ``, `` `round-${roundId}` ``, `"final"`. Targets are DOM ids: `` `entry-${eventId}` ``, `` `mail-${mailId}` ``, `` `round-${roundId}` ``.
- Produces: `namedStepsOf(record: StepSource, now: Date): NamedStep[]` where `StepSource` is the current input minus `typicalLoop`; `currentNamedStep` unchanged.
- Produces: `NamedSteps({ steps, size, add?: ReactNode })`: reached steps with a target render as `<a href="#<target>">`; `add` renders as a step before `"final"`.
- Removes: `EXPECTED_DETAIL`, `ApplicationRecord.typicalLoop`, `typicalLoopByName` use in `read.ts`.

- [ ] **Step 1: Write the failing tests** in `tests/application-named-steps.test.ts` (replace the expected-round tests):

```ts
it("adds Interview scheduled before each round and never predicts", () => {
  const id = uid();
  const r1 = round(id, { kind: "DSA", position: 1, scheduledAt: at("2026-11-16T12:00:00") });
  const steps = namedStepsOf(
    record({
      id,
      status: "TECHNICAL_INTERVIEW",
      phase: "Interviewing",
      events: [
        event(id, "ACKNOWLEDGEMENT_RECEIVED", at("2026-11-04T08:17:00")),
        event(id, "INTERVIEW_SCHEDULED", at("2026-11-11T17:39:00"), { roundId: r1.id }),
      ],
      rounds: [r1],
    }),
    NOW,
  );
  expect(labels(steps)).toEqual([
    "Applied",
    "Acknowledged",
    "Interview scheduled",
    "Round 1 · DSA",
    "Offer / Rejected",
  ]);
  expect(steps[2]).toMatchObject({ state: "done", detail: "11 Nov · for 16 Nov" });
  expect(steps[2].target).toMatch(/^entry-/);
  expect(steps[3]).toMatchObject({ state: "current", target: `round-${r1.id}` });
});
it("shows Applied, then Offer / Rejected, when nothing else happened", () => {
  expect(labels(namedStepsOf(record({ status: "APPLIED" }), NOW))).toEqual([
    "Applied",
    "Offer / Rejected",
  ]);
});
it("names the OA step OA received", () => {
  // kind ONLINE_ASSESSMENT → labels include "OA received" then "Round 1 · OA"
});
it("reads Date not set for a round without a date", () => {
  // scheduledAt null → round step detail === "Date not set"
});
it("keeps one Interview scheduled step after a reschedule", () => {
  // ROUND_RESCHEDULED event plus scheduledAt moved to 18 Nov → one "Interview scheduled", detail ends "for 18 Nov"
});
it("ends at Rejected when a round fails, and at Accepted with a settled offer", () => {
  // FAILED round → final label "Rejected", state "stopped"; closedReason ACCEPTED → final label "Accepted"
});
```

In `tests/application-list-render.test.ts`, change the first test to expect `"Interview scheduled"` and `"Round 1 · DSA"` and **not** `"Round 2 · LLD"`; drop `typicalLoop` from `render`.

- [ ] **Step 2: Run** `npx vitest run tests/application-named-steps.test.ts tests/application-list-render.test.ts`. Expected: FAIL (labels still include expected rounds / "Offer").

- [ ] **Step 3: Implement.** Steps in order: Applied (`sentAt`; target the `APPLICATION_SUBMITTED` or `OUTREACH_SENT` event), Acknowledged only when acknowledgement evidence exists (target the acknowledgement mail as `mail-<id>` from the event's `payload.mailMessageId`, else its event). Per non-cancelled round by `position`: the pre-step (label "OA received" for `ONLINE_ASSESSMENT`, else "Interview scheduled"; time = the `INTERVIEW_SCHEDULED` or `ASSESSMENT_RECEIVED` event whose `payload.roundId` equals the round id, else the round's `createdAt`; detail `` `${formatDay(at)} · for ${formatDay(scheduledAt)}` `` or just the day when no date; always `done`), then the round step (label from `roundLabels`; detail "Booked 20 Nov, 3:00 pm" before the time, "Result due" after, "Date not set" without a date; `PASSED` done, `SCHEDULED` current, `FAILED` stopped). Final step key `"final"`: "Offer / Rejected" (`ahead`) until an outcome; then Offer, Accepted, Declined, Rejected, Withdrew or Closed. Keep the Preparing ("Not sent") and outreach behaviour. When the final step is reached it carries the settled detail ("Accepted · 20 Oct"). `NamedSteps` adds anchors and the `add` slot.

- [ ] **Step 4: Run** the same command, then `npx vitest run` and `npx tsc --noEmit -p .`. Expected: PASS; fix every compile error from removing `typicalLoop` (`read.ts`, fixtures, `views/application-list.tsx`).

- [ ] **Step 5: Commit** `JOB_FINDER-9999: Show only what happened in the application tracker`.

---

### Task 2: Interviewer on rounds

**Files:**

- Create: `drizzle/0022_round_interviewer.sql`; Modify: `drizzle/meta/_journal.json`, `src/db/schema.ts`, `src/features/applications/outcome-input.ts`, `phase.ts` (`OutcomeDetail`, round insert), `outcome-service.ts`, `record-actions.ts` (`updateRound`), `src/features/applications/views/outcome-chips.tsx` (round-scheduled form field), round edit form
- Test: `tests/application-schema.test.ts`, `tests/application-outcomes.integration.test.ts` (or the existing outcome integration file)

**Interfaces:**

- Produces: `applicationRounds.interviewer: text NOT NULL DEFAULT ''`, check `char_length(interviewer) <= 200`.
- Produces: `outcomeDetailsSchema.interviewer?: string` (max 200); `OutcomeDetail.interviewer: string`; transition API `details.interviewer`.
- Produces: `updateRound` form field `interviewer`.

- [ ] **Step 1: Failing tests.** Schema test: `outcomeDetailsSchema.parse({ interviewer: "Mohammad Zabi" })` succeeds and a 201-character value fails. Integration test: `recordOutcome` `scheduled` with `details.interviewer: "Mohammad Zabi"` stores it on the new round; `updateRecordRound` with `interviewer: ""` clears it.
- [ ] **Step 2: Run** `npx vitest run tests/application-schema.test.ts` and `npm run test:db -- <outcome integration file>`. Expected: FAIL (unknown key / missing column).
- [ ] **Step 3: Implement** the migration (`ALTER TABLE application_rounds ADD COLUMN interviewer text NOT NULL DEFAULT ''` plus the check), schema, detail parsing, insert, update, and an "Interviewer (optional)" input in the round-scheduled form and Edit round.
- [ ] **Step 4: Run** both commands plus `npx vitest run`. Expected: PASS.
- [ ] **Step 5: Docs.** Add `interviewer` to the round details table in `docs/api/application-transitions.md` and the job-apply skill reference. **Commit** `JOB_FINDER-9999: Record who interviewed in each round`.

---

### Task 3: Timeline cards for one application

**Files:**

- Modify: `src/features/applications/dates.ts`, `src/features/timeline/entries.ts`, `src/features/timeline/timeline.tsx`
- Create: `src/features/timeline/round-card.tsx`
- Test: `tests/timeline-entries.test.ts` (create if absent), `tests/timeline-render.test.ts`

**Interfaces:**

- Consumes: `roundLabels` (round-label.ts), `RoundQuestions` (interviews), `OutcomeChips`.
- Produces: `noonIfDateOnly(value: Date): Date`, which returns `value + 12h` when its India time is 00:00:00.000, else `value`.
- Produces: `type TimelineRound = { type: "round"; at: string; round: RoundRow; label: string }`; `TimelineEntry = TimelineStep | TimelineMail | TimelineRound`; `TimelineStep.upcoming` removed; the "Coming up" day removed.
- Produces: `type RoundCardData = { recordId: string; questions: InterviewQuestion[]; outcomes: OutcomeId[]; today: string }`.
- Produces: `CompanyTimeline` new props `requisition?: string | null` and `roundCards?: Record<string, RoundCardData>`. Row ids: steps `entry-<eventId>`, mail `mail-<mailId>`, rounds `round-<roundId>`.

- [ ] **Step 1: Failing tests.**

```ts
it("treats only India midnight as a date without a time", () => {
  expect(noonIfDateOnly(new Date("2026-11-03T18:30:00Z")).toISOString()).toBe(
    "2026-11-04T06:30:00.000Z",
  );
  expect(noonIfDateOnly(new Date("2026-11-04T00:00:00Z")).toISOString()).toBe(
    "2026-11-04T00:00:00.000Z",
  );
});
it("places every round as a card, newest first, at its time or creation", () => {
  // one past PASSED round, one future SCHEDULED round, one with scheduledAt null
  // expect type "round" entries at scheduledAt, createdAt for the undated one; no "upcoming" day key
});
it("sorts a date-only step as noon", () => {
  // on 3 Nov: mail 14:32 IST, step at 2026-11-02T18:30Z (India midnight), mail 08:47 IST
  // expect order [14:32 mail, step shown "12:00 pm", 08:47 mail]
});
```

Render test: with `requisition` set, the chips read All, Stages, Mail, and choosing Mail hides step rows; a step row shows `Recorded` once, its time `12:00 pm` under the pill for a date-only event, and the requisition tag `JB0076231`; a round card shows its label, interviewer, question count and result, and opening it (rendered `open`) shows the question titles and the round notes.

- [ ] **Step 2: Run** `npx vitest run tests/timeline-entries.test.ts tests/timeline-render.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** In `timelineEntries`, apply `noonIfDateOnly` to step `occurredAt` and round times; emit a `TimelineRound` per non-cancelled round; drop the upcoming day. In `StepRow`, the tag column holds the pill (one `PenLine` icon, "Recorded") with `clock(at)` beneath, the text column holds the text, and the right column holds the requisition tag. `RoundCard` (client) is a row in the mail-row grid: "Round" pill with time, interviewer (or "Interviewer not recorded"), label with "N questions", and the result pill (Booked, Result due, Cleared, Didn't clear). Its expansion has tabs Questions · N (`RoundQuestions`) and Round notes (Markdown, Edit round), plus `OutcomeChips` limited to `passed`, `failed`, `rescheduled` ∩ `outcomes`. Opening a `#round-<id>` hash opens that card. When `requisition` is passed (a per-application timeline), the role filter chips are replaced by filter chips **All · Stages · Mail** (client state; Stages shows steps and round cards, Mail shows emails).
- [ ] **Step 4: Run** the tests, `npx vitest run`, `npx tsc --noEmit -p .`. Expected: PASS (Mail's timeline still renders; it simply passes no `roundCards`).
- [ ] **Step 5: Commit** `JOB_FINDER-9999: Add round cards and times to the timeline`.

---

### Task 4: Readable notes and the notes API

**Files:**

- Create: `src/features/applications/views/notes/sections.ts`, `notes-view.tsx`, `notes-fold.tsx`, `src/features/resumes/fit/score-dials.tsx`, `src/app/api/v1/applications/[id]/notes/route.ts`
- Modify: `src/features/resumes/fit/dials.tsx` (export `Ring`, `band`), `src/features/applications/record-actions.ts` (use the shared writer), `src/proxy.ts`
- Test: `tests/application-notes-render.test.ts`, `tests/application-notes.integration.test.ts`, `tests/security.test.ts`

**Interfaces:**

- Produces: `parseNoteSections(markdown: string): { summary: string | null; onTheForm: string | null; proof: string | null; rest: string } | null` (null when none of `## Summary`, `## On the form`, `## Proof` is present).
- Produces: `NotesView({ notes, scores }: { notes: string; scores: Record<ToolSource, ToolSummary> | null })`; `NotesFold({ recordId, notes, scores })` (closed line: section names or first line; Edit notes opens `NotesEditor` with `saveApplicationNotes`).
- Produces: `ScoreDials({ tools, href })`: three dials at 88px reusing `Ring`, named by `TOOL_META`, "Master N" plus the change when a base exists; nothing when every tool is `notChecked`.
- Produces: `writeApplicationNotes(id: string, notes: string): Promise<string>` (throws `ApiError(404)` for unknown ids, `ApiError(400)` over `NOTES_MAX`) and `PUT /api/v1/applications/{id}/notes` with body `{ notes }` returning `{ notes }`.

- [ ] **Step 1: Failing tests.** Render: the ServiceNow template note (Summary paragraph, `- [x] Signature`, `- [ ] Relocation at own expense`, Proof with a 64-hex hash and an absolute path) renders the summary paragraph, ✓ and ✕ marks, the hash as `546558fd…ebf21600` with a Copy button and the full value in `title`, and the path as `submitted.jpg`; free Markdown renders unchanged with no section headings; an empty note renders "Nothing yet."; a template note without `## Proof` renders no Proof heading. Integration: `PUT` with valid notes → 200 and the stored notes equal the body; an unknown id → 404; 100 001 characters → 400. Security: the proxy allows `PUT /api/v1/applications/<uuid>/notes` from the LAN without an origin and rejects it with a foreign `Origin`.
- [ ] **Step 2: Run** `npx vitest run tests/application-notes-render.test.ts tests/security.test.ts` and `npm run test:db -- tests/application-notes.integration.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** The proof token rule: inline code of 24+ hex characters, UUID-like, or path-like values is middle-truncated to 8…8 characters (a path shows its last segment), with a Copy button. The summary renders at `text-[15px]` with bold as the emphasised colour. Add `notes` to the proxy regex group: `applications(?:\/[0-9a-f-]{36}\/(?:transitions|questions|notes|rounds\/[0-9a-f-]{36}\/questions))?`. The route body is limited to 1 MiB.
- [ ] **Step 4: Run** the same commands plus `npx vitest run`. Expected: PASS.
- [ ] **Step 5: Docs.** Add the route to `docs/api/automation.md` (Applications table), `docs/api/application-notes.md` (new: body, limits, the template with its three headings and an example), and the job-apply skill: at submit, write notes with `PUT …/notes` using the template. **Commit** `JOB_FINDER-9999: Make application notes readable and writable through the API`.

---

### Task 5: Applications tab on the company page

**Files:**

- Create: `src/features/companies/applications.ts`, `src/features/companies/views/applications-tab.tsx`, `application-row.tsx`, `row-dialogs.tsx`
- Modify: `src/features/companies/detail.tsx`, `src/app/companies/[slug]/page.tsx`
- Delete: `src/features/timeline/company-panel.ts` (its `next`/`status` move into the loader)
- Test: `tests/company-applications.integration.test.ts`, `tests/company-applications-render.test.ts`

**Interfaces:**

- Consumes: `namedStepsOf`, `NamedSteps` (Task 1), `CompanyTimeline` + `RoundCardData` (Task 3), `NotesFold`, `ScoreDials` (Task 4), `readCompanyTimeline`, `listRoundQuestions`, `getFit`, `summarizeTool`, `availableOutcomes` as used by the transitions route, `readCompanySearch`, `readCompanyIndex`.
- Produces: `readCompanyApplications(companyKey: string, query: { open?: string; cursor?: string }, now: Date): Promise<CompanyApplications>` with

```ts
type CompanyApplicationRow = {
  record: ApplicationRecord;
  steps: NamedStep[];
  days: TimelineDay[];
  handling: Record<string, Handling>;
  olderHref: string | null;
  roundCards: Record<string, RoundCardData>;
  scores: Record<ToolSource, ToolSummary> | null;
  outcomes: OutcomeId[];
};
type CompanyApplications = {
  rows: CompanyApplicationRow[];
  unplaced: TimelineDay[];
  unplacedHandling: Record<string, Handling>;
  next: { text: string; due: RailDue | null } | null;
  status: CompanyStatus | null;
  search: Awaited<ReturnType<typeof readCompanySearch>> | null;
};
```

- Produces: `ApplicationsTab({ data, companyKey, companyName, openId, requested, mailIntent, now })`; `detailTabs = ["applications", "pay", "interviews", "about"]`, with `timeline` and `progress` accepted as aliases for `applications`.

- [ ] **Step 1: Failing tests.** Loader (seeded in `jobops_e2e` helpers): two applications at one company → two rows, newest `sentAt` first; each row's `days` holds only its own mail and events; company mail linked to no application is in `unplaced`; `PREVIOUS_JOB` records are excluded; `scores` is null unless the submitted version's fit targets the same `jobId`. Render: a row shows date, requisition (or "No requisition"), role · city and the state pill; `openId` renders that row open with `id="application-<id>"`, the facts (Opening, Applied on, Résumé used, Where it stands), the Notes fold, "Application page" with "not saved", Edit details, the tracker with "+ Add step", the follow-up buttons and the timeline; the header has no "Practise questions" or "View application" button and no "Your applications" aside.
- [ ] **Step 2: Run** `npm run test:db -- tests/company-applications.integration.test.ts` and `npx vitest run tests/company-applications-render.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **Loader:** one `readCompanyTimeline` per application, plus one company read filtered to mail with `item.application === null` for `unplaced`; the cursor applies only to the open row; `olderHref` is `?open=<id>&cursor=<c>#application-<id>`.
  - **Row:** a client accordion; the newest active row is open when there's no `openId`; several rows may be open.
  - **+ Add step:** toggles an inline panel with `OutcomeChips` over `outcomes` minus `followup`, `passed`, `failed` and `rescheduled`, opened automatically when the URL has `outcome` (with `mailIntent` as the source email). A `mail` value without `outcome` instead opens that email's popup over the page (`CompanyTimeline` `openMail`).
  - **Follow-ups:** `FollowUp` plus a "Sent a follow-up" chip beside the facts.
  - **Unsent records:** `PreparingControl` replaces + Add step.
  - **Dialogs** (`row-dialogs.tsx`, both on `Modal`): Edit details (`updateApplicationDetails`: application URL, résumé only while editable, otherwise shown locked) and Résumé preview (`<iframe src="/api/resumes/<versionId>/file">` with a Download link `?download=1`).
  - **Opening by hash:** on mount, `#application-<id>` scrolls to that row and adds a 1.5s highlight ring.
  - **Mail search:** the RulePanel ("How we find X's mail") stays at the bottom of the tab.
- [ ] **Step 4: Run** the same commands, `npx vitest run`, `npx tsc --noEmit -p .`. Expected: PASS.
- [ ] **Step 5: Commit** `JOB_FINDER-9999: Track each application on its company page`.

---

### Task 6: Company page for companies without a record

**Files:**

- Create: `src/features/companies/views/minimal-company.tsx`
- Modify: `src/app/companies/[slug]/page.tsx`
- Test: `tests/company-applications-render.test.ts`, `tests/company-applications.integration.test.ts`

**Interfaces:**

- Produces: `companyPageHref(record: { companyKey: string; companyHref?: string | null }): string`, which returns `companyHref` or `` `/companies/${encodeURIComponent(companyKey)}` ``, in `src/features/applications/navigation.ts`.
- Produces: `MinimalCompanyPage({ name, companyKey, data, openId, requested, mailIntent, now })`.

- [ ] **Step 1: Failing tests.** `companyPageHref({ companyKey: "level ai" })` is `/companies/level%20ai`, and `decodeURIComponent` of the slug matches `"level ai"`; the same holds for `"société générale"`. Rendering `MinimalCompanyPage` shows the banner "Not in your Companies list yet. Ask Claude Code or Codex to add it; pay, interview loop and sources appear then." (no button: companies are created only through the company API), one active "Applications · N" tab, and the research tabs disabled. The page route resolves a slug with no company record but with matching application records to the minimal page, and returns 404 otherwise.
- [ ] **Step 2: Run** the render and integration tests. Expected: FAIL.
- [ ] **Step 3: Implement.** In `page.tsx`, when no company matches the slug, look up records with `companyKey === decodeURIComponent(slug)` (excluding `PREVIOUS_JOB`); if any exist, render the minimal page with `readCompanyApplications(key, …)`.
- [ ] **Step 4: Run** the tests, `npx vitest run`. Expected: PASS.
- [ ] **Step 5: Commit** `JOB_FINDER-9999: Give applications at unlisted companies a page`.

---

### Task 7: One link to every application

**Files:**

- Modify: `src/features/applications/navigation.ts`, `src/app/applications/[id]/page.tsx`, `src/app/applications/page.tsx`, `src/features/applications/views/application-list.tsx`, `src/features/interviews/views/library-table.tsx` (open-in-context link), `src/features/mail/mail-dialog.tsx` / timeline links if they build application URLs
- Delete: `src/features/applications/views/detail.tsx`, `views/application-detail.tsx`, `views/page/header.tsx`, `views/page/rail.tsx` (keep `views/page/notes-editor.tsx`)
- Test: `tests/application-navigation.test.ts`, `tests/application-list-render.test.ts`; delete `tests/application-page-render.test.ts` and `tests/application-expanded-render.test.ts`, and move their still-relevant assertions into the company render test

**Interfaces:**

- Produces: `laneHref(recordId, extra)` now returns `` `/applications/${recordId}` `` with `mail`, `outcome` and `round` query values. Its name stays so call sites don't change.
- Produces: `applicationHref(record, extra: { mail?: string; outcome?: string; round?: string }): string`, which is `` `${companyPageHref(record)}?open=<id>[&mail=…][&outcome=…]#${round ? `round-${round}` : `application-${id}`}` ``.
- `/applications?open=<id>` (old links) redirects to `/applications/<id>`.

- [ ] **Step 1: Failing tests.** `applicationHref` on a researched record → `/companies/servicenow?open=<id>#application-<id>`; with `{ mail, outcome: "heard" }` the query keeps both; with `{ round }` the hash is `#round-<roundId>`. `laneHref("<id>", { outcome: "followup" })` is `/applications/<id>?outcome=followup`. The list render test asserts a row's link is `/applications/<id>` and that no `aria-expanded` row exists.
- [ ] **Step 2: Run** `npx vitest run tests/application-navigation.test.ts tests/application-list-render.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** `/applications/[id]/page.tsx` becomes a redirect only: read the record, then `redirect(applicationHref(record, query))`, or `notFound()`. A `PREVIOUS_JOB` record redirects to its company page without `open`. The Applications page drops the expansion and its story loading. Library rows link "Open in context" with `laneHref(appId, { round })`. Delete the old components and their now-unused imports. Run `rg "application-detail|views/detail|page/header|page/rail|ApplicationExpanded"` and expect no hits.
- [ ] **Step 4: Run** `npx vitest run` and `npx tsc --noEmit -p .`. Expected: PASS.
- [ ] **Step 5: Commit** `JOB_FINDER-9999: Send every application link to its company page`.

---

### Task 8: Browser tests on the new flow

**Files:**

- Create: `tests/e2e/company-applications.spec.ts`
- Modify: `tests/e2e/applications.spec.ts`, `interview-questions.spec.ts`, `mail-dialog.spec.ts`, `mail-triage.spec.ts`, `simple-records.spec.ts`, `workspace.spec.ts`, `mobile.spec.ts` (wherever they open `/applications/<id>` or `/applications?open=`)

- [ ] **Step 1: Write `company-applications.spec.ts`** (seeded data only): (a) `/applications/<id>` lands on `/companies/<slug>?open=<id>#application-<id>` and that row is open and visible; (b) the tracker's round step scrolls to the round card and opens its questions; (c) Notes opens and shows the template sections; Edit details opens a dialog and saves an application URL; Résumé used opens the preview dialog and Esc closes it; (d) + Add step → Got an OA records "OA received" in the tracker and a Recorded card with a time; (e) an application at a company without a record opens on the minimal page with the banner; (f) at 390px there's no horizontal scroll and the facts stack.
- [ ] **Step 2: Run** `npm run test:e2e -- company-applications`. Expected: FAIL before fixes, PASS after any fixes in the owning task's files.
- [ ] **Step 3: Update the existing specs** to the new locations: the phase label is now in the open row's facts (`data-testid="phase-label"` on Where it stands), outcomes sit under + Add step, notes use Edit notes in the Notes fold, and Unlink is in the email popup footer. Keep each spec's intent.
- [ ] **Step 4: Run** the full `npm run test:e2e` in the background and compare failures with base `e08a1ab`: only the 13 failures listed in the previous plan's final ledger may remain, and any other failure is fixed.
- [ ] **Step 5: Commit** `JOB_FINDER-9999: Cover company-page tracking in browser tests`.

---

### Task 9: Docs, cleanup and Docker check

**Files:**

- Modify: `AGENTS.md` (product scope), `README.md` (walkthrough step 7), `docs/diagrams/07-interviews.svg`, `docs/api/interview-questions.md` (open-in-context link), `docs/operator-reference.md`, `.claude/skills/job-apply/SKILL.md` and `references/jobops-api.md`, spec status line
- Delete: untracked `src/features/interview-notes-gallery/`, `src/app/gallery/interview-notes/`

- [ ] **Step 1: Update docs.** Describe the company page as the place to track each application, the tracker rule ("only what happened"), the notes template, `PUT …/notes` and `details.interviewer`. Diagram 07: steps become Company page → Application row → Round card → Question library.
- [ ] **Step 2: Remove the restored gallery files** after checking that `git status --short` lists them as untracked only.
- [ ] **Step 3: Run** `npx vitest run`, `npx tsc --noEmit -p .`, `npm run lint`. Expected: green; lint warnings only in untouched résumé-scoring files.
- [ ] **Step 4: Docker check.** `docker compose up -d --build app`, then open `/companies/servicenow`, `/applications/1cb0e12d-7b71-4c31-9521-0ca747ee65cf` (expect a redirect into the open row), `/companies/doordash` (minimal page), at 1280 and 390px. Confirm the tracker has no Expected steps and the Round 1 · DSA card opens its three questions.
- [ ] **Step 5: Commit** `JOB_FINDER-9999: Document company-page tracking`.

---

### Task 10: Rewrite existing notes (data, with a checkpoint)

No code. Runs against the Docker app through `PUT /api/v1/applications/{id}/notes`.

- [ ] **Step 1:** Export every application's current notes to `jobops/data/notes-backup/2026-11-16.json` (ignored) with ids.
- [ ] **Step 2:** Rewrite the ServiceNow JB0076231 and DoorDash P-111609 notes into `## Summary`, `## On the form` and `## Proof`, keeping every fact. Save both and **stop for the user's review** in the browser.
- [ ] **Step 3:** After approval, rewrite the rest the same way; read each back and compare facts against the backup (every number, hash, date and path present).
- [ ] **Step 4:** Report counts, plus any note left unchanged because it was empty or already free-form by intent. Keep the backup until the user confirms.
