# Company Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the company page's header, application rows, open-application body, mail-rules
panel and new-mail handling into the layout chosen in the 2026-11-17 gallery, without losing any
existing control.

**Architecture:** Presentation rework over the existing readers and server actions. Three small
logic additions (URL-free previews, a requisition/role-title match, a `handled` mail filter) and
one reader change (new-mail tray, handled-only fold, last activity) feed new components under
`src/features/companies/views/`. Round outcome buttons move from the round card to a current-step
box.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind 4 (container queries), Drizzle/Postgres,
zod 4, lucide-react, Vitest, Playwright.

**Spec:** `jobops/docs/superpowers/specs/2026-11-17-company-page-redesign-design.md`
(visual reference, not committed: `.superpowers/brainstorm/56589-1794879888/content/company-page.html`)

## Global Constraints

- Work in `jobops/`. Branch `company-page-redesign`. Never merge or push. Never commit `jobops/data/`.
- Commits: `JOB_FINDER-9999: <summary>` (no conventional prefixes), footer
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- No new dependencies. lucide-react icons. System font. Tokens from `src/styles/theme.css`
  (Tailwind names: `bg-card`, `bg-rail`, `bg-selected`, `text-warning`, `bg-warning-soft`,
  `bg-review`, `text-success`, `bg-danger-soft`, `text-destructive`, `border-border`, `rounded-card`).
- Must work in dark and light themes, and at 375 px wide with no horizontal page scroll.
- Menus: a `<button aria-expanded aria-controls>`; Escape and outside click close; focus returns
  to the trigger. Dialogs reuse the existing dialog pattern (`ResumePreview` in
  `src/features/companies/views/row-dialogs.tsx`, `MailDialog`).
- Every control in the spec's "Control inventory" survives (it may move).
- Unit/render tests: `npx vitest run <file> > /tmp/…log 2>&1` (redirect long output to a file).
  Single e2e spec: `npm run test:e2e -- tests/e2e/<spec>.ts` (uses `jobops_e2e`, never personal
  data). Do not run the full e2e suite except in Task 9.
- Before each commit: `npm run typecheck` and `npm run lint` clean for touched files.

## Review Focus

1. A listed company with **no applications** and an **unlisted company** (minimal page): header
   stats read "0", "No activity yet", "Nothing due"; tray says "need a look"; no crash.
2. **Long values at 375 px** (role titles, requisitions, subjects, next-step text): truncate with a
   `title`, never widen the page.
3. An email whose text is **only links or empty**: `previewLine` returns `""` and the tray line
   falls back to the sender.
4. A **requisition that is a prefix/substring** of another number (`1060` vs `10604005`) or of a
   URL path: only whole-token matches count.
5. A **future booked round** must not become "Last activity"; a round whose date has passed with
   no result shows the current-step box with outcome buttons exactly once on the page.

Each line has a test in the task that owns the code (Tasks 1, 2, 3, 5, 8).

---

### Task 1: Clean previews, role match, handled filter

**Files:**
- Modify: `src/features/mail/row-text.ts` (`previewLine`)
- Create: `src/features/timeline/role-match.ts`
- Modify: `src/features/timeline/suggest.ts` (`Handling.applications[].requisition`)
- Modify: `src/features/timeline/read.ts` (`TimelineRole.requisition`, `timelineRole`)
- Modify: `src/features/mail/mail-list.ts` (attention `"handled"`)
- Test: `tests/mail-row-text.test.ts`, `tests/timeline-role-match.test.ts` (new),
  `tests/timeline-suggest.test.ts`, `tests/mail-list.integration.test.ts`

**Interfaces:**
- Produces: `previewLine(text: string): string` — URLs removed.
- Produces: `matchingRoles(item: { subject: string; text: string }, applications: { id: string; role: string; requisition: string | null }[]): Set<string>` (application ids).
- Produces: `Handling["applications"][number]` = `{ id; role; requisition: string | null; outcomes }`.
- Produces: `listMail` query `attention: "open" | "handled" | "all"`; `"handled"` = `attentionState = 'DONE'`.

- [ ] **Step 1: Write failing tests**

