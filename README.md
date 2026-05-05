# job-finder

A **local-first** job-search control tower. Not an auto-apply bot — a CRM that collects, scores, shortlists, and tracks roles while you stay in the driver's seat.

**Tech Stack:** FastAPI + SQLite backend + React 18 + TypeScript + Tailwind frontend, served via Docker Compose on ports 47130 (web) / 47131 (api).

- **Collects** jobs from public sources (Remotive, Greenhouse, Ashby, Lever, Y Combinator) plus a manual-paste path for LinkedIn / Naukri / recruiter posts / WhatsApp / Telegram.
- **Normalizes + deduplicates** everything into a `Job` model with a stable content-hashed id.
- **Scores** relevance against your profile with a deterministic rubric; optionally refines via LLM.
- **Stores** everything in SQLite. Optional Notion sync, optional GitHub Actions scheduler.
- **Never** scrapes login-gated sites, auto-applies, or sends recruiter messages without your approval.

## Design principles

- **SQLite is the source of truth.** Config (profile / companies / scoring / sources) lives in SQLite tables, seeded once from `config/*.yaml` via `import-config`. Notion is an optional dashboard, not the DB.
- **LLM is optional.** No key set → rule-based scoring. Key set → LLM refiner with a bounded delta on top of the rule score.
- **LinkedIn / Naukri are manual inputs.** Paste the JD into `config/manual_jobs.yaml` or the UI's Manual Jobs page.
- **Every integration degrades gracefully.** Missing Notion creds → skip. Missing API key → rule only. Missing Outlook/Gmail creds → skeleton returns `[]`.

## Setup (Docker — recommended)

```bash
# 1. Build both images
docker compose build

# 2. Copy env template (optional — app starts without it)
cp .env.example .env

# 3. Initialize DB + import YAML config + seed resume (one-time)
docker compose run --rm cli python -m app.main init-db
docker compose run --rm cli python -m app.main import-config
docker compose run --rm cli python -m app.main seed-resume

# 4. Launch the stack
docker compose up -d api web
# → UI:    http://localhost:47130
# → API:   http://localhost:47131
# → Docs:  http://localhost:47131/docs
```

### Services

| Service | Purpose | How to invoke |
|---|---|---|
| `api` | FastAPI on :47131 | `docker compose up -d api` |
| `web` | React SPA (nginx) on :47130 | `docker compose up -d web` |
| `cli` | Interactive CLI scratchpad | `docker compose run --rm cli python -m app.main <cmd>` |

`data/`, `config/`, `resumes/` are **bind-mounted** into the containers, so the SQLite DB, YAML edits, and markdown resumes live on the host — inspect them with `sqlite3 data/job_search.db`, edit YAML in your IDE, and nothing is lost on `docker compose down`.

The `cli` service is behind the `tasks` profile, so `docker compose up` only starts `api` + `web`.

### Setup (native Python — for tests only)

```bash
python3.13 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pytest
```

## CLI commands

| Command | What it does |
|---|---|
| `python -m app.main init-db` | Create the SQLite schema at `data/job_search.db`. |
| `python -m app.main import-config` | Import `config/*.yaml` into SQLite tables (one-time / re-import). |
| `python -m app.main seed-resume` | Seed `resumes/master.md` from the portfolio bind-mount if still scaffold. |
| `python -m app.main collect` | Fetch + dedupe + upsert jobs from all enabled sources. |
| `python -m app.main score` | Re-score every stored job. `--no-llm` forces rule-only. |
| `python -m app.main run-daily` | Full pipeline. This is what the GitHub Actions workflow runs. |
| `python -m app.main shortlist` | Regenerate `data/shortlist.md` from the store. |
| `python -m app.main sync-notion` | Push P0/P1/P2 scored jobs to Notion (skipped if creds missing). |
| `python -m app.main tailor --job-id <id> --resume-file resumes/master.md` | Print a tailor markdown sheet for one job (deterministic if no LLM key). |
| `python -m app.main export-json` | Snapshot the store to `data/exports/export_<ts>.json`. |
| `python -m app.main check-email` | Classify recent job-related emails via Outlook/Gmail (v1 skeletons). |

