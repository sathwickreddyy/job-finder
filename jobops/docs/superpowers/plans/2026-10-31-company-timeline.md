# Company Timeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the stopgap `/mail` with a company rail and a shared day-ledger timeline, and put the same timeline on the company page beside roles, pay and the interview loop.

**Architecture:** A new `src/features/timeline` module holds pure assembly (`entries.ts`, `index-rows.ts`, `suggest.ts`, `query.ts`), one server reader (`read.ts`) built on the existing Applications pipeline (`readApplications` → `readMailTriage` → `buildQueue` → `buildLanes`) and `listMail`, and client components (`timeline.tsx`, `handling.tsx`, `mail-view.tsx`). `/mail` and `/companies/[slug]` render those components. Writes reuse `handleMail` and `updateMail`.

**Tech Stack:** Next.js 16 App Router, React 19, Drizzle 0.45 on PostgreSQL, zod 4, vitest, Playwright, Tailwind 4 tokens.

**Spec:** `docs/superpowers/specs/2026-10-31-company-timeline-design.md`

## Global Constraints

- Normal use is Docker-only (`docker compose up -d --build`). No host dev servers; Playwright's port 3211 server is allowed.
- Database and browser tests use only the marked `jobops_e2e` database (`npm run test:db`, `npm run test:e2e`). Never point them at personal data.
- Excluded mail is never shown or counted: every mail read goes through `notExcluded`.
- Email bodies are plain text (`MailItem.text`). HTML is never rendered.
- Dates group and display in Asia/Kolkata.
- Colours come from theme tokens only (`--tag-*`, `bg-selected`, `text-link`). No palette literals in components.
- Copy is sentence case, with no all-caps labels.
- Commits are `JOB_FINDER-9999: <summary>` ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push.

## Review Focus

1. **Company name versus alias.** An application filed under a company's alias and mail keyed to its canonical name must produce one rail row and one timeline. Pinned in Task 2 (`merges alias and canonical keys into one row`).
2. **Linked mail without a company key.** An email linked to an application but with a null `company_key` must still appear on that company's timeline and count in its row. Pinned in Tasks 1 and 2 (`includes linked mail without a company key`).
3. **Late-evening India time.** An email received at 23:30 IST belongs to that India day, not the UTC day. Pinned in Task 1 (`groups by India date at 23:30 IST`).
4. **A second outcome on the same email.** When two tabs both record, the second must show the 409 message in the handling bar, not crash. Pinned in Task 3 (`returns the refusal when the email was already handled`).
5. **Long or empty email fields.** An empty sender name, a 300-character subject or a long body must not widen the page at 375 px. Pinned in Task 8 (`long and empty fields keep the phone layout`).

---

### Task 1: Timeline entries and the company timeline reader

**Files:**

- Create: `src/features/timeline/entries.ts`, `src/features/timeline/read.ts`
- Modify: `src/features/mail/mail-list.ts` (export the filter builder)
- Test: `tests/timeline-entries.test.ts`, `tests/company-timeline.integration.test.ts`

**Interfaces:**

- Produces:
  - `type TimelineStep = { type: "step"; id: string; at: string; applicationId: string; eventType: string; text: string; upcoming: boolean }`
  - `type TimelineMail = { type: "mail"; at: string; item: MailItem; recorded: string | null }`
  - `type TimelineEntry = TimelineStep | TimelineMail`
  - `type TimelineDay = { key: string; label: string; entries: TimelineEntry[] }`, where `label` is "Coming up", "Today", "Yesterday" or "Fri 30 Oct"
  - `timelineEntries(input: { mail: MailItem[]; events: EventRow[]; rounds: RoundRow[]; complete: boolean; filtered: boolean; now: Date }): TimelineDay[]`, where `EventRow` is `typeof applicationEvents.$inferSelect` and `RoundRow` is `typeof applicationRounds.$inferSelect`
  - `readCompanyTimeline(key: string, filters: { tag?: MailTag; q?: string; application?: string; cursor?: string }, now?: Date): Promise<{ company: { key: string; name: string; slug: string | null; city: string }; roles: { id: string; role: string; source: string; phase: Phase }[]; days: TimelineDay[]; nextCursor: string | null }>`
  - `mailScope(query: z.output<typeof mailListSchema>, context: MailContext): SQL[]` in `mail-list.ts`. `listMail` uses it.

