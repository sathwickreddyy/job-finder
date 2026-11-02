# Score against a job

Approved from the live gallery at `/gallery/score-job` on 2026-11-02. Picks:
- **Where you start:** A, an outlined pill under the job bar.
- **Choosing the opening:** A, a search popup.
- **Confirming what the job requires:** A, tap-to-change chips.
- **While the checks run:** A, one row per tool.
- **A file scored against several jobs:** C, a comparison table.

## Why

The résumé fit panel (`2026-11-02-resume-fit-panel-design.md`) only shows scores an agent recorded while tailoring a
file. The user wants to pick any résumé file, pick any saved opening, and get scores from a button: "how would my
master, or the file I made for Walmart, do for this new Atlassian role?" Today that needs a Claude conversation.

All three checks become programmatic and run from JobOps:
- **Keyword check** (`jobops-lexical`): the existing Python scoring service.
- **ResumeNext** (`resumenext`): `match_resume_to_job` through the personal-mcps bridge on port 8004. Verified on
  2026-11-02 that the app container reaches it at `http://host.docker.internal:8004/mcp` (MCP streamable HTTP).
- **ATS optimizer** (`resume-ats-optimizer`): today a rubric the agent applies by hand. It is ported to code in the
  Python scoring service.

## Goals

- From `/resumes?file=<id>`, score that exact file against any saved opening that has a description.
- For a reviewed opening, score in two clicks (button, opening). For a new opening, confirm the job's terms once.
- Score the file's base version (the master) against the same snapshot and terms, so "from X on the master" always
  compares like with like.
- Save every result as a `resume_assessments` row tied to the exact version and job snapshot, labelled by tool and
  method version, so it survives restarts and shows in the panel.
- Show every job a file was scored against in one comparison table.

## Non-goals

- No résumé editing, rewriting or keyword suggestions to add. The button measures; it never changes a file.
- Scoring a file against a job never changes what the file is tailored for (`targetJobId`, `baseVersionId`).
  Tailoring stays the agent's `POST /api/v1/resumes/{versionId}/fit` flow.
- No scheduled or bulk scoring. One file, one opening, one click.
- No pasting of unsaved job descriptions. Openings are saved through Find openings or the jobs import first.
- No scoring of applications' submitted files from the Applications page (they can be opened on Résumés).

## Anti-goals

- Never present a score as an employer ATS result. Every number keeps its tool name, method and "tool diagnostic"
  framing, as in the fit panel.
- Next.js never matches terms or computes a score. Matching and scoring stay in the Python service or ResumeNext.
- No silent data leaving the machine: the ResumeNext row always says it sends the text to resumenext.io.
- A failed tool never blocks or erases the others' results.

## The flow

### 1. Where you start (pick A)

In the right-hand panel, directly under the job bar, an outlined full-width pill: **Score against another job**
(gauge icon, link colour). On a file that is not tailored for a job, the "Not tailored for a job" pill is replaced by
the same button reading **Score against a job**. Files whose text has not been extracted
(`parsingStatus !== "COMPLETED"`) show the button disabled with the reason as its description.

### 2. Choosing the opening (pick A)

The pill opens a popover anchored under it:
- A search field (company, role, req id, location), focused on open. Arrow keys move, Enter picks, Escape closes.
- Rows: `Company · Title`, then location, req id and the posting line used by the job bar
  (`Posted 5 days ago (latest publication)` / `Posting date not recorded`).
