# Résumé fit panel

Approved from the live gallery at `/gallery/resume-fit` on 2026-11-02. Picks:
- **Job:** B, one tonal bar.
- **Scores:** C, one tool at a time.
- **Matches:** B, coloured chips.
- **Changes:** B, tracked changes.
- **Suggestions:** B, every check by tool.
- **Panel:** B, one scroll.

## Why

The user tailors one résumé file per opening and needs to see, before pressing Submit, how that exact file fits the
exact job description it was made for. Today the right-hand panel on `/resumes?file=<id>` shows only "Used for",
"Bullet changes" and a manual "Assessments" form, so tailored files look identical to the master and the scores
live in an assistant's scratchpad.

The panel also has to make the **Résumé rewrite rule** (AGENTS.md, 2026-11-02) visible. Every tailored file is
checked by three tools against the saved job description, side by side with the master it came from. The panel
shows when a check is missing instead of hiding the gap.

## Goals

- For a tailored file, show the following:
  - which job it is for, with a link to the live posting and the exact saved description the scores used;
  - each tool's score next to the master's score;
  - which job terms match and how closely, with the job's wording beside the résumé line;
  - what changed from the master as tracked changes;
  - every check each tool reported.
- Store fit data in JobOps: the target job, the saved description, the base version and the per-tool results.
  It belongs to that version and survives restarts and new uploads.
- Let the agent record fit data through a local API, the same LAN-trusted pattern as `POST /api/v1/applications`.
- Backfill the eight tailored files uploaded on 2026-11-02 so the panel is useful on day one.

## Non-goals (v1)

- JobOps does not run the tools itself. There is no "Run checks" button. The agent runs the checks and records the
  results, as with applications. *My call; a server-side re-run is a later follow-up.*
- No editing of the résumé or of the scores in the UI.
- No change to how applications record their résumé file. A sent application keeps its exact file.

## Anti-goals

- Presenting any score as an employer ATS result. Every score is labelled with its tool, and the panel says once
  "Tool diagnostics, not an employer's ATS".
- Implying that a missing term should be added. A missing term is shown as "Not on résumé". The detail shows the
  recorded reason when there is one, and otherwise only "Not on this résumé".
- A missing tool silently disappearing. It shows "Not checked yet", and the panel notes that the rewrite rule
  needs all three checks.
- Generic SaaS cards, dials, gradients or a new colour palette. Use the existing Material 3 tokens. Follow the gallery
  components exactly.

## Data

One migration, `0017`, adds the following.

`resume_versions`, all nullable:
- `base_version_id uuid` references `resume_versions.id` on delete restrict. The version this file was tailored from.
- `target_job_id uuid` references `jobs.id` on delete restrict.
- `target_snapshot_id uuid` references `job_snapshots.id` on delete restrict. The exact saved description used for
  tailoring and scoring.

`resume_assessments`:
- `details jsonb not null default '{}'`. Holds the tool's structured result.
- The existing `findings` text stays as the human summary.
- Index on `(version_id, snapshot_id, source)`.

The tool is identified by `source`, which must be one of these values:
- `jobops-lexical`: the local `resume-scoring` service.
- `resumenext`: ResumeNext `match_resume_to_job`.
- `resume-ats-optimizer`: the skill's rubric.

`method` holds the tool or engine version string. `score` holds each tool's headline:
- jobops-lexical: weighted coverage.
- ResumeNext: `ats_score`.
- resume-ats-optimizer: required-keyword match.

New rows are appended. The panel reads the **latest row per (version, snapshot, source)**, so history is kept.

The base version is scored against the **same snapshot**. Those rows are stored under the base version's id. That
is how "master" comparisons are found: base version + target snapshot + source.

`details` shapes, validated with zod at the API:
- `jobops-lexical`:
  - `{ keyword, required, preferred, weighted }` numbers or null.
  - `requirements: [{ term, aliases[], importance: "required"|"preferred", jd_quote }]`. These are the reviewed
    requirements that were scored.
  - `findings: [{ term, aliases[], importance, status: "mentioned"|"not_evidenced"|"unclear",
    resume_evidence: [{ start, end, text, context }] }]`. These are the service's findings as returned, plus
    `context`.
  - `engineVersion`.
- `resumenext`: `{ ats_score, grade, grade_label, categories[], issues[], keyword_coverage, keywords[], resume }`, as the
  tool returns them. `issues[]` items may carry an optional `decision` string, the agent's "not changing because…"
  note.
- `resume-ats-optimizer`: `{ match_score, target: 80, format: [{ check, ok, warn?, detail }], keywords: [{ term,
  importance, found, where: { summary, skills, experience } }], method }`.