- [ ] **Step 1: Write the failing unit tests** in `tests/timeline-entries.test.ts`:
  - `drops mail-driven events and annotates the email`: events `MAIL_LINKED`, `ACKNOWLEDGEMENT_RECEIVED`, and `INTERVIEW_SCHEDULED` with `payload.mailMessageId` equal to a mail on the page. Expect no steps for them, and the mail's `recorded` to equal that event's summary.
  - `keeps steps from other mail and plain events`: an `APPLICATION_SUBMITTED` event becomes a step whose `text` is its summary.
  - `orders newest first with Coming up above Today`: a round with `outcome: "SCHEDULED"` and `scheduledAt` tomorrow sits in day `"Coming up"` with `upcoming: true`; the first non-upcoming day is `"Today"`.
  - `groups by India date at 23:30 IST`: mail at `2026-10-30T18:00:00Z` with `now` `2026-10-31T10:00:00+05:30` sits in `"Yesterday"`.
  - `hides steps older than the oldest loaded email until complete`: `complete: false` drops a step older than the oldest mail; `complete: true` keeps it.
  - `hides steps while filtered`: `filtered: true` returns mail entries only.
- [ ] **Step 2: Run them.** Run `npx vitest run tests/timeline-entries.test.ts`. Expected: FAIL, "Cannot find module '@/features/timeline/entries'".
- [ ] **Step 3: Implement `timelineEntries`** in `entries.ts`.
  - Mail-driven event types are `MAIL_LINKED`, `MAIL_UNLINKED` and `ACKNOWLEDGEMENT_RECEIVED`.
  - India day keys and labels come from the existing helpers in `src/features/applications/dates.ts` (`indiaDate`, `istDayStart`).
  - A scheduled round in the future becomes an `upcoming` step with text `"<kind label> round"`, or `"OA closes"` for `ONLINE_ASSESSMENT`.
- [ ] **Step 4: Run them.** Expected: PASS, 6/6.
- [ ] **Step 5: Write the failing integration test** in `tests/company-timeline.integration.test.ts`. It uses the `mail-handle.integration.test.ts` fixture pattern: a company record, a job and an application under the company's name, application events, and mail rows with a fixture prefix and cleanup.
  - `reads one company's mail and steps newest first`.
  - `includes linked mail without a company key`: mail with `companyKey: null` and `linkedApplicationId` set.
  - `never returns excluded mail`: a `mail_tracking` row with `disposition: "excluded"` hides its message.
  - `filters by tag and role`: `{ tag: "offer" }` returns only offer mail and no steps; `{ application: id }` returns only that application's mail and steps.
