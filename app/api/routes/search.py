"""Task 11 — POST /api/search.

On-demand search pipeline:
1. Fetch jobs from every enabled source (via ``fetch_all_with_stats``), capturing
   per-source ``{fetched, kept, duration_ms, error}`` so the UI's SourceStatsBar
   can show which sources succeeded and which failed.
2. Dedupe + upsert raw jobs, score them, optionally refine with the LLM, and
   upsert the scored rows.
3. Append one row per source to ``search_stats`` so the Dashboard can read the
   most recent run (``ConfigStore.latest_per_source``).
4. Mark the run (``store.mark_run``) so the Dashboard's "last run at" refreshes.
5. Return the *full tracker state* (scored jobs, status-rank sorted) alongside
   the per-source stats map.

The ``_fetch_with_stats`` indirection is intentional — it's the monkeypatch seam
tests use to swap the real HTTP-calling pipeline for a synthetic result.
"""
from __future__ import annotations

import time
from typing import Any

from fastapi import APIRouter, Depends

from ...config import Settings
from ...config_repo import (
    COMPANIES_YAML,
    PROFILE_YAML,
    SCORING_YAML,
    SOURCES_YAML,
    ConfigRepository,
)
from ...dedupe import dedupe_jobs
from ...scoring import refine_all, score_all
from ...sources import fetch_all_with_stats
from ...storage.config_store import ConfigStore
from ...storage.sqlite_store import SQLiteStore
from ...utils import utcnow_iso
from ..deps import get_config_repo, get_config_store, get_settings, get_store
from ..schemas import SearchRequest, SearchResponse, SourceStat
from .jobs import _to_scored_out

router = APIRouter(tags=["search"])


def _fetch_with_stats(repo, sources_cfg, companies_cfg):
    """Extracted so tests can monkeypatch it."""
    return fetch_all_with_stats(repo, sources_cfg, companies_cfg)


@router.post("/search", response_model=SearchResponse)
def search(
    body: SearchRequest,
    store: SQLiteStore = Depends(get_store),
    cstore: ConfigStore = Depends(get_config_store),
    repo: ConfigRepository = Depends(get_config_repo),
    settings: Settings = Depends(get_settings),
) -> SearchResponse:
    started = time.monotonic()
    sources_cfg: dict[str, Any] = repo.load_yaml(SOURCES_YAML)
    companies_cfg = repo.load_yaml(COMPANIES_YAML)
    profile = repo.load_yaml(PROFILE_YAML)
    scoring_cfg = repo.load_yaml(SCORING_YAML)

    if body.sources:
        sources_cfg = {k: v for k, v in sources_cfg.items() if k in set(body.sources)}

    jobs, stats = _fetch_with_stats(repo, sources_cfg, companies_cfg)
    unique = dedupe_jobs(jobs)
    store.upsert_jobs(unique)

    scored = score_all(unique, profile, scoring_cfg, companies_cfg)
    if body.use_llm and settings.llm_enabled:
        scored = refine_all(scored, profile, scoring_cfg, settings, max_refine=20)
    store.upsert_scored_jobs(scored)

    for source, stat in stats.items():
        cstore.append_search_stat(
            source=source, fetched=stat["fetched"], kept=stat["kept"],
            duration_ms=stat["duration_ms"], error=stat.get("error"),
        )

    store.mark_run()

    rows = store.list_scored_with_filters(sort="status_rank", limit=1000, offset=0)
    return SearchResponse(
        jobs=[_to_scored_out(s, a) for s, a in rows],
        source_stats={k: SourceStat(**v) for k, v in stats.items()},
        ran_at=utcnow_iso(),
        duration_ms=int((time.monotonic() - started) * 1000),
    )
