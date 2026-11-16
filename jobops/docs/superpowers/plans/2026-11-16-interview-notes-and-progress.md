# Interview notes, named rounds and mail reader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track each application as named interview rounds, record every interview question with the user's answer in Markdown, browse them in a cross-company library, and read every email in a focused popup.

**Architecture:** A new `interview_questions` table under `application_rounds`, with a service module and LAN-trusted `/api/v1` routes. A pure `namedStepsOf()` derives Applied → Acknowledged → named rounds → expected rounds → Offer. It drives a new stepper on Applications rows and on the rebuilt two-column application page. One native `<dialog>` mail reader replaces inline mail expansion everywhere.

**Tech Stack:** Next.js 16 App Router, React 19, Drizzle/PostgreSQL, zod, Tailwind 4 container queries, CodeMirror 6 + react-markdown (already added by the gallery), Vitest, Playwright.

**Spec:** `jobops/docs/superpowers/specs/2026-11-16-interview-notes-and-progress-design.md`

All paths below are relative to `jobops/`. Run commands from `jobops/`.

## Global Constraints

- Docker-only runtime: verify UI with `docker compose up -d --build app` from the repo root and http://127.0.0.1:3210. No host dev servers.
- Integration tests run only through `npm run test:db <files>` (marked `jobops_e2e` database).
- Theme tokens only (`bg-card`, `text-muted-foreground`, `bg-selected`, `text-warning` …), light and dark; no palette literals.
- Markdown rendering escapes HTML (no `rehype-raw`); mail bodies render as text, never HTML.
- Inner scroll areas never use `overscroll-contain` except inside dialogs; every truncating row uses `min-w-0` plus a full-text `title`.
- Reduced motion respected (`motion-reduce:transition-none`); collapsed content is `inert`.
- Expected rounds are labelled "Expected · from company research", never shown before the first recorded round, never counted as reached.
- Requisition comes only from `jobs.external_id`; when missing show "No requisition saved". Never derive one from a filename.
- Copy: "Solved in code", "Solved, finished aloud", "Partly solved", "Got stuck"; "Managerial round", "HR round", "Behavioural round", "Round N · DSA".
- Commits: `JOB_FINDER-9999: <summary>` with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; no conventional prefixes. Review docs per AGENTS.md before each commit.
- The working tree already contains the gallery: `src/components/markdown/markdown-editor.tsx`, `src/components/markdown/markdown-view.tsx`, the `.md-view` block in `src/app/globals.css`, CodeMirror/react-markdown dependencies, and `src/features/interview-notes-gallery/*`. Task 1 commits them first.

## Review Focus

1. **Very long question content** (200-line answers, wide code, 30-column tables) must scroll inside code or table blocks, never widen the page. Test in Task 7: render a question body with a 400-character code line inside a 360px container and assert the `pre` has `overflow-x: auto` and the row keeps `min-w-0`.
2. **A round booked in the future vs past** must read "Booked 20 Nov, 3:00 pm" vs "Result due". Test in Task 4 with `now` on each side of `scheduledAt`.
3. **A company with no research** shows no expected steps, and a research loop shorter than the recorded rounds adds none. Test in Task 4.
4. **Closing the mail dialog** (Esc, scrim, close button) returns focus to the row that opened it, and the page behind does not scroll. Playwright test in Task 6.
5. **Unsaved question edits**: Cancel or navigating away with changes asks first; saving twice quickly does not create two questions. Tests in Task 8 (component: Cancel prompts when dirty; action: create uses one transaction and returns the id the editor then reuses).

---

### Task 1: Commit the gallery, shared UI pieces, schema and migration

**Files:**
- Create: `src/components/ui/expand.tsx`, `src/components/ui/middle-truncate.tsx`, `src/lib/use-edge-fade.ts` (moved from `src/features/interview-notes-gallery/shared.tsx`; the gallery imports them from here)
- Modify: `src/lib/round-kinds.ts`, `src/db/schema.ts`, `src/features/companies/metrics.ts` (add `HR` label)
- Create: `drizzle/0021_interview_questions.sql`; Modify: `drizzle/meta/_journal.json` (idx 21, tag `0021_interview_questions`)
- Test: `tests/application-schema.test.ts`