- [ ] **Step 6: Run it.** Run `npm run test:db -- tests/company-timeline.integration.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 7: Implement `mailScope` and `readCompanyTimeline`.**
  - Move `listMail`'s scope building into `mailScope` unchanged.
  - `readCompanyTimeline` calls `listMail({ company: key, attention: "all", ...filters })`. It takes events and rounds from `readApplications()` records whose `companyKey === key` (limited to `filters.application` when set), and the company from `loadMailContext().companies` or `companyRecords`.
  - `complete` is `nextCursor === null`; `filtered` is `Boolean(tag || q)`.
- [ ] **Step 8: Run it.** Expected: PASS, 4/4. Also run `npm test` (unit) and `npm run test:db -- tests/mail-list.integration.test.ts`; expected PASS (the `listMail` refactor is behaviour-neutral).
- [ ] **Step 9: Commit** as `JOB_FINDER-9999: Assemble one company timeline from mail and application steps`.

### Task 2: The company index (rail rows)

**Files:**

- Create: `src/features/timeline/index-rows.ts`
- Modify: `src/features/timeline/read.ts`, `src/features/mail/mail-list.ts`
- Test: `tests/timeline-index.test.ts`, extend `tests/company-timeline.integration.test.ts`

**Interfaces:**

- Consumes: `buildLanes`, `Lane`, `LaneNext` from `applications/lanes.ts`; `mailScope` from Task 1.
- Produces:
  - `type RailGroup = "needs" | "waiting" | "closed"`
  - `type RailRow = { key: string; name: string; slug: string | null; group: RailGroup; signal: string; due: { label: string; tone: "now" | "late" | "calm" } | null; newCount: number; matches: number | null; latestAt: string | null }`
  - `type MailFacts = { key: string | null; open: number; latestAt: string; latestOpenKind: string | null }`
  - `companyRows(input: { lanes: Lane[]; mail: MailFacts[]; names: Map<string, { name: string; slug: string | null }>; matches: Map<string, number> | null }): { rows: RailRow[]; home: { open: number; total: number } }`
  - `readCompanyIndex(filters: { tag?: MailTag; q?: string }, now?: Date): Promise<{ rows: RailRow[]; home: { open: number; total: number; matches: number | null } }>`
  - `mailFacts(context: MailContext, keyOf: (applicationId: string) => string | undefined, filters: { tag?: MailTag; q?: string }): Promise<{ facts: MailFacts[]; matches: Map<string | null, number> | null }>` in `mail-list.ts`.

- [ ] **Step 1: Write the failing unit tests** in `tests/timeline-index.test.ts`. Lanes come from `tests/lane-fixtures.ts`.
  - `maps lane groups`: lane `needs` → `needs`, `active` → `waiting`, `closed` → `closed`.
  - `open mail forces Needs you`: an `active` lane with `MailFacts.open: 1` → `needs`, `newCount: 1`, `signal` is the open kind ("Interview").
  - `adds mail-only companies`: facts for a key with no lane → `needs` when open, else `closed`, ordered after lane rows by `latestAt`.
  - `counts Needs a home`: facts with `key: null` give `home.open` and `home.total`.
  - `narrows to matches`: with `matches` set, rows without a match are dropped and kept rows carry `matches`.
  - `due tone`: lane next `due: "today"` → `now`, `"overdue"` → `late`, `"week"` → `calm`; `label` is `next.when`.
- [ ] **Step 2: Run them.** Run `npx vitest run tests/timeline-index.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement `companyRows`** (lanes keep their own order).
- [ ] **Step 4: Run them.** Expected: PASS, 6/6.
- [ ] **Step 5: Extend the integration test** with:
  - `merges alias and canonical keys into one row`: the application's job company is an alias of the company record, and the mail's `company_key` is the canonical key. Expect exactly one row for it.
  - `counts linked mail without a company key`.
  - `narrows the index by tag and search`.
- [ ] **Step 6: Run it.** Expected: FAIL on the new cases.
- [ ] **Step 7: Implement `mailFacts` and `readCompanyIndex`.**
  - `mailFacts` reads non-excluded mail. A row's key is `company_key`, or else the key of its linked application via `keyOf`.
  - With a tag or search, `matches` counts the rows that also satisfy `mailScope` (same conditions as `listMail`).
  - `readCompanyIndex` runs the Applications pipeline exactly as `src/app/applications/page.tsx` does, then `companyRows`.
- [ ] **Step 8: Run it.** Expected: PASS. Run `npm test`; expected PASS.
- [ ] **Step 9: Commit** as `JOB_FINDER-9999: Build the Mail rail from the Applications lanes and mail facts`.

### Task 3: Suggestion, recording details and Just info undo

**Files:**

- Create: `src/features/timeline/suggest.ts`
- Modify:
  - `src/features/mail/handle-service.ts` (`updateSchema` gains `attention: z.literal("open")`; `updateMail` reopens)
  - `src/features/mail/workspace-actions.ts` (`handleMailAction` passes details; new `reopenMailAction`)
- Test: `tests/timeline-suggest.test.ts`, extend `tests/mail-handle.integration.test.ts`, extend `tests/mail-handle-api.test.ts`

