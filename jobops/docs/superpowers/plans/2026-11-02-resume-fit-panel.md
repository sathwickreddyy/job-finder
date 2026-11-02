# Résumé Fit Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show, beside each tailored résumé PDF, which job it is for, the three tools' scores against the master,
what matches, what changed and every check, with all of it stored in JobOps.

**Architecture:** One migration adds target, base and snapshot references to `resume_versions` and a `details`
jsonb column to `resume_assessments`. A record-only local API (`/api/v1/resumes/{id}/fit`) upserts the job and
snapshot and appends tool results. Pure modules validate tool details and derive what the panel shows; Next.js
does no term matching.

**Tech Stack:** Next.js 16 App Router, React 19, Drizzle/PostgreSQL 17, zod 4, Vitest, Playwright, Tailwind 4 theme
tokens, lucide-react.

**Spec:** `docs/superpowers/specs/2026-11-02-resume-fit-panel-design.md`. Read it before each task. The gallery
components the user approved are in `src/features/resume-fit-gallery/demos.tsx` (job B, scores C, keywords B,
changes B, advice B, panel B).

## Global Constraints

- Tool `source` names, exactly: `jobops-lexical`, `resumenext`, `resume-ats-optimizer`.
- Headline `score` per tool:
  - jobops-lexical: `weighted`;
  - resumenext: `ats_score`;
  - resume-ats-optimizer: `match_score`.
- No scoring or term matching in Next.js. Chips come only from the recorded jobops-lexical `findings`.
- Fixed copy:
  - "Tool diagnostics, not an employer's ATS."
  - "Not checked yet"
  - "Not tailored for a job"
  - "Not on this résumé"
  - "The tool couldn't tell"
  - "This name is reserved for recorded tool checks."
  - "This file is already tailored for {company} · {title}"
  - "Open the live posting"
  - "Saved {captured date}; scores were measured against this text"
- Use shared Tailwind 4 theme tokens only, never palette literals. Support light and dark themes, visible focus and
  `prefers-reduced-motion`.
- Docker-only runtime. DB tests use `npm run test:db` (jobops_e2e) and browser tests use `npm run test:e2e`
  (port 3211). Never use personal data in tests.
- **Commits:** only when the user has authorised them for this plan, with message
  `JOB_FINDER-9999: <summary>` and footer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never use
  `feat:`/`fix:` prefixes. Without authorisation, stop at each commit step and propose the message.
- After code changes, rebuild with `docker compose up -d --build app` from the repository root. Migrations run in
  the container entrypoint.

## Review Focus

1. **A tailored version whose base has no rows for the snapshot.** The panel shows "from — on the master" with no
   delta and no crash. The test lives in Task 3 (`summarizeTool`).
2. **A manual assessment named like a tool** (`resumenext`) with empty details, or a tool row whose details fail
   zod. The panel ignores it and the manual list still shows it. The test lives in Task 3 (`parseToolRow`).
3. **The same title and location with different req ids, and the same URL posted twice.** These make two jobs and
   one job respectively. Applications get the same behaviour. The tests live in Task 1.
4. **A summary rewrite that changes a digit or date.** The changes header must not claim "Dates, titles and numbers
   unchanged". The test lives in Task 4.
5. **A very long saved description (100k chars) or ResumeNext payload.** It is stored whole and the panel's JD box
   scrolls; the API caps the request at 1 MB. The test lives in Task 5.

---

### Task 1: Separate jobs by requisition id

**Files:**
- Modify: `src/features/jobs/import.ts:19-21` (`jobDedupeKey`).
- Modify: `src/features/jobs/service.ts:111-115`, so the merge path passes `externalId` into `jobDedupeKey`.
- Modify: `src/features/applications/agent-record.ts:36-50`, adding optional `reqId` to `opening`, mapped to
  `externalId` wherever the opening becomes a job.
- Modify: `src/features/mail/handled.ts:115`, passing `externalId` when present.
- Test: `tests/job-import.test.ts`, `tests/agent-record.integration.test.ts`.

