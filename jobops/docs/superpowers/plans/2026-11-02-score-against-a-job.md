# Score Against a Job Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** From `/resumes?file=<id>`, score any résumé file against any saved opening with the Keyword check,
ResumeNext and the ATS optimizer, run from JobOps, and compare every scored job in one table.

**Architecture:** The Python scoring service gains term suggestion, evidence context and a coded ATS optimizer.
Next.js gains a per-snapshot term list, HTTP clients for the scoring service and the ResumeNext MCP bridge, a
`POST /api/v1/resumes/{versionId}/score` route (one tool per request, file plus base in one transaction), and the
approved panel UI: pill under the job bar, search popup, tap-to-change chips, one row per tool, comparison table.

**Tech Stack:** Next.js App Router, React 19, Tailwind 4 tokens, Drizzle/PostgreSQL, zod, vitest, Playwright;
Python 3.13, FastAPI, Pydantic 2, pdfplumber, pytest, ReportLab.

**Spec:** `jobops/docs/superpowers/specs/2026-11-02-score-against-a-job-design.md` (read it with this plan).

## Global Constraints

- Next.js never matches terms or computes a score; matching and scoring live in `services/resume-scoring` or
  ResumeNext. Stripping the JD's leading metadata block is text cleanup and lives in Next.js.
- Scoring never changes `resumeVersions.targetJobId`, `targetSnapshotId` or `baseVersionId`.
- Tool source names stay `jobops-lexical`, `resumenext`, `resume-ats-optimizer`; saved `details` must parse with the
  schemas in `src/features/resumes/fit/tools.ts`.
- Every row JobOps saves has `method` ending in `, run in JobOps` and `details.termsFingerprint`.
- Scoring engine version becomes `1.1.0`.
- ResumeNext `job_description` max 20,000 characters: refuse, never truncate.
- Timeouts: 30 s for scoring-service calls, 60 s for ResumeNext.
- Copy is sentence case; "Score against another job" / "Score against a job" / "Score with these terms" /
  "Add a term from the job" / "Mark at least one term as required" /
  "No terms were suggested for this job. Select the skills it asks for." /
  "No saved opening matches. Save the job description from Find openings first." /
  "Each check scores this file and the master, so the comparison uses the same terms." /
  "Arrows compare with the master on the same job." / "Couldn't reach the scoring service" /
  "Couldn't reach ResumeNext (bridge on port 8004)" / "Sends the text to resumenext.io" /
  "JobOps scoring service, on this computer".
- Colours only from the shared theme tokens (`bg-selected`, `text-link`, `bg-warning-soft`, …); no palette literals.
- Integration tests run with `npm run test:db` against `jobops_e2e` only. Python tests run in the service's Docker
  test target with `--network none`.
- Application use is Docker-only (`docker compose up -d --build` from `jobops/`); no host dev servers except the
  Playwright runner's own.
- Commits: `JOB_FINDER-9999: <summary>`, no conventional prefixes, footer
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Commit only when the user asks; each task's commit
  step means "propose this commit".

## Review Focus

1. **Double-click or two tabs scoring the same file and job.** Expect one base row per snapshot, tool and
   fingerprint, not two. Test in Task 6 (`concurrent runs save one base row`).
2. **A file's PDF missing from storage.** Expect that row to say "The PDF for this file is missing from storage" and
   the other tools to continue, not a 500. Test in Task 6 (`missing PDF fails only that tool`).
3. **The scoring service busy (HTTP 429, two worker slots, up to four calls in one click).** Expect one retry after
   `Retry-After`, then success. Test in Task 5 (`retries once on 429`).
4. **The saved description changed after terms were reviewed** (a `jd_quote` no longer occurs; service returns 422).
   Expect error code `terms_stale` and the UI reopening the terms step. Tests in Task 5 and Task 8.
5. **The base file has no extracted text yet.** Expect the file scored alone, delta "—", and the row noting "The
   master couldn't be scored". Test in Task 6 (`base without text is skipped`).

---

### Task 1: Retire the gallery and record the approved design

**Files:**
- Delete: `jobops/src/app/gallery/score-job/page.tsx`, `jobops/src/features/score-job-gallery/` (whole folder)
- Modify: `AGENTS.md` (root) product scope, after the "Résumé fit panel (2026-11-02)" bullet
- Add: `jobops/docs/superpowers/specs/2026-11-02-score-against-a-job-design.md`, this plan