**Interfaces:**

- Consumes: `suggestedOutcome` (`mail/triage.ts`), `availableOutcomes`, `recordStateFrom`, `outcomeMeta`, `outcomeDetail` (`applications/phase.ts`).
- Produces:
  - `type Handling = { applications: { id: string; role: string; outcomes: OutcomeId[] }[]; chosen: string | null; suggested: OutcomeId | "info"; reason: string }`
  - `suggestHandling(item: MailItem, roles: { id: string; role: string; state: RecordState }[]): Handling`
  - `reopenMailAction(previous: ActionState, form: FormData): Promise<ActionState>`
  - `updateMail(id, { attention: "open" })`

- [ ] **Step 1: Write the failing unit tests** in `tests/timeline-suggest.test.ts`:
  - `suggests the classification's outcome when allowed`: `INTERVIEW` mail with one Applied direct role gives `suggested: "scheduled"` and `reason: "Suggested for an interview email."`.
  - `falls back to Just info when not allowed`: `OFFER` mail on an Applied (not Interviewing) role whose outcomes exclude `offer` gives `suggested: "info"`.
  - `uses the linked application first`: `item.application.id` set means `chosen` is that id.
  - `asks which role with several open`: two open roles and no link give `chosen: null` and `applications.length === 2`.
  - `offers only Just info without an application`: no roles gives `applications: []` and `suggested: "info"`.
- [ ] **Step 2: Run them.** Expected: FAIL, module not found.
- [ ] **Step 3: Implement `suggestHandling`.**
  - Closed roles are excluded.
  - `reason` is `"Suggested for <kind, lower case> email."` when an outcome is suggested, else `"Nothing to record from this email."`.
- [ ] **Step 4: Run them.** Expected: PASS, 5/5.
- [ ] **Step 5: Extend the failing integration tests** in `tests/mail-handle.integration.test.ts`:
  - `reopens an email marked just info`: after `handleMail(id, { justInfo: true })`, `updateMail(id, { attention: "open" })` returns `attention: "open"`, writes a `MAIL_REOPENED` activity log, and clears `processedAt`.
  - `refuses to reopen after an outcome`: an email with a recorded outcome gives a 409 with message "An outcome was recorded from this email. Correct it on the application."
  - `records a round with its time from the Mail form`: `handleMailAction` with `outcome=scheduled`, `day=2026-11-03`, `time=15:00` and `kind=DSA` creates a SCHEDULED round at `2026-11-03T09:30:00Z`.
  - `returns the refusal when the email was already handled`: a second `handleMailAction` returns `{ error: <409 message> }` and does not throw.
- [ ] **Step 6: Add a route test.** In `tests/mail-handle-api.test.ts`, add `PATCH accepts attention open`: the mocked `updateMail` receives `{ attention: "open" }`.
- [ ] **Step 7: Run the tests.** Expected: FAIL on the new cases.
- [ ] **Step 8: Implement the actions and the reopen path.**
  - `handleMailAction` parses `day`, `time`, `kind`, `name`, `note` and `happenedOn` through `outcomeDetail`, then passes `details` as ISO strings.
  - `reopenMailAction(id)` calls `updateMail(id, { attention: "open" })`.
  - The `updateMail` reopen path:
    - Lock the email.
    - If `attentionState` is not `DONE`, do nothing.
    - If an application event has `payload.mailMessageId === id`, refuse with `ApiError` 409.
    - Otherwise set `attentionState: "OPEN"` and `processedAt: null`, return its events to `NEEDS_REVIEW` without `justInfo`, and log `MAIL_REOPENED`.
- [ ] **Step 9: Run the tests.** Expected: PASS. Then run `npm test` and `npm run test:db`; expected PASS.
- [ ] **Step 10: Commit** as `JOB_FINDER-9999: Suggest one outcome per email and let Just info be undone`.

### Task 4: URL query and redirects

**Files:**