**Interfaces:**
- Produces: `jobDedupeKey(input: { company: string; title: string; location: string; externalId?: string | null }): string`.
  Without `externalId` the result is byte-identical to today's. With it, the normalised id is appended as a
  fourth array element.
- Produces: `agentRecordSchema.opening.reqId?: string` (max 200).

This deviates from the spec, which says the migration recomputes existing keys. That normalisation lives in
TypeScript (`normalizedPart`), so SQL can't reproduce it. Instead, existing keys are rewritten by the merge path
the next time a row is imported. Rows without `externalId` keep identical keys, and URL matching is unchanged, so
nothing merges wrongly in the meantime.

- [ ] **Step 1: Write failing tests**
  - In `tests/job-import.test.ts`:
    - `jobDedupeKey keeps old keys without a req id`: assert
      `jobDedupeKey({company:"A",title:"T",location:"L"}) === JSON.stringify(["a","t","l"])`. Use whatever
      `normalizedPart` produces today; snapshot the current output first.
    - `jobDedupeKey separates req ids`: assert the keys for `externalId:"R-1"` and `"R-2"` differ, and both differ
      from the key without one.
  - In `tests/agent-record.integration.test.ts`:
    - `two openings with one title and different req ids are two records`: post two openings with the same
      company, title and location, different URLs and `reqId` `R-2694949`/`R-2655406`. Expect two job rows and
      neither result `duplicate`.
    - `the same URL is still a duplicate`: post the same URL twice. Expect the second result `duplicate: true`.
- [ ] **Step 2: Run them and see them fail**
  - `npx vitest run tests/job-import.test.ts`: the new test fails.
  - `npm run test:db -- tests/agent-record.integration.test.ts`: the req id test fails, with the second opening
    reported as a duplicate.
- [ ] **Step 3: Implement** the signature above. Update every caller listed under Files.
- [ ] **Step 4: Run both test files, plus `npx vitest run tests/applications-api.test.ts`.** Expected: PASS.
- [ ] **Step 5: Commit**: `JOB_FINDER-9999: Keep openings with different requisition ids as separate jobs`.

### Task 2: Fit columns migration

**Files:**
- Modify: `src/db/schema.ts`:
  - `resumeVersions`: add `baseVersionId`, `targetJobId` and `targetSnapshotId`, all nullable uuid FKs with `onDelete: "restrict"`.
  - `resumeAssessments`: add `details: jsonb("details").$type<Record<string, unknown>>().notNull().default({})`
    and the index `resume_assessments_fit_idx` on `(version_id, snapshot_id, source)`.
- Create: `drizzle/0017_resume_fit.sql` and its meta, via `npm run db:generate`.

**Interfaces:**
- Produces: the column names above, used by Tasks 5 and 6.

- [ ] **Step 1: Edit the schema, then run `npm run db:generate -- --name resume_fit`.** Expected: a new
  `drizzle/0017_resume_fit.sql` with three `ALTER TABLE "resume_versions" ADD COLUMN`, one
  `ALTER TABLE "resume_assessments" ADD COLUMN "details" jsonb DEFAULT '{}'::jsonb NOT NULL`, three FKs and one
  index. `resume_versions.base_version_id` is a self-reference.
- [ ] **Step 2: Verify.**
  - Run `npm run typecheck`. Expected: clean.
  - Run `docker compose up -d --build app`. Then run
    `docker exec jobops-postgres-1 psql -U jobops -d jobops -c "\d resume_versions"`. Expected: the three new columns.
- [ ] **Step 3: Commit**: `JOB_FINDER-9999: Store tailoring target and tool details for résumé versions`.

### Task 3: Tool details schemas and panel derivations (pure)

**Files:**
- Create: `src/features/resumes/fit/tools.ts`, holding zod schemas and the tool registry.
- Create: `src/features/resumes/fit/derive.ts`, holding pure derivations for the panel.
- Test: `tests/resume-fit-derive.test.ts`.

