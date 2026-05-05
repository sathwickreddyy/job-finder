from __future__ import annotations

from pathlib import Path

import pytest

from app.models import ApplicationStatus, Job, Priority, ScoredJob
from app.storage.sqlite_store import SQLiteStore
from app.utils import stable_job_id


@pytest.fixture
def store(tmp_path: Path) -> SQLiteStore:
    s = SQLiteStore(tmp_path / "test.db")
    s.init_schema()
    return s


def _mk(role: str = "Senior Backend Engineer", company: str = "Acme", url: str = "https://x/1") -> Job:
    return Job(
        id=stable_job_id(company, role, url),
        role=role,
        company=company,
        url=url,
        source="manual",
        description="Python FastAPI Postgres",
    )


def test_init_schema_creates_tables(store: SQLiteStore) -> None:
    with store._conn() as c:
        names = {
            row["name"]
            for row in c.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()
        }
    assert {
        "jobs",
        "scored_jobs",
        "applications",
        "email_events",
        "sync_state",
        "runs",
    } <= names


def test_upsert_jobs_is_idempotent(store: SQLiteStore) -> None:
    j = _mk()
    assert store.upsert_jobs([j]) == 1
    assert store.upsert_jobs([j]) == 1  # same row, still 1 upserted, no duplicate
    assert store.total_jobs() == 1


def test_upsert_preserves_description_when_later_record_is_sparser(store: SQLiteStore) -> None:
    full = _mk()
    sparse = full.model_copy(update={"description": None, "location": None})
    assert full.id == sparse.id
    store.upsert_jobs([full])
    store.upsert_jobs([sparse])
    fetched = store.get_job(full.id)
    assert fetched is not None
    # COALESCE in the upsert SQL should keep the original description.
    assert fetched.description == "Python FastAPI Postgres"


def test_upsert_scored_jobs_roundtrip(store: SQLiteStore) -> None:
    j = _mk()
    store.upsert_jobs([j])
    s = ScoredJob(
        job=j,
        fit_score=85,
        priority=Priority.P0,
        level_match="SDE2",
        matched_skills=["python", "fastapi"],
        missing_skills=["kubernetes"],
        reasons=["matches backend stack"],
        risks=[],
        recommended_resume_variant="backend_platform",
        next_action="Apply today",
    )
    store.upsert_scored_jobs([s])

    got = store.get_scored_jobs(priorities=[Priority.P0.value])
    assert len(got) == 1
    assert got[0].fit_score == 85
    assert got[0].matched_skills == ["python", "fastapi"]
    assert got[0].recommended_resume_variant == "backend_platform"


def test_application_status_upsert(store: SQLiteStore) -> None:
    j = _mk()
    store.upsert_jobs([j])
    store.set_application_status(j.id, ApplicationStatus.APPLIED, notes="Applied via referral")
    with store._conn() as c:
        row = c.execute("SELECT * FROM applications WHERE job_id = ?", (j.id,)).fetchone()
    assert row["status"] == "Applied"
    assert row["notes"] == "Applied via referral"


def test_sync_state_roundtrip(store: SQLiteStore) -> None:
    j = _mk()
    store.upsert_jobs([j])
    store.set_sync_state(j.id, "notion", "notion-page-1")
    state = store.get_sync_state(j.id, "notion")
    assert state is not None
    assert state["external_id"] == "notion-page-1"


def test_manual_jobs_normalize_via_store(store: SQLiteStore) -> None:
    # Simulate a ManualSource output: same (company, role, url) must always
    # hash to the same id — so repeated paste never duplicates.
    jobs = [
        Job(
            id=stable_job_id("Acme", "Senior Backend Engineer", "https://x/1"),
            role="Senior Backend Engineer",
            company="Acme",
            url="https://x/1",
            source="manual",
            description="Python, FastAPI, Postgres",
        ),
        Job(
            id=stable_job_id("Acme", "Senior Backend Engineer", "https://x/1"),
            role="Senior Backend Engineer",
            company="Acme",
            url="https://x/1",
            source="manual",
            description="Python, FastAPI, Postgres",
        ),
    ]
    store.upsert_jobs(jobs)
    assert store.total_jobs() == 1
