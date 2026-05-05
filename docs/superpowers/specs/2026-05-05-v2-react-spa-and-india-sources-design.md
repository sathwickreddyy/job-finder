# v2 — React SPA UI, On-Demand Search, Indian-First Sources

- **Date:** 2026-05-05
- **Author:** Sathwick (design) + Claude (capture)
- **Status:** Approved for planning
- **Scope:** job-finder repo only. Portfolio repo stays independent.

## 1. Context and motivation

v1 is a Python CLI + Streamlit UI that fetches jobs from public APIs, scores them against a profile, and stores everything in SQLite. In production use, three problems surfaced:

1. **The UI is not enjoyable to live in daily.** Streamlit's full-page rerender model makes inline status updates, filtering, and expand-on-click awkward.
2. **Sources skew US-remote.** Remotive, Greenhouse, Lever, and Ashby default to a US/EU pipeline; India-friendly roles get lost in the noise.
3. **Priority sort is wrong for daily use.** Fit-score is a relevance indicator, but once you're actively interviewing somewhere, that job should be pinned to the top regardless of its score.

v2 addresses all three with a single, bounded change: replace Streamlit with a React SPA, switch to on-demand search, add an India-first source, and make the Tracker sort by application status first.

## 2. Non-goals

The following are explicitly out of scope, to keep v2 shippable in one session:

- **Kanban board.** User plans to move visual workflow to Notion later; the app is a table-first CRM.
- **Auto-apply, recruiter outreach, or any automated sending.** Same hard rule as v1.
- **LinkedIn / Naukri scraping.** Manual paste remains the only path for login-gated sources.
- **Server-sent events / WebSockets.** Search is synchronous; most source pipelines complete in < 10s.
- **Auth / multi-user.** Local-only tool.
- **Mobile / responsive past laptop width.** Desktop-only; minimum supported viewport 1280×720. Content below that may overflow.
- **AI-powered JD import from a URL.** Placeholder until LLM integration matures.

## 3. Decision summary

| Area | Decision |
|---|---|
| UI stack | Vite + React 18 + TypeScript (strict) + Tailwind + shadcn/ui + React Router v6 + TanStack Query v5 |
| Backend | FastAPI monolith in `app/api/`, reuses every existing module |
| Dockerization | Two Dockerfiles: `Dockerfile.api` (Python slim) and `Dockerfile.web` (Node build → nginx runtime) |
| Ports | web: **47130**, api: **47131** (both unregistered, collision-free) |
| Config storage | SQLite tables (`settings`, `companies_cfg`, `scoring_cfg`, `sources_cfg`). YAML files become seed-only. |
| Search model | On-demand synchronous `POST /api/search`; no default cron. GitHub Actions workflow retained as optional. |
| Sort order (Tracker) | `status_rank ASC, next_interview_at ASC NULLS LAST, fit_score DESC, found_at DESC` |
| LLM tailor | Deterministic template by default. When no key present, response carries `ai_pending: true` so UI shows an "AI integration pending" badge. |
| Resume source | Portfolio sister project (`sathwick-portfolio/public/pdfs/resume.{md,pdf,docx}`), read-only via absolute path + Docker bind-mount. Local `resumes/master.md` is the fallback. |
| Visual language | Warm dark (cyan accent for P0, amber for P1, neutral grey for P2, radial gradient background) |
| Row interaction | Dense table with click-to-expand in-place — Tailor / Open JD / Mark-as-X actions live in the expanded panel |
| Streamlit | Deleted entirely |

## 4. System architecture

```
┌──────────────────────────┐    ┌──────────────────────────┐
│  web (nginx, :47130)     │    │  api (FastAPI, :47131)   │
│  React SPA, Vite build   │◀──▶│  Python 3.13             │
│  Dockerfile.web          │    │  Dockerfile.api          │
└──────────────────────────┘    └────────────┬─────────────┘
                                             │
                             ┌───────────────┼───────────────┐
                             ▼               ▼               ▼
                       ┌──────────┐  ┌──────────────┐  ┌──────────────┐
                       │ SQLite   │  │ sources/     │  │ scoring/     │
                       │ (bind    │  │ remotive,    │  │ rule_scorer, │
                       │  mount)  │  │ greenhouse,  │  │ llm_scorer   │
                       │          │  │ ashby, lever,│  │              │
                       │          │  │ ycombinator, │  │              │
                       │          │  │ manual       │  │              │
                       └──────────┘  └──────────────┘  └──────────────┘

cli  (compose profile "tasks")  — interactive shell for CLI commands
DELETED:  ui (Streamlit)
```