- [ ] **Step 1:** Delete the gallery route and folder.
- [ ] **Step 2:** Add one product-scope bullet: "Score against a job (2026-11-02), approved from the live gallery at
  `/gallery/score-job`, since removed (picks: start A pill under the job bar, opening A search popup, terms A
  tap-to-change chips with add-from-description, running A one row per tool, several jobs C comparison table).
  Any file can be scored against any saved opening from the résumé panel; JobOps runs the Keyword check and ATS
  optimizer in the scoring service and ResumeNext through the bridge on port 8004, scores the base with the same
  terms, and never changes what a file is tailored for. One reviewed term list per job snapshot; rows carry a term
  fingerprint and deltas pair like with like. Spec: `jobops/docs/superpowers/specs/2026-11-02-score-against-a-job-design.md`."
- [ ] **Step 3:** Run `npm run typecheck && npm run lint` in `jobops/`. Expected: no errors.
- [ ] **Step 4:** Commit `JOB_FINDER-9999: Retire the score-against-a-job gallery and record the approved design`.

### Task 2: Scoring service — evidence context and term suggestion

**Files:**
- Modify: `services/resume-scoring/scoring/models.py` (`Evidence`), `scoring/engine.py`, `scoring/api.py`
- Test: `services/resume-scoring/tests/test_scoring.py`, `tests/test_api.py`

**Interfaces:**
- Produces: `Evidence.context: str` — the résumé line containing the span (from the previous `\n` to the next `\n`,
  clipped to 200 characters around the span). `ENGINE_VERSION = "1.1.0"`.
- Produces: `POST /v1/requirements/suggest`, body `{"job_description": str}` →
  `{"engine_version": "1.1.0", "requirements": [{"term", "aliases", "jd_quote"}]}` (today's
  `suggested_requirements`, no importance). Same auth, body limit and Origin rejection as other endpoints.

- [ ] **Step 1: Write failing tests**
  - `test_evidence_carries_line_context`: résumé text `"Summary\nBuilt Kafka pipelines on AWS\nSkills"` with a
    `Kafka` requirement → `findings[0].resume_evidence[0].context == "Built Kafka pipelines on AWS"`.
  - `test_suggest_returns_catalogue_terms_with_quotes`: POST JD `"We use Kafka and Java.\nNice: Docker."` →
    terms `{"Kafka", "Java", "Docker"}`, each `jd_quote` a substring of the JD, no `importance` key.
  - `test_suggest_rejects_blank_description`: `"   "` → 422.
  - `test_engine_version_is_1_1_0`: `GET /health` → `engine_version == "1.1.0"`.
- [ ] **Step 2:** Build and run the test image (commands below). Expected: the four tests FAIL.
  ```bash
  docker build --target test -t jobops-resume-scoring-test services/resume-scoring
  docker run --rm --network none jobops-resume-scoring-test
  ```
- [ ] **Step 3:** Implement `context` in `assess()`'s evidence construction, the suggest endpoint in `api.py`
  (pydantic body model with the same non-blank validator as `Metadata.job_description`), bump `ENGINE_VERSION`.
- [ ] **Step 4:** Re-run the tests plus `ruff check .` and `ruff format --check .` in the image. Expected: all pass.
- [ ] **Step 5:** Commit `JOB_FINDER-9999: Add term suggestion and evidence context to the scoring service`.

### Task 3: Scoring service — coded ATS optimizer

**Files:**
- Create: `services/resume-scoring/scoring/ats.py`
- Modify: `scoring/api.py`, `scoring/engine.py` (`METHODS` gains `ats_optimizer`), `README.md` (API table)
- Test: `services/resume-scoring/tests/test_ats.py`

**Interfaces:**
- Produces: `layout_facts(data: bytes) -> LayoutFacts` (fonts with sizes, image count, table count, column count
  estimate, page count) using pdfplumber; `ats_optimizer(document: Document, facts: LayoutFacts | None,
  metadata: Metadata, filename: str | None) -> dict`.
- Produces: `POST /v1/ats-optimizer/pdf`, multipart `resume` + `metadata` (same `Metadata`; `requirements` required
  and must contain at least one `required`), response:
  `{"engine_version", "match_score": float, "target": 80, "method": "ats_optimizer@1.1.0: required terms found ÷ required terms × 100", "format": [{"check","ok","warn","detail"}], "keywords": [{"term","importance","found","unclear","where":{"summary","skills","experience"}}]}`.
  Runs in the same worker pool and timeout as assessments.