The jobops AGENTS.md keeps all matching and evidence extraction inside the separate scoring service, so Next.js
does **no** term matching. The chips come only from the recorded jobops-lexical `findings`. Each finding is the
scoring service's own output: `term`, `aliases`, `importance`, `status`, `resume_evidence: [{ start, end, text }]`.
When recording, the agent adds `context`, the résumé bullet or paragraph around each evidence offset. It slices
that from the service's returned `resume_text`, with wrapped lines joined and section headings and skill-row labels
dropped.

Closeness is a display comparison of the recorded evidence:
- **exact**: `status` is `mentioned` and some evidence `text` equals the term, case-insensitive.
- **close**: `mentioned` through an alias only.
- **unclear**: `unclear`. Shown amber with "The tool couldn't tell".
- **missing**: `not_evidenced`.

"New in this version" means the base version's finding for the same snapshot is `not_evidenced` and this one is
`mentioned`.

### Separate jobs for openings that share a title (my call)

Walmart R-2694949 and R-2655406 have the same company, title and location. Today the importer's
`company/title/location` dedupe key (`jobs_dedupe_idx`, unique) would merge them into one job, and
`POST /api/v1/applications` would report the second one as a duplicate.

The fix: `jobDedupeKey` includes the normalised `externalId`, which is the requisition id, whenever one is
provided. The same migration recomputes `dedupe_key` for existing rows that have an `externalId`. Matching by
canonical URL is unchanged, so reposts of the same URL still merge. The fit route passes `reqId` as `externalId`.

This fixes applications too. Test both cases:
- two jobs with the same title and different req ids stay separate;
- the same URL still merges.

### Tool rows and manual assessments (my call)

- No database check on `source`.
- The panel reads only rows whose `source` is one of the three tool names and whose `details` parse with that
  tool's zod schema. Anything else is ignored by the panel.
- The manual **Assessments** section lists only rows that are not tool rows. Its form refuses the three reserved
  source names with "This name is reserved for recorded tool checks."
- The master therefore never lists 24 tool rows.

### Why a term is missing (my call)

- Each jobops-lexical `requirements[]` item may carry an optional `note`, for example "Left out: no experience to
  back it". This is how deliberately unclaimed gaps are saved with the version, as the rewrite rule requires.
- When there is no note, the chip detail says only "Not on this résumé". It never claims a reason that was not
  recorded.

### Re-recording (my call)

- A later POST for the same version and the same target job appends assessments. It also moves the target
  snapshot when the description changed.
- A POST with a different target job or a different base refuses with 409, "This file is already tailored for
  {company} · {title}". A file is made for one job.

## API (local agent route, LAN-trusted like `/api/v1/companies`)

`POST /api/v1/resumes/{versionId}/fit`. It is record-only.

```json
{
  "baseVersionId": "uuid",
  "target": { "url": "https://…", "company": "…", "title": "…", "location": "…", "reqId": "…",
              "postedAt": "YYYY-MM-DD", "postedAtKind": "original|latest_publication",
              "postedAtSourceUrl": "https://…", "description": "full saved JD text" },
  "assessments": [
    { "versionId": "uuid (this version or the base)", "source": "jobops-lexical|resumenext|resume-ats-optimizer",
      "method": "…", "score": 0-100|null, "findings": "short human summary", "details": { } }
  ]
}
```

What the route does:
- It upserts the job through the existing jobs import service by URL. It saves a new snapshot only when the
  description changed, as the importer already does.
- It sets `base_version_id`, `target_job_id` and `target_snapshot_id` on the version.
- It appends the assessments against that snapshot.
- It returns `{ versionId, jobId, snapshotId, recorded }`.

Refusals:
- 404 for an unknown version.
- 409 when `baseVersionId` belongs to a different résumé family or equals `versionId`.
- 422 for a non-PDF-parsed version or any assessment `versionId` other than this version or its base.
- 400 with the issue list for an invalid payload, as on every other agent route.
- No auth beyond the existing LAN trust.

`GET /api/v1/resumes/{versionId}/fit` returns the same structure the panel renders: target, snapshot description,
latest assessments for both versions, and derived chips. It exists for agents and tests.

`GET /api/v1/resumes` keeps its shape. Add `targetCompany`/`targetTitle` per file only if trivial.

## Panel (right column of `/resumes?file=<id>`, layout B "one scroll")

The order is top to bottom. Widths and spacing follow the gallery at the current inspector width.

1. **Job bar (B).** A tonal pill (`bg-selected`) with "{company} · {title}" and "Posted {d MMM}, {n} days ago". The
   posted line adds "(latest publication)" when the date is not the original posting date, and the req id when
   known.
   - Tapping it expands, in place, the **full saved description**. It sits in a scrollable box no taller than
     about 16rem, with "Saved {captured date}; scores were measured against this text". Below that is a link,
     "Open the live posting ↗", which opens in a new tab.