- Create: `src/features/timeline/query.ts`
- Modify:
  - `src/app/mail/page.tsx`
  - `src/app/mail/[id]/page.tsx` (becomes a redirect)
  - `src/features/companies/detail.tsx:119` (mail link)
  - `src/features/applications/views/detail.tsx:99` ("All mail" link)
- Test: `tests/timeline-query.test.ts`, `tests/mail-redirect.integration.test.ts`

**Interfaces:**

- Produces:
  - `type MailQuery = { company: string | null; home: boolean; tag: MailTag | null; q: string | null; role: string | null; mail: string | null; cursor: string | null }`
  - `parseMailQuery(raw: Record<string, string | undefined>, resolve: (name: string) => string, roleCompany: (applicationId: string) => string | undefined): MailQuery`
  - `mailHref(query: Partial<MailQuery>): string`
  - `mailLocation(id: string): Promise<string | null>`, where `null` means 404

- [ ] **Step 1: Write the failing unit tests:**
  - `resolves a company name or alias to its key`.
  - `maps application to its company and role`: `{ application: id }` gives `company: <key>`, `role: id`.
  - `drops view and unknown tags`.
  - `home view`: `{ view: "home" }` gives `home: true`, `company: null`.
  - `round-trips through mailHref`.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement `parseMailQuery` and `mailHref`.**
- [ ] **Step 4: Run them.** Expected: PASS, 5/5.
- [ ] **Step 5: Write the failing integration test** in `tests/mail-redirect.integration.test.ts`:
  - `mailLocation` gives `/mail?company=<key>&mail=<id>` for placed mail.
  - It gives `/mail?view=home&mail=<id>` for unplaced mail.
  - It gives `null` for excluded or missing mail.
- [ ] **Step 6: Run it.** Expected: FAIL.
- [ ] **Step 7: Implement `mailLocation`.** It uses `readMailItem`, which already 404s excluded mail. Then:
  - `/mail/[id]/page.tsx` becomes `redirect(await mailLocation(id) ?? notFound())`, and its old UI is deleted.
  - Point both links at `mailHref`.
- [ ] **Step 8: Run it.** Expected: PASS. Run `npm run typecheck`; expected exit 0.
- [ ] **Step 9: Commit** as `JOB_FINDER-9999: Route old mail links into the company timeline`.

### Task 5: Timeline and handling components

**Files:**

- Create: `src/features/timeline/timeline.tsx`, `src/features/timeline/handling.tsx`
- Test: `tests/timeline-render.test.ts`. Vitest collects only `.test.ts` in Node, so render with `renderToStaticMarkup(createElement(CompanyTimeline, props))` from `react-dom/server`. Full behaviour is covered by Task 6's browser tests.

**Interfaces:**

- Consumes: `TimelineDay` (Task 1), `Handling` (Task 3), `handleMailAction`/`reopenMailAction`/`placeMailAction`.
- Produces:
  - `CompanyTimeline(props: { days: TimelineDay[]; handling: Record<string, Handling>; roles: { id: string; role: string }[]; role: string | null; openMail: string | null; olderHref: string | null; placeOptions?: { companies: { key: string; name: string }[]; applications: { id: string; label: string }[] } })`
  - `HandlingBar(props: { item: MailItem; handling: Handling })`

- [ ] **Step 1: Write the failing render tests** in `tests/timeline-render.test.ts`:
  - `renders day headings and rows`: "Coming up", "Today" and "Fri 30 Oct" headings; an open row shows "Needs you" and the suggested button "Record round scheduled".
  - `role chips only with two roles`: one role gives no group named "Filter by role"; two roles give chips "All roles" plus both roles.
  - `handled row shows what was recorded`: `recorded: "Round scheduled"` gives "Recorded: Round scheduled".
  - `never renders HTML`: a body of `<b>x</b>` renders as escaped text.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement the components** from the approved gallery options.
  - **Ledger rows:** gallery `LedgerTimeline` (`src/features/timeline/gallery/timelines.tsx`).
  - **Handling bar:** gallery `SuggestedOption` (`gallery/handling.tsx`), with these differences:
    - Forms post to the server actions with `useActionState`.
    - Outcomes that need detail post `day`, `time` and `kind` fields named as `outcomeDetail` expects.
    - "Which role?" shows radio chips of `handling.applications` before the button when `chosen` is null.
    - The handled line offers Undo (`reopenMailAction`) only when it reads "Marked as just info".
    - A refusal shows in a `role="alert"` line.
  - **Placement:** "Place at…" shows when `placeOptions` is set.
  - **Role chips:** gallery `useRoleFilter`. Chips are links built with `mailHref`, so the server filters.
  - **Opening and paging:** `openMail` opens and scrolls to that row; "Show older" links to `olderHref`.
