"""Task 12 — GET /api/dashboard.

One plan-verbatim shape test plus three BDD additions that verify:
* priority counts + total_jobs + shortlist_top reflect seeded scored rows
* PATCH Interviewing + next_interview_at populates upcoming_interviews
* ConfigStore.append_search_stat feeds latest_source_stats
"""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.models import Job, Priority, ScoredJob
from app.utils import stable_job_id


# ── plan-verbatim test ──────────────────────────────────────────────────
def test_dashboard_shape(client: TestClient) -> None:
    r = client.get("/api/dashboard")
    assert r.status_code == 200
    body = r.json()
    assert set(body) >= {
        "counts_by_priority", "total_jobs", "last_run_at",
        "upcoming_interviews", "shortlist_top", "latest_source_stats",
    }


# ── BDD additions ──────────────────────────────────────────────────────
def test_dashboard_counts_and_shortlist_reflect_seeded_jobs(
    client: TestClient,
) -> None:
    """BDD: two scored jobs (P0 + P1) seeded via get_store() → dashboard
    reports matching counts_by_priority, total_jobs, and shortlist_top."""
    from app.api.deps import get_store

    store = get_store()
    j1 = Job(
        id=stable_job_id("Acme", "Senior Backend", "https://x/1"),
        role="Senior Backend",
        company="Acme",
        url="https://x/1",
        source="manual",
    )
    j2 = Job(
        id=stable_job_id("Beta", "SDE2", "https://x/2"),
        role="SDE2",
        company="Beta",
        url="https://x/2",
        source="manual",
    )
    store.upsert_jobs([j1, j2])
    store.upsert_scored_jobs(
        [
            ScoredJob(job=j1, fit_score=88, priority=Priority.P0),
            ScoredJob(job=j2, fit_score=71, priority=Priority.P1),
        ]
    )

    r = client.get("/api/dashboard")
    assert r.status_code == 200
    body = r.json()
    assert body["counts_by_priority"] == {"P0": 1, "P1": 1}
    assert body["total_jobs"] == 2
    assert len(body["shortlist_top"]) == 2


def test_dashboard_upcoming_interviews_populated_from_patch(
    client: TestClient,
) -> None:
    """BDD: PATCH status → Interviewing with next_interview_at shows up in
    upcoming_interviews with the right job fields."""
    from app.api.deps import get_store

    store = get_store()
    job = Job(
        id=stable_job_id("Acme", "Senior Backend", "https://x/iv"),
        role="Senior Backend",
        company="Acme",
        url="https://x/iv",
        source="manual",
    )
    store.upsert_jobs([job])
    store.upsert_scored_jobs(
        [ScoredJob(job=job, fit_score=80, priority=Priority.P0)]
    )

    patch = client.patch(
        f"/api/jobs/{job.id}/status",
        json={
            "status": "Interviewing",
            "next_interview_at": "2026-05-10T15:00:00Z",
        },
    )
    assert patch.status_code == 200

    r = client.get("/api/dashboard")
    assert r.status_code == 200
    upcoming = r.json()["upcoming_interviews"]
    assert len(upcoming) == 1
    entry = upcoming[0]
    assert entry["company"] == "Acme"
    assert entry["role"] == "Senior Backend"
    assert entry["next_interview_at"].startswith("2026-05-10")


def test_dashboard_latest_source_stats_from_search_runs(
    client: TestClient,
) -> None:
    """BDD: cstore.append_search_stat lands in latest_per_source → the
    dashboard's latest_source_stats mirrors the most recent run."""
    from app.api.deps import get_config_store, get_store

    # search_stats table is owned by SQLiteStore.init_schema() (see Task 1
    # note in config_store.py) — must run before ConfigStore touches it.
    get_store()
    cstore = get_config_store()
    cstore.append_search_stat(
        source="ycombinator",
        fetched=5,
        kept=3,
        duration_ms=120,
        error=None,
    )

    r = client.get("/api/dashboard")
    assert r.status_code == 200
    body = r.json()
    assert body["latest_source_stats"]["ycombinator"]["kept"] == 3
    assert body["latest_source_stats"]["ycombinator"]["fetched"] == 5
    assert body["latest_source_stats"]["ycombinator"]["duration_ms"] == 120
    assert body["latest_source_stats"]["ycombinator"]["error"] is None