**Interfaces:**
- Produces: `roundKinds` now ends `[..., "HIRING_MANAGER", "DOMAIN", "OTHER", "HR"]` (append; existing values keep order). `questionOutcomes = ["SOLVED_CODE","SOLVED_ALOUD","PARTIAL","STUCK"] as const`, `questionOutcomeEnum`, and table `interviewQuestions` exported from `src/db/schema.ts`, with columns exactly as in the spec's Data table (camelCase in Drizzle: `roundId, position, title, patterns (strings), prompt, answer, outcome, timeComplexity, spaceComplexity, interviewer, review, reviewSource, reviewedAt, createdAt, updatedAt`).
- Produces: `Expand({ open, id?, children })`, `ExpandButton({ open, onClick, controls, label })`, `MiddleTruncate({ text, tail?, className? })`, `useEdgeFade<T>(axis: "x" | "y"): { ref, style, update }`, with the same behaviour as the gallery versions.

- [ ] **Step 1: Commit the gallery as it stands** (`git add` package files, `src/components/markdown`, the `globals.css` change, `src/features/interview-notes-gallery`, `src/app/gallery/interview-notes`; message `JOB_FINDER-9999: Add the interview notes and application progress gallery`).
- [ ] **Step 2: Write failing schema tests** in `tests/application-schema.test.ts`:

```ts
it("adds HR as the last round kind and the question outcome enum", () => {
  expect(roundKinds.at(-1)).toBe("HR");
  expect(questionOutcomeEnum.enumValues).toEqual(["SOLVED_CODE", "SOLVED_ALOUD", "PARTIAL", "STUCK"]);
});
it("keeps interview questions under their round", () => {
  const config = getTableConfig(interviewQuestions);
  expect(config.foreignKeys[0].reference().foreignTable).toBe(applicationRounds);
  expect(config.foreignKeys[0].onDelete).toBe("cascade");
  expect(config.columns.map((c) => c.name)).toContain("review_source");
});
```

- [ ] **Step 3: Run** `npx vitest run tests/application-schema.test.ts`. Expected: FAIL (`questionOutcomeEnum` not exported).
- [ ] **Step 4: Implement** the enum, table and `HR` kind. Write `0021_interview_questions.sql` by hand in the style of `0020`:
  - `ALTER TYPE "round_kind" ADD VALUE 'HR';`
  - `CREATE TYPE "question_outcome" ...`
  - `CREATE TABLE "interview_questions"` with `CHECK (position >= 1)`, `CHECK (char_length(title) between 1 and 200)`, the 100 000-character checks on the text columns, and `CHECK (review = '' OR review_source IS NOT NULL)`
  - indexes `interview_questions_round_idx (round_id, position)` and `interview_questions_updated_idx (updated_at)`

  Move the three shared helpers out of the gallery and re-import them there.
- [ ] **Step 5: Run** `npx vitest run tests/application-schema.test.ts && npm run typecheck`. Expected: PASS (fix any `Record<RoundKind, …>` maps the typecheck flags by adding `HR`, labelled "HR", family "People").
- [ ] **Step 6: Run** `npm run test:db tests/application-story.integration.test.ts`. Expected: PASS; this proves the migration applies.
- [ ] **Step 7: Commit** `JOB_FINDER-9999: Store interview questions and the HR round kind`.

### Task 2: Question service and validation

**Files:**
- Create: `src/features/interviews/questions.ts` (zod + service), `src/features/interviews/types.ts`
- Test: `tests/interview-questions.test.ts`, `tests/interview-questions.integration.test.ts`

**Interfaces:**
- Consumes: `interviewQuestions`, `applicationRounds`, `applications`, `jobs` from Task 1.
- Produces (in `types.ts`):