### 4.1 Why two Dockerfiles

Python deps change on a different cadence from Node deps. A combined image rebuilds `node_modules` every time `requirements.txt` moves, and vice versa. Two Dockerfiles sharing a compose stack costs roughly 40 extra lines of YAML but saves minutes per rebuild over the life of the project.

### 4.2 Why FastAPI monolith (not microservices)

The existing `app/storage`, `app/scoring`, `app/sources`, `app/resume`, `app/config_repo` modules are import-compatible with FastAPI. A monolith is one dependency graph to keep green. Microservices would duplicate the SQLite connection pool, double the docker footprint, and provide zero benefit for a local-only tool.

### 4.3 Why SQLite for config (not keeping YAML)

React forms want structured input (sliders for thresholds, multi-select chips for skills), not a textarea of YAML. Parsing/validating YAML in the browser adds a dependency (`js-yaml`) and a validation layer. Moving config into SQLite means:

- Settings UI pages are real forms, not textareas.
- API responses already use JSON, so TS types cover config without YAML-specific code.
- `updated_at` columns give us free versioning.
- The JSON export already planned covers config → backup.

YAML files stay as seed files only. `python -m app.main import-config` reads YAML → writes DB. Idempotent, re-runnable as an escape hatch when the UI misbehaves.

## 5. Data model

### 5.1 Existing tables — no schema changes

`jobs`, `scored_jobs`, `email_events`, `sync_state`, `runs` — all unchanged.

### 5.2 `applications` — four column additions

```sql
ALTER TABLE applications ADD COLUMN next_interview_at TEXT;  -- ISO 8601 datetime
ALTER TABLE applications ADD COLUMN interview_notes   TEXT;
ALTER TABLE applications ADD COLUMN applied_at        TEXT;  -- set when status→Applied
ALTER TABLE applications ADD COLUMN rejected_at       TEXT;  -- set when status→Rejected
```

All nullable. Guarded by `PRAGMA table_info()` checks in `init-db` so re-running is safe.

### 5.3 New tables

**`settings`** (key-value singletons):
```sql
CREATE TABLE settings (
    key          TEXT PRIMARY KEY,
    value_json   TEXT NOT NULL,
    updated_at   TEXT NOT NULL
);
-- keys used in v2: "profile"
```

**`companies_cfg`** (replaces `companies.yaml` as runtime source of truth):
```sql
CREATE TABLE companies_cfg (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    name                  TEXT NOT NULL UNIQUE,
    careers_url           TEXT,
    ats_type              TEXT NOT NULL DEFAULT 'unknown',
    board_token           TEXT,
    org_slug              TEXT,
    company_slug          TEXT,
    preferred_locations   TEXT,      -- JSON array
    priority              TEXT NOT NULL DEFAULT 'P2',
    notes                 TEXT,
    enabled               INTEGER NOT NULL DEFAULT 1,  -- 0 = soft-deleted
    updated_at            TEXT NOT NULL
);
```

**`scoring_cfg`** (key-value, structured rows so forms map naturally):
```sql
CREATE TABLE scoring_cfg (
    key          TEXT PRIMARY KEY,  -- 'threshold_p0', 'positive_keyword:python', 'location_boost:bengaluru'
    value_json   TEXT NOT NULL,
    updated_at   TEXT NOT NULL
);
```

**`sources_cfg`** (per-source enabled flag + options):
```sql
CREATE TABLE sources_cfg (
    source       TEXT PRIMARY KEY,  -- 'remotive', 'greenhouse', 'ashby', 'lever', 'ycombinator', 'manual'
    enabled      INTEGER NOT NULL DEFAULT 1,
    options_json TEXT,              -- e.g. {"categories": ["software-dev"], "limit": 100}
    updated_at   TEXT NOT NULL
);
```

