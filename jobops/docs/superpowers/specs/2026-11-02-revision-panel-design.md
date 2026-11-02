# Revision panel and agent brief

Approved from the live gallery at `/gallery/score-analytics` on 2026-11-02. Picks:
- **Scores at a glance:** A, dials coloured by score.
- **Where must-haves appear:** B, with a next step.
- **ResumeNext:** A, real issues vs misreads.
- **What the agent is told:** B, the full brief.

Supersedes these picks in `2026-11-02-resume-fit-panel-design.md`: "Scores C, one tool at a time" and
"Suggestions B, every check by tool".

## Why

The user doesn't revise résumés by hand or in a chat assistant. They connect Claude Code or Codex to JobOps and ask
it to revise a résumé; the agent uploads the new version and records the scores. The panel at
`/resumes?file=<id>` has two readers:

1. **The user**, glancing before or after a revision. Today the scores confuse: the Keyword check's big number is a
   weighted figure that no visible bar shows, every number is a percentage with no "out of", and the panel keeps
   saying "master" when the user thinks in terms of the current résumé and the revised one.
2. **The agent**, which opens the résumé through the API and needs to know how to operate: what is missing, what was
   left out on purpose and why, what to fix, what not to touch, and the honesty rules.

## Goals

- Each score reads as "N of 100" with an obvious good/needs-work colour and its change from the current résumé.
- One table shows, per must-have, whether it is proven in Experience or only listed, and what the next step is.
- ResumeNext's issues split into real ones worth fixing and misreads already checked, each misread with its reason.
- `GET /api/v1/resumes/{versionId}/fit` returns a **brief** the agent follows. The panel shows the user exactly that
  brief.
- UI copy says **current résumé** (the version this file was revised from, `baseVersionId`) and **revised résumé**
  (this file), never "master".

## Non-goals

- No decision buttons, forms or questionnaires in the portal. The agent asks the user about gaps in its own chat.
  The user said they won't sit and click through decisions and that such UI wastes space.
- No LLM calls in JobOps. The brief is assembled deterministically from recorded tool results.
- No term matching in Next.js. Everything shown comes from recorded findings (existing rule).
- No change to how scores are produced, recorded or compared (term fingerprints, base pairing, older-terms flags all
  stay as they are).

## Anti-goals

- Presenting any score or colour as an employer ATS verdict. The colour bands are labelled as a JobOps display choice.
- Nudging toward adding unsupported terms. "Missing" is a fact, not an instruction; the brief tells the agent to use
  only what the user confirms.
- Losing a recorded reason. Every deliberate gap and every set-aside ResumeNext issue keeps its reason in the panel and
  in the brief.

## The panel (right column, tailored or scored file)

Order, top to bottom. Job bar, score flow and the comparison table across jobs stay as they are.

### 1. Scores at a glance (replaces the tool tabs in `fit/scores.tsx`)

Three dials side by side: Keyword check, ATS optimizer, ResumeNext. Each dial:
- Arc filled to the revised score on a 0–100 ring; whole number in the centre with "of 100" beneath.
- Arc and number coloured by band: **under 50** `danger-action`, **50–79** `warning`, **80 and up** `success`. The
  same bands for all three tools.
- A tick on the ring at the current résumé's score (when it was scored with the same term list).
- Below: tool name, one-line meaning, "Current N" and the change arrow (existing `Delta`).
  - Keyword check: "Job terms found, must-haves count 3×".
  - ATS optimizer: "X of Y must-haves found".
  - ResumeNext: "Document quality and tailoring".