```ts
export type QuestionOutcome = "solved_code" | "solved_aloud" | "partial" | "stuck";
export type InterviewQuestion = {
  id: string; roundId: string; position: number; title: string; patterns: string[];
  prompt: string; answer: string; outcome: QuestionOutcome | null;
  time: string; space: string; interviewer: string;
  review: string; reviewSource: string | null; reviewedAt: string | null; updatedAt: string;
};
export type RoundWithQuestions = { id: string; position: number; kind: RoundKind; name: string;
  scheduledAt: string | null; outcome: string; questions: InterviewQuestion[] };
export type LibraryRow = InterviewQuestion & { applicationId: string; company: string;
  role: string; roundLabel: string; date: string | null };
```

- Produces (in `questions.ts`):
  - `questionInput` (zod; `title` 1–200 trimmed; `patterns` ≤ 8 trimmed, non-empty, de-duplicated case-insensitively; text fields ≤ 100 000; `review` requires `reviewSource`)
  - `questionPatch = questionInput.partial()`
  - `listRoundQuestions(applicationId): Promise<RoundWithQuestions[]>`
  - `addQuestions(applicationId, roundId, inputs: unknown[]): Promise<string[]>`
  - `updateQuestion(id, patch: unknown): Promise<InterviewQuestion>`
  - `deleteQuestion(id): Promise<void>`
  - `readLibrary({ q?, company?, pattern?, outcome?, limit?, cursor? }): Promise<{ rows: LibraryRow[]; nextCursor: string | null }>`

  Errors are thrown as `ApiError` from `@/features/agent-api/http`: `404` unknown application, round or question; `409` when a round belongs to a different application; `400` with zod issues. `roundLabel` uses `roundLabel()` from Task 4. Until Task 4 lands, put `roundLabel` in `src/features/applications/round-label.ts` here and have Task 4 import it.

- [ ] **Step 1: Write failing unit tests** (`tests/interview-questions.test.ts`):
  - `questionInput` trims `"  Sliding window "` and drops duplicate `"sliding window"`
  - it rejects a 201-character title and nine patterns
  - it rejects `review: "x"` without `reviewSource`
  - `roundLabel("DSA", 1)` is `"Round 1 · DSA"`, `roundLabel("HIRING_MANAGER", 0)` is `"Managerial round"`, `roundLabel("HR", 0)` is `"HR round"`, `roundLabel("BEHAVIORAL", 0)` is `"Behavioural round"`