### 5.5 `search_stats` (new table)

Captures per-source outcomes for every `/api/search` invocation so the Dashboard can show health without re-running.

```sql
CREATE TABLE search_stats (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    ran_at        TEXT NOT NULL,
    source        TEXT NOT NULL,
    fetched       INTEGER NOT NULL DEFAULT 0,
    kept          INTEGER NOT NULL DEFAULT 0,
    duration_ms   INTEGER NOT NULL DEFAULT 0,
    error         TEXT                          -- NULL on success
);
CREATE INDEX IF NOT EXISTS idx_search_stats_ran_at ON search_stats(ran_at);
```

One row per source per search. Retention: last 100 rows per source are enough for v2; pruning happens in `mark_run()`.

### 5.4 Status rank

Hard-coded in Python (rarely changes). **Not** a stored column — computed per query via a SQL `CASE` expression in `SQLiteStore.get_scored_jobs()` so there is nothing to migrate when the rank order changes.

```python
# app/storage/sqlite_store.py
STATUS_RANK = {
    "Interviewing":       0,  # always top
    "Assessment Pending": 1,
    "Recruiter Reply":    2,
    "Applied":            3,
    "Tailoring Resume":   4,
    "Need Referral":      5,
    "Shortlisted":        6,
    "Found":              7,
    "Rejected":           8,
    "Archived":           9,
}

def _status_rank_case_sql() -> str:
    """Return a SQL CASE expression that maps applications.status → STATUS_RANK int.
    Rendered once at module load; values are compile-time constants, not user input,
    so direct interpolation is safe (no parameters needed)."""
    branches = "\n    ".join(
        f"WHEN '{status}' THEN {rank}" for status, rank in STATUS_RANK.items()
    )
    # 99 is the fallback bucket — ranks new or unknown statuses below Archived.
    return f"CASE COALESCE(applications.status, 'Found')\n    {branches}\n    ELSE 99\n  END"
```

Tracker default sort uses the rendered expression:

```sql
-- The storage query renders this expression verbatim; callers never build SQL themselves.
SELECT … ,
       (<status_rank_case>) AS status_rank
FROM scored_jobs s
JOIN jobs j ON j.id = s.job_id
LEFT JOIN applications ON applications.job_id = s.job_id
ORDER BY status_rank ASC,
         applications.next_interview_at ASC NULLS LAST,
         s.fit_score DESC,
         j.found_at DESC;
```

**Rule:** `status_rank` exists only as a query-time computed column. Never add it to `CREATE TABLE applications`. When `STATUS_RANK` changes in Python, no DB migration is required.

The scorer itself does NOT change based on status — score stays a pure relevance number. Sort is applied at query time.

## 6. API surface

All routes under `/api/`. OpenAPI docs at `/docs`. Errors use uniform shape `{"error": {"code", "message", "details"}}`.

### 6.1 Dashboard

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/dashboard` | Counts by priority, last-run timestamp, upcoming interviews (status=Interviewing sorted by `next_interview_at`), top 10 shortlist sorted by status_rank then fit. |

### 6.2 Search

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/search` | Body: `{location?, keyword?, sources?, use_llm?}`. Runs full pipeline: `fetch_all → dedupe → score_all → [refine_all if use_llm] → upsert_jobs → upsert_scored`. Returns `SearchResult` (see §6.3.1). Synchronous. Cancellable via `AbortController` on the client. |

### 6.2.1 `SearchResult` shape and per-source visibility

The search response must expose partial failures, not swallow them. Shape:

```json
{
  "jobs": [ /* ScoredJob[] — successful normalize + score from every source that worked */ ],
  "source_stats": {
    "ycombinator": {"fetched": 120, "kept": 14, "duration_ms": 812, "error": null},
    "greenhouse":  {"fetched": 0,   "kept": 0,  "duration_ms": 30012, "error": "timeout"},
    "remotive":    {"fetched": 66,  "kept": 22, "duration_ms": 340, "error": null},
    "ashby":       {"fetched": 0,   "kept": 0,  "duration_ms": 450, "error": "404 Not Found"},
    "lever":       {"fetched": 0,   "kept": 0,  "duration_ms": 420, "error": "404 Not Found"},
    "manual":      {"fetched": 0,   "kept": 0,  "duration_ms": 3,   "error": null}
  },
  "ran_at": "2026-05-05T14:22:10Z",
  "duration_ms": 31987
}
```