## React SPA routes

1. **Dashboard** — counts, upcoming interviews, top shortlist preview
2. **Tracker** — status-aware sortable job table with inline status + interview edits
3. **Search** — on-demand collect+score with per-source stats and a cancelable elapsed timer
4. **Resume** — split markdown preview / editor, source origin badge (portfolio vs. local)
5. **Settings** — Profile / Companies / Scoring / Sources with inline CRUD and YAML re-import

All routes are typed against the live OpenAPI schema (`web/src/lib/api-types.ts`), fetched via TanStack Query v5.

## Tuning scoring

`config/scoring.yaml` (imported into the `scoring` SQLite table) drives everything:

- **Thresholds** map score → priority: `P0=80, P1=70, P2=60` by default.
- **Positive keywords** add small points on top of strong/secondary-skill matches.
- **Negative keywords** force `Priority=Ignore` regardless of raw score. This is how `frontend only`, `QA only`, `intern`, `10+ years required` get filtered out.
- **Location / domain / company / source boosts** are additive.
- **`resume_variant_rules`** let you recommend a specific resume variant when matched skills contain certain signals (e.g., `llm` / `applied ai` → `applied_ai.md`).

Edit live from the Settings → Scoring page in the UI, or edit `config/scoring.yaml` and re-run `import-config`.

## Adding companies

Edit `config/companies.yaml` (or Settings → Companies in the UI). For each target company:

- `ats_type: greenhouse` → set `board_token`
- `ats_type: ashby` → set `org_slug`
- `ats_type: lever` → set `company_slug`
- `ats_type: ycombinator` → Y Combinator jobs board fallback (no slug needed)
- `ats_type: workday | unknown` → not fetched by source pipeline (scored via `company_boost`); use Manual Jobs.

Example:

```yaml
- name: Razorpay
  ats_type: lever
  company_slug: razorpay
  priority: P0
  preferred_locations: [Bengaluru]
```

## Notion sync (optional)

1. Create a Notion integration at https://www.notion.so/my-integrations and copy its secret into `NOTION_TOKEN`.
2. Create a database in Notion with these **exact** property names and types:

   | Property | Type |
   |---|---|
   | Role | Title |
   | Company | Rich text |
   | URL | URL |
   | Source | Select |
   | Status | Select |
   | Priority | Select (P0/P1/P2/Ignore) |
   | Fit Score | Number |
   | Level Match | Select |
   | Location | Rich text |
   | Remote Type | Select |
   | Posted Date | Date |
   | Found Date | Date |
   | Resume Variant | Select |
   | JD Summary | Rich text |
   | Matched Skills | Multi-select |
   | Missing Skills | Multi-select |
   | Next Action | Rich text |
   | Notes | Rich text |

3. Share the database with your integration, copy the database ID into `NOTION_JOBS_DATABASE_ID`.
4. Run `python -m app.main sync-notion` or the daily pipeline. Sync is idempotent (round-trips `notion_page_id` via `sync_state`).

If your schema is different, the app prints the required property list and exits without writing.

## GitHub Actions scheduler (optional)

`.github/workflows/daily.yml` runs at 02:30 UTC (08:00 IST) and on manual dispatch. It:

- installs dependencies,
- runs `init-db` + `import-config` + `run-daily`,
- uploads `data/shortlist.md` as a workflow artifact (14-day retention).

`.github/workflows/ci.yml` runs on every push / PR:

- **python** job: `ruff check app tests` + `pytest -q`
- **web** job: `npm install` → regenerate `api-types.ts` from live API → `npm run build` → `npm test`

To use the scheduler:

1. Push to a **private** repository (your config may contain target companies and private notes).
2. Add these repository secrets as needed (all optional — missing ones are skipped gracefully):
   - `NOTION_TOKEN`, `NOTION_JOBS_DATABASE_ID`
   - `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`, `LLM_MODEL`
   - `CONFIG_SOURCE_URL`, `RESUME_SOURCE_URL` (if you keep config/resume in a separate private URL, set `CONFIG_BACKEND=http`)

**Important:** the workflow does *not* commit generated personal data back to the repo. Durable state lives in Notion or in a private config source you control. Never put secrets or a real resume into a public repository.

## Outlook / Gmail (optional skeletons)

v1 ships headless-safe stubs:

- `check_recent_job_emails(settings)` returns `[]` when creds are missing.
- `classify_email(subject, snippet)` is a regex classifier producing labels like `interview_invite`, `recruiter_reply`, `rejection`. When you wire OAuth later, forward each fetched message to this function and store the resulting `EmailEvent` via `store.record_email_event()`.

## Why these choices?

- **Local SQLite as source of truth** — single file, trivially backupable, offline-capable, and testable without mocks.
- **Notion is optional** — a nice dashboard, but anything Notion stores can be rebuilt from the local DB, so loss is not catastrophic.
- **LinkedIn / Naukri are manual** — scraping them violates ToS and gets your account flagged. Pasting the JD takes 20 seconds and works across every source (WhatsApp, recruiter DM, Telegram, etc.).
- **No auto-apply / no mass outreach** — the app generates drafts; you decide what to send.
- **Deterministic scoring first, LLM second** — rule scores are reproducible and debuggable. LLM is a refiner that can nudge ±15, not a replacement.
- **Two Dockerfiles** — python and node dep trees rebuild independently; nginx proxies `/api/*` to FastAPI so the SPA only needs one origin.

## Development

```bash
# Python side
.venv/bin/pytest -q
.venv/bin/ruff check app tests

# Web side
cd web
npm install
npm run dev        # Vite dev server (proxies /api to :47131)
npm test           # Vitest
npm run build      # production bundle → dist/
```

Regenerate the typed API client after any schema change:

```bash
# API must be running on :47131
cd web && npx openapi-typescript http://localhost:47131/openapi.json -o src/lib/api-types.ts
```

## Repository layout

```
app/
  main.py              # typer CLI (init-db, import-config, seed-resume, collect, score, run-daily, ...)
  config.py            # Settings dataclass (env)
  models.py            # Job, ScoredJob, Priority, ApplicationStatus, EmailEvent
  utils.py             # stable_job_id, logger, text helpers
  dedupe.py
  api/                 # FastAPI app + routes + schemas + deps (served on :47131)
  config_repo/         # ConfigRepository: local + remote-http (read-only) + SQLite-backed ConfigStore
  sources/             # remotive, greenhouse, ashby, lever, ycombinator, manual + fetch_all
  scoring/             # rule_scorer (40/20/10/15/10/5), llm_scorer (optional refiner)
  resume/              # tailor + prompts + source resolver (portfolio vs. local)
  storage/             # sqlite_store, json_export
  integrations/        # notion, outlook, gmail (optional, graceful skip)
  reports/             # shortlist markdown

web/                   # React 18 + Vite + TS + Tailwind SPA (built into nginx image)
  src/routes/          # dashboard, tracker, search, resume, settings
  src/components/      # shared primitives + job table + filter bar + dialogs
  src/lib/             # api-client, api-types (generated), query keys, format helpers

config/                # profile.yaml, companies.yaml, scoring.yaml, sources.yaml, manual_jobs.yaml
resumes/               # master.md + variants
data/                  # job_search.db, shortlist.md, exports/  (gitignored)
tests/                 # pytest
.github/workflows/     # ci.yml (push/PR) + daily.yml (scheduler)
Dockerfile.api         # python → FastAPI
Dockerfile.web         # node → static build → nginx
docker-compose.yml     # api + web + cli (tasks profile)
```