- [ ] **Step 2: Run** `npx vitest run tests/interview-questions.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** the validators and `roundLabel(kind: RoundKind, technicalIndex: number): string` (technical kinds = ONLINE_ASSESSMENT, DSA, LLD, HLD, DOMAIN, OTHER, labelled via `roundKindLabel`).
- [ ] **Step 4: Run** the unit tests. Expected: PASS.
- [ ] **Step 5: Write failing integration tests** (`tests/interview-questions.integration.test.ts`; seed an application with two rounds the way `application-story.integration.test.ts` does):
  - `addQuestions` with two inputs returns two ids at positions 1 and 2
  - a later add gets position 3
  - `addQuestions` for a round of another application throws status 409
  - `updateQuestion` with `{ review: "r", reviewSource: "Claude Code" }` sets `reviewedAt`
  - `readLibrary({ q: "window" })` finds the question by title; `{ pattern: "Hash map" }` filters
  - rows are newest round date first
  - deleting the round removes its questions (cascade)
- [ ] **Step 6: Run** `npm run test:db tests/interview-questions.integration.test.ts`. Expected: FAIL.
- [ ] **Step 7: Implement** the service. Appends run in one transaction, taking `coalesce(max(position),0)+1` under `SELECT … FOR UPDATE` on the round row. The library joins question → round → application → job, and its cursor is the base64 of `(roundDate, id)`.
- [ ] **Step 8: Run** both test files. Expected: PASS.
- [ ] **Step 9: Commit** `JOB_FINDER-9999: Add the interview question service`.

### Task 3: Agent API routes and contract

**Files:**
- Create: `src/app/api/v1/applications/[id]/questions/route.ts` (GET), `src/app/api/v1/applications/[id]/rounds/[roundId]/questions/route.ts` (POST), `src/app/api/v1/questions/route.ts` (GET), `src/app/api/v1/questions/[id]/route.ts` (PATCH)
- Modify: `src/proxy.ts` (agentApi regex), `docs/api/automation.md` (new "Interview questions" table), Create `docs/api/interview-questions.md` (payloads, status codes, examples)
- Test: `tests/security.test.ts`, `tests/interview-questions.integration.test.ts`

**Interfaces:**
- Consumes: Task 2 service functions.
- Produces:
  - POST body `{ questions: QuestionInput[] }` (1–20) → `201 { ids: string[] }`
  - PATCH → `200 { question: InterviewQuestion }`
  - GET application → `{ rounds: RoundWithQuestions[] }`
  - GET library → `{ rows, nextCursor }`

  Routes follow `transitions/route.ts` (`readJson`, `apiResponse`, `apiError`, `revalidatePath` for `/applications`, `/applications/${id}`, `/applications/questions`).

- [ ] **Step 1: Write failing security tests:** LAN requests without Origin to `/api/v1/applications/${id}/questions`, `/api/v1/applications/${id}/rounds/${id}/questions`, `/api/v1/questions` and `/api/v1/questions/${id}` pass the proxy. `/api/v1/questions/not-an-id/extra` and `/api/v1/applications/${id}/rounds/x/questions` do not.
- [ ] **Step 2: Run** `npx vitest run tests/security.test.ts`. Expected: FAIL.
- [ ] **Step 3: Extend the regex** with `applications/[0-9a-f-]{36}/(?:questions|rounds/[0-9a-f-]{36}/questions)` and `questions(?:/[0-9a-f-]{36})?`, and update the comment above it.
- [ ] **Step 4: Add route-level integration tests:**
  - POST then GET round-trips a question
  - PATCH with an unknown id returns 404
  - POST with an empty `questions` array returns 400
- [ ] **Step 5: Implement** the four routes.
- [ ] **Step 6: Run** `npx vitest run tests/security.test.ts && npm run test:db tests/interview-questions.integration.test.ts`. Expected: PASS.
- [ ] **Step 7: Write the contract doc and automation guide table.** Outcome values are lowercase. Deletion is UI-only. Reviews must be labelled with their source and are diagnostics, not the user's answer.
- [ ] **Step 8: Commit** `JOB_FINDER-9999: Expose interview questions to local agents`.

### Task 4: Named steps model

**Files:**
- Create: `src/features/applications/named-steps.ts`
- Modify: `src/features/applications/read.ts`: add `typicalLoop: RoundKind[]` (from `companyMetrics(...).typicalLoop`, built like `typicalRoundsByName`), `requisition: string | null` (`job.externalId`), `resume: { id; filename; label } | null` (`label` = `resumeVersions.versionLabel`). Modify `tests/lane-fixtures.ts`: default `typicalLoop: []`.
- Test: `tests/application-named-steps.test.ts`

**Interfaces:**
- Consumes: `roundLabel` (Task 2), `ApplicationRecord`, `journeyOf` (for Applied/Acknowledged evidence and close semantics).
- Produces:

```ts
export type NamedStep = {
  key: string; label: string; detail: string;
  state: "done" | "current" | "expected" | "ahead" | "stopped" | "faded";
  tone: "applied" | "interviewing" | "offer" | "bad" | "muted";
  due?: boolean;
};
export function namedStepsOf(record: NamedStepSource, now: Date): NamedStep[];
export function currentNamedStep(steps: NamedStep[]): NamedStep;
```

`NamedStepSource` = `JourneySource & Pick<ApplicationRecord, "typicalLoop">`. Outreach records return `journeyOf` steps mapped 1:1 (`reached` → `done`, `ahead` stays `ahead`).

- [ ] **Step 1: Write failing tests** (dates via `at()`; `now = NOW`):
  - acknowledged, no rounds, loop `["DSA","LLD"]` → labels `["Applied","Acknowledged","Offer"]`, with Acknowledged `current`
  - one `SCHEDULED` DSA round at `2026-10-01T12:00` with loop `["DSA","LLD","HLD","HIRING_MANAGER"]` → `["Applied","Acknowledged","Round 1 · DSA","Round 2 · LLD","Round 3 · HLD","Managerial round","Offer"]`; the DSA step is `current` with `due: true` and detail starting "Result due"; the last three before Offer are `expected` with detail "Expected · from company research"
  - the same round on `2026-10-20T15:00` → detail `"Booked 20 Oct, 3:00 pm"`, no `due`
  - DSA `PASSED` then HR `SCHEDULED` → `"Round 1 · DSA"` done, `"HR round"` current
  - a `CANCELLED` round is skipped
  - a `FAILED` round with `closedReason: "REJECTED"` → that step is `stopped`, tone `bad`, label "Rejected", and later steps `faded`
  - empty `typicalLoop` with one round → no expected steps
  - a loop of length 1 with two recorded rounds → no expected steps
  - an outreach record keeps Sent / Replied / Referred
- [ ] **Step 2: Run** `npx vitest run tests/application-named-steps.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Expected rounds = `typicalLoop.slice(recordedNonCancelled.length)`, numbered by continuing the technical count. Booked/due detail uses `formatDayTime` from `../dates`.
- [ ] **Step 4: Run** the new test plus `tests/application-journey.test.ts tests/application-read.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** `JOB_FINDER-9999: Name each interview round in an application's progress`.