- `fetched` — count returned by the source API before any filtering.
- `kept` — count that passed the source's own normalize/filter predicate (e.g., YC's India filter).
- `error: null` means success; any string means that source failed and its jobs are missing from `jobs`.
- `jobs` ordering is deterministic: `status_rank ASC, fit_score DESC` (same shape as `/api/jobs`).

Frontend renders a compact per-source strip: ✓ / ✗ icon, `{kept}/{fetched}` count, duration. If any source has an error, a toast appears: "Search completed with 2 source errors — see details". Click → opens a `<Sheet>` with full `source_stats`.

### 6.2.2 Cancellation and UX guardrails

Synchronous search is acceptable only if the UX makes the wait legible. Required frontend behavior:

- **Button state.** While a search is in flight, the "Run Search" button is replaced with "Searching… (14s)" — the elapsed timer updates every 500ms from an effect.
- **Inputs locked.** All search-form inputs are disabled during the request.
- **Cancel.** A secondary "Cancel" button fires `abortController.abort()`. The mutation's `onError` distinguishes `AbortError` (no toast — the user asked) from other errors (toast with the error message).
- **Timeout visibility.** Backend enforces a 120s total timeout and 30s per source. On client timeout, show a specific error: "Search exceeded 120s — some sources are very slow. Try disabling ycombinator or greenhouse in Sources settings."
- **Historical run.** Every `/api/search` call records a row in `runs` and a row in `search_stats` (new table, §5.5 below). `/api/dashboard` surfaces the most recent `source_stats` so you can glance at health without running a fresh search.

### 6.3 Jobs

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/jobs` | Query: `status[]`, `priority[]`, `company`, `source`, `remote_type`, `location_contains`, `q` (role+company+description full-text), `sort=status_rank\|fit\|found_at`, `limit`, `offset`. Default sort = `status_rank`. |
| `GET` | `/api/jobs/{id}` | Full detail: `Job`, `ScoredJob`, `Application` (nullable). |
| `PATCH` | `/api/jobs/{id}/status` | Body: `{status, next_interview_at?, interview_notes?, notes?}`. Updates `applications` row, sets `applied_at`/`rejected_at` automatically on relevant transitions. |
| `POST` | `/api/jobs/manual` | Body: `{role, company, url, notes?}`. Creates `Job` with `source='manual'`, upserts, then scores. Minimal form per R3. |
| `POST` | `/api/jobs/{id}/tailor` | Returns `{mode: "deterministic"\|"llm", markdown, ai_pending: bool}`. |

### 6.4 Resume

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/resume` | Returns `{md_source: "portfolio"\|"local"\|"none", markdown, pdf_url?, docx_url?}`. |
| `PUT` | `/api/resume` | Body: `{markdown}`. Writes to `resumes/master.md` (never to portfolio path). |

### 6.5 Settings

| Method | Path | Purpose |
|---|---|---|
| `GET` / `PUT` | `/api/settings/profile` | Full profile JSON. |
| `GET` / `POST` / `PATCH` / `DELETE` | `/api/settings/companies[/{id}]` | CRUD, soft-delete via `enabled=0`. |
| `GET` / `PUT` | `/api/settings/scoring` | Bulk read/replace. |
| `GET` / `PUT` | `/api/settings/sources` | Bulk read/replace. |
| `POST` | `/api/settings/import-yaml` | Re-import from `config/*.yaml` into DB tables. Escape hatch. |

### 6.6 System

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/health` | Liveness. `{status: "ok", llm_enabled, notion_enabled, outlook_enabled, gmail_enabled}`. |
| `GET` | `/api/capabilities` | Feature flags the UI reads to show "AI pending" badges and disable integration-dependent buttons. |

### 6.7 Type generation flow

1. Pydantic models live in `app/api/schemas.py`.
2. `make types` runs `openapi-typescript http://localhost:47131/openapi.json -o web/src/lib/api-types.ts`.
3. Frontend uses `openapi-fetch` keyed by generated types. Every API call compile-time-checked against the backend contract.
4. CI runs the API ephemerally to regenerate types before `npm run build`; build fails on TS errors.

