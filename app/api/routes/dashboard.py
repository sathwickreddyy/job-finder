"""Task 12 — GET /api/dashboard.

One endpoint that aggregates the home screen's stat cards: priority
counts, total jobs, last run timestamp, upcoming interviews, a shortlist
"top 10" (same status_rank sort as /api/jobs), and the latest per-source
search stats so the UI can render the "Sources last run" strip.

All underlying queries are already implemented in SQLiteStore and
ConfigStore — this route only composes them into the DashboardResponse
shape."""
from __future__ import annotations

from fastapi import APIRouter, Depends

from ...storage.config_store import ConfigStore
from ...storage.sqlite_store import SQLiteStore
from ..deps import get_config_store, get_store
from ..schemas import DashboardResponse, SourceStat, UpcomingInterview
from .jobs import _to_scored_out

router = APIRouter(tags=["dashboard"])


@router.get("/dashboard", response_model=DashboardResponse)
def dashboard(
    store: SQLiteStore = Depends(get_store),
    cstore: ConfigStore = Depends(get_config_store),
) -> DashboardResponse:
    counts = store.count_by_priority()
    total = store.total_jobs()
    last_run = store.last_run_at()
    upcoming = [UpcomingInterview(**row) for row in store.upcoming_interviews(limit=10)]

    rows = store.list_scored_with_filters(sort="status_rank", limit=10, offset=0)
    shortlist = [_to_scored_out(s, a) for s, a in rows]

    latest = cstore.latest_per_source()
    latest_stats = {
        src: SourceStat(
            fetched=r["fetched"],
            kept=r["kept"],
            duration_ms=r["duration_ms"],
            error=r.get("error"),
        )
        for src, r in latest.items()
    }

    return DashboardResponse(
        counts_by_priority=counts,
        total_jobs=total,
        last_run_at=last_run,
        upcoming_interviews=upcoming,
        shortlist_top=shortlist,
        latest_source_stats=latest_stats,
    )