### Task 5: Named stepper on Applications rows

**Files:**
- Create: `src/features/applications/views/named-steps.tsx`
- Modify: `src/app/applications/page.tsx` (compute `namedStepsOf(record, now)` instead of `journeyOf` for applications), `src/features/applications/views/application-list.tsx` (line ~149), `src/features/applications/views/application-detail.tsx` (line ~133; also make "From this email: …" a `MailDialogButton` from Task 6. Until Task 6 lands, a plain button)
- Test: `tests/application-list-render.test.ts`

**Interfaces:**
- Consumes: `NamedStep`, `namedStepsOf` (Task 4); `useEdgeFade` (Task 1).
- Produces: `NamedSteps({ steps, size }: { steps: NamedStep[]; size: "row" | "page" })`. This is gallery stage A: an `<ol aria-label="Where this application stands">` with `aria-current="step"` on the current item. It scrolls sideways with an edge fade and centres the current step by setting `scrollLeft` once per record. Dots: done = filled primary with a check, current = ring (warning when `due`), expected = dashed outline, ahead = solid outline, stopped = red X. Row size hides detail lines. Outreach rows keep `JourneyTrack`.

- [ ] **Step 1: Write a failing render test:** rendering a list row for an interviewing record with one booked round contains `Round 1 · DSA` and `aria-current="step"`, and does not contain the text `Interviewing` inside the stepper.
- [ ] **Step 2: Run** `npx vitest run tests/application-list-render.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `NamedSteps` and wire it into the list and the in-row expansion.
- [ ] **Step 4: Run** `npx vitest run tests/application-list-render.test.ts tests/application-expanded-render.test.ts`. Expected: PASS (update snapshot-free assertions that expected "Interviewing" in rows).
- [ ] **Step 5: Rebuild Docker and check** `/applications` at 1024px and 390px: the ServiceNow row shows the named steps, the requisition stays visible, and nothing overflows.
- [ ] **Step 6: Commit** `JOB_FINDER-9999: Show named rounds on Applications rows`.

### Task 6: Mail reader dialog

**Files:**
- Create: `src/components/ui/modal.tsx`, `src/features/mail/mail-dialog.tsx`, `src/features/mail/read-actions.ts`
- Modify: `src/features/timeline/timeline.tsx` (MailRow + its list), `src/features/timeline/mail-view.tsx` (deep link), `src/features/applications/views/application-detail.tsx`
- Test: `tests/mail-dialog-render.test.ts`, `tests/e2e/mail-dialog.spec.ts`

**Interfaces:**
- Produces:
  - `Modal({ open, onClose, label, children, size? })`, a wrapper over native `<dialog>` with `showModal()`. It closes on Esc and on a scrim click (click target is the dialog element), locks body scroll while open, returns focus to the element focused before opening, and fills the screen below 640px.
  - `MailDialog({ item, onClose, onPrev?, onNext?, footer })` renders header (subject, sender name + address, inbox via `SourceChip`, date, `TagPill` + `EditTag`), body (`item.text` with `whitespace-pre-wrap`, URLs linked by `linkify(text): ReactNode[]` with `target="_blank" rel="noreferrer"`), and footer.
  - `readMailForDialog(id: string): Promise<MailItem>` is a server action that builds a `MailItem` via `toMailItem` with the same lookup the timeline uses, throwing for unknown ids.
  - `MailDialogButton({ mailId, children, className, footer? })` loads on click, with a skeleton while pending.
- Behaviour:
  - MailRow loses `open` state and the inline expansion. The row button opens the dialog with `entry.item`.
  - The footer is `HandlingBar` when the mail needs attention, else `HandledLine`.
  - The list owns `openIndex`, so prev and next walk the rendered entries.
  - `startOpen` (from `?mail=`) sets `openIndex` on mount.
  - The `bar` under collapsed rows stays (the one-click suggested action) and is unchanged.

- [ ] **Step 1: Write a failing render test:** `linkify("See https://a.test/x.")` yields one anchor with href `https://a.test/x` and the trailing period outside it. `MailDialog` with `text: "<b>hi</b>"` renders the literal text, not a `b` element.
- [ ] **Step 2: Run** `npx vitest run tests/mail-dialog-render.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `Modal`, `linkify`, `MailDialog` and `readMailForDialog`.
- [ ] **Step 4: Run** the render test. Expected: PASS.
- [ ] **Step 5: Wire** MailRow, the deep link, and the Applications in-row "From this email" button.
- [ ] **Step 6: Write the Playwright test** `tests/e2e/mail-dialog.spec.ts`, seeding mail the way `inbox-ui.spec.ts` does:
  - clicking a row opens `role=dialog` with the body text
  - Esc closes it and the row button is focused again
  - `window.scrollY` is unchanged
  - Next shows the following subject
  - visiting `/mail?...&mail=<id>` opens it directly
  - no `[aria-expanded]` remains on mail rows
- [ ] **Step 7: Run** `npm run test:e2e -- tests/e2e/mail-dialog.spec.ts tests/e2e/inbox-ui.spec.ts tests/e2e/company-timeline.spec.ts`. Expected: PASS (update older specs that clicked to expand a row so they assert the dialog instead).
- [ ] **Step 8: Commit** `JOB_FINDER-9999: Read every email in a focused popup`.

### Task 7: Application page, two columns with facts header

**Files:**
- Create: `src/features/applications/views/page/header.tsx`, `src/features/applications/views/page/rail.tsx`, `src/features/applications/views/page/notes-editor.tsx`
- Modify: `src/features/applications/views/detail.tsx` (compose; keep `PreparingControl`, `OutcomeChips`, `FollowUp`, the `RoundRow` edit form, history add-note and Edit details), `src/app/applications/[id]/page.tsx` (load `siblings` = records with the same `companyKey`, and `listRoundQuestions(id)`), `src/features/applications/record-actions.ts` (add `saveApplicationNotes(_s, form)`: `id`, `notes` ≤ 100 000; revalidates the page)
- Test: `tests/application-page-render.test.ts`

**Interfaces:**
- Consumes: `NamedSteps` (Task 5), `MailDialogButton` (Task 6), `RoundWithQuestions` (Task 2), `MarkdownEditor`/`MarkdownView`, `MiddleTruncate`, `Expand`.
- Produces:
  - `ApplicationHeader({ record, siblings, steps })`, gallery header B. The switcher is a `nav` of links to `/applications/<id>`, labelled with requisition (or "No requisition saved") and phase, shown when `siblings.length > 1`. Four facts: Opening, Applied, Résumé sent (`label` with `line-clamp-2` + middle-truncated filename linking `/resumes?file=<id>`), and Where it stands.
  - `ApplicationRail({ record, linked, versions, history, editable })` renders Résumé sent, Mail (one-line rows → `MailDialogButton`, footer = the existing Unlink form), History + Add to history, Linked records, and Edit details (folded).
  - `NotesEditor({ recordId, notes })` shows `MarkdownView` with an Edit button. Edit opens the side-by-side editor (gallery editor A, stacked below 768px) with Save (⌘S) and Cancel (confirm when dirty).
  - Layout: `@container` grid, `@[52rem]:grid-cols-[minmax(0,1fr)_300px]`. The rail is `@[52rem]:sticky @[52rem]:top-4 @[52rem]:max-h-[calc(100vh-2rem)] overflow-y-auto`.
  - Round notes render through `MarkdownView`.

- [ ] **Step 1: Write failing render tests:**
  - with `requisition: null` the header shows "No requisition saved"
  - with two siblings it renders two switcher links, the current one `aria-current="page"`
  - the Résumé sent fact contains `label` and links `/resumes?file=`
  - a round note `"**bold**"` renders a `strong`
  - a 400-character code line inside a question renders within `pre` (Review Focus 1)
- [ ] **Step 2: Run** `npx vitest run tests/application-page-render.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the header, rail, notes editor and the composed page. Remove `PhaseBar`/`RoundLadder` usage from this page only.
- [ ] **Step 4: Run** the render test plus `tests/application-outcome-actions.test.ts`. Expected: PASS.
- [ ] **Step 5: Rebuild Docker and check** `/applications/1cb0e12d-7b71-4c31-9521-0ca747ee65cf` at 1280, 1024 and 390px:
  - two columns at 1024 and up, with the rail pinned
  - the switcher reaches the 28 Oct application
  - mail opens the popup
  - the page scrolls past inner areas
