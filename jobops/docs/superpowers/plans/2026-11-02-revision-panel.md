# Revision Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the résumé fit panel's tool tabs, chips and per-tool checks with score dials, a must-haves table,
a ResumeNext issue triage and the agent brief, and serve that brief from the fit API.

**Architecture:** Pure derivations (`brief.ts`, `must-haves.ts`, `issues.ts`) over the existing `FitGroup`; `getFit`
attaches a brief per group; server components render the new sections; one client component copies the brief.
A nullable `docx_path` on `resume_versions` feeds `startFrom.docxPath`.

**Tech Stack:** Next.js App Router, TypeScript, Drizzle/PostgreSQL, Tailwind 4 tokens, Vitest.

**Spec:** `jobops/docs/superpowers/specs/2026-11-02-revision-panel-design.md`

## Global Constraints

- UI copy says "current résumé"/"current" and "revised", never "master". Code identifiers (`base*`) stay.
- Bands: under 50 `danger-action`, 50–79 `warning`, 80 and up `success`, same for all tools.
- No term matching in Next.js; everything derives from recorded rows.
- Every score keeps "Tool diagnostics, not an employer's ATS" once in the panel.
- Theme tokens only; no palette literals.
- Commit key `JOB_FINDER-9999`, no conventional prefixes, Claude co-author footer.

## Review Focus

- A file with only some tools recorded: dials show "—"/"Not checked yet", table falls back without sections, brief
  scores `null`. Tests in Tasks 2 and 4.
- A master scored against a job (no base): brief `startFrom` is the file, `revision` null, dials hide "Current".
  Test in Task 2.
- `unclear` findings: table state "Unclear"/"Ask", included in `askUserFirst` with `status: "unclear"`. Task 2.
- Wrapped-line ResumeNext labels ("Experience — …") without a decision land in keep-as-is with the fixed reason.
  Task 2.
- A re-score of ResumeNext after decisions were recorded keeps them (label match, case-insensitive). Task 3.

---

### Task 1: Editable DOCX path

**Files:** `drizzle/0019_resume_docx_path.sql` (+ meta journal via `drizzle-kit generate`), `src/db/schema.ts`,
`src/features/resumes/fit/service.ts`, `src/features/resumes/service.ts`, `src/features/resumes/actions.ts`,
`src/features/resumes/upload-drawer.tsx`, `src/features/applications/agent-record.ts`, tests
`tests/resume-docx-path.test.ts`, `tests/resume-fit.integration.test.ts`.

**Produces:** `resumeVersions.docxPath: string | null`; `docxPathSchema` (zod: trimmed, absolute `/…`, ends `.docx`,
≤1000 chars) exported from `fit/service.ts`; `fitInputSchema` accepts optional `docxPath`; `recordFit` sets it on the
posted version; `uploadResumeVersion({… docxPath?: string | null})`; `listResumeFiles()` rows include `docxPath`.

- [ ] Test: `docxPathSchema` accepts `/Users/x/Resume.docx`, refuses `Resume.docx`, `/x/Resume.pdf`, `""`;
  `fitInputSchema` parses a body with `docxPath` and with none.
- [ ] Run, see it fail; add column + migration, schema, recordFit update, upload field ("Editable DOCX path",
  optional, `name="docxPath"`), list rows.
- [ ] Integration (db): POST fit with `docxPath` stores it on the version.
- [ ] `npm run typecheck && npx vitest run tests/resume-docx-path.test.ts` pass; commit
  "JOB_FINDER-9999: Record where each résumé version's editable DOCX lives".

### Task 2: Derivations and the brief in the fit API

**Files:** create `src/features/resumes/fit/issues.ts`, `fit/must-haves.ts`, `fit/brief.ts`; modify
`fit/service.ts`; test `tests/resume-brief.test.ts`.

**Produces:**
- `splitIssues(issues: ResumeNextDetails["issues"]): { fix: Issue[]; keep: (Issue & { reason: string })[] }` —
  decision present → keep with that reason; label starts with "Experience —" → keep with reason
  "ResumeNext read a wrapped bullet line as a separate job"; else fix.
- `type MustHaveState = "shown" | "add-bullet" | "elsewhere" | "unclear" | "missing"`;
  `mustHaveRows(group: FitGroup): { term: string; state: MustHaveState; where: Where | null }[]` from the lexical
  findings (required only) joined to optimizer `keywords` by lower-cased term; sorted shown/add-bullet first, then
  elsewhere, unclear, missing.