## 7. Frontend architecture

### 7.1 Stack

- **Build:** Vite + React 18 + TypeScript (`strict: true`)
- **Router:** React Router v6 data-router
- **Styling:** Tailwind + shadcn/ui primitives + custom `tailwind.config.ts` tokens
- **Data:** TanStack Query v5 (no Redux, no Zustand — TanStack Query + React Context for theme/toasts is enough)
- **API client:** `openapi-fetch`
- **Forms:** `react-hook-form` + `zod` resolvers
- **Markdown:** `react-markdown` + `remark-gfm`
- **Dates:** `date-fns`
- **Icons:** `lucide-react`

### 7.2 Routes

- `/` — Dashboard: 4 stat cards, upcoming interviews card, top-10 shortlist.
- `/search` — Search form, "Add Manual Job" button, results table.
- `/tracker` — Filter bar + an "Upcoming interviews" pinned section above the main table (shows jobs where `status=Interviewing` with their `next_interview_at`), followed by the full sortable applications table.
- `/resume` — Split view: preview (left), editor (right). Reset-from-portfolio button, download PDF/DOCX links.
- `/settings/{profile,companies,scoring,sources}` — Nested layout with side-nav and form-based editors. Import-from-YAML button at top.

### 7.3 Directory layout

```
web/
├── Dockerfile.web
├── nginx.conf                    # /api/* → api:47131, else index.html
├── index.html
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── vite.config.ts
└── src/
    ├── main.tsx
    ├── App.tsx                   # AppShell + Outlet
    ├── lib/
    │   ├── api-types.ts          # generated from OpenAPI — do not edit
    │   ├── api-client.ts         # openapi-fetch + TanStack Query hooks
    │   ├── format.ts             # priority → color, date formatting
    │   └── constants.ts          # STATUS_RANK mirror, PRIORITY_COLORS
    ├── components/
    │   ├── ui/                   # shadcn primitives
    │   ├── layout/               # AppShell, NavBar
    │   ├── job/
    │   │   ├── JobTable.tsx             # dense + click-to-expand
    │   │   ├── JobTableRow.tsx
    │   │   ├── JobTableExpandedRow.tsx
    │   │   ├── StatusCell.tsx
    │   │   ├── PriorityBadge.tsx
    │   │   ├── FitScoreCell.tsx
    │   │   ├── InterviewSchedulePopover.tsx
    │   │   ├── ManualJobDialog.tsx
    │   │   ├── TailorDialog.tsx
    │   │   ├── FilterBar.tsx
    │   │   └── AiPendingBadge.tsx
    │   ├── resume/
    │   │   ├── ResumePreview.tsx
    │   │   └── ResumeEditor.tsx
    │   └── shared/{Empty,Loading,Error}State.tsx
    ├── routes/
    │   ├── Dashboard.tsx
    │   ├── Search.tsx
    │   ├── Tracker.tsx
    │   ├── Resume.tsx
    │   └── settings/
    │       ├── SettingsLayout.tsx
    │       ├── Profile.tsx
    │       ├── Companies.tsx
    │       ├── Scoring.tsx
    │       └── Sources.tsx
    └── styles/globals.css        # Tailwind base + CSS variables
```

### 7.4 Design tokens

```css
:root {
  --bg: #0f1115;
  --bg-gradient-start: #1a1f2e;
  --surface: rgba(255, 255, 255, 0.03);
  --surface-hover: rgba(255, 255, 255, 0.06);
  --border: rgba(255, 255, 255, 0.08);
  --border-strong: rgba(255, 255, 255, 0.12);
  --text: #f5f6f8;
  --text-muted: #9ca3af;
  --text-faint: #6b7280;
  --accent: #22d3ee;            /* P0 */
  --accent-amber: #fbbf24;      /* P1 */
  --accent-muted: #6b7280;      /* P2 */
  --danger: #f87171;
  --success: #34d399;
  --ring: rgba(34, 211, 238, 0.4);
}
```

### 7.5 State and interaction patterns