- [ ] **Step 1: Write failing tests** (ReportLab PDFs, synthetic text only)
  - `test_match_score_counts_required_only`: 3 required (2 present), 1 preferred present → `match_score == 66.7`.
  - `test_negated_mention_not_found_and_unclear`: line "No Kafka experience" → Kafka `found == 0`, `unclear is True`.
  - `test_where_counts_by_section`: headings `PROFESSIONAL SUMMARY`, `SKILLS`, `PROFESSIONAL EXPERIENCE`, Java once in
    each → `where == {"summary": 1, "skills": 1, "experience": 1}`, `found == 3`.
  - `test_format_checks_pass_fail_warn`: a single-column Helvetica 11 pt PDF with email and phone in body passes
    text-based, contact, single column, no images, no tables; a PDF with a drawn image fails "No images"; a PDF with
    no recognised headings fails "Standard section headings"; file name `resume.pdf` warns on the
    `FirstName_LastName_Resume.pdf` pattern; a font not on the list (Arial, Calibri, Georgia, Times New Roman,
    Helvetica and their PDF base names) warns, never passes.
  - `test_endpoint_requires_a_required_term`: all `preferred` → 422.
- [ ] **Step 2:** Run the test image. Expected: FAIL (module missing).
- [ ] **Step 3:** Implement `ats.py`. Matching reuses `engine.occurrences` and `engine.uncertain_context`. Sections:
  a line is a heading when it case-insensitively equals one of the standard headings (summary/professional summary;
  skills/technical skills/core skills; experience/work experience/professional experience/employment); a term's
  section is the last heading above it; text before any heading counts as summary. Any check that cannot be
  established returns `ok: false, warn: true`.
- [ ] **Step 4:** Re-run tests and ruff. Expected: pass.
- [ ] **Step 5:** Commit `JOB_FINDER-9999: Port the ATS optimizer rubric to the scoring service`.

### Task 4: Term lists per snapshot

**Files:**
- Modify: `jobops/src/db/schema.ts` (new `jobTermLists`), generate `jobops/drizzle/0018_job_term_lists.sql`
- Create: `jobops/src/features/resumes/score/terms.ts`, `jobops/src/features/resumes/score/backfill.ts`
- Modify: `jobops/src/features/resumes/fit/tools.ts` (all three schemas gain `termsFingerprint: z.string().optional()`;
  optimizer keywords gain `unclear: z.boolean().optional()`), `fit/service.ts` (`recordFit`), `src/instrumentation.ts`
- Test: `jobops/tests/resume-terms.test.ts`, `jobops/tests/resume-terms.integration.test.ts`

**Interfaces:**
- Produces table `job_term_lists`: `id`, `snapshot_id` (unique, FK `job_snapshots` cascade), `terms jsonb`,
  `fingerprint text`, `reviewed_by text` (`USER` | `AGENT`), `reviewed_at timestamptz`.
- Produces in `terms.ts`:
  - `type ReviewedTerm = { term: string; aliases: string[]; importance: "required" | "preferred" | "skip"; jdQuote: string; added?: boolean }`
  - `reviewedTermsSchema` (zod, 1–100 terms, unique case-insensitive `term`, at least one `required`)
  - `termsFingerprint(terms: ReviewedTerm[]): string` — SHA-256 hex of JSON of
    `[term.toLocaleLowerCase(), aliases sorted, importance]` tuples sorted by term, skipped terms excluded.
  - `getTermList(snapshotId: string): Promise<{ terms: ReviewedTerm[]; fingerprint: string; reviewedAt: Date; reviewedBy: "user" | "agent" } | null>` —
    when no row exists and the snapshot has a recorded `jobops-lexical` assessment, seeds from the latest one's
    `details.requirements` (`reviewed_by AGENT`) and returns it.
  - `saveTermList(snapshotId: string, terms: ReviewedTerm[], by: "user" | "agent", tx?): Promise<{ fingerprint: string }>` (upsert).
  - `fromRequirements(requirements: LexicalDetails["requirements"]): ReviewedTerm[]` (`jd_quote` → `jdQuote`). Seeding,
    `recordFit` and the backfill all fingerprint through it, so a seeded list and the rows it came from match.
