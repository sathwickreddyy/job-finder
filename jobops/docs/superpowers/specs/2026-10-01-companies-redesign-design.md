# Companies redesign: views, metrics and a strict research contract

Date: 2026-10-01 · Status: implemented; stored-data backfill awaiting the user's approval of the review file
Gallery: `/gallery/companies-v2` (picks 1A, 2B with pay extras, 3A, 4A, 5A, 6A)
Final-UI previews: `/gallery/companies-v2/list` and `/gallery/companies-v2/company/[slug]` (layout B chosen)

## Goal

Make Companies answer two questions at a glance: _where should I aim_ (pay range, interview
style, rounds) and _where am I_ (my real pipeline stage per company). Every number shown comes
from sourced research facts or recorded applications. Nothing is estimated, converted or invented.

## 1. Research contract (hard rule)

The company ingestion API (`/api/v1/companies`, `/batch`, fact patches) rejects facts that do not
carry normalized numbers. External assistants (ChatGPT, Claude) and the user all write through it,
so the extraction happens once, at write time.

### COMPENSATION — required

| Field                          | Rule                                                                                                   |
| ------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `role`                         | Required non-empty text.                                                                               |
| `currency`                     | Required ISO 4217 code, uppercase (`INR`).                                                             |
| `fixedAnnual` or `totalAnnual` | At least one required. Positive number in whole currency units per year (`3100000`, never `"31 LPA"`). |

### COMPENSATION — optional, typed when present

| Field             | Shape                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `level`           | text                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `yearsExperience` | number ≥ 0                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `variableAnnual`  | number ≥ 0, same currency as `currency`; 0 records a report that says there is none                                                                                                                                                                                                                                                                                                                                                                      |
| `variablePercent` | number 0–100 (of fixed)                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `joiningBonus`    | number ≥ 0, total across all instalments, same currency; 0 records "none"                                                                                                                                                                                                                                                                                                                                                                                |
| `equity`          | `{ amount?: number, annualAmount?: number, units?: integer, currency?: string, vestingYears?: number, type?: "RSU" \| "ESOP" \| "STOCK_BONUS" \| "OTHER" }`, with any of `amount` (total grant), `annualAmount` (yearly value) or `units`. Grants are usually in dollars or units while cash is INR, so a value needs its own `currency` and is never converted or added to `totalAnnual`. Cards show the median grant in the currency most reports use. |
| `benefits`        | `string[]` (for example "Relocation ₹1.5L", "Wellness ₹50K/yr")                                                                                                                                                                                                                                                                                                                                                                                          |

### Twin rule

Any `<name>Original` text (`fixedAnnualOriginal`, `totalAnnualOriginal`, `joiningBonusOriginal`,
`variableOriginal`, `equityOriginal`) requires its numeric twin (`fixedAnnual`, `totalAnnual`,
`joiningBonus`, `variableAnnual` or `variablePercent`, `equity`). On failure the 400 response names
the missing twin. Original text stays alongside as provenance. A reviewed `null` original needs no
twin: text that holds no single amount (a range, units without a price, "up to 20%") moves to
`<name>Notes` and its original is set to `null`. The amount check also runs when other fields fail,
so a writer sees every problem in one response.

### INTERVIEW — required

| Field        | Rule                                                                                                                                                 |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `role`       | Required non-empty text.                                                                                                                             |
| `rounds`     | Non-empty array of objects. Each round has `name` (text) and `kind` ∈ `ONLINE_ASSESSMENT, DSA, LLD, HLD, BEHAVIORAL, HIRING_MANAGER, DOMAIN, OTHER`. |
| `roundCount` | Integer ≥ `rounds.length`, to allow for partially described loops.                                                                                   |
| `outcome`    | One of `OFFER, REJECTED, PENDING, WITHDREW, UNKNOWN`. Free-text detail moves to `outcomeNotes`.                                                      |

`level` and `yearsExperience` stay optional.

### Validation timing

The contract is checked **after** `mergeData(previous, patch)`, so a patch that adds one note to an
existing fact is judged on the merged record. Facts in other categories are unchanged. The JSON
schema endpoint (`/api/v1/companies/schema`) and the Company research API section of `README.md`
(including the copyable assistant prompt) document the contract.

## 2. Backfill of existing data

Current state: 81 compensation and 88 interview facts. Only about 21 have numeric `fixedAnnual`, and
no round has a `kind`.

- Claude reads every non-conforming fact and writes the normalized fields. This is a one-time,
  reviewed extraction, not a runtime parser. Original text fields are kept.
- The change set is written to a reviewable JSON file
  (`data/backfill/2026-10-01-company-facts.json`, gitignored as local data). For each fact it lists
  fact id, before/after values and an `ambiguous` flag with a reason.
- Ambiguous items (for example a bare `"37"`, or a report contradicting its own title) are **not
  guessed**. They are listed for the user to decide. Until resolved they stay non-conforming and
  appear as "Needs review" on the company page; the read path tolerates legacy rows.