2. **Scores (C).** A segmented tablist: Keyword check, ResumeNext, ATS optimizer.
   - Each tab shows the big score for this file and "from {base score} on the master", with an up or down
     delta. It also shows the tool's one-line method and the tool's own breakdown on one 0–100 scale. The filled bar
     is this file and a ring marks the master.
   - **Keyword check:** required, preferred and all-terms coverage.
   - **ResumeNext:** structure, content, contact and JD tailoring as points out of their maximum.
   - **ATS optimizer:** required-keyword match with an 80 marker, then its formatting checklist.
   - A tool with no recorded result shows "Not checked yet" and no number.
   - Below the tabs, once: "Tool diagnostics, not an employer's ATS."
3. **What the job asks for (B).** "{n} of {total} on your résumé".
   - Chips are grouped into "Must have" and "Nice to have":
     - green for exact;
     - amber for close;
     - a dashed outline for not on résumé;
     - "+" for new in this version.
   - Selecting a chip opens one detail card under the chips. It holds the job's verbatim quote and up to two
     matching résumé lines with the term highlighted. It also shows the count and where the term appears (summary,
     skills, experience), and "New in this version" when that applies. With no chip selected, the card shows the
     legend.
4. **Checks by tool (B).**
   - **ATS optimizer:** the formatting checklist, with check, warning and cross icons and the detail on hover or focus.
   - **ResumeNext:** issues with severity dots. Parser notes about wrapped lines ("Experience — …") collapse into
     one muted line, "{n} parser notes on wrapped lines". A recorded `decision` shows as "Not changing: …".
   - **Keyword check:** the terms that are not evidenced.
5. **What changed** (collapsed `details`, "{n} edits"). Tracked changes against the base version, grouped by
   section:
   - Title line, Summary, Skills, then each employer.
   - Inserted words are highlighted green and removed words are struck through.
   - A moved bullet shows "Line {from} → {to}" and its opening words.
   - Dropped bullets are struck through.
   - The summary line says "Dates, titles and numbers unchanged" only when the diff confirms it. A digit, month
     name or year that changed anywhere is called out instead.
   - Computed at render time from the two `extracted_text` values: bullets are the unit, matched by similarity
     (≥ 0.6) and otherwise added or dropped.
6. **Used for** (collapsed). The existing UsedFor content.
7. The existing **Bullet changes** and manual **Assessments** sections stay below, unchanged.

States:
- **A version with no target job** (the master, older files): the job bar reads "Not tailored for a job". Sections
  2–5 are replaced by one line. For a base version it reads "{n} tailored files were made from this one", with links.
  The other sections are unchanged.
- **Target job but missing tools:** see Scores above.
- **Base version missing a score for a tool:** "from — on the master" and no delta.
- Light and dark themes, keyboard focus on tabs, chips and summaries, and `prefers-reduced-motion` respected. Mobile
  stacks the panel under the PDF, as it does today.

## Backfill

The saved description is the posting text with the agent's `SOURCE:`/`POSTED:` header lines removed. It is the
exact text sent to ResumeNext.

Because the first keyword check scored text that still had those lines, the backfill **re-runs** two tools against
the stored description for both the master and each tailored PDF:
- the local scoring service, which is running in Docker, to get full per-term findings and the engine version;
- the ATS optimizer rubric.

ResumeNext results are reused as recorded, because they already used this text. The zod schemas therefore require
the full `details` shapes; nothing is optional except `note` and `decision`.

After the build, the agent records fit data for the eight current tailored files, uploaded on 2026-11-02:
- Walmart R-2694949 and R-2655406.
- Google One.
- Target.
- JPMC 210803151.
- Microsoft 200062839.
- Amazon 10593661.
- Atlassian 27589.

The source is the session's saved checks, with the base set to master `6bd6cf2e…`. The master's own rows are
recorded against each snapshot. The six superseded first uploads get `base_version_id` and target only, with no
scores. They are superseded by the "· v2" files and show "Not checked yet".

## Constraints

- Docker-only runtime. Tests run against `jobops_e2e` (`npm run test:db`) and Playwright on port 3211, never personal
  data.
- Private check results and saved descriptions live in the database, which is never committed. The gallery fixture
  stays under ignored `data/uploads/gallery-fixtures/`.
- Shared Tailwind 4 theme tokens only; no component-local palette literals.

- No scoring or text matching in Next.js (jobops AGENTS.md). The tracked-changes diff is a text comparison for
  display, not a score.
- The `/gallery/resume-fit` route and `src/features/resume-fit-gallery/` are temporary. Delete them once the panel
  ships, following the 2026-11-02 "galleries removed" practice. Record the approval in the repository AGENTS.md
  product notes.

## Left to the builder

- Component file layout under `src/features/resumes/fit/`.
- Reusing gallery components or rewriting them cleanly.
- Exact query shape.
- The diff algorithm details within the behaviour above.
- How the API reuses `jobInputSchema` and `importJobRows`.
- Test split: unit tests for chip derivation and diffing; DB tests for the route and refusals; one Playwright pass
  over the panel states.