- [ ] **Step 4: Run them.** Expected: PASS, 4/4. Run `npm run lint` and `npm run typecheck`; expected clean.
- [ ] **Step 5: Commit** as `JOB_FINDER-9999: Add the shared day-ledger timeline and handling bar`.

### Task 6: The Mail view

**Files:**

- Create: `src/features/timeline/mail-view.tsx`
- Modify: `src/app/mail/page.tsx`
- Delete:
  - From `src/features/mail/workspace.tsx`: the tabs, scope list and flat list. Keep `TagChip` only if used, else delete it with its file's remainder.
  - `src/features/mail/workspace-data.ts` and `workspace-read.ts`, if nothing else imports them after this task.
- Test: `tests/e2e/company-timeline.spec.ts` (new); update or delete `tests/e2e/mail-foundation.spec.ts` cases that assert the old tabs

**Interfaces:**

- Consumes:
  - `readCompanyIndex`, `readCompanyTimeline` (Tasks 1 and 2).
  - `parseMailQuery`, `mailHref` (Task 4).
  - `CompanyTimeline` (Task 5).
  - `MailConnections` (`mail-connections.tsx`), `CompanyRuleEditor` (`company-rule-editor.tsx`), `checkMail`.
- Produces: `MailView(props: { index; timeline | null; home: { items: MailItem[] } | null; query: MailQuery; connections; configs; coverage })`.

- [ ] **Step 1: Write the failing browser tests** in `tests/e2e/company-timeline.spec.ts`. They use the seeding helpers; extend `seedMail` in `tests/e2e/helpers/task13-mail.ts` with optional `companyKey` and `receivedAt`.
  - `opens the first Needs you company`: an open interview email at a seeded company. Expect a rail row with a count badge, its pane heading, and "Record round scheduled".
  - `records the suggested outcome with a time`: fill day and time, Save. Expect "Recorded: Round scheduled" and the badge gone.
  - `Just info and Undo`: "Just info" gives "Marked as just info"; "Undo" brings "Needs you" back.
  - `asks which role with two open applications`.
  - `tag pill narrows rail and timeline`: Offer leaves only companies with offers and only offer emails.
  - `search narrows rail and timeline`: the rail row shows "1 match".
  - `places a Needs a home email`.
  - `nothing needs you`: with no open mail, the pane says "Nothing needs you".
- [ ] **Step 2: Run them.** Run `npm run test:e2e -- tests/e2e/company-timeline.spec.ts`. Expected: FAIL.
- [ ] **Step 3: Implement `MailView` and the page.**
  - The rail rows follow gallery `TwoLineRow`. Groups are Needs you, Waiting on them, Closed and Needs a home, collapsed as the spec says.
  - The rail header holds Check mail (the existing `checkMail` loop from `workspace.tsx`, moved here), an Inboxes drawer wrapping `MailConnections`, and search as a GET form.
  - The pane header holds the company link, city, next step, tag pills (gallery `PillTags` style, as links) and a "Mail rule" drawer wrapping `CompanyRuleEditor`.
  - On a phone, the pane replaces the rail when `company` or `view=home` is set, with an "All companies" link.
  - The default selection is the first `needs` row.
