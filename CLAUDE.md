# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common commands

**Python (run against the `.venv`; Docker compose is the way to run services):**

```bash
.venv/bin/pytest -q                         # full backend suite
.venv/bin/pytest tests/test_rule_scorer.py  # one file
.venv/bin/pytest tests/test_notion_sync.py::test_uses_url_filter_when_sync_state_empty -v  # one test
.venv/bin/ruff check app tests              # lint
```

**Web (run from `web/`):**

```bash
npm test                       # vitest, full run
npm test -- PriorityBadge      # single file (substring match)
npm run build                  # tsc -b && vite build (typecheck + bundle)
npm run lint                   # eslint --max-warnings 0
npm run dev                    # vite dev on :47130, proxies /api → :47131
```

**Docker compose (primary runtime — not host venv):**

```bash
docker compose build
docker compose up -d api web
docker compose run --rm cli python -m app.main <cmd>   # init-db | import-config | seed-resume | run-daily | ...
docker compose logs -f api web
```

**Make shortcuts:** `make test` (pytest + vitest), `make lint` (ruff + eslint), `make types` (regenerate `web/src/lib/api-types.ts` — API must already be running on :47131).

**Regenerate typed API client** (required after any route/schema change):

```bash
# With API running on :47131
cd web && npx openapi-typescript http://localhost:47131/openapi.json -o src/lib/api-types.ts
```

CI fails if `api-types.ts` is stale relative to the live OpenAPI schema — always regen after changing request/response shapes.

## Architecture

### Two-process stack, one SQLite file

Backend is FastAPI (`app/api`, served on :47131 via `python -m app.api.main`) + a typer CLI (`python -m app.main`) sharing one SQLite DB at `data/job_search.db`. Frontend is a React 18 + Vite SPA served by nginx on :47130, which proxies `/api/*` to the API container.

`data/`, `config/`, `resumes/` are bind-mounted into both containers, and `../sathwick-portfolio/public/pdfs` is bind-mounted read-only at `/portfolio/pdfs` so the resume editor can surface the canonical resume without a copy step.

### Config has two layers — the resolver is the seam

`config/*.yaml` is the **seed**. `ConfigStore` (SQLite tables `settings`, `companies_cfg`, `scoring_cfg`, `sources_cfg` in `app/storage/config_store.py`) is the **runtime source of truth**. The Settings UI writes to ConfigStore.

The CLI pipeline (`collect`, `score`, `run-daily`) and `/api/search` read through `app/storage/config_resolver.py`, which picks ConfigStore if the relevant table has any rows, else falls back to YAML via `ConfigRepository`. Presence is checked via `has_profile()` / `has_companies()` / `has_scoring()` / `has_sources()` — **not** truthiness — so "user disabled every company in the UI" doesn't accidentally resurrect the YAML seed.

If you add a new config surface: add a table to ConfigStore, a `has_*` presence check, a resolver function, and wire any pipeline reader through the resolver (never directly off the YAML repo).

### Error envelope is centralized on both sides

Backend installs one handler in `app/api/errors.py` that wraps every error as `{error: {code, message, details}}`. Frontend pulls the user-facing message via `apiErrorMessage(error)` in `web/src/lib/api-client.ts`, which handles three shapes in order: envelope, FastAPI `HTTPValidationError` (`detail` array), bare `{detail: string}`. Always use the helper — don't poke into `error.detail[0].msg` directly; openapi-typescript types it as `HTTPValidationError` and it breaks under the envelope.

### Status-aware job ordering lives in SQL

`app/storage/sqlite_store.py` builds a SQL `CASE` from `STATUS_RANK` (Interviewing=0, Assessment Pending=1, …, Archived=9) and sorts every `scored_jobs` query by that rank first. This is why Tracker rows pin active applications to the top without app-level sorting. Never add a new status without adding its rank.

### Scoring pipeline: rule first, LLM refiner ±15

`app/scoring/rule_scorer.py` produces a deterministic 0–100 score (40 skills / 20 level / 10 location / 15 domain / 10 recency / 5 target-company) and assigns priority via `config/scoring.yaml` thresholds. `app/scoring/llm_scorer.py` is an **optional** refiner invoked only when `settings.llm_enabled` — it gets a ±15 delta bounded against the rule score. LLM failures (timeouts, rate limits, malformed JSON, non-int `score_delta`) log a warning and return the rule-scored job unchanged; never let an LLM exception fail the batch.

### Notion sync is idempotent across stateless environments

`app/integrations/notion.py::sync_scored_jobs` looks up an existing Notion page by URL filter (`databases.query(filter={"property":"URL","url":{"equals": url}})`) when `sync_state` doesn't already carry the `external_id`. This is what makes GitHub Actions (which starts with a fresh SQLite every run) not create duplicates. It writes the page id back to `sync_state` on hit so steady-state runs skip the extra query.

The Notion DB schema is **not** auto-created — mismatch prints the required properties and exits with code 2. `sync-notion` / `run-daily` exit 0/1/2 based on hard-failure vs partial failure; see `app/main.py` for the exact policy (`--allow-partial` relaxes partial failures only).

### Sources must degrade gracefully

Every `app/sources/*` fetcher inherits `Source.fetch()` — contract is **return `[]` on network failure, never raise**. Validation/config errors may raise. Greenhouse/Ashby/Lever/Y Combinator all key off fields in `config/companies.yaml` (`board_token`, `org_slug`, `company_slug`); LinkedIn/Naukri/recruiter DMs have no fetcher by design and go through `app/sources/manual.py` / the Manual Jobs UI.

### Resume has three resolution paths

`app/resume/source.py::read_resume` returns a `ResumeBundle` with `source="portfolio" | "local" | "none"`:

1. `RESUME_MD_PATH` (portfolio bind mount) if the file exists.
2. `{settings.resume_dir}/master.md` (local editable).
3. Nothing found → `source="none"`.

The editor UI shows the source badge and disables "Save" when `source="portfolio"` (PUT returns 409 — we never write back into the portfolio bind mount). `local_resume_path(settings)` is the single source for the editable path — the PUT route and `seed-resume` both call it so they can't drift.

### Frontend testing intercepts `fetch` with a `Request` object

openapi-fetch passes a `Request` to `fetch`, not `(url, init)`. Vitest test stubs need to handle both:

```ts
global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const req = input instanceof Request ? input : new Request(String(input), init);
  const url = req.url;
  const method = req.method;
  const body = req.body ? await req.text() : "";
  // ...
});
```

Same pattern applies in every route test under `web/src/routes/*.test.tsx`.

## Conventions

- **Commits:** Conventional style, scoped (`feat(web): …`, `fix(notion): …`, `test+ci: …`). One logical unit per commit, Co-Authored-By footer. See `AGENTS.md` for full PR guidelines.
- **Python:** type hints + Pydantic v2 everywhere, snake_case, `ruff` clean, tests named `test_*.py`. Python 3.13.
- **Web:** PascalCase components colocated with `Component.test.tsx`, 2-space indent, Tailwind utility classes, no lint warnings (`--max-warnings 0`).
- **Generated files are read-only:** never hand-edit `web/src/lib/api-types.ts`; regenerate via `make types`.
- **Secrets:** optional integrations (Notion, LLM, Outlook, Gmail) must degrade when env vars are missing. `.env.example` is shareable; real `.env` and `data/` are gitignored.

## Ports

| Port  | Service                       |
|-------|-------------------------------|
| 47130 | nginx (SPA + `/api` proxy)    |
| 47131 | FastAPI (uvicorn)             |