**Interfaces:**
- Produces in `tools.ts`:
  - `TOOL_SOURCES = ["jobops-lexical","resumenext","resume-ats-optimizer"] as const`.
  - `type ToolSource`.
  - `toolDetailsSchema: Record<ToolSource, z.ZodType>`. These match the spec's `details` shapes exactly:
    - lexical `requirements[].note?`;
    - lexical `findings[].resume_evidence[].context`;
    - resumenext `issues[].decision?`.
  - `isToolSource(s: string): s is ToolSource`.
  - `type LexicalDetails`, `type ResumeNextDetails` and `type OptimizerDetails`, each the `z.infer` of its schema.
  - `TOOL_META: Record<ToolSource, { name: string; by: string; method: string }>`. The names are "Keyword check",
    "ResumeNext" and "ATS optimizer". Copy the `by` and `method` strings from `TOOLS` in
    `src/features/resume-fit-gallery/demos.tsx`.
- Produces in `derive.ts`:
  - `type ToolRow = { versionId: string; snapshotId: string; source: ToolSource; score: number | null; method: string; details: unknown; createdAt: Date }`.
  - `type ParsedRow = ToolRow & { parsed: LexicalDetails | ResumeNextDetails | OptimizerDetails }`.
  - `parseToolRow(row: { source: string; details: unknown } & Omit<ToolRow,"source"|"details">): ParsedRow | null`.
    Returns null unless `isToolSource` holds and the details parse.
  - `latestBySource(rows: ParsedRow[], versionId: string, snapshotId: string): Partial<Record<ToolSource, ParsedRow>>`.
  - `summarizeTool(source: ToolSource, mine?: ParsedRow, base?: ParsedRow): { score: number | null; baseScore: number | null; delta: number | null; breakdown: { label: string; mine: number | null; base: number | null; target?: number }[] } | { notChecked: true }`.
    - The lexical breakdown is required, preferred and all-terms coverage.
    - The ResumeNext breakdown is its categories as `"{label} ({points}/{max})"` with percent values.
    - The optimizer breakdown is "Required keywords" with `target: 80`.
  - `deriveChips(mine: LexicalDetails, base?: LexicalDetails, optimizer?: OptimizerDetails): { term: string; importance: "required"|"preferred"; closeness: "exact"|"close"|"unclear"|"missing"; isNew: boolean; quote: string; evidence: string[]; note?: string; where?: { count: number; places: string[] } }[]`.
    - Closeness rules are as the spec states.
    - `evidence` is up to two `context` strings.
    - `where` comes from `optimizer.keywords`, matched by `term`. It is undefined when the optimizer row is absent
      or reports `found: 0`.

- [ ] **Step 1: Write failing tests** in `tests/resume-fit-derive.test.ts`:
  - `parseToolRow ignores a manual row named like a tool`: `{source:"resumenext", details:{}}` gives `null`.
  - `parseToolRow ignores non-tool sources`: `{source:"Claude estimate", details:{…valid lexical…}}` gives `null`.
  - `latestBySource picks the newest row per tool`: two lexical rows. Expect the later `createdAt` one.
  - `summarizeTool without a base row`: the score comes from mine, `baseScore` is null and `delta` is null.
  - `summarizeTool notChecked`: no mine row gives `{ notChecked: true }`.
  - `deriveChips closeness`, from one fixture with four findings:
    - `mentioned` with evidence text equal to the term, case-insensitive, gives "exact";
    - `mentioned` through an alias only gives "close";
    - `unclear` gives "unclear";
    - `not_evidenced` gives "missing".
  - `deriveChips isNew`: base `not_evidenced` and mine `mentioned` gives `isNew: true`. No base gives `isNew: false`.
  - `deriveChips note`: a requirement `note` is carried onto its missing chip. With no note the chip has none.
- [ ] **Step 2: Run `npx vitest run tests/resume-fit-derive.test.ts`.** Expected: FAIL, module not found.
- [ ] **Step 3: Implement** both modules with the signatures above.
- [ ] **Step 4: Run the test.** Expected: PASS.
- [ ] **Step 5: Commit**: `JOB_FINDER-9999: Validate recorded résumé tool checks and derive fit summaries`.

### Task 4: Tracked changes between two résumé texts (pure)

**Files:**
- Create: `src/features/resumes/fit/diff.ts`.
- Test: `tests/resume-fit-diff.test.ts`.

