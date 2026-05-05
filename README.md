# job-search-agent

A **local-first** Python tool that manages your job search like a CRM / control tower — without turning into an auto-apply bot.

- **Collects** jobs from public sources (Remotive, Greenhouse, Ashby, Lever) plus a manual-paste path for LinkedIn / Naukri / recruiter posts / WhatsApp / Telegram.
- **Normalizes + deduplicates** everything into a `Job` model with a stable content-hashed id.
- **Scores** relevance against your profile with a deterministic rubric; optionally refines via LLM.
- **Stores** everything in SQLite. Optional Notion sync, optional Streamlit UI, optional GitHub Actions scheduler.
- **Never** scrapes login-gated sites, auto-applies, or sends recruiter messages without your approval.

## Design principles

- **SQLite / local files are the source of truth.** Notion is an optional dashboard, not the DB.
- **LLM is optional.** No key set → rule-based scoring. Key set → LLM refiner with a bounded delta on top of the rule score.
- **LinkedIn / Naukri are manual inputs.** Paste the JD into `config/manual_jobs.yaml` or the UI's Manual Jobs page.
- **Every integration degrades gracefully.** Missing Notion creds → skip. Missing API key → rule only. Missing Outlook/Gmail creds → skeleton returns `[]`.

## Setup

```bash
# 1. Create a venv (uses the newest Python on your machine)
python3.13 -m venv .venv
source .venv/bin/activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Copy env template
cp .env.example .env

# 4. Edit config/profile.yaml — update name, skills, locations, compensation
# 5. Edit resumes/master.md — replace the scaffold with your real resume
# 6. (Optional) Paste initial jobs into config/manual_jobs.yaml

# 7. Initialize the SQLite DB
python -m app.main init-db

# 8. Run the full daily pipeline (collect → score → shortlist → optional notion)
python -m app.main run-daily

# 9. Open the UI
python -m app.main ui
# → http://localhost:8501
```

## CLI commands

| Command | What it does |
|---|---|
| `python -m app.main init-db` | Create the SQLite schema at `data/job_search.db`. |
| `python -m app.main collect` | Fetch + dedupe + upsert jobs from all enabled sources. |
| `python -m app.main score` | Re-score every stored job. `--no-llm` forces rule-only. |
| `python -m app.main run-daily` | Full pipeline. This is what the GitHub Actions workflow runs. |
| `python -m app.main shortlist` | Regenerate `data/shortlist.md` from the store. |
| `python -m app.main sync-notion` | Push P0/P1/P2 scored jobs to Notion (skipped if creds missing). |
| `python -m app.main tailor --job-id <id> --resume-file resumes/master.md` | Print a tailor markdown sheet for one job (deterministic if no LLM key). |
| `python -m app.main export-json` | Snapshot the store to `data/exports/export_<ts>.json`. |
| `python -m app.main check-email` | Classify recent job-related emails via Outlook/Gmail (v1 skeletons). |
| `python -m app.main ui` | Launch the Streamlit control panel. |

## Streamlit UI sections

1. **Dashboard** — counts, last run, shortlist preview
2. **Profile Config** — edit `profile.yaml`
3. **Companies Config** — edit `companies.yaml`
4. **Scoring Config** — edit `scoring.yaml`
5. **Sources Config** — edit `sources.yaml`
6. **Resume Variants** — list + preview all resume variants
7. **Manual Jobs** — add/remove manual jobs via form, saved to `manual_jobs.yaml`
8. **Shortlist Preview** — render `data/shortlist.md`
9. **Run Actions** — one-click buttons for `collect`, `run-daily`, `export-json`, `sync-notion`

> When `CONFIG_BACKEND=http`, the UI is read-only: save buttons are disabled and a banner explains why.

## Tuning scoring

`config/scoring.yaml` drives everything:

- **Thresholds** map score → priority: `P0=80, P1=70, P2=60` by default.
- **Positive keywords** add small points on top of strong/secondary-skill matches.
- **Negative keywords** force `Priority=Ignore` regardless of raw score. This is how `frontend only`, `QA only`, `intern`, `10+ years required` get filtered out.
- **Location / domain / company / source boosts** are additive.
- **`resume_variant_rules`** let you recommend a specific resume variant when matched skills contain certain signals (e.g., `llm` / `applied ai` → `applied_ai.md`).

## Adding companies

Edit `config/companies.yaml`. For each target company:

- `ats_type: greenhouse` → set `board_token`
- `ats_type: ashby` → set `org_slug`
- `ats_type: lever` → set `company_slug`
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
- runs `init-db` + `run-daily`,
- uploads `data/shortlist.md` as a workflow artifact (14-day retention).

To use it:

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

- **Local SQLite as source of truth** — it's a single file, trivially backupable, offline-capable, and testable without mocks.
- **Notion is optional** — it's a nice dashboard, but anything Notion stores can be rebuilt from the local DB, so loss is not catastrophic.
- **LinkedIn / Naukri are manual** — scraping them violates ToS and gets your account flagged. Pasting the JD takes 20 seconds and works across every source (WhatsApp, recruiter DM, Telegram, etc.).
- **No auto-apply / no mass outreach** — the app generates drafts; you decide what to send.
- **Deterministic scoring first, LLM second** — rule scores are reproducible and debuggable. LLM is a refiner that can nudge ±15, not a replacement.

## Development

```bash
# Run tests
pytest

# Lint (optional)
ruff check app tests
```

## Repository layout

```
app/
  main.py              # typer CLI (init-db, collect, score, run-daily, shortlist, sync-notion, tailor, export-json, check-email, ui)
  config.py            # Settings dataclass (env)
  models.py            # Job, ScoredJob, Priority, ApplicationStatus, EmailEvent
  utils.py             # stable_job_id, logger, text helpers
  dedupe.py
  config_repo/         # ConfigRepository: local + remote-http (read-only)
  sources/             # remotive, greenhouse, ashby, lever, manual + fetch_all
  scoring/             # rule_scorer (40/20/10/15/10/5), llm_scorer (optional refiner)
  resume/              # tailor + prompts
  storage/             # sqlite_store, json_export
  integrations/        # notion, outlook, gmail (optional, graceful skip)
  reports/             # shortlist markdown
  ui/                  # streamlit_app.py

config/                # profile.yaml, companies.yaml, scoring.yaml, sources.yaml, manual_jobs.yaml
resumes/               # master.md + variants
data/                  # job_search.db, shortlist.md, exports/  (gitignored)
tests/                 # pytest
.github/workflows/     # daily.yml
```