- Flags on a row: **Tailored for this** (this file's target), **Scored** (results already exist for this file),
  **Over 14 days** and **Date unknown** (warning tone). Old and undated openings are flagged, not hidden: scoring is
  not applying. *My call.*
- Lists only jobs whose latest snapshot has a non-empty description. Ordered by posting date, newest first, unknown
  dates last. Empty state: "No saved opening matches. Save the job description from Find openings first."

Picking an opening goes to step 3, or straight to step 4 if that snapshot already has reviewed terms.

### 3. Confirming what the job requires (pick A)

Shown in the panel, replacing the popover, with the opening's name and a Cancel link.
- Terms are suggested by the scoring service from the saved description (its catalogue), each with the exact line
  of the description it came from.
- Each term is a chip. Tapping cycles **Required → Preferred → Not counted**. Required is the filled tonal chip,
  Preferred outlined, Not counted dashed and struck through.
- Under the chips, the last tapped or hovered term's state and the job's own words: "Kafka is required. The job says:
  “Hands-on with streaming systems such as Kafka”".
- Footer: "6 required, 3 preferred, 1 not counted" and a primary **Score with these terms** button, disabled until
  at least one term is Required, with the reason beside it ("Mark at least one term as required"). *My call: the
  ATS optimizer divides by the required count, and the approved formula stays as is.*
- Initial state: if the snapshot has reviewed terms, those; otherwise the catalogue suggestions with importance
  `preferred` (the service cannot tell required from preferred). *My call: the user decides what is required.*
- Confirmed terms are saved per job snapshot and reused by every later score of any file against that snapshot.
  When reviewed terms exist, step 3 is skipped and the run rows show "Using your terms from 2 Nov · Edit terms";
  Edit terms reopens step 3 and the next score uses the edited list.
- **Adding a term** (the user's decision, 2026-11-02): the catalogue knows about 55 tech terms, so a **Add a term
  from the job** link opens the saved description. Selecting a word or phrase in it adds a chip for that exact text,
  Required by default, with the selected line as its `jd_quote`. Free typing is not offered: every term stays tied
  to the job's own words. Added terms can be cycled to Not counted like any other, and are saved with the snapshot's
  list. With no catalogue suggestions at all, step 3 opens with the description already showing and the message
  "No terms were suggested for this job. Select the skills it asks for."
- The scoring service validates that each `jd_quote` occurs in the description (as today), so an added term is
  rejected only if the description changed underneath it.

### 4. While the checks run (pick A)

The panel shows one row per tool for the chosen opening, in this order: Keyword check, ResumeNext, ATS optimizer.
- Each row: tool name, where it runs ("JobOps scoring service, on this computer" / "Sends the text to resumenext.io"),
  a status (waiting dot, spinner, green check, or a red mark with the error), and when done this file's score with
  "master 61.5" under it.
- Footer note: "Each check scores this file and the master, so the comparison uses the same terms."
- When all rows finish, a **Done** button returns to the fit panel with the new job selected in the comparison
  table. A failed row has **Try again**, which re-runs only that tool.
- Navigating away mid-run is allowed. Rows already saved stay saved; unfinished tools are simply not recorded.

### 5. A file scored against several jobs (pick C)

When a file has results for one or more jobs, a comparison table sits under the job bar (above the scores):
- One row per scored job snapshot: company, with "Tailored for" or the title under it; then one column per tool
  with this file's latest score and a `Delta` arrow against the master's latest score for the same snapshot.
- The tailored job is the first row; others follow by most recent assessment.
- Clicking a row selects it. The job bar, saved description, score tabs, chips and "Every check by tool" below all
  follow the selected row. The tailored job is selected by default; after a run, the job just scored.
- A tool with no result for a row shows "—". Caption: "Arrows compare with the master on the same job."
- With only the tailored job scored, the table is hidden and the panel looks as it does today.

## Which snapshot is scored

The popover lists jobs, one row each. Picking the job a file is tailored for scores against that file's
`targetSnapshotId`, so new scores stay comparable with the recorded ones. Any other job is scored against its latest
snapshot with a description. *My call.* A table row is one snapshot; if a job's description changes and the file is
scored again, the table can show two rows for the same role, the older one marked "earlier description".

## One term list per snapshot

- The per-snapshot terms table is the source of truth. Whoever reviews last wins: confirming terms in the panel
  updates it, and `POST /api/v1/resumes/{versionId}/fit` with `jobops-lexical` requirements also updates it, so the
  agent's review and the user's review are the same list. *My call.*
- Every saved row (all three tools) records a fingerprint of the term list it used (a SHA-256 of the sorted
  term, aliases, importance tuples) in `details.termsFingerprint`. ResumeNext rows record it too, so a run's rows
  stay grouped, even though ResumeNext ignores terms.
- **Deltas pair like with like.** A file's score is compared with the master's row for the same snapshot, tool and
  fingerprint. If the master has none, the run re-scores the master with that list (the base re-score rule below).
- After Edit terms, older rows stay saved. The table and panel show the latest rows whose fingerprint matches the
  snapshot's current list; when a file only has rows from an older list, its row shows those scores marked
  "older terms" with no delta, and a one-click **Re-score** using the current list.
- **Unclaimed notes carry forward.** Per-term `note`s (gaps deliberately left unclaimed) belong to a file and
  snapshot. When JobOps saves a `jobops-lexical` row, it copies each term's `note` from the most recent row with
  notes for the same file and snapshot, matched by term. Re-scoring a tailored file never hides its notes. *My call.*
- Negated or uncertain mentions ("no Kafka", "learning Spark"): the lexical engine marks them `unclear` as today. The
  ATS optimizer counts only positive mentions as found and reports such terms in `keywords[]` with
  `found: 0` and `unclear: true`; its `match_score` stays a number. *My call.*

## What "the master" means

The comparison base is the file's `baseVersionId`. A file with no base (a master itself, or an untailored upload)
is scored alone and shows "this is the master" instead of a delta. *My call: a file that is not tailored and not
the master has no meaningful base, so it is compared with nothing.*

The base is re-scored only when it has no result for that snapshot, tool and term list, or when that result came
from an older method version. Otherwise the existing row is reused. *My call.*

## Architecture

```
Résumés panel (client)
  └─ per tool, in parallel: POST /api/v1/resumes/{versionId}/score  { snapshotId, tool }
        Next.js route (server)
          ├─ jobops-lexical ─────► resume-scoring  POST /v1/assessments/pdf   (PDF bytes + JD + terms)
          ├─ resume-ats-optimizer ► resume-scoring POST /v1/ats-optimizer/pdf (new; same inputs)
          └─ resumenext ─────────► http://host.docker.internal:8004/mcp  tools/call match_resume_to_job
        └─ writes resume_assessments rows for the file (and the base when needed), returns them
```

- One request per tool so each row finishes independently. Each route call scores the file, then the base if needed,
  and saves both rows in one transaction.
- The route is LAN-trusted like the other `/api/v1/resumes` routes and also usable by agents.
- Term suggestion: `POST /api/v1/jobs/snapshots/{snapshotId}/terms/suggest` proxies a new scoring-service endpoint
  `POST /v1/requirements/suggest` (JD in, catalogue terms with aliases and `jd_quote` out; today's
  `suggested_requirements`). `PUT /api/v1/jobs/snapshots/{snapshotId}/terms` saves the confirmed list.
- Reviewed terms are stored in a new table keyed by snapshot (term, aliases, importance, jd_quote, reviewed_at).
  *My call on the shape.* Backfill: for each snapshot that has a recorded `jobops-lexical` assessment, seed the table
  from that assessment's `details.requirements`, so already-tailored jobs skip step 3.
- `getFit` grows to return results for every snapshot the file and its base were scored against, grouped by
  snapshot, plus each snapshot's job. The fit panel's existing pieces render the selected group unchanged.

### Tool inputs and outputs

- **Keyword check:** the stored PDF from `storagePath` and the snapshot's exact description, with reviewed terms as
  `requirements` (`required`/`preferred`; Not counted terms are omitted). Saved `details` must parse with the
  existing `lexicalSchema` (`keyword`, `required`, `preferred`, `weighted`, `engineVersion`, `requirements`,
  `findings`); the row's `score` is `weighted`, as today.
- **ATS optimizer (new, Python):** the same PDF, JD and reviewed terms. Returns the existing `optimizerSchema` shape:
  - `match_score` = required terms found ÷ required terms × 100 (literal term or alias, the scorer's matching rules);
  - `keywords[]` with `found` count and `where` counts for summary, skills and experience sections, detected from
    standard headings;
  - `format[]` checks that pdfplumber can actually establish: text-based PDF, standard section headings present,
    contact details in the body text, fonts from the standard list, body font size 10–12 pt, no tables, no images,
    single column, file name pattern. A check that cannot be determined is `warn`, never a pass;
  - `target: 80`, and `method` naming the formula and engine version.
  Lives in `services/resume-scoring` with its own tests and synthetic fixtures; the engine version is bumped.
- **ResumeNext:** `resume_text` is the version's `extractedText`; `job_description` is the snapshot description
  without its leading metadata block; `target_role`/`target_company` from the job. The metadata block is the run of
  lines at the very top that look like `key: value` or `key : value` with a key of at most 30 characters and no
  sentence punctuation (e.g. `TITLE:`, `REQ ID:`, `APPLY URL:`, `jobReqId :`, `postedOn :`), plus blank lines
  between them; stripping stops at the first other line. This is text cleanup, not term matching, so it lives in
  Next.js beside the ResumeNext client. The exact text sent is saved in the row's `details.sentJobDescription`, so
  results can be compared and reproduced. *My call.* A description over 20,000 characters is
  refused with that reason rather than truncated. The response is saved whole and must parse with
  `resumeNextSchema`; the row's `score` is `ats_score`.
- Every row's `method` says it was run from JobOps (for example `weighted_coverage@1.1.0, run in JobOps`) so it can
  be told apart from agent-recorded rows. `assessedAt` follows the existing India-day convention.

### Failures

- Scoring service down or ResumeNext bridge unreachable: that row shows "Couldn't reach the scoring service" /
  "Couldn't reach ResumeNext (bridge on port 8004)" with Try again. Others continue.
- Scanned or unreadable PDF: the service returns `unable_to_assess`; the row says so and saves nothing.
- An "unclear" lexical finding leaves that score blank (`null`), as the engine does today, and the row says
  "Needs a manual look".
- Timeouts: 30 s for local tools, 60 s for ResumeNext. *My call.*

## Retiring the gallery

Remove `/gallery/score-job` and `src/features/score-job-gallery/` in the implementation's first commit, and record
the approved picks in the root `AGENTS.md` product scope, as with the résumé fit panel.

## Testing

- Python: ATS optimizer formula, keyword counts by section, each format check (pass, fail and undeterminable) and
  the suggest endpoint, all with ReportLab synthetic PDFs. Run in the service's Docker test target.
- Next.js unit: tool output mapping into the three detail schemas; comparison table grouping and deltas; flags in
  the opening list; base re-score rule.
- `npm run test:db` against `jobops_e2e`: the score route saves file and base rows to the right snapshot, reuses
  reviewed terms, never touches `targetJobId`/`baseVersionId`; terms backfill from recorded assessments.
- Playwright on the e2e database with the scoring service and a stubbed ResumeNext: pick a file, pick an opening,
  confirm terms, add a term by selecting it in the description, watch three rows finish, see the new row in the
  table; then Edit terms and see the older row marked "older terms".
- Unit: term-list fingerprint is order-independent; unclaimed notes carry forward by term; the metadata-block
  stripper on both header styles found in saved descriptions.

## Left to the builder

- Component structure, file layout and naming inside `src/features/resumes/fit/`.
- The exact MCP client code for ResumeNext (session handshake, SSE parsing).
- Heading detection rules for summary/skills/experience, within "standard headings only".
- Drizzle migration details for the terms table.