**Interfaces:**
- Produces:
  - `splitSections(text: string): { name: string; units: string[] }[]`.
    - Section names come from the all-caps ruled headings (`PROFESSIONAL SUMMARY`, `CORE SKILLS`,
      `PROFESSIONAL EXPERIENCE`, `EDUCATION`, …).
    - The experience section splits further into one section per employer line.
    - The title line, the second line of the text, is its own section, "Title line".
    - Units are bullets (`•`-prefixed, with wrapped continuation lines joined) or paragraphs or skill rows.
  - `diffResumes(base: string, mine: string): { sections: { name: string; changes: Change[] }[]; counts: Record<Change["kind"], number>; factsUnchanged: boolean }`.
    - `Change` is the same type as in `src/features/resume-fit-gallery/types.ts`. Move it into this module.
    - Units are matched by similarity ≥ 0.6, using the token-set Dice coefficient. A matched unit is "reworded"
      when its text differs and "moved" when its index differs. Unmatched units are "added" or "dropped".
  - `wordDiff(before: string, after: string): { op: "same"|"ins"|"del"; text: string }[]`. This is a word-level
    LCS. Move the algorithm from `InlineDiff` in the gallery's `demos.tsx`.
  - `factsUnchanged` is false when the multiset of tokens matching
    `/\d[\d.,%$+]*|\b(January|February|March|April|May|June|July|August|September|October|November|December)\b/`
    differs between the two texts.

- [ ] **Step 1: Write failing tests** in `tests/resume-fit-diff.test.ts`. Use synthetic two-employer résumé texts
  in the extracted format, with `•` bullets and wrapped lines.
  - `a reworded bullet is one reworded change`: one bullet edited by adding a word.
  - `a moved bullet reports from and to`: two bullets swapped.
  - `a dropped bullet`: one bullet removed.
  - `wrapped lines join into one unit`: a bullet split over two lines matches its unwrapped twin, with no change.
  - `factsUnchanged false when a digit changes`: change "72%" to "75%". Assert `factsUnchanged === false`.
  - `factsUnchanged true for rewording only`.
- [ ] **Step 2: Run `npx vitest run tests/resume-fit-diff.test.ts`.** Expected: FAIL.
- [ ] **Step 3: Implement `diff.ts`.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit**: `JOB_FINDER-9999: Compute tracked changes between résumé versions`.

### Task 5: Record and read fit through the local API

**Files:**
- Create: `src/features/resumes/fit/service.ts`.
- Create: `src/app/api/v1/resumes/[versionId]/fit/route.ts`.
- Test: `tests/resume-fit.integration.test.ts`.

**Interfaces:**
- Consumes:
  - `importJobRows` (Task 1 key behaviour);
  - `toolDetailsSchema` and `parseToolRow`/`latestBySource` (Task 3);
  - the schema columns (Task 2).
- Produces:
  - `fitInputSchema`: zod for the spec's POST body, with `target.reqId` mapped to `externalId` and
    `target.description` max 100000.
  - `recordFit(versionId: string, input: z.infer<typeof fitInputSchema>, now = new Date()): Promise<{ versionId: string; jobId: string; snapshotId: string; recorded: number }>`.
  - `getFit(versionId: string): Promise<Fit | null>`, where
    `Fit = { versionId; baseVersionId: string | null; target: { jobId; company; title; location; url; reqId: string | null; postedAt: string | null; postedAtKind: string | null } | null; snapshot: { id; capturedAt: Date; description: string } | null; mine: Partial<Record<ToolSource, ParsedRow>>; base: Partial<Record<ToolSource, ParsedRow>>; derivedFrom: { id: string; label: string }[] }`.
    `derivedFrom` lists the versions whose `baseVersionId` is this one.