- Produces `backfillTermFingerprints()`: once (settings key `resumeTermFingerprints`, version 1), for every
  assessment without `details.termsFingerprint`, sets it from the `jobops-lexical` row with the same `versionId`,
  `snapshotId` and `createdAt` (rows recorded together); rows with no such lexical row are left without one.

- [ ] **Step 1: Write failing tests**
  - unit `fingerprint ignores order and skipped terms`; `fingerprint changes when importance changes`;
    `schema refuses a list with no required term`.
  - integration `seeds from the latest recorded lexical requirements`; `saveTermList upserts and recordFit with
    lexical requirements replaces the list as agent`; `recordFit stamps termsFingerprint on every recorded row`;
    `backfill stamps rows recorded together and runs once`.
- [ ] **Step 2:** `npm test -- resume-terms` and `npm run test:db -- resume-terms`. Expected: FAIL.
- [ ] **Step 3:** Add the table, run `npm run db:generate`, implement `terms.ts`, `backfill.ts`, the `recordFit`
  hook (inside its transaction: when the input has a `jobops-lexical` assessment for this file, save its
  requirements as the list and stamp the fingerprint into each assessment's `details`), and register
  `backfillTermFingerprints` in `register()` after the mail catch-up with the same `.catch(console.error)` pattern.
- [ ] **Step 4:** Re-run both. Expected: PASS; `npm run test:db -- resume-fit` still passes.
- [ ] **Step 5:** Commit `JOB_FINDER-9999: Keep one reviewed term list per job snapshot`.

### Task 5: Tool clients and result mapping

**Files:**
- Create: `jobops/src/features/resumes/score/scoring-client.ts`, `score/resumenext-client.ts`, `score/map.ts`
- Modify: `jobops/compose.yaml` (app `environment`: `SCORING_URL: http://resume-scoring:8000`,
  `RESUMENEXT_MCP_URL: http://host.docker.internal:8004/mcp`), `jobops/.env.example` (same keys, commented)
- Test: `jobops/tests/resume-score-clients.test.ts`, `jobops/tests/resume-score-map.test.ts`

**Interfaces:**
- Produces `class ToolError extends Error { code: "unreachable" | "busy" | "unreadable" | "terms_stale" | "too_long" | "missing_pdf" | "failed" }`.
- Produces in `scoring-client.ts` (base `process.env.SCORING_URL ?? "http://127.0.0.1:3212"`), with
  `LexicalAssessment` and `OptimizerAssessment` as zod schemas of the service responses (Task 2 `Assessment` with
  `Evidence.context`; Task 3 optimizer body); `status: "unable_to_assess"` → `unreadable`:
  - `suggestTerms(jd: string): Promise<{ term: string; aliases: string[]; jdQuote: string }[]>`
  - `assessLexical(pdf: Buffer, filename: string, jd: string, terms: ReviewedTerm[]): Promise<LexicalAssessment>`
  - `assessOptimizer(pdf: Buffer, filename: string, jd: string, terms: ReviewedTerm[]): Promise<OptimizerAssessment>`
  Skipped terms are omitted; `jdQuote` → `jd_quote`. 422 whose body names `jd_quote` → `terms_stale`; other 422
  → `unreadable`; 429 → wait `Retry-After` (cap 5 s) and retry once, then `busy`; network/5xx → `unreachable`.
- Produces in `resumenext-client.ts` (base `process.env.RESUMENEXT_MCP_URL ?? "http://127.0.0.1:8004/mcp"`):
  - `stripMetadataBlock(jd: string): string` — the spec's leading `key: value` rule.
  - `matchResumeToJob(input: { resumeText: string; jobDescription: string; targetRole: string; targetCompany: string }): Promise<unknown>` —
    MCP `initialize` → `notifications/initialized` → `tools/call match_resume_to_job`, carrying `mcp-session-id`,
    parsing JSON or SSE `data:` frames; returns the tool's structured result. Description over 20,000 → `too_long`
    before any request.
- Produces in `map.ts`:
  - `toLexicalDetails(a: LexicalAssessment, terms: ReviewedTerm[], fingerprint: string, notes: Record<string, string>): LexicalDetails`
  - `toOptimizerDetails(a: OptimizerAssessment, fingerprint: string): OptimizerDetails`
  - `toResumeNextDetails(raw: unknown, fingerprint: string, sentJobDescription: string): ResumeNextDetails` (throws `failed` if it doesn't parse)
  - `carryNotes(previous: LexicalDetails | undefined): Record<string, string>` (term lower-case → note)
  - `jobOpsMethod(base: string): string` → `` `${base}, run in JobOps` ``

- [ ] **Step 1: Write failing tests** (mock `fetch` with `vi.stubGlobal`)
  - `stripMetadataBlock removes both header styles`: `"TITLE: X\nREQ ID: 1\nAPPLY URL: https://a\n\nAbout the role…"`
    → starts `"About the role"`; `"jobReqId : 9\npostedOn : Posted Today\n\nWe build…"` → starts `"We build"`;
    `"Requirements: Java, Kafka and more."` at the top is kept (sentence punctuation).
  - `retries once on 429` then 200 → resolves; two 429s → `busy`.
  - `422 naming jd_quote maps to terms_stale`; `network error maps to unreachable`.
  - `matchResumeToJob refuses descriptions over 20,000 characters` with no fetch call.
  - `matchResumeToJob reads SSE frames and sends the session id`.
  - map: `lexical details parse with lexicalSchema and score is weighted`; `notes carry forward by term`;
    `optimizer details parse with optimizerSchema`; `ResumeNext details keep sentJobDescription and fingerprint`.
- [ ] **Step 2:** `npm test -- resume-score`. Expected: FAIL.
- [ ] **Step 3:** Implement the three modules and the compose/env entries.
- [ ] **Step 4:** `npm test -- resume-score && npm run typecheck`. Expected: PASS.
- [ ] **Step 5:** Commit `JOB_FINDER-9999: Add scoring and ResumeNext clients for in-app scoring`.

### Task 6: Run service and API routes

**Files:**
- Create: `jobops/src/features/resumes/score/run.ts`, `score/openings.ts`
- Create routes: `jobops/src/app/api/v1/resumes/[versionId]/score/route.ts` (POST),
  `.../[versionId]/openings/route.ts` (GET), `jobops/src/app/api/v1/jobs/snapshots/[snapshotId]/terms/route.ts`
  (GET, PUT), `.../terms/suggest/route.ts` (POST)
- Test: `jobops/tests/resume-score.integration.test.ts`

**Interfaces:**
- Consumes: Task 4 `getTermList`, `saveTermList`, `termsFingerprint`; Task 5 clients and mappers; `readBuffer` from
  `@/services/storage`; `parseToolRow` from `fit/derive`; `indiaDayBoundary`, `indiaDate` from `@/features/mail/attention`.
- Produces `scoreVersion(versionId: string, snapshotId: string, tool: ToolSource, now?: Date): Promise<{ mine: ParsedRow; base: ParsedRow | null; baseSkipped?: "no_text" | "no_base" }>` —
  throws `ApiError` 404 (unknown file/snapshot), 409 `"Review this job's terms first."` when no term list,
  422 when the file's text isn't extracted; throws `ToolError` for tool failures. Takes
  `pg_advisory_xact_lock(hashtext(versionId || snapshotId || tool))` for the base check-and-insert. Re-scores the base
  only if it has no row for snapshot, tool and fingerprint, or that row's method engine version differs.
- Produces `listScorableOpenings(versionId: string): Promise<ScorableOpening[]>` where
  `ScorableOpening = { jobId; snapshotId; company; title; location; reqId: string | null; postedAt: string | null; postedAtKind: string | null; tailored: boolean; scored: boolean; fresh: boolean; dateUnknown: boolean; reviewed: boolean }`.
  Tailored job → the file's `targetSnapshotId`; others → latest snapshot with non-empty description. Fresh = posted
  within 14 Asia/Kolkata calendar days inclusive. Order: `postedAt` desc, unknown last.
- Routes: `POST /score` body `{ snapshotId: uuid, tool: ToolSource }` → 201 `{ mine, base, baseSkipped }`, tool
  failure → 502 `{ error, code }`; `GET /openings` → `{ openings }`; `GET /terms` → `{ list | null }`;
  `PUT /terms` body `{ terms: ReviewedTerm[] }` → `{ fingerprint }`; `POST /terms/suggest` → `{ terms }`.
  All LAN-trusted like `/fit`, using `apiResponse` / `apiError`; `revalidatePath("/resumes")` after writes.

- [ ] **Step 1: Write failing tests** (`vi.mock` the two client modules; synthetic files under the test prefix)
  - `scores the file and the base against the snapshot with one fingerprint`;
  - `reuses the base row when fingerprint and engine version match`; `re-scores the base after terms change`;
  - `never changes targetJobId, targetSnapshotId or baseVersionId`;
  - `concurrent runs save one base row` (two `scoreVersion` calls in `Promise.all`);
  - `missing PDF fails only that tool` (`ToolError` `missing_pdf`, no rows saved);
  - `base without text is skipped` (`baseSkipped: "no_text"`, file row saved);
  - `409 without a term list`; `lexical row copies notes from the latest noted row for the file and snapshot`;
  - `openings flag tailored, scored, over 14 days and unknown date, tailored uses targetSnapshotId`.
- [ ] **Step 2:** `npm run test:db -- resume-score`. Expected: FAIL.
- [ ] **Step 3:** Implement `run.ts`, `openings.ts`, the four routes.
- [ ] **Step 4:** Re-run; also `npm run test:db -- resume-fit resume-terms`. Expected: PASS.
- [ ] **Step 5:** Commit `JOB_FINDER-9999: Run résumé checks from JobOps against any saved opening`.

### Task 7: Fit groups and the comparison table

**Files:**
- Modify: `jobops/src/features/resumes/fit/service.ts` (`Fit` gains `groups`), `fit/derive.ts`, `fit/panel.tsx`,
  `jobops/src/app/resumes/page.tsx` (passes `searchParams.fitJob`)
- Create: `jobops/src/features/resumes/fit/compare.tsx`
- Test: `jobops/tests/resume-fit-derive.test.ts`, `jobops/tests/resume-fit-render.test.ts`, `jobops/tests/resume-fit.integration.test.ts`

**Interfaces:**
- Produces `type FitGroup = { snapshotId; target: NonNullable<Fit["target"]>; snapshot: NonNullable<Fit["snapshot"]>; tailored: boolean; earlierDescription: boolean; fingerprint: string | null; mine: Partial<Record<ToolSource, ParsedRow>>; base: Partial<Record<ToolSource, ParsedRow>>; olderTerms: Partial<Record<ToolSource, boolean>>; chips: Chip[] }`.
  `Fit.groups: FitGroup[]` — tailored first, then by latest assessment `createdAt` desc. Existing `Fit` fields
  are unchanged (they still describe the tailored job).
- Produces in `derive.ts`: `pickRows(rows: ParsedRow[], versionId: string, snapshotId: string, fingerprint: string | null): { rows: Partial<Record<ToolSource, ParsedRow>>; olderTerms: Partial<Record<ToolSource, boolean>> }` —
  latest row whose `details.termsFingerprint` equals `fingerprint`; else latest row of any fingerprint (or none),
  flagged older. The base uses the same fingerprint as the selected mine row and no fallback.
- A group whose snapshot is not its job's latest shows "earlier description" under the company in the table.
- Produces `ComparisonTable({ groups, selected, onSelect })` in `compare.tsx`; columns Keyword check / ResumeNext /
  ATS optimizer; `Delta` only when not `olderTerms`; "older terms" label and a **Re-score** button (emits
  `onRescore(snapshotId)`) otherwise; caption "Arrows compare with the master on the same job."; hidden when
  `groups.length < 2` and the only group is tailored.
- `FitView` becomes a client wrapper `FitWorkspace({ fit, selected })`: selection is the `fitJob` search param
  (default tailored group, else first); job bar, `Scores`, `Chips` and `ToolChecks` render the selected group.

- [ ] **Step 1: Write failing tests**
  - derive `pickRows prefers the current fingerprint`; `pickRows flags older terms`; `base never falls back`.
  - render `table lists tailored job first with deltas`; `older terms row shows Re-score and no arrow`;
    `table hidden with only the tailored job`; `selecting a row swaps the job bar and scores`.
  - integration `getFit groups every snapshot the file was scored against`.
- [ ] **Step 2:** `npm test -- resume-fit` and `npm run test:db -- resume-fit`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Re-run; `npm run typecheck && npm run lint`. Expected: PASS.
- [ ] **Step 5:** Commit `JOB_FINDER-9999: Compare every job a résumé file was scored against`.

### Task 8: The score flow in the panel

**Files:**
- Create: `jobops/src/features/resumes/score/ui/score-button.tsx`, `ui/opening-picker.tsx`, `ui/term-review.tsx`,
  `ui/run-rows.tsx`, `ui/flow.tsx`
- Modify: `jobops/src/features/resumes/fit/panel.tsx` (mount the flow under the job bar and in the untailored state)
- Test: `jobops/tests/resume-score-render.test.ts`, `jobops/tests/e2e/resumes.spec.ts`

**Interfaces:**
- Consumes: Task 6 routes; Task 7 `FitWorkspace` (`fitJob` param).
- Produces `ScoreFlow({ versionId, tailored: boolean, disabledReason?: string })` — state machine
  `idle → picking → reviewing → running → done`, with `editing` reachable from `running`/`done` via "Edit terms".
  - `ScoreButton`: outlined full-width pill, `Gauge` icon, label "Score against another job" (tailored) or
    "Score against a job"; disabled with `disabledReason` when text isn't extracted.
  - `OpeningPicker`: popover under the pill, search over company/title/req id/location, Arrow/Enter/Escape,
    rows with the job bar's posting line, flags Tailored for this / Scored / Over 14 days / Date unknown, empty copy
    from Global Constraints. Reviewed opening → skip to running.
  - `TermReview`: chips cycling Required → Preferred → Not counted (filled tonal / outlined / dashed struck);
    detail line "<term> is <state>. The job says: “<quote>”"; footer counts and **Score with these terms**
    disabled with "Mark at least one term as required"; **Add a term from the job** shows the saved description,
    and a text selection inside it adds a Required chip with the selected line as `jdQuote` (`added: true`);
    empty suggestions open with the description shown and "No terms were suggested for this job. Select the skills
    it asks for." Confirm → `PUT /terms` then running.
  - `RunRows`: one row per tool (order Keyword check, ResumeNext, ATS optimizer), "where" line, status icon, score
    with "master N" or the error copy and **Try again** (re-runs that tool only); a saved Keyword check with a
    null score reads "Needs a manual look"; `unreadable` reads "This PDF's text couldn't be read; it may be
    scanned"; `baseSkipped: "no_text"` adds "The master couldn't be scored"; `terms_stale` reopens
    `TermReview`; footer note; "Using your terms from <d MMM> · Edit terms"; **Done** sets `fitJob` to the snapshot
    and calls `router.refresh()`. Fires the three `POST /score` requests in parallel.

- [ ] **Step 1: Write failing render tests** (`renderToStaticMarkup`, as in `resume-fit-render.test.ts`)
  - `pill reads Score against another job on a tailored file`; `disabled with the reason when text is missing`;
  - `chips render the three states and the counts`; `Score with these terms disabled without a required term`;
  - `empty suggestions show the description and the prompt`;
  - `run rows show where each tool runs and the ResumeNext notice`; `error row shows Try again`.
- [ ] **Step 2: Write the failing browser test** in `tests/e2e/resumes.spec.ts`: upload a synthetic PDF, seed one
  opening (description mentioning Java, Kafka, Docker) through `POST /api/v1/jobs` or the existing jobs helper,
  open the file, click **Score against a job**, pick the opening, tap Kafka to Required, select "Docker" in the
  description to add it, click **Score with these terms**; expect Keyword check and ATS optimizer rows to finish
  with scores and the ResumeNext row to show "Couldn't reach ResumeNext (bridge on port 8004)" (the e2e
  environment sets `RESUMENEXT_MCP_URL=http://127.0.0.1:9/mcp`, `SCORING_URL=http://127.0.0.1:3212`); click
  **Done**; expect the comparison table row for the opening. Then **Edit terms**, change Java to Not counted,
  confirm, and expect the earlier scores to read "older terms".
- [ ] **Step 3:** Run `npm test -- resume-score-render` and `npm run test:e2e -- resumes`. Expected: FAIL.
- [ ] **Step 4:** Implement the components; add the two env values to the `environment` object in `scripts/e2e.ts`.
- [ ] **Step 5:** Re-run both, then `npm test && npm run typecheck && npm run lint`. Expected: PASS.
- [ ] **Step 6:** `docker compose up -d --build` from `jobops/`; open `/resumes?file=<master id>` in the browser
  pane and score it against a real saved opening (this sends the master's text to resumenext.io, which the user
  approved for this feature). Expected: three finished rows and a table row.
- [ ] **Step 7:** Update `services/resume-scoring/README.md` ("Current delivery" now: JobOps calls the service from
  the résumé panel and stores results) and commit
  `JOB_FINDER-9999: Score any résumé file against a saved opening from the résumé panel`.