`tests/mail-row-text.test.ts`:
```ts
it("drops links from the preview line", () => {
  expect(previewLine("[Amazon.jobs]<https://g3s6.r.us-west-2.awstrack.me/L0/x>\nThanks for applying for Sr SDE"))
    .toBe("Thanks for applying for Sr SDE");
  expect(previewLine("See https://a.example/x?y=1 for details")).toBe("See for details");
  expect(previewLine("[Open portal]<https://p.example>")).toBe("Open portal");
  expect(previewLine("https://only.example/link\n<https://another.example>")).toBe("");
  expect(previewLine("")).toBe("");
});
```
`tests/timeline-role-match.test.ts`:
```ts
const apps = [
  { id: "a", role: "Software Dev Engineer II, 3P Pricing", requisition: "10600856" },
  { id: "b", role: "Software Development Engineer, CS ARIA", requisition: "10604005" },
  { id: "c", role: "Sr Software Engineer", requisition: null },
];
it("matches a requisition as a whole token", () => {
  expect(matchingRoles({ subject: "Keep track of your application (10604005)", text: "" }, apps)).toEqual(new Set(["b"]));
});
it("ignores a requisition inside a longer number or URL path", () => {
  expect(matchingRoles({ subject: "", text: "ref 1106008567 https://x.example/10600856abc" }, apps)).toEqual(new Set());
});
it("falls back to the exact role title, case and space insensitive", () => {
  expect(matchingRoles({ subject: "", text: "your application for  software development engineer, cs aria" }, apps)).toEqual(new Set(["b"]));
});
it("does not match a role title that is only part of a longer title", () => {
  expect(matchingRoles({ subject: "", text: "Sr Software Engineer II" }, apps)).toEqual(new Set());
});
it("returns every match", () => {
  expect(matchingRoles({ subject: "10600856 and 10604005", text: "" }, apps)).toEqual(new Set(["a", "b"]));
});
```
`tests/timeline-suggest.test.ts`: assert `suggestHandling(item, roles).applications[0].requisition` carries the role's requisition.
`tests/mail-list.integration.test.ts`: with one DONE and one open message for a company, `attention: "handled"` returns only the DONE one; `"open"` only the other.

- [ ] **Step 2: Run them, confirm they fail.**
- [ ] **Step 3: Implement.** `previewLine`: before picking the line, replace `\[([^\]]*)\]<https?:[^>]*>` with `$1`, then remove `<https?:[^>]*>` and bare `https?://\S+`, then collapse spaces; skip lines left empty. `matchingRoles`: requisition token = `(?<![\w/])REQ(?![\w])` on `subject + "\n" + text` (escape the requisition); role fallback per app: lowercase and collapse whitespace in both; match the title when it is preceded by start or a non-alphanumeric char, followed by end or a non-alphanumeric char, and not followed by a level suffix `\s+(i{1,3}|iv|v|\d+)\b` (so "Sr Software Engineer" does not match "Sr Software Engineer II"). Add `requisition` to `TimelineRole` from `record.requisition`, and through `suggestHandling`. `listMail`: extend the zod enum and add `eq(mailMessages.attentionState, "DONE")` for `"handled"`.
- [ ] **Step 4: Run the four test files, confirm PASS; run `tests/timeline-render.test.ts` and `tests/company-applications-render.test.ts` to catch fallout.**
- [ ] **Step 5: Commit** `JOB_FINDER-9999: Drop links from mail previews and match emails to roles`

---

### Task 2: Company reader — new-mail tray, handled fold, last activity

**Files:**
- Modify: `src/features/companies/applications.ts`
- Create: `src/features/companies/last-activity.ts`
- Test: `tests/company-last-activity.test.ts` (new), `tests/company-applications.integration.test.ts`