- `type FileRef = { versionId: string; label: string; docxPath: string | null }`;
  `buildBrief(group: FitGroup, files: { revised: FileRef; current: FileRef | null }): Brief | null` with the spec's
  exact shape and seven rule strings (`BRIEF_RULES`). No base → `startFrom = revised`, `revision = null`.
- `FitGroup.brief: Brief | null`, `Fit.brief: Brief | null` (tailored group's), `Fit.docxPath`.

- [ ] Tests: split (decision, wrapped, plain); rows (each state incl. unclear, optimizer missing → `where: null`);
  brief (askUserFirst has missing+unclear without notes, must-haves first, `status`; keepOut carries note as reason;
  addExperienceBullet; scores with current null when no base row; no-base file; `job.target` equals snapshot fields;
  null without a lexical row; `rules` equals `BRIEF_RULES`).
- [ ] Implement; wire into `fitGroups`/`getFit` (load revised + base labels/docx paths once).
- [ ] `npx vitest run tests/resume-brief.test.ts tests/resume-fit-derive.test.ts` pass; commit
  "JOB_FINDER-9999: Serve an agent brief with each fit".

### Task 3: Keep ResumeNext decisions across re-scores

**Files:** `src/features/resumes/score/map.ts`, `score/run.ts`; test `tests/resume-score-map.test.ts`.

**Produces:** `carryDecisions(previous: ResumeNextDetails | undefined, next: ResumeNextDetails): ResumeNextDetails`
(copies `decision` by case-insensitive label when `next` has none); `runTool` resumenext branch reads that version's
latest ResumeNext row for the snapshot.

- [ ] Test: decision copied by label ignoring case; existing decision in `next` wins; unmatched labels untouched.
- [ ] Implement, pass, commit "JOB_FINDER-9999: Keep set-aside ResumeNext issues set aside after a re-score".

### Task 4: The new panel

**Files:** create `fit/dials.tsx`, `fit/must-haves-view.tsx`, `fit/issues-view.tsx`, `fit/brief-view.tsx` (client,
copy); modify `fit/panel.tsx`, `fit/bits.tsx` (drop `ScaleBar`/`Highlight` if unused); delete `fit/scores.tsx`,
`fit/checks.tsx`, `fit/chips.tsx` and `derive.ts` chip code if unused; update `tests/resume-fit-render.test.ts`.

**Consumes:** Task 2's `mustHaveRows`, `splitIssues`, `Brief`. Dials take `{ tools: Record<ToolSource, ToolSummary>,
captions }`; `summarizeTool` stays.

- [ ] Render tests: dial shows rounded score, "of 100", band class (`text-warning` for 54), "Current 46.2", "Not
  checked yet" for a missing tool, band legend and diagnostics line once; no "Current" for a no-base file; table
  shows "Add a bullet", "Missing", "Unclear"/"Ask", the no-optimizer line; issues show Worth fixing / Checked and
  left as is with reasons; brief section shows JSON with `askUserFirst`; no "master" anywhere in the panel HTML.
- [ ] Implement from the gallery reference (`GlanceDemo` band mode, `WhereTable withNext`, `IssueTriage`,
  `BriefBox`); formatting checks fold under the table; DOCX path line in the job area when set.
- [ ] `npx vitest run tests/resume-fit-render.test.ts` pass; commit "JOB_FINDER-9999: Show the revision panel".

### Task 5: Copy, gallery retirement, approval record

**Files:** `fit/changes.tsx`, `fit/compare.tsx`, `score/ui/run-rows.tsx` copy; delete `src/app/gallery/` and
`src/features/score-analytics-gallery/`; root `AGENTS.md` product scope.

- [ ] Replace user-facing "master" strings; update any tests asserting old copy.
- [ ] Remove gallery; add the AGENTS.md note (picks, supersedes, brief, DOCX path, score-first rule, spec link).
- [ ] Commit "JOB_FINDER-9999: Say current résumé, retire the score analytics gallery and record the approval".

### Task 6: Verify and merge

- [ ] `npm run lint && npm run typecheck && npm test` and `npm run test:db`; Docker rebuild with migration; browser
  check of `/resumes?file=<tailored id>` and `GET /api/v1/resumes/<id>/fit` `.brief`.
- [ ] `git checkout main && git merge --no-ff revision-panel`.
