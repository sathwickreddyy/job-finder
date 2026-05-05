---
name: Prefer Docker Compose over host services
description: For the job-finder project, run the app via Docker Compose rather than activating a venv and running Python directly on the host
type: feedback
---

For the `job-finder` project, default to Docker Compose for running any service (UI, daily pipeline, one-off CLI commands). Do NOT default to `source .venv/bin/activate && python -m app.main …` when the user asks to run something.

**Why:** User explicitly requested "spin up this in docker for now and update memories to use docker compose instead of using system services." They want containerized lifecycle (`docker ps`, `docker compose down`) rather than host processes that can linger as zombies.

**How to apply:**
- When the user says "run the app" / "start the UI" / "run the pipeline", reach for `docker compose …` commands (e.g., `docker compose up -d ui`, `docker compose run --rm daily`, `docker compose run --rm cli init-db`).
- Keep the host `.venv` around only for running `pytest` during development — tests are fine to run natively.
- If adding new runtime dependencies, update `requirements.txt` AND rebuild with `docker compose build`; mention both steps.
- `.env` is optional (`env_file.required: false`) so fresh clones work without it; remind the user to `cp .env.example .env` before wiring Notion/LLM credentials.
- The SQLite DB at `data/job_search.db` is bind-mounted so it survives container rebuilds and is readable from the host for inspection.