**Interfaces:**
- Consumes: Task 1 `listMail` `attention: "handled" | "open"`, `Handling.applications[].requisition`.
- Produces on `CompanyApplications`:
  - `newMail: { days: TimelineDay[]; handling: Record<string, Handling>; more: boolean }` — open unplaced mail, first 50 newest first; `more` when a next page exists (Ruling: the spec's "and N more" becomes "More new mail on the Mail page" — no count query).
  - `unplaced` / `unplacedHandling` / `unplacedOlderHref` — now **handled** unplaced mail only (same cursor param `unplacedCursor`).
  - `lastActivity: { at: string; kind: "Recorded" | "Round" | "Email" } | null`.
- Produces: `lastActivityOf(days: TimelineDay[][], now: Date): CompanyApplications["lastActivity"]` in `last-activity.ts`.

- [ ] **Step 1: Write failing tests.** `tests/company-last-activity.test.ts`: newest past entry wins across several day lists; a round with `at` in the future is skipped (Review Focus 5); step → "Recorded", round → "Round", mail → "Email"; empty → `null`. Integration test: a company with one open and one handled unplaced email returns the open one only in `newMail.days` and the handled one only in `unplaced`; `lastActivity` reflects the newest past entry including unplaced mail.
- [ ] **Step 2: Run, confirm FAIL.**
- [ ] **Step 3: Implement.** Two `listMail` calls with `isNull(linkedApplicationId)`: `{ company, attention: "open", limit: 50 }` (use the reader's existing page size option; if none, take the first page and set `more` from `nextCursor`) and `{ company, attention: "handled", cursor }`. Build both through `timelineEntries` + `markSavedOpenings` as today; handling via `handlingOf(..., own.map(timelineRole))`. `lastActivity = lastActivityOf([...rows.map(r => r.days), newMail.days, unplaced], now)`. Update the minimal page's reader path too (it calls the same function).
- [ ] **Step 4: Run both test files and `tests/company-applications-render.test.ts`; PASS.**
- [ ] **Step 5: Commit** `JOB_FINDER-9999: Read new and handled company mail separately`

---

### Task 3: Header — title plus stat strip

**Files:**
- Create: `src/features/companies/views/company-header.tsx` (server component)
- Create: `src/features/companies/views/header-menu.tsx` (client: ⋯ menu + previous-job dialog)
- Modify: `src/features/companies/detail.tsx` (replace `DetailHeader` usage; delete `DetailHeader`)
- Modify: `src/features/companies/views/minimal-company.tsx`
- Test: `tests/company-applications-render.test.ts`, `tests/e2e/companies.spec.ts`, `tests/e2e/company-applications.spec.ts`

**Interfaces:**
- Consumes: Task 2 `CompanyApplications.lastActivity`, `next`, `status`, `rows`.
- Produces: `CompanyHeader(props: { name: string; companyKey: string; focus?: string | null; cities: string[]; workModes: string[]; careersUrl?: string | null; stage: PipelineStage | null; data: CompanyApplications; action: { label: string; href: string } })`.
- Produces: `HeaderMenu(props: { careersUrl?: string | null; company: { key: string; name: string } })` — items "Open careers site" (external, only with `careersUrl`), "Add previous job" (dialog with `PreviousJobForm`), "Mail search settings" (`<Link href="?tab=applications#mail-search">`).

- [ ] **Step 1: Write failing render tests**: exactly one status pill for a company whose status and stage are both Interviewing; the meta line reads `"Enterprise workflows & AI · Bengaluru, Hyderabad"`; stat cells labelled Status, Applications ("2", "1 active · 1 closed"), Last activity, Next (contains `next.text` and `due.label`, warning tone when `due.tone === "late"`); with no rows: "0", "No activity yet", "Nothing due" (Review Focus 1); "Open careers" is not a top-level link (it is in the menu); the "Add previous job" disclosure is gone from the header.
- [ ] **Step 2: Run, FAIL.**
- [ ] **Step 3: Implement** per spec §1 and the gallery's header C. Stat strip: `grid grid-cols-2 @2xl:grid-cols-4` inside an `@container`; each value truncates with `title`. Status cell: `StatusPill` when `status && status.tone !== "none"`, else `StageChip`; `PreviousBadge` beneath when `status?.previous`. "Last activity" shows `formatDay(at)` and the kind. Update e2e specs that clicked "Add previous job" / "Open careers" to open the ⋯ menu first.
- [ ] **Step 4: Run render test and the two e2e specs; PASS.**
- [ ] **Step 5: Commit** `JOB_FINDER-9999: Redesign the company header as a title and stat strip`

---

### Task 4: Closed application rows — cards with a progress bar

**Files:**
- Modify: `src/features/companies/views/application-row.tsx` (`ApplicationRow` header)
- Create: `src/features/companies/views/step-progress.tsx`
- Modify: `src/features/companies/views/applications-tab.tsx` (props passed to `ApplicationRow`)
- Test: `tests/company-applications-render.test.ts`, `tests/e2e/company-applications.spec.ts`

**Interfaces:**
- Consumes: `NamedStep` (`state: "done" | "current" | "ahead" | "stopped" | "faded"`, `tone`).
- Produces: `ApplicationRow` props become `{ id; role: string; meta: string /* "Applied 4 Nov 2026 · No requisition · Hyderabad" */; steps: NamedStep[]; pill: string; detail: string; tone: NamedStep["tone"]; newCount: number; defaultOpen; children }`.
- Produces: `StepProgress({ steps }: { steps: NamedStep[] })` — one segment per step, `aria-label="<n> of <total> steps"` where n = done + current.

- [ ] **Step 1: Write failing render tests**: the row button's accessible text starts with the role; meta line text as above; `StepProgress` has one segment per step and the label "4 of 5 steps" for the ServiceNow-like fixture; the rail class follows tone (`interviewing` → `bg-review`); `newCount` 2 renders "2 new"; 0 renders nothing; long role is truncated with a `title` (Review Focus 2).
- [ ] **Step 2: Run, FAIL.**
- [ ] **Step 3: Implement** per spec §2 / gallery rows A. Keep the hash-open, scroll, ring, `aria-expanded/controls` and closed-row-renders-nothing behaviour unchanged. `newCount` = open mail entries in `row.days`.
- [ ] **Step 4: Run render test and `company-applications.spec.ts`; PASS.**
- [ ] **Step 5: Commit** `JOB_FINDER-9999: Show application rows as role-first cards with progress`

---

### Task 5: Open application — current-step box and moved round outcomes

**Files:**
- Create: `src/features/companies/views/row-body.tsx` (move `RowBody`, `Facts`-replacement layout shell out of `applications-tab.tsx`)
- Create: `src/features/companies/views/current-step.tsx`
- Modify: `src/features/timeline/round-card.tsx` (remove `OutcomeChips`)
- Modify: `src/features/companies/views/applications-tab.tsx`
- Test: `tests/company-applications-render.test.ts`, `tests/timeline-render.test.ts`, `tests/e2e/company-timeline.spec.ts`, `tests/e2e/company-applications.spec.ts`

**Interfaces:**
- Produces: `RowBody` (same props as today) rendering a two-column shell: `<div className="@container"><div className="grid gap-6 @3xl:grid-cols-[minmax(0,1fr)_290px]"><main/><aside data-testid="row-aside"/></div></div>`. Task 6 fills the aside and the composer slot.
- Produces: `CurrentStep(props: { record: ApplicationRecord; booked?: RoundRow; outcomes: OutcomeId[]; today: string; returnTo?: string; editable: boolean; notApplyingClosed: boolean; now: Date })` — renders nothing when there is nothing to act on.

- [ ] **Step 1: Write failing tests.** Render: for a record with a SCHEDULED round dated in the past and no result, the row shows "Round 1 · DSA was on 16 Nov" and buttons Passed / Not selected / Rescheduled **once** on the page (`getAllByRole("button", { name: "Passed" })` length 1 — Review Focus 5); the round card in the timeline no longer renders outcome buttons but keeps Edit round, Questions and Notes; a future round reads "is on"; a Preparing record shows "Not sent yet" with Record sent and Not applying; an outreach Preparing record also shows "Open outreach prompt" and "Record a direct application"; a closed-not-applying record shows Reopen. E2E: update `company-timeline.spec.ts` assertions that recorded a round result from the round card to use the current-step box.
- [ ] **Step 2: Run, FAIL.**
- [ ] **Step 3: Implement.** `CurrentStep` uses `OutcomeChips` with `outcomes={row.outcomes.filter(id => ["passed","failed","rescheduled"].includes(id))}` and `booked` for the round case; `PreparingControl`, the `notApplying` / `reopenRecord` forms and the outreach links move inside it. Main column order: CurrentStep, Tracker (+ From this email), "Recorded from an email · Undo" notice, then the existing timeline (Task 6 restyles below it). Keep every control from today's `RowBody`.
- [ ] **Step 4: Run the render tests and both e2e specs; PASS.**
- [ ] **Step 5: Commit** `JOB_FINDER-9999: Lead an open application with its current step`

---

### Task 6: Open application — details aside, note composer, timeline polish

**Files:**
- Create: `src/features/companies/views/details-aside.tsx`
- Create: `src/features/companies/views/note-composer.tsx` (client)
- Modify: `src/features/applications/views/notes/notes-fold.tsx` (dialog presentation option)
- Modify: `src/features/companies/views/row-body.tsx`
- Modify: `src/features/timeline/timeline.tsx` (segmented filter, New dot)
- Test: `tests/company-applications-render.test.ts`, `tests/timeline-render.test.ts`, `tests/e2e/company-applications.spec.ts`, `tests/e2e/workspace.spec.ts`

**Interfaces:**
- Consumes: Task 5 `RowBody` shell.
- Produces: `DetailsAside(props: { row: CompanyApplicationRow; versions: { id: string; label: string }[]; editable: boolean })`.
- Produces: `NoteComposer({ recordId }: { recordId: string })` — `addApplicationNote`, input name `summary`, `maxLength={20000}`, Enter submits, Shift+Enter inserts a newline (auto-growing textarea, 1 row by default), placeholder "Add a note to this application's history…".
- Produces: `NotesFold` gains `variant?: "fold" | "dialog"`; `"dialog"` renders a card with the section names and an "Open notes" button opening the existing view/edit content in a dialog.

- [ ] **Step 1: Write failing tests.** Render: aside contains Opening link (requisition text, `target="_blank"`), "Applied" with date and method, the Follow-up control, Application page link or "Add link" (opens Edit details), the résumé file chip and the three score values when `scores` is set; aside has no score tiles when `scores` is null; the composer is a single-row textbox named "Add a note to this application's history…"; the old "Add to history" label is gone; the timeline filter is a group named "Filter timeline" with pressed state; an open mail entry carries a "New" marker (`aria-label="New"`), a handled one does not. E2E `workspace.spec.ts`: add a note via the composer with Enter and see it in the timeline; open notes via the dialog and save an edit.
- [ ] **Step 2: Run, FAIL.**
- [ ] **Step 3: Implement** per spec §3 / gallery open A. Below `@3xl` the aside stacks above the activity. Follow-up chip (`OutcomeChips` with `followup`) sits on the right of the activity toolbar. Keep `EditDetails`, `ResumePreview`, `FollowUp` as they are; restyle only their containers.
- [ ] **Step 4: Run render tests and both e2e specs; PASS.**
- [ ] **Step 5: Commit** `JOB_FINDER-9999: Move application facts to a sidebar and shrink note entry`

---

### Task 7: Mail-search rules — one summary line

**Files:**
- Modify: `src/features/mail/search/rule-panel.tsx`
- Test: `tests/company-search-render.test.ts`, `tests/e2e/company-applications.spec.ts` (or the spec that drives the rule panel today)

**Interfaces:**
- Produces: `RulePanel` renders collapsed by default as a summary line with id `mail-search`; `Edit` toggles the full editor (`aria-expanded`); `Search now` expands the editor and invokes the same search function as the editor's own Search button; the editor opens itself when `location.hash === "#mail-search"` on mount and on `hashchange`.

- [ ] **Step 1: Write failing tests.** Render: collapsed shows "Mail search", the last-run sentence, domain/keyword/address tags and "3 inboxes", and buttons Edit and Search now; editor fields are not rendered until Edit; after Edit the full editor (Addresses, Domains, Names and keywords, Never include, Inboxes, Time frame, exact search disclosure) is present. E2E: Search now starts a search (existing assertions on results move under it); the ⋯ menu "Mail search settings" lands with the editor open.
- [ ] **Step 2: Run, FAIL.**
- [ ] **Step 3: Implement** per spec §4 / gallery rules A; no search logic leaves `RulePanel`.
- [ ] **Step 4: Run tests; PASS.**
- [ ] **Step 5: Commit** `JOB_FINDER-9999: Fold the mail-search rules into one summary line`

---

### Task 8: New-mail tray, handled fold and tab layout

**Files:**
- Create: `src/features/companies/views/new-mail-tray.tsx` (client)
- Modify: `src/features/timeline/handling.tsx` (`HandlingBar` prop `linkWhenNoOutcome?: { returnTo: string }`)
- Modify: `src/features/mail/workspace-actions.ts` (`markAllJustInfoAction`)
- Modify: `src/features/companies/views/applications-tab.tsx` (order and spacing; fold)
- Test: `tests/company-applications-render.test.ts`, `tests/timeline-render.test.ts`, `tests/e2e/company-applications.spec.ts`, `tests/e2e/mail-triage.spec.ts`

**Interfaces:**
- Consumes: Task 1 `matchingRoles`, Task 2 `newMail`, `unplaced` (handled only).
- Produces: `NewMailTray(props: { companyKey: string; newMail: CompanyApplications["newMail"]; openMail: string | null; inboxes?: string[]; placeOptions?: PlaceOptions })`.
- Produces: `markAllJustInfoAction(state: ActionState, form: FormData): Promise<ActionState>` — `ids` (repeated uuid fields, max 50), calls `handleMail(id, { justInfo: true })` for each, returns `{ success: "Marked <n> emails as just info." }`.
- Produces: `HandlingBar` with `linkWhenNoOutcome`: when a role is chosen and no outcome is suggested for it, the primary button is "Link to this application" submitting `linkMailOnly` (`mailId`, `recordId`, `returnTo`); Just info stays beside it.

- [ ] **Step 1: Write failing tests.** Render (tray): heading "3 new emails need a role" with two or more open applications, "need a look" otherwise (Review Focus 1); one line per email with subject, tag chip, `aria-label="New"` marker; matched role shown as "Role in the email: <role>"; unmatched line shows the sender and the cleaned preview, and only the sender when the preview is empty (Review Focus 3); "Choose role" menu lists matched applications first with a "match" badge, then "Just info, no application" and "Place at a date…"; picking a role records nothing and shows the chosen role with the handling bar; for an acknowledgement email the primary button reads "Link to this application"; for an interview email it reads "Record interview scheduled" and opens the fields form; `more` renders a link to `/mail?company=<key>`. Layout: order is notice, tray, rows, "Other company mail · N" (closed `<details>`), rules line; no tray when `newMail.days` is empty; the fold opens when `openMail` is one of its emails. E2E: in `company-applications.spec.ts` seed two open unplaced emails and assert the tray, pick a role, link it, and see it move into that row with a "1 new"/New marker gone after handling; Mark all just info empties the tray and the emails appear in the fold with Undo; the vertical gap between the last row and the next block is ≥ 32 px (`boundingBox`).
- [ ] **Step 2: Run, FAIL.**
- [ ] **Step 3: Implement** per spec §5 / gallery new mail A. The subject opens `MailDialog` (controlled open when `openMail` matches). Wrap blocks in `flex flex-col gap-8` so no block can butt against another; remove any negative margin the rule panel carried.
- [ ] **Step 4: Run render tests and both e2e specs; PASS.**
- [ ] **Step 5: Commit** `JOB_FINDER-9999: Add a new-mail tray and fold handled company mail`

---

### Task 9: Docs, full verification, Docker check

**Files:**
- Modify: docs the documentation-maintenance rule in `AGENTS.md` points at for the company page (e.g. `README.md`, `docs/operator-reference.md`, `.claude/skills/job-apply/references/*.md` if they describe the company page or round outcomes on the round card)

- [ ] **Step 1:** `grep -rn "Add to history\|How we find\|Open careers\|Which role\|round card" README.md docs .claude AGENTS.md` (from the repo root) and update stale descriptions.
- [ ] **Step 2:** `npm run typecheck && npm run lint && npm test > /tmp/unit.log 2>&1`; all pass.
- [ ] **Step 3:** Full e2e once, in the background: `npm run test:e2e > /tmp/e2e.log 2>&1`. Compare failures with the baseline list in the ledger; any new failure is fixed (or ruled on) before finishing.
- [ ] **Step 4:** Docker: from the repo root `docker compose up -d --build app`; check http://127.0.0.1:3210/companies/servicenow and /companies/amazon at desktop and 375 px in dark and light (Review Focus 2); record what was checked.
- [ ] **Step 5: Commit** `JOB_FINDER-9999: Update docs for the redesigned company page`