- **Server state:** TanStack Query. Mutations invalidate `['jobs']`, `['dashboard']`, `['capabilities']` as relevant.
- **Optimistic updates:** Status changes patch the cache immediately, roll back on 4xx/5xx.
- **Expanded row state:** `useState<Set<string>>` of expanded job IDs per `JobTable` instance. Not URL-serialized (tradeoff: loses deep-linking, avoids URL spam on scroll).
- **URL-as-truth for filters:** `/search` and `/tracker` serialize filters to query string. Back/forward + bookmarks work.
- **Toasts:** shadcn `<Toaster />` at AppShell.
- **Loading UX:** skeleton rows in tables, skeleton cards on Dashboard, not spinners.

### 7.6 Dev vs. prod

| Mode | Command | Purpose |
|---|---|---|
| Dev | `docker compose --profile dev up web-dev` | Vite dev server with HMR, proxies `/api/*` to `api:47131`. |
| Prod | `docker compose up api web` | Vite builds to `dist/`, nginx serves static + proxies `/api/*`. |

## 8. Sources changes

### 8.1 New source: Y Combinator WAAS

`app/sources/ycombinator.py`:
- Endpoint: `https://www.ycombinator.com/companies/all/jobs.json` (public, no auth).
- India filter at normalize time: keep a posting if **(a)** `location` matches `r"\b(india|bengaluru|bangalore|hyderabad|mumbai|delhi|noida|gurgaon|pune|remote)\b"` case-insensitive, **(b)** `remote_type == "remote"`, or **(c)** the company name is in `companies_cfg.name`.
- Normalizes `source="ycombinator"`, `posted_date` from epoch.
- Preserves full YC payload in `Job.raw` — **never dropped, even when filter rejects the posting** (kept in raw for debugging).
- Fault-tolerant: HTTP failures logged and return `[]`, pipeline continues.

**Field-level tolerance rules** (YC schema is undocumented and unstable — these are hard requirements, not preferences):

| Field | Source key candidates | Missing behavior |
|---|---|---|
| `role` | `title`, `position_title` | Required — skip posting, log `WARNING ycombinator: missing title in %r` with the raw row id |
| `company` | `company.name`, `company_name`, `startup.name` | Required — skip posting with same warning |
| `url` | `url`, `apply_url`, `job_url` | If all missing, synthesize `ycombinator://{company}/{role}` as URL; the stable-id hash still works |
| `location` | `location`, `office_locations`, `remote_location` | Missing → `None`; India filter condition (a) fails open, fall through to (b) and (c) |
| `remote_type` | `remote` (bool), `remote_type` (string) | Infer from bool: `True → "remote"`, `False → None`. Missing → `None` (filter condition (b) fails open) |
| `posted_date` | `published_at` (epoch or ISO), `posted_at`, `created_at` | Try `datetime.fromtimestamp(int(v))` then `datetime.fromisoformat(v.replace('Z', '+00:00'))`. Both fail → `None` (recency scoring gets no bump) |
| `description` | `description`, `body`, `details` | Missing → empty string; scorer works on empty; UI shows "(no description provided)" |

All conversions wrapped in `try/except (ValueError, TypeError, KeyError)` — one malformed posting never kills the batch. Per-posting failure logs: `log.warning("ycombinator: skipped posting id=%s reason=%s", posting_id, reason)` with raw id for debugging.

### 8.1.1 YC test coverage

`tests/test_ycombinator.py` must exercise these fixtures:

- **happy path** — typical posting with all fields, located in Bengaluru → normalized correctly.
- **remote only** — `remote: true`, no location → passes filter via rule (b), `remote_type="remote"`.
- **company-matched** — no India location, not remote, but company is in `companies_cfg` → passes filter via rule (c).
- **rejected location** — London onsite, not remote, unknown company → rejected by filter; raw preserved in logs.
- **missing title** — no `title` key → skipped with warning, other postings in batch succeed.
- **missing company** — no company name → skipped with warning.
- **missing URL** — synthesized `ycombinator://…` URL, stable id still deterministic.
- **missing location** — `location: null` → `location=None`, filter falls through cleanly.
- **missing remote_type** — no `remote` key → `remote_type=None`, filter falls through cleanly.
- **malformed posted_date** — `posted_at: "not-a-date"` → `posted_date=None`, no exception.
- **epoch vs ISO date** — both formats parse correctly.
- **mixed batch** — 10 postings, 3 malformed in different ways, 7 valid → 7 returned, 3 logged.
- **network failure** — `httpx.HTTPError` → returns `[]`, caller continues.