- One line under the dials: "Red is under 50, amber 50–79 and green 80 or more. The bands are a JobOps display
  choice (80 is the ATS optimizer's suggestion), not a verdict from any tool. The tick marks the current résumé."
- A tool with no row shows an empty ring with "—" and "Not checked yet"; the existing warning that the rewrite rule
  needs all three checks stays.
- Keep the single "Tool diagnostics, not an employer's ATS" line.

The gallery's dial code (`GlanceDemo` with mode `band`) is the reference implementation.

### 2. Where must-haves appear

A table of the job's must-have terms (importance `required`) from the recorded findings:
- Columns: Must-have, Summary, Skills, Exp., Next.
- Section cells come from the ATS optimizer's `keywords[].where` counts (filled when > 0).
- Row states and Next:
  - not mentioned (`not_evidenced`) → "Not on the résumé" across the section cells; Next "Missing" (muted);
  - mentioned but every section count is 0 → "Found in another section"; Next "Check where" (muted);
  - `unclear` (the tool saw only a negated or uncertain mention) → "Unclear" across the section cells; Next "Ask"
    (`warning`). *My call: the agent should confirm these with the user, like missing ones.*
  - mentioned, no Experience mention → Next "Add a bullet" (`warning`);
  - mentioned with an Experience mention → Next "Shown" (`success`).
- Sorted: placed terms first, then other-section, then missing.
- Footer: "N of M found must-haves have no Experience mention. A reader trusts a bullet that shows the work more than
  a skills list." or "Every found must-have is backed by an Experience mention."
- Scrolls inside the panel past about 18 rows.
- Without an ATS optimizer row, section cells can't be filled: show the Must-have and Next columns from the keyword
  check alone and a "Sections need the ATS optimizer check" line.

### 3. ResumeNext: real issues vs misreads (replaces the ResumeNext group in `fit/checks.tsx`)

- Top line: "N of 100, grade G" with the change.
- **Worth fixing (count):** issues with no recorded decision, each with severity dot, label and hint.
- **Checked and left as is (count):** folded `<details>`, each with its recorded `decision` text as the reason.
- Issues matching the existing wrapped-line heuristic (`label` starts with "Experience —") count as misreads with
  the reason "ResumeNext read a wrapped bullet line as a separate job", unless they carry their own decision.
- Footer: "ResumeNext reads the PDF like a parser, so some flags are misreads. Each one set aside keeps its reason, so
  the agent doesn't try to fix it again."

### 4. What the agent is told

A folded section ("What the agent is told", collapsed by default) holding the full brief exactly as the API returns
it, pretty-printed JSON, with a Copy button. One line: "Claude Code or Codex reads this when it opens the résumé."

### Removed or moved

- The per-tool tabs and their breakdown bars (`Scores`, `ScaleBar`) go.
- `ToolChecks` goes. Its ATS optimizer formatting checklist moves to a small folded "Formatting checks" list under the
  where-must-haves table (same `FormatIcon` rows and detail on hover/focus). Its "Keyword check: not evidenced" line
  is covered by the table and the brief.
- Term chips ("What the job asks for", `fit/chips.tsx`) go, at the user's request: must-haves live in the table, and
  nice-to-haves and reasons in the brief. `deriveChips` stays only if something else still uses it.

## The agent brief

`GET /api/v1/resumes/{versionId}/fit` adds `brief` to each entry in `groups` (and to the top level for the tailored
job, mirroring how `mine`/`base`/`chips` are exposed today). It is `null` when the group has no keyword-check row.

Shape (field names are part of the contract):

```json
{
  "job": {
    "snapshotId": "…",
    "target": { "url": "…", "company": "…", "title": "…", "description": "…" }
  },
  "startFrom": { "versionId": "…", "label": "…", "docxPath": "/Users/…/Resume.docx" },
  "revision": { "versionId": "…", "label": "…" },
  "scores": {
    "keywordCheck": { "revised": 52.3, "current": 43.2 },
    "atsOptimizer": { "revised": 53.8, "current": 46.2, "mustHavesFound": 7, "mustHaves": 13 },
    "resumeNext": { "revised": 69, "current": 66 }
  },
  "askUserFirst": [{ "term": "…", "importance": "required", "status": "missing", "jdQuote": "…" }],
  "keepOut": [{ "term": "…", "importance": "required", "jdQuote": "…", "reason": "…" }],
  "addExperienceBullet": ["…"],
  "fixIssues": [{ "label": "…", "hint": "…", "severity": "important" }],
  "keepAsIs": [{ "label": "…", "reason": "…" }],
  "rules": ["…"]
}
```

- `askUserFirst`: missing (`not_evidenced`) and `unclear` terms with no recorded `note`, must-haves first. Each entry
  carries `status: "missing" | "unclear"`. *My call.*
- `keepOut`: missing terms with a recorded `note`; `reason` is the note.
- `addExperienceBullet`: must-haves mentioned with section counts but no Experience mention.
- `fixIssues` / `keepAsIs`: the ResumeNext split from the panel, same misread rule.
- Scores are `null` where a tool or the current résumé has no row; `current` uses the same base pairing as the panel.
- `job.target` is the saved snapshot's job and exact description, ready to send back to `POST /fit` unchanged so the
  import resolves to the same snapshot. *My call.*
- **A file with no current résumé** (a master scored through "Score against a job"): `startFrom` is the file
  itself, `revision` is `null`, every `current` score is `null`, and the dials hide the "Current" line and tick.
  *My call.*
- **No brief without a scored job.** A file never scored against the job has no group and so no brief. Rule 0 of the
  agent's workflow lives outside the brief: score the starting file first with `POST /score`. This goes in the
  root `AGENTS.md` note. *My call.*
- `rules`, fixed strings:
  1. "Ask the user about every askUserFirst term in the chat, one at a time, before writing. Use only what they
     confirm, in their words."
  2. "Truthful re-weighting only: never add skills, metrics or keywords the user hasn't confirmed."
  3. "Edit a copy of the DOCX at startFrom.docxPath (ask the user where it is if that is null), keep its layout, and
     list every change you make. Save the revision as a new DOCX beside it; never overwrite the original."
  4. "Export a text-based PDF and upload it as a new version on the Résumés page."
  5. "Link the new version with POST /api/v1/resumes/{newVersionId}/fit: send job.target unchanged,
     baseVersionId = startFrom.versionId, docxPath = the new DOCX and no assessments. Then run POST /api/v1/resumes/{newVersionId}/score with
     { snapshotId: job.snapshotId, tool } for each of jobops-lexical, resumenext and resume-ats-optimizer."
  6. "Carry every keepOut reason and keepAsIs reason into the new version's records, so the user isn't asked again."
  7. "Scores are tool diagnostics, not an employer's ATS."

  *My calls:* rule 5 uses the existing `/score` route, which also scores the current résumé with the same terms, so
  the panel's pairing holds; there is no agent upload API, so rule 4 points at the Résumés page, which agents already
  drive in the browser.
- Built by one pure function (e.g. `fit/brief.ts`) from a `FitGroup` plus the two version labels, unit-tested.

### Reasons survive re-scoring

In-app scoring already carries keyword-check `note`s forward (`latestNotes` in `score/run.ts`). Give ResumeNext
`issues[].decision` the same treatment: when `/score` runs ResumeNext for a version, copy each decision from that
version's latest ResumeNext row for the same snapshot onto the issue with the same label (case-insensitive). Without
this, every set-aside issue returns to "Worth fixing" after a re-score. *My call; it's what the "losing a recorded
reason" anti-goal requires.*

## Copy changes

Replace "master" with "current résumé" (or "current" where space is tight) across `fit/` and `score/ui/run-rows.tsx`
user-facing strings, e.g. "New in this version: the current résumé didn't mention it", "Arrows compare with the
current résumé on the same job", "The current résumé couldn't be scored". Code identifiers (`base`, `baseVersionId`)
stay.

## Wrap-up

- Remove `/gallery/score-analytics` and `src/features/score-analytics-gallery/` once the panel ships.
- Record the approval in the root `AGENTS.md` product scope, superseding the two old picks, and pointing to this spec.

## Editable DOCX path

Decided by the user: JobOps records where each version's editable DOCX lives.
- Migration `0019` adds `resume_versions.docx_path text` (nullable). It is an absolute local path the agent can open;
  JobOps never reads, serves or uploads the DOCX itself.
- Set it from the upload drawer (optional "Editable DOCX path" field) or with an optional `docxPath` on
  `POST /api/v1/resumes/{versionId}/fit`, which updates the version it is posted to. The same field is editable for
  existing versions. *My call: path validation is "non-empty, absolute, ends in .docx".*
- The brief's `startFrom.docxPath` carries it; `null` when unset. `GET /api/v1/resumes` includes it per version.
- The panel shows it as one muted line under the file's name ("Editable: …/Resume.docx") when set.

## Left to the builder

- Component split and file names inside `src/features/resumes/fit/`.
- Exact spacing, dial size within the panel width, and mobile layout (stack the dials in one row of three; they fit at
  375 px in the gallery).
- Test layout: unit tests for the brief builder and row-state logic; extend existing fit component/integration tests.

## Changes after the branch review

- **Reasons follow the revision.** When `/score` runs on a version with no noted or decided rows of its own for the
  job, keep-out notes and ResumeNext decisions come from its base version's latest rows. Rule 6 now says reasons carry
  over automatically.
- **Exact snapshot.** `POST /fit` accepts an optional `snapshotId`. When given, it fixes the job and description
  (unknown id → 404) and nothing is re-imported, so an older description can't spawn a duplicate snapshot. Rule 5
  sends `snapshotId = job.snapshotId`.
- **DOCX path on existing versions.** `PATCH /api/v1/resumes/{versionId}` with `{ docxPath }` (or `null` to clear).
  Rule 3 tells the agent to record a missing path this way.
- **Keep the revision's changes.** `startFrom` stays the current résumé (the user's rule: build from the preserved
  DOCX master), and rule 3 now tells the agent to keep the changes the revision already made, pointing at
  `revision.docxPath`.