- Route behaviour:
  - `POST` uses `readJson`, then `recordFit`, then `revalidatePath("/resumes")`, and returns 201.
  - `GET` returns `getFit` or 404 `{ error: "Unknown résumé file." }`.
  - Errors go through `apiError`. Raise `ApiError(message, status)` for the refusals:
    - 404 for an unknown version;
    - 409 when the base is in another family or equals the version;
    - 409 for a different target job, with "This file is already tailored for {company} · {title}";
    - 422 when the version's `parsingStatus` is not `COMPLETED`;
    - 422 for an assessment `versionId` that is neither the version nor its base;
    - 413 for a body over 1 MB, checked against `content-length` and the read length.
  - `recordFit` runs in one transaction:
    - import the job with `strategy: "merge"`, `source: "AGENT_FIT"`, the description and the posted fields;
    - take the latest snapshot for that job;
    - update the version's three columns;
    - insert the assessments with `assessedAt` set to the India day of `now`;
    - write the activity log `RESUME_FIT_RECORDED`.

- [ ] **Step 1: Write failing tests** in `tests/resume-fit.integration.test.ts`, following the setup and cleanup
  pattern of `tests/agent-record.integration.test.ts`. Create a résumé family with two versions by inserting rows
  directly, with `parsingStatus` COMPLETED and synthetic text.
  - `records target, snapshot and assessments for both versions`: POST one lexical row each for mine and base.
    `getFit` returns the target company, the snapshot description and `mine["jobops-lexical"].score` /
    `base["jobops-lexical"].score`.
  - `re-recording the same target appends and keeps the latest`: post twice with different scores. `getFit` shows
    the second.
  - `refuses a different target with 409 and the exact message`.
  - `refuses a base from another family (409) and an assessment for a third version (422)`.
  - `refuses an unparsed version (422)`.
  - `stores a 100000-character description whole`.
  - `two Walmart-like targets on two files stay two jobs`: same title and location, different reqId and URL.
- [ ] **Step 2: Run `npm run test:db -- tests/resume-fit.integration.test.ts`.** Expected: FAIL.
- [ ] **Step 3: Implement the service and route.**
- [ ] **Step 4: Run it.** Expected: PASS. Also run `npm run typecheck && npm run lint`.
- [ ] **Step 5: Commit**: `JOB_FINDER-9999: Record résumé fit through a local agent API`.

### Task 6: Fit panel on the résumé page

**Files:**
- Create: `src/features/resumes/fit/panel.tsx`, the server component composing the sections.
- Create: `src/features/resumes/fit/job-bar.tsx` (client).
- Create: `src/features/resumes/fit/scores.tsx` (client, tabs).
- Create: `src/features/resumes/fit/chips.tsx` (client).
- Create: `src/features/resumes/fit/checks.tsx` (server).
- Create: `src/features/resumes/fit/changes.tsx` (server).
- Modify: `src/app/resumes/page.tsx:181-232`.
  - Widen the inspector column from `288px` to `360px`.
  - Render `<FitPanel versionId={version.id} />` above `UsedFor`.
  - Move `UsedFor` into a collapsed `DetailSection` titled "Used for".
  - Filter `Assessments` to non-tool rows with `!isToolSource(assessment.source)`.
- Modify: `src/features/resumes/assessment.ts`. `assessmentInput.source` refuses `TOOL_SOURCES`, case-insensitive,
  with "This name is reserved for recorded tool checks."
- Test: `tests/resume-fit-render.test.ts` and `tests/e2e/resumes.spec.ts`.

**Interfaces:**
- Consumes: `getFit` (Task 5), `summarizeTool`/`deriveChips` (Task 3) and `diffResumes`/`wordDiff` (Task 4).
- Each section takes plain props derived from `Fit`, so the render tests need no database:
  - `JobBar({ target, snapshot })`;
  - `Scores({ tools: Record<ToolSource, ReturnType<typeof summarizeTool>> })`;
  - `Chips({ chips })`;
  - `ToolChecks({ mine })`;
  - `TrackedChanges({ diff })`.
- The markup and behaviour follow the approved gallery options exactly:
  - JobDemo B;
  - ScoresDemo C, its breakdown coming from `summarizeTool`;
  - KeywordsDemo B, with an amber "unclear" chip and the detail text "The tool couldn't tell";
  - ChangesDemo B, built on `diffResumes`, with "Dates, titles and numbers unchanged" shown only when
    `factsUnchanged`;
  - AdviceDemo B, with a recorded `decision` rendered as "Not changing: …" and wrapped-line parser notes collapsed
    into "{n} parser notes on wrapped lines";
  - PanelDemo B.
