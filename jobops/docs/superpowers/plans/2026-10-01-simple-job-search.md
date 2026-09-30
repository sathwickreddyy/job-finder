# Simple Job Search Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement the approved Option A task by task. The user has requested autonomous execution and frequent commits.

**Goal:** Replace the task-centric interface with useful, persistent pages for finding Indian openings, using existing resume files and tracking applications or outreach.

**Architecture:** Keep the existing Next.js/Drizzle/PostgreSQL application and private PDF storage. Extract the approved spacious gallery components into shared components. Reuse job snapshots, profiles, application events and mail refresh; add resume change notes and sourced assessments against immutable description snapshots.

**Tech Stack:** Next.js 16, React 19, Tailwind CSS 4, Drizzle, PostgreSQL, Zod, Vitest and Playwright.

**Spec:** `docs/superpowers/specs/2026-10-01-simple-job-search-design.md`; Option A approved on 2026-10-01.

## Global Constraints

- Google blue controls, neutral surfaces, shared Tailwind tokens and spacious icon cards.
- India-focused sources, INR/LPA terminology and Asia/Kolkata dates.
- Full editable prompts on activity pages; one obvious next action.
- No agent access, progress, proposals or workflow approval controls in the main experience.
- No invented job activity, profile analytics or ATS scores. Preserve originals and historical records.
- Test database/uploads remain isolated. Never seed or drop the user's database.
- Commits use `JOB_FINDER-9999` and the Codex co-author footer.

## Review Focus

- A sent referral must not inflate direct-application counts or fabricate submission.
- An assessment must remain attached to its exact file and description snapshot after later uploads/edits.
- A malformed PDF must never replace a good original; downloads must preserve bytes.
- Reloading after a saved form must retain its changes; error/pending states must be visible.
- Empty records, long text and small screens must stay usable without sample data.

### Task 1: Home, navigation and discovery

**Files:** shared prompt/card/chart components, `features/workspace/`, `/`, `/find`, `/my-profile`, app shell, prompt tests.

**Interfaces:** Produce `PromptPanel({prompt, compact?})`, `CopyButton({text,label?})`, `searchPrompt(role,location,context)`, shared site cards and real-data home. Keep preview routes independent.

- [ ] Write prompt tests that verify selected resume/file context can be included and no API/progress instructions appear; run them before adding the context support.
- [ ] Extract shared controls, retain Option A layout, build the real Home and Find pages, and simplify the profile page to actual links/preferences.
- [ ] Verify clipboard contents, mobile layout and form persistence, then commit this unit.

### Task 2: Jobs, application and outreach records

**Files:** `/jobs`, `/jobs/new`, `/jobs/[id]`, `/applications`, `/applications/new`, `/applications/[id]`, `/outreach`, application record actions/domain and tests.

**Interfaces:** Existing `importJobRows()` saves job descriptions. New `recordIntent({method,sent})` distinguishes direct submission from outreach; records write existing applications/events and retain the exact resume version.

- [ ] Add failing domain tests: `recordIntent({method:"REFERRAL",sent:true}).applied === false` and direct sent is true. Run them and confirm failure.
- [ ] Implement direct pages with restrained forms, full descriptions/prompts and explicit record-keeping. Persist sent dates and source/channel in application events.
- [ ] Remove task/proposal links from main destinations, redirect obsolete task entry points and disable the unused task API entry points without dropping historical data.
- [ ] Run domain tests and browser job/application/outreach flows; commit.

### Task 3: Resume files, change notes and assessments

**Files:** schema/migration, resume domain/actions/service, `/resumes`, `/resumes/[id]`, `/resume-prompt`, tests.

**Interfaces:** A `changeNotes` string belongs to a file version. `resumeAssessments` relates a version to one immutable `jobSnapshots` row, with source, date, method, nullable 0–100 score and findings. Preserve original file storage and version IDs.

- [ ] Write assessment validation tests for no score, zero, out-of-range score, missing source/method and invalid dates. Run before implementation.
- [ ] Add an additive migration only; upload original/revised files in straightforward forms. Show file, bullet changes, company/role usage and sourced assessments.
- [ ] Keep keyword coverage separate from ATS estimates and visibly label older description assessments.
- [ ] Verify byte-preserving downloads, version switching and assessment persistence in the isolated browser database; commit.

### Task 4: Verification and walkthrough

**Files:** browser tests, README, verification notes and approved spec status.

- [ ] Replace tests for removed task UI with the new end-to-end journey; retain meaningful PDF/import/mail/security coverage.
- [ ] Run unit suite, browser suite, lint, TypeScript, formatting and a production build.
- [ ] Get a fresh review of the whole change, address material findings and verify them.
- [ ] Document the real search → description → resume → application/referral workflow, commit and give the user the step-by-step starting guide.

## Execution ledger

- The approved gallery is the design authority. No additional design gate is needed.
- Implementation uses a clean `codex/simple-job-search` branch in the existing workspace so the user's running localhost preview updates directly.

- Task 1 complete: shared controls, Home, discovery and persistent profile preferences. Prompt tests 2/2 and isolated browser flows 2/2 passed; lint and TypeScript passed.

- Task 2 complete: saved descriptions, direct application/outreach prompts and records, frozen submitted resume links, retired task/mission UI and agent entry points. Intent tests 3/3 and isolated browser flows 2/2 passed; lint and TypeScript passed.

- Task 3 complete: additive migration applied, original/revised PDF viewer, version notes, company/role usage and sourced snapshot-specific assessments. Validation tests 4/4 and isolated PDF/assessment flows 2/2 passed; original bytes and stale-assessment behavior verified.