- `scripts/company-facts-backfill.ts` has three commands: `export` writes the review file, `check`
  validates every reviewed patch against the stored rows without writing, and `apply` writes the file
  through `patchCompany` (the API's validation plus a `company_fact_observations` entry per change).
  `apply` writes nothing if any item fails, and runs against the personal DB only after the user
  approves the file.

## 3. Metrics (`src/features/companies/metrics.ts`)

Pure functions, unit-tested, shared by all views:

- `companyMetrics(facts)` returns `fixed`, `total` (INR only: n, min, p25, median, p75, max, points
  with level, years and source), `variable`, `joiningBonus` (INR stats), `equity` (list of grants in
  original currency, with per-year value when `vestingYears` is known), `benefits` (distinct values
  with counts), `typicalRounds` (median), `roundsRange`, `styleMix` by family, `typicalLoop` (from
  the report closest to the median round count), `outcomes`, `topTopics`.
- Round families: Coding (OA, DSA), Design (LLD, HLD), People (Behavioral, HM), Other (Domain,
  Other). Colors are the validated `--chart-*` theme tokens and always come with text labels.
- `companyStage(statuses, openings)` derives Not started → Opening saved → Applied → Interviewing →
  Offer → Closed from `applications.status`. The furthest active stage wins; a company is Closed only
  when every application is closed.
- `inferRoundKind` is removed once the backfill lands. Rounds without `kind` count as Other.

## 4. Companies page (`/companies`)

- **View switcher (1A segmented pill)** next to search. `?view=grid|compare|pipeline`, default
  grid. Search `q` applies to every view.
- **Grid (2B, extended):** city sections stay. Card shows header with stage chip; two stat tiles,
  Fixed pay (p25–p75 LPA) and Typical rounds (with range); a compensation line listing whichever is
  reported: variable, joining bonus, stock (original currency, per year when known) and benefit
  count; style mix bar with labels. Missing data reads "Not reported" or "Needs review", never 0.
- **Compare (3A):** sortable table (fixed pay, fewest rounds, name). The fixed-pay column draws range
  bars on one shared LPA scale with a 0/mid/max axis. Further columns: rounds, style bar, stock
  (yes/no plus currency), stage. Each row links to the company page. Report dots have hover/focus
  tooltips showing level and experience.
- **Pipeline (4A board):** six stage columns with counts; each card shows name and fixed range. An
  empty board shows one next action ("Save an opening to start your pipeline").

## 5. Company page (`/companies/[slug]`) — layout B, tabs

The header and metric tiles stay fixed at the top. Tabs swap one short page at a time, and the
active tab is kept in the URL (`?tab=pay|interviews|progress|about`, default `pay`) so it can be
bookmarked and survives a reload.

- **Header:** "All companies" link, monogram, name, stage chip, cities and work modes, Careers link,
  and one primary next action based on stage (Not started → Save an opening; Opening saved →
  Record application; Interviewing → Practise questions; otherwise View applications).
- **Metric tiles (5A):** Fixed pay · Total pay · Typical rounds · Offers in reports · Your
  applications.
- **Compensation tab:** the large fixed-pay range on the shared scale with report dots; a row for
  Variable, Joining bonus, Stock (original currency, with vesting) and Benefits; a "needs review"
  note when some reports are not yet normalized; and a reports table (year, role and level,
  experience, fixed, total, stock, source).
- **Interview loop tab:** the typical-loop stepper (6A), style mix and top topics; each interview
  report as a collapsible row (year, role, level/experience/rounds, round-kind chips, outcome chip)
  that opens to its rounds, questions and source link; then "Questions to practise", which lists
  each question once and can be filtered by round family.
- **Your progress tab:** saved openings, applications and resume reference as three cards.
- **About & sources tab:** the raw `CompanyResearch` tables in a collapsible panel, beside an About
  card (careers, website, offices with verification, aliases).

Spacing scale: 32px between header, tiles and tabs; 56px between sections inside a tab; 20px from
a section heading to its content; card padding 20/24px; 12–16px gaps inside grids. Grid tracks use
`grid-cols-1`/`min-w-0`, so nothing scrolls sideways at 390px.

### Module layout

| File                               | Responsibility                                                                            |
| ---------------------------------- | ----------------------------------------------------------------------------------------- |
| `metrics.ts`                       | Pure stats, stage derivation, interview report summaries                                  |
| `format.ts`                        | Pure formatters shared by server and client (`payRange`, `money`, `payExtras`, view list) |
| `marks.tsx`                        | Client chart marks (range bar with tooltips, mix bar, stepper, chips)                     |
| `summary.ts`                       | `companySummaries(data)`, `sharedPayScale`                                                |
| `views.tsx`                        | List views: switcher, grid card, compare table, pipeline board                            |
| `detail.tsx` / `detail-client.tsx` | `CompanyDetail` (tabbed page), its sections, URL-driven tabs and question filter          |
| `backfill.ts`                      | Pure backfill helpers: contract problems per fact, patch preview, review-file schema      |

The gallery and preview routes were removed when the real pages shipped.

## Out of scope

Currency conversion, new tables, internal AI calls, automatic outreach, and changes to the
non-company pages.

## Testing

- Unit: contract (required fields, twin rule, post-merge validation, outcome/kind enums); metrics
  (quantiles, INR filtering, equity kept separate, stage derivation, empty data).
- API: 400 responses name the missing field; legacy rows still read.
- E2E (`jobops_e2e` DB, port 3211): view switching via URL, compare sorting, company page sections
  render with seeded conforming facts.
- Visual: screenshots of the three views and a company page in dark and light themes.