- No target: render "Not tailored for a job". When `derivedFrom` is non-empty, add
  "{n} tailored files were made from this one" with links to `/resumes?file=<id>`.

- [ ] **Step 1: Write failing render tests** in `tests/resume-fit-render.test.ts`, using `renderToStaticMarkup` as
  in `tests/edit-tag-render.test.ts`:
  - `job bar shows company, title and the posted line with latest publication`.
  - `scores show Not checked yet for a missing tool and the diagnostics line once`.
  - `chips mark new terms with a plus and missing ones dashed`.
  - `missing chip without a note says only Not on this résumé`.
  - `changes header omits the unchanged claim when facts changed`.
  - `no target renders Not tailored for a job and derived links`.
- [ ] **Step 2: Run `npx vitest run tests/resume-fit-render.test.ts`.** Expected: FAIL.
- [ ] **Step 3: Implement the components and the page changes.**
- [ ] **Step 4: Run the render tests.** Expected: PASS. Then extend `tests/e2e/resumes.spec.ts` with
  `a tailored file shows its fit panel`. It uploads two PDFs and POSTs `/api/v1/resumes/{id}/fit` with a synthetic
  target and three tool rows, then:
  - opens `/resumes?file=<id>`;
  - expands the job bar and sees "Open the live posting";
  - switches the ResumeNext tab and sees its number;
  - clicks a chip and sees the quote;
  - opens "What changed".

  Then run `npm run test:e2e -- tests/e2e/resumes.spec.ts`. Expected: PASS.
- [ ] **Step 5: Rebuild Docker and look.** Run `docker compose up -d --build app` and open `/resumes` in both
  themes and at 390px width. Check the six states: full, missing tool, no base row, no target, master with derived
  files, and a long JD.
- [ ] **Step 6: Commit**: `JOB_FINDER-9999: Show résumé fit beside each tailored file`.

### Task 7: Backfill the eight tailored files, retire the gallery, record the approval

**Files:**
- Create in the session scratchpad (not committed): `resume-build/backfill_fit.py`.
- Delete: `src/app/gallery/resume-fit/` and `src/features/resume-fit-gallery/`.
- Modify: the repository `AGENTS.md` product scope, adding one line for the approved fit panel with picks and a
  spec link.

**Interfaces:**
- Consumes: `POST /api/v1/resumes/{id}/fit` (Task 5).

- [ ] **Step 1: Write `backfill_fit.py`.** For each of the eight slugs, take the current version id from
  `tailor/<slug>.upload.json` and the base `6bd6cf2e-ab43-4880-8c6a-67699da97b0f`. Then:
  - Set the description to the JD text without the `SOURCE:`/`POSTED:` lines.
  - Re-run the local scorer (`POST /v1/assessments/pdf` on 127.0.0.1:3212) for the master PDF and the tailored
    PDF with the stored description and `requirements`.
  - Build each finding's `context` from the returned `resume_text`.
  - Add `note: "Left out: no experience to back it"` to requirements that are `not_evidenced` on the tailored file.
  - Re-run the ATS optimizer rubric (`checks.py:ats_optimizer`) on both texts.
  - Reuse the ResumeNext results from `tailor/<slug>.checks.json`. Attach `decision` notes:
    - "Job description keywords": generic posting words.
    - "Work experience": wrapped lines read as extra jobs.
    - "Action verbs": present tense kept per the 3 Oct choice.
  - POST six assessments per file: three tools, for mine and for the base.
  - For the six superseded v1 files, POST only the target and base, with an empty `assessments` array.
- [ ] **Step 2: Run it.** Expected: eight 201 responses with `recorded: 6` and six with `recorded: 0`. Open
  `/resumes?file=<Walmart R-2694949 id>` and confirm the panel matches the checks.
- [ ] **Step 3: Delete the gallery files** and add the AGENTS.md line. Run
  `npm run typecheck && npm run lint && npx vitest run`. Expected: all clean. Rebuild Docker.
- [ ] **Step 4: Commit**: `JOB_FINDER-9999: Retire the résumé fit gallery and record the approved panel`.