All fixtures live in `tests/fixtures/ycombinator/*.json`. No live network calls in CI.

### 8.2 Scorer harshening

`app/scoring/rule_scorer.py`:

- `_location_points`: when `location` matches `r"\b(usa|united states|europe|uk|london|germany|canada|australia)\b"` **and** `remote_type != "remote"`, apply **−15** penalty.
- Bump remote match from `+8` to `+10` when user's `remote_preferences` contains `"remote"`.
- New `profile.exclude_locations: list[str]` (default `[]`). Any hit forces `Priority.IGNORE` — same force-skip semantics as negative keywords.

### 8.3 Companies additions

Added YC-ecosystem + India-first targets: CRED, Groww, Zerodha, Dream11, Pine Labs, Setu, Juspay, PostmanLabs, Hasura, Freshworks. Existing 22 entries untouched.

## 9. Resume integration

### 9.1 Read path (`app/resume/source.py`)

```python
@dataclass
class ResumeBundle:
    markdown: str | None
    pdf_path: Path | None
    docx_path: Path | None
    source: Literal["portfolio", "local", "none"]

def read_resume(settings) -> ResumeBundle: ...
```

Resolution order for markdown:
1. `profile.resume_md_path` (default: `/portfolio/pdfs/resume.md` inside container)
2. `resumes/master.md`
3. Return `source="none"`.

PDF/DOCX paths returned when present; UI shows "Download" links; never read into memory.

### 9.2 Docker bind-mount for portfolio

`docker-compose.yml` adds to the `api` service:

```yaml
volumes:
  - ../sathwick-portfolio/public/pdfs:/portfolio/pdfs:ro
```

**Read-only** — the API container cannot write back to the portfolio. Profile settings in the UI show the resolved container path; if the mount is stale, UI shows a clear "file not found" warning.

### 9.3 One-time seed from portfolio

New command: `python -m app.main seed-resume`.

- Checks if `resumes/master.md` contains the scaffold placeholder `"Replace this scaffold with your real master resume."`
- If yes: reads `sathwick-portfolio/public/pdfs/resume.md` if it exists. If not, parses `sathwick-portfolio/src/constants/experiences.js` + `about.js` via regex, produces a verbatim markdown from those constants.
- If no (user has edited master.md): no-op with log line.

Never writes to portfolio. Never invents experience beyond what's in the portfolio constants.

### 9.4 Tailor AI-pending mode

`POST /api/jobs/{id}/tailor` always returns usable markdown. The response carries:

- `mode: "deterministic", ai_pending: true` — no LLM key. UI renders yellow banner: "AI integration pending — add `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` to `.env` for AI-drafted rewrites." Deterministic markdown still renders.
- `mode: "llm", ai_pending: false` — success.
- `mode: "deterministic", ai_pending: false` — key configured but LLM call failed. Banner: "LLM call failed, showing deterministic template."

`<AiPendingBadge>` component lives next to every Tailor button app-wide so users see capability state without clicking.

## 10. Testing

### 10.1 Backend (pytest)

New:
- `tests/api/test_jobs.py` — CRUD, filters, sort order, status updates including interview scheduling.
- `tests/api/test_search.py` — end-to-end pipeline with mocked `httpx.MockTransport`.
- `tests/api/test_resume.py` — portfolio read path, scaffold detection, fallback chain.
- `tests/api/test_settings.py` — profile + companies + scoring CRUD, YAML import idempotency.
- `tests/test_ycombinator.py` — fixture payload, India filter, normalization.
- `tests/test_config_store.py` — YAML → DB round-trip, soft-delete preserves `sync_state` references.
- `tests/test_resume_source.py` — portfolio path resolution, scaffold-detection guard.

Updated:
- `tests/test_rule_scorer.py` — onsite-USA penalty, `exclude_locations` force-ignore, remote boost bump.

No existing test files modified except `test_rule_scorer.py`. Existing 20 tests stay green.