- [ ] **Step 6: Commit** `JOB_FINDER-9999: Rebuild the application page around rounds, résumé and mail`.

### Task 8: Questions in rounds, with editor

**Files:**
- Create: `src/features/interviews/views/round-questions.tsx`, `src/features/interviews/views/question-body.tsx`, `src/features/interviews/views/question-editor.tsx`, `src/features/interviews/actions.ts`
- Modify: `src/features/applications/views/detail.tsx` (render `RoundQuestions` under each round)
- Test: `tests/interview-question-editor.test.ts`, `tests/interview-questions.integration.test.ts`

**Interfaces:**
- Consumes: Task 2 service, `MarkdownEditor`/`MarkdownView`, `Expand`/`ExpandButton`.
- Produces:
  - `saveQuestion(_s, form)`: no `id` → `addQuestions` and return `{ success, id }`; with `id` → `updateQuestion`. `review` and `reviewSource` are ignored from forms.
  - `removeQuestion(_s, form)`.
  - `RoundQuestions({ applicationId, round })`, gallery questions A: heading "Round N · DSA · <date> · Result due" with Expand all / Collapse all; a row per question (title, patterns, `HowItWentBadge`, T/S); the expanded body; Add a question.
  - `QuestionEditor({ applicationId, roundId, question? , onDone })`:
    - fields: title, how-it-went segmented control, Time and Space inputs, pattern chips with an Add field
    - a section switcher (What they asked / How I answered / Interviewer) over one side-by-side editor
    - Save (⌘S), Cancel, and Delete (for existing questions, with a confirm)
    - after the first save it keeps the returned `id`, so later saves update
    - `beforeunload` guards while dirty
  - `QuestionBody({ q })` shows What they asked, How I answered, Interviewer, and "Review by <reviewSource>" in the tinted block.
  - `HowItWentBadge({ value, short? }: { value: QuestionOutcome; short?: boolean })` and `outcomeMeta: Record<QuestionOutcome, { label; short; tone; dot }>`, exported from `question-body.tsx` (moved from the gallery's `shared.tsx`, keys renamed to the API values).

- [ ] **Step 1: Write failing tests:**
  - `saveQuestion` without `id` creates one row and returns its id; a second call with that id updates rather than inserts (Review Focus 5)
  - a form `review` field is ignored
  - the editor's `isDirty(initial, draft)` helper is false for identical drafts and true after a title change
  - Cancel when dirty calls `confirm`
- [ ] **Step 2: Run** `npx vitest run tests/interview-question-editor.test.ts && npm run test:db tests/interview-questions.integration.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the actions, `QuestionBody`, `RoundQuestions` and `QuestionEditor`.
- [ ] **Step 4: Run** the same commands. Expected: PASS.
- [ ] **Step 5: Rebuild Docker and check:**
  - add, edit and delete a question on an e2e-seeded application
  - Expand all works
  - code blocks highlight
  - phone width stacks the editor
- [ ] **Step 6: Commit** `JOB_FINDER-9999: Record interview questions and answers on each round`.

### Task 9: Question library

**Files:**
- Create: `src/app/applications/questions/page.tsx`, `src/features/interviews/views/library-table.tsx`
- Modify: `src/app/applications/page.tsx` (header button "Question library"), `src/features/interviews/views/round-questions.tsx` (heading link "All questions")
- Test: `tests/interview-library-render.test.ts`

**Interfaces:**
- Consumes: `readLibrary` (Task 2), `Modal` (Task 6), `QuestionBody` and `HowItWentBadge` (Task 8), `useEdgeFade`.
- Produces: `LibraryTable({ rows }: { rows: LibraryRow[] })`, gallery library B:
  - search box and chips for how it went and pattern (client-side filtering over the loaded rows; the page loads up to 500)
  - sortable Question, Company, Date headers with `aria-sort`; default Date descending
  - `min-w-[720px]` table in an x-scroll with edge fade and a sticky header
  - a row button opens a right-side `Modal` sheet with `QuestionBody`, Open application (`/applications/<id>#round-<roundId>`) and Edit (the same link)
  - empty state "Questions you record after interviews appear here."

- [ ] **Step 1: Write failing render tests:**
  - with no rows the empty-state copy shows
  - with rows from two companies, both appear newest first
  - the Company header has `aria-sort="none"` and Date has `aria-sort="descending"`
- [ ] **Step 2: Run** `npx vitest run tests/interview-library-render.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the page and the table.
- [ ] **Step 4: Run** the test. Expected: PASS.
- [ ] **Step 5: Rebuild Docker and check** `/applications/questions` at 1024 and 390px: sort, search, open the sheet, Esc closes it.
- [ ] **Step 6: Commit** `JOB_FINDER-9999: Add the question library`.

### Task 10: Retire the gallery, update docs, record ServiceNow round 1

**Files:**
- Delete: `src/app/gallery/interview-notes/`, `src/features/interview-notes-gallery/`
- Modify: `AGENTS.md` (product scope note with the picks, spec path and API routes), root `README.md` (walkthrough: named rounds, questions, library, mail popup, with screenshots retaken from Docker), `.claude/skills/job-apply/references/jobops-api.md` (recording interview questions after a round), `docs/api/automation.md` (if not done in Task 3)

- [ ] **Step 1: Delete the gallery** and run `npm run lint && npm run typecheck && npm test`. Expected: all pass, no imports of the gallery remain.
- [ ] **Step 2: Update the docs.** Check every link and button name against the running app.
- [ ] **Step 3: Commit** `JOB_FINDER-9999: Retire the interview notes gallery and document the feature`.
- [ ] **Step 4: Record the ServiceNow round 1 questions** through `POST /api/v1/applications/1cb0e12d-7b71-4c31-9521-0ca747ee65cf/rounds/<round 1 id>/questions`:
  - the three questions from `data/uploads/gallery-fixtures/interview-notes.json`, with the user's answers as written
  - outcomes `solved_code`, `solved_aloud`, `solved_aloud`
  - reviews with `reviewSource: "Claude Code"`

  Read back with GET and confirm the three rows on the page.
- [ ] **Step 5: Look up the interviewing opening's requisition** on its live posting (`https://careers.servicenow.com/jobs/744000159096479/sr-software-engineer`). If the posting states it, report it to the user and set it through the jobs editor. Otherwise leave "No requisition saved".
