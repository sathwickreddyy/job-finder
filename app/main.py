"""CLI entrypoint: `python -m app.main <command>`.

`run-daily` is the orchestrator every other command is a slice of:
    collect     → fetch + dedupe + upsert jobs
    score       → rule-score (+ optional LLM refine) stored jobs
    shortlist   → render shortlist.md from scored_jobs
    sync-notion → push P0/P1/P2 to Notion
    export-json → snapshot of scored_jobs to data/exports/
    check-email → classify recent emails (skeleton)
    tailor      → print a tailor markdown for a single job
    ui          → spawn streamlit on streamlit_app.py
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path
from typing import Annotated, Optional

import typer

from .config import Settings, load_settings
from .config_repo import (
    COMPANIES_YAML,
    MANUAL_JOBS_YAML,
    PROFILE_YAML,
    SCORING_YAML,
    SOURCES_YAML,
    build_config_repository,
)
from .dedupe import dedupe_jobs
from .integrations import notion as notion_int
from .integrations import outlook as outlook_int
from .integrations import gmail as gmail_int
from .models import Priority
from .reports import write_shortlist
from .resume import tailor as tailor_fn
from .scoring import refine_all, score_all
from .sources import fetch_all
from .storage import build_store, export_all
from .utils import get_logger

app = typer.Typer(add_completion=False, no_args_is_help=True, help="job-search-agent CLI")
log = get_logger("cli")


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------
def _load_all_config(settings: Settings):
    repo = build_config_repository(settings)
    profile = repo.load_yaml(PROFILE_YAML)
    companies = repo.load_yaml(COMPANIES_YAML)
    scoring = repo.load_yaml(SCORING_YAML)
    sources = repo.load_yaml(SOURCES_YAML)
    # manual_jobs is loaded inside ManualSource on demand
    return repo, profile, companies, scoring, sources


# ---------------------------------------------------------------------------
# init-db
# ---------------------------------------------------------------------------
@app.command("init-db", help="Create the SQLite schema.")
def init_db() -> None:
    settings = load_settings()
    store = build_store(settings)
    store.init_schema()
    typer.echo(f"initialized SQLite at {settings.sqlite_db_path}")


# ---------------------------------------------------------------------------
# collect
# ---------------------------------------------------------------------------
@app.command("collect", help="Fetch + dedupe + upsert jobs from configured sources.")
def collect() -> None:
    settings = load_settings()
    store = build_store(settings)
    store.init_schema()
    repo, _profile, companies, _scoring, sources = _load_all_config(settings)
    jobs = fetch_all(repo, sources, companies)
    unique = dedupe_jobs(jobs)
    n = store.upsert_jobs(unique)
    typer.echo(f"collected={len(jobs)} unique={len(unique)} upserted={n}")


# ---------------------------------------------------------------------------
# score
# ---------------------------------------------------------------------------
@app.command("score", help="Score stored jobs (rule-based; LLM refiner if configured).")
def score(
    llm: bool = typer.Option(
        True, "--llm/--no-llm", help="Use LLM refiner when an API key is configured."
    ),
    max_refine: int = typer.Option(20, help="Cap LLM-refined candidates per run."),
) -> None:
    settings = load_settings()
    store = build_store(settings)
    store.init_schema()
    _repo, profile, companies, scoring_cfg, _sources = _load_all_config(settings)

    # Re-score everything in the jobs table.
    with store._conn() as c:
        rows = c.execute("SELECT id FROM jobs").fetchall()
    ids = [r["id"] for r in rows]
    jobs = [j for j in (store.get_job(i) for i in ids) if j is not None]

    scored = score_all(jobs, profile, scoring_cfg, companies)
    if llm and settings.llm_enabled:
        scored = refine_all(scored, profile, scoring_cfg, settings, max_refine=max_refine)
    n = store.upsert_scored_jobs(scored)

    counts = store.count_by_priority()
    typer.echo(f"scored={n} counts={counts}")


# ---------------------------------------------------------------------------
# shortlist
# ---------------------------------------------------------------------------
@app.command("shortlist", help="Regenerate data/shortlist.md from stored scored jobs.")
def shortlist() -> None:
    settings = load_settings()
    store = build_store(settings)
    scored = store.get_scored_jobs()
    path = Path("data/shortlist.md")
    write_shortlist(scored, path)
    typer.echo(f"wrote {path} ({len(scored)} scored jobs)")


# ---------------------------------------------------------------------------
# sync-notion
# ---------------------------------------------------------------------------
@app.command("sync-notion", help="Sync P0/P1/P2 jobs to Notion (skipped if creds missing).")
def sync_notion() -> None:
    settings = load_settings()
    store = build_store(settings)
    scored = store.get_scored_jobs(
        priorities=[Priority.P0.value, Priority.P1.value, Priority.P2.value]
    )
    result = notion_int.sync_scored_jobs(scored, settings, store)
    typer.echo(f"notion: {result}")


# ---------------------------------------------------------------------------
# tailor
# ---------------------------------------------------------------------------
@app.command("tailor", help="Print a tailor markdown for one job; does not write any file.")
def tailor(
    job_id: Annotated[str, typer.Option("--job-id", help="Job id from the scored_jobs table.")],
    resume_file: Annotated[
        Path, typer.Option("--resume-file", exists=False, help="Path to resume markdown.")
    ] = Path("resumes/master.md"),
) -> None:
    settings = load_settings()
    store = build_store(settings)
    scored = next((s for s in store.get_scored_jobs() if s.job.id == job_id), None)
    if not scored:
        typer.echo(f"no scored job with id={job_id}", err=True)
        raise typer.Exit(code=1)
    resume_text = resume_file.read_text(encoding="utf-8") if resume_file.exists() else ""
    _repo, profile, _companies, _scoring, _sources = _load_all_config(settings)
    md = tailor_fn(resume_text=resume_text, scored=scored, profile=profile, settings=settings)
    typer.echo(md)


# ---------------------------------------------------------------------------
# export-json
# ---------------------------------------------------------------------------
@app.command("export-json", help="Export scored jobs snapshot to data/exports/.")
def export_json() -> None:
    settings = load_settings()
    store = build_store(settings)
    out = export_all(store, Path("data/exports"))
    typer.echo(f"exported → {out}")


# ---------------------------------------------------------------------------
# check-email
# ---------------------------------------------------------------------------
@app.command("check-email", help="Classify recent job-related emails (skeleton in v1).")
def check_email() -> None:
    settings = load_settings()
    store = build_store(settings)
    store.init_schema()
    events = outlook_int.check_recent_job_emails(settings)
    events += gmail_int.check_recent_job_emails(settings)
    for ev in events:
        store.record_email_event(ev)
    typer.echo(f"email events recorded: {len(events)}")


# ---------------------------------------------------------------------------
# run-daily
# ---------------------------------------------------------------------------
@app.command("run-daily", help="One-shot pipeline: collect → score → shortlist → (optional) notion.")
def run_daily(
    llm: bool = typer.Option(True, "--llm/--no-llm"),
    max_refine: int = typer.Option(20),
) -> None:
    settings = load_settings()
    store = build_store(settings)
    store.init_schema()
    repo, profile, companies, scoring_cfg, sources_cfg = _load_all_config(settings)

    # 1. Collect
    jobs = fetch_all(repo, sources_cfg, companies)
    unique = dedupe_jobs(jobs)
    store.upsert_jobs(unique)
    log.info("run-daily: collected=%d unique=%d", len(jobs), len(unique))

    # 2. Score
    scored = score_all(unique, profile, scoring_cfg, companies)
    if llm and settings.llm_enabled:
        scored = refine_all(scored, profile, scoring_cfg, settings, max_refine=max_refine)
    store.upsert_scored_jobs(scored)

    counts = store.count_by_priority()
    log.info("run-daily: counts=%s", counts)

    # 3. Shortlist
    path = Path("data/shortlist.md")
    write_shortlist(store.get_scored_jobs(), path)

    # 4. Optional Notion sync
    if settings.notion_enabled:
        targets = store.get_scored_jobs(
            priorities=[Priority.P0.value, Priority.P1.value, Priority.P2.value]
        )
        result = notion_int.sync_scored_jobs(targets, settings, store)
        log.info("run-daily: notion=%s", result)
    else:
        log.info("run-daily: notion skipped (no creds)")

    store.mark_run()
    typer.echo(f"run-daily complete: {counts} — shortlist at {path}")


# ---------------------------------------------------------------------------
# ui
# ---------------------------------------------------------------------------
@app.command("ui", help="Launch the Streamlit control panel.")
def ui(
    port: int = typer.Option(8501, help="Port for streamlit."),
) -> None:
    ui_path = Path(__file__).parent / "ui" / "streamlit_app.py"
    cmd = [
        sys.executable,
        "-m",
        "streamlit",
        "run",
        str(ui_path),
        "--server.port",
        str(port),
    ]
    typer.echo(f"$ {' '.join(cmd)}")
    raise typer.Exit(code=subprocess.call(cmd))


if __name__ == "__main__":
    app()