- [ ] **Step 4: Update the old specs.** `tests/e2e/mail-foundation.spec.ts` keeps the agent-record case. Its tab cases move to the new spec as above; delete the old ones.
- [ ] **Step 5: Run them.** Run the two spec files. Expected: PASS. Run `npm run lint`, `npm run typecheck` and `npm test`; expected clean.
- [ ] **Step 6: Commit** as `JOB_FINDER-9999: Replace the stopgap Mail page with the company rail and timeline`.

### Task 7: Company page Timeline tab

**Files:**

- Modify: `src/features/companies/detail.tsx` (tabs, aside, header next step), `src/app/companies/[slug]/page.tsx`
- Test: extend `tests/e2e/company-timeline.spec.ts`; update existing company detail e2e assertions that expect Compensation as the default tab or "Your progress"

**Interfaces:**

- Consumes: `readCompanyTimeline`, `readCompanyIndex` (for the next step and row), `CompanyTimeline`, `CompanyMetrics` (`fixed`, `total`, `payReports`, `typicalLoop`, `interviewReports`), `companyActivity`.
- Produces:
  - `detailTabs = ["timeline", "pay", "interviews", "about"] as const`
  - `TimelineAside(props: { company; summary; activity })`

- [ ] **Step 1: Write the failing browser tests:**
  - `company page opens on Timeline with the aside`: the heading is the company; tab "Timeline" is selected; the aside shows "Your roles", "Pay" and "Interview loop"; an email seeded for the company appears in the timeline.
  - `progress tab opens Timeline`: `?tab=progress` selects "Timeline".
  - `research tabs keep their content`: `?tab=pay` shows the existing Compensation section and the metric tiles.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
  - The default tab becomes `timeline`, and `progress` maps to `timeline`.
  - `MetricTiles` render only on research tabs.
  - The aside follows gallery `AsideCompany`. Roles come from `activity.records` with their resume link; saved openings come from `activity.allOpenings` without a record; pay comes from `metrics.total ?? metrics.fixed`; the loop is `metrics.typicalLoop`.
  - `ProgressSection` is deleted once nothing renders it.
- [ ] **Step 4: Run them**, then the whole company e2e set (`npm run test:e2e -- tests/e2e/companies*.spec.ts`). Expected: PASS after updating the default-tab assertions.
- [ ] **Step 5: Commit** as `JOB_FINDER-9999: Open company pages on the shared timeline with roles, pay and loop beside it`.

### Task 8: Layout checks, records and release

**Files:**

- Modify: `tests/e2e/company-timeline.spec.ts`, `/Users/sathwick/my-office/professional_growth_projects/job-finder/AGENTS.md` (product scope line), `src/features/timeline/gallery/*` (unchanged; the record of the picks)
- Test: `tests/e2e/company-timeline.spec.ts`

- [ ] **Step 1: Write the failing browser tests:**
  - `long and empty fields keep the phone layout`: seed an email with an empty sender name, a 300-character subject and a 5,000-character body. At 375×812, `document.documentElement.scrollWidth <= innerWidth` holds on `/mail`, the company pane and the company page.
  - `captures Mail and the company page`: light and dark at 375 and 1440 px, saved to `test-results/company-timeline/`.
- [ ] **Step 2: Run them.** Expected: the first FAILS until truncation is applied anywhere it is missing; the second passes.
- [ ] **Step 3: Fix any overflow** with `min-w-0` and `truncate` on the offending element. Review the screenshots against the gallery picks.
- [ ] **Step 4: Run the full gates.**
  - `npm run lint`, `npm run typecheck`, `npm test` and `npm run test:db`.
  - `npm run test:e2e`.
  - Expected: all pass. Redirect long output to the scratchpad and read the tails.
- [ ] **Step 5: Record the picks.** Add the piece 2 decisions to `AGENTS.md` product scope, one line per the existing style: the timeline, handling, tags, rail and company page picks, and the Just info undo.
- [ ] **Step 6: Release.**
  - Run `docker compose up -d --build`.
  - Check that `/mail` and one company page return 200 against the personal app.
  - Review both in the browser pane without pressing Check mail.
- [ ] **Step 7: Commit** as `JOB_FINDER-9999: Record the company timeline release`.