### 10.2 Frontend (Vitest + React Testing Library)

- Co-located `*.test.tsx` next to components.
- MSW for API mocking, handlers generated from the same OpenAPI schema.
- Critical paths:
  - `JobTable` expand/collapse keyboard + mouse
  - `StatusCell` inline update + interview picker appearing on Interviewing selection
  - `TailorDialog` renders AI-pending banner when `ai_pending: true`
  - `ResumeEditor` save + "reset from portfolio"
  - `FilterBar` URL serialization round-trip

### 10.3 CI

- `ci.yml` new workflow on push: `ruff check` + `pytest` + `web/npm test` + `web/npm run build` (includes types regen).
- `daily.yml` retained unchanged — the scheduled `run-daily` job stays optional.

## 11. Migration path

Order on first run of v2 code:

1. `docker compose build` — both Dockerfiles built fresh.
2. `docker compose run --rm cli python -m app.main init-db` — idempotent schema upgrades (`CREATE TABLE IF NOT EXISTS` + guarded `ALTER TABLE`).
3. `docker compose run --rm cli python -m app.main import-config` — seeds `settings`, `companies_cfg`, `scoring_cfg`, `sources_cfg` from `config/*.yaml`. Re-running overwrites DB with YAML values.
4. `docker compose run --rm cli python -m app.main seed-resume` — one-time resume seed (scaffold-guarded).
5. `docker compose up -d api web`.

**Rollback safety:** every schema change is additive. v1 code still reads the same DB if reverted.

**Deleted in v2:**
- `app/ui/` (Streamlit app)
- `app/main.py::ui` CLI command + typer registration
- `streamlit` from `requirements.txt`
- `ui` service from `docker-compose.yml`

**Retained:** all v1 CLI commands (`init-db`, `collect`, `score`, `run-daily`, `shortlist`, `sync-notion`, `tailor`, `export-json`, `check-email`). New commands: `import-config`, `seed-resume`.

## 12. Risks and tradeoffs

| Risk | Mitigation |
|---|---|
| YAML-vs-DB drift when user edits YAML and forgets to re-import | Settings page banner: "Last imported from YAML: <timestamp>" + one-click re-import button. CLI `run-daily` uses DB config. |
| Portfolio bind-mount fragility if portfolio repo moves | Settings Profile form shows resolved container path; missing-file warning is immediate and visible. |
| Synchronous search can block 30–60s on a slow source | Per-source 30s timeout (already in `sources/base.py`), total `/api/search` 120s timeout. §6.2.2 UX guardrails: elapsed timer on button, disabled inputs, Cancel via `AbortController`, per-source `source_stats` in the response so the UI surfaces partial failures instead of looking frozen. Revisit SSE if hit repeatedly. |
| YC schema drift | §8.1 field-level tolerance rules + §8.1.1 fixture coverage for every missing/malformed variant. Raw payload always preserved in `Job.raw` for post-hoc debugging. |
| OpenAPI → TS codegen needs a live API | `make types` documented. CI spins api ephemerally before `npm build`. |
| Two Dockerfiles double the build matrix | Compose caches each image independently; rebuild cost is lower than a combined image over session lifetime. |

## 13. Explicitly preserved from v1

- Content-hashed `job_id` formula (`sha256(company|role|url)[:16]`).
- Scoring rubric 40/20/10/15/10/5 — only penalties/boosts added.
- Notion sync schema — unchanged. Interview fields SQLite-only until user is confident enough to extend Notion.
- Config repository abstraction (`LocalConfigRepository`, `RemoteHttpReadOnlyConfigRepository`).
- Graceful-degrade contract for every integration.
- No auto-apply, no login-gated scraping — ironclad.

## 14. Open questions

None at design sign-off. Planning will decompose this into ordered tasks.

## 15. References

- Brainstorm session: conversation 2026-05-05.
- Portfolio repo (sibling): `/Users/sathwick/my-office/professional_growth_projects/sathwick-portfolio/`.
- Memory: `.claude/memory/reference/resume_source_in_portfolio.md`, `.claude/memory/feedback/prefer_docker_compose.md`.
- v1 scaffold: commits `23e7ffa`..`3704aba`.
