from __future__ import annotations

from pathlib import Path

import pytest

from app.models import ApplicationStatus, Job, Priority, ScoredJob
from app.storage.sqlite_store import STATUS_RANK, SQLiteStore, _status_rank_case_sql
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
        recommended_resume_variant="applied_ai",
        next_action="Apply today",
    )
    store.upsert_scored_jobs([s])

    got = store.get_scored_jobs(priorities=[Priority.P0.value])
    assert len(got) == 1
    assert got[0].fit_score == 85
    assert got[0].matched_skills == ["python", "fastapi"]
    assert got[0].recommended_resume_variant == "applied_ai"


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


def test_applications_has_interview_and_lifecycle_columns(store: SQLiteStore) -> None:
    with store._conn() as c:
        cols = {row["name"] for row in c.execute("PRAGMA table_info(applications)").fetchall()}
    assert {"next_interview_at", "interview_notes", "applied_at", "rejected_at"} <= cols


def test_search_stats_table_exists(store: SQLiteStore) -> None:
    with store._conn() as c:
        names = {
            r["name"]
            for r in c.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()
        }
    assert "search_stats" in names


def test_application_interview_fields_roundtrip(store: SQLiteStore) -> None:
    """Behavior: writing new interview/lifecycle columns and reading them back."""
    j = _mk()
    store.upsert_jobs([j])
    # Seed base application row using the public API.
    store.set_application_status(j.id, ApplicationStatus.APPLIED, notes="Applied")
    # Directly update the new columns — no public setter yet (future task).
    with store._conn() as c:
        c.execute(
            """
            UPDATE applications
               SET next_interview_at = ?,
                   interview_notes   = ?,
                   applied_at        = ?,
                   rejected_at       = ?
             WHERE job_id = ?
            """,
            (
                "2026-05-10T15:00:00Z",
                "Phone screen with hiring manager",
                "2026-05-05T10:00:00Z",
                None,
                j.id,
            ),
        )
    with store._conn() as c:
        row = c.execute(
            "SELECT * FROM applications WHERE job_id = ?", (j.id,)
        ).fetchone()
    assert row["next_interview_at"] == "2026-05-10T15:00:00Z"
    assert row["interview_notes"] == "Phone screen with hiring manager"
    assert row["applied_at"] == "2026-05-05T10:00:00Z"
    assert row["rejected_at"] is None


def test_init_schema_is_idempotent(store: SQLiteStore) -> None:
    """Re-entrancy: running init_schema (and the column migration) twice must not raise."""
    # First init_schema already ran via the fixture; run again.
    store.init_schema()
    # And explicitly exercise the guarded migration a second time.
    store._migrate_applications_columns()
    # Columns still there, nothing duplicated.
    with store._conn() as c:
        cols = [row["name"] for row in c.execute("PRAGMA table_info(applications)").fetchall()]
    assert cols.count("next_interview_at") == 1
    assert cols.count("interview_notes") == 1
    assert cols.count("applied_at") == 1
    assert cols.count("rejected_at") == 1


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


# ---------------------------------------------------------------------------
# STATUS_RANK + _status_rank_case_sql (spec §5.4 — query-time computed column)
# ---------------------------------------------------------------------------
def test_status_rank_ordering() -> None:
    assert STATUS_RANK["Interviewing"] < STATUS_RANK["Applied"]
    assert STATUS_RANK["Applied"] < STATUS_RANK["Rejected"]
    assert STATUS_RANK["Rejected"] < STATUS_RANK["Archived"]


def test_status_rank_case_sql_renders_all_statuses() -> None:
    sql = _status_rank_case_sql()
    assert "CASE COALESCE(applications.status, 'Found')" in sql
    for status in STATUS_RANK:
        assert f"WHEN '{status}'" in sql
    assert "ELSE 99" in sql


def test_status_rank_case_sql_orders_rows_in_live_query(store: SQLiteStore) -> None:
    """BDD: helper must work inside a real SELECT against real tables.

    Given one Interviewing job, one Applied job, one unapplied (NULL status)
    job (defaults to Found), and one Archived job,
    when we SELECT with status_rank computed via the helper and ORDER BY it,
    then the rows must come out in Interviewing → Applied → Found → Archived
    order.
    """
    interviewing = _mk(role="Interview Role", company="IV", url="https://x/iv")
    applied = _mk(role="Applied Role", company="AP", url="https://x/ap")
    found = _mk(role="Found Role", company="FO", url="https://x/fo")
    archived = _mk(role="Archived Role", company="AR", url="https://x/ar")
    store.upsert_jobs([interviewing, applied, found, archived])

    # scored_jobs rows required because the Tracker query will join through them.
    for j in (interviewing, applied, found, archived):
        store.upsert_scored_jobs(
            [
                ScoredJob(
                    job=j,
                    fit_score=50,
                    priority=Priority.P1,
                    next_action="",
                )
            ]
        )

    # Explicit application rows for three of the four; leave `found` with
    # no applications row so COALESCE falls back to 'Found'.
    store.set_application_status(interviewing.id, ApplicationStatus.INTERVIEWING)
    store.set_application_status(applied.id, ApplicationStatus.APPLIED)
    store.set_application_status(archived.id, ApplicationStatus.ARCHIVED)

    case_sql = _status_rank_case_sql()
    sql = f"""
        SELECT jobs.id AS job_id,
               ({case_sql}) AS status_rank
        FROM jobs
        JOIN scored_jobs ON scored_jobs.job_id = jobs.id
        LEFT JOIN applications ON applications.job_id = jobs.id
        ORDER BY status_rank ASC
    """
    with store._conn() as c:
        rows = c.execute(sql).fetchall()

    ordered_ids = [r["job_id"] for r in rows]
    assert ordered_ids == [interviewing.id, applied.id, found.id, archived.id]
    # Sanity-check the computed ranks themselves.
    ranks = [r["status_rank"] for r in rows]
    assert ranks == [
        STATUS_RANK["Interviewing"],
        STATUS_RANK["Applied"],
        STATUS_RANK["Found"],
        STATUS_RANK["Archived"],
    ]


def test_get_scored_by_id_returns_none_when_not_scored(store: SQLiteStore) -> None:
    j = _mk()
    store.upsert_jobs([j])
    # Job exists but hasn't been scored yet.
    assert store.get_scored_by_id(j.id) is None


def test_get_scored_by_id_returns_scored_when_present(store: SQLiteStore) -> None:
    j = _mk()
    store.upsert_jobs([j])
    store.upsert_scored_jobs([
        ScoredJob(job=j, fit_score=77, priority=Priority.P1, level_match="Senior",
                  matched_skills=["python"], missing_skills=["kafka"],
                  reasons=["test"], risks=[], recommended_resume_variant="master",
                  next_action="tailor")
    ])
    result = store.get_scored_by_id(j.id)
    assert result is not None
    assert result.job.id == j.id
    assert result.fit_score == 77
    assert result.priority == Priority.P1
    assert result.matched_skills == ["python"]


def test_status_rank_case_sql_fallbacks(store: SQLiteStore) -> None:
    """Fallback: NULL application status → 'Found' (rank 7) via COALESCE,
    and an unknown literal status string → 99 via the ELSE branch."""
    no_app = _mk(role="No App Role", company="NA", url="https://x/na")
    weird = _mk(role="Weird Status Role", company="WS", url="https://x/ws")
    store.upsert_jobs([no_app, weird])

    # Insert an application row with a status NOT in STATUS_RANK, bypassing the
    # enum-typed public API. This models a legacy / future status value.
    with store._conn() as c:
        c.execute(
            """
            INSERT INTO applications (job_id, status, notes, updated_at)
            VALUES (?, ?, ?, ?)
            """,
            (weird.id, "Rescinded", None, "2026-05-05T00:00:00Z"),
        )

    case_sql = _status_rank_case_sql()
    sql = f"""
        SELECT jobs.id AS job_id,
               ({case_sql}) AS status_rank
        FROM jobs
        LEFT JOIN applications ON applications.job_id = jobs.id
        WHERE jobs.id IN (?, ?)
    """
    with store._conn() as c:
        rows = {
            r["job_id"]: r["status_rank"]
            for r in c.execute(sql, (no_app.id, weird.id)).fetchall()
        }

    # NULL application.status → COALESCE supplies 'Found' → rank 7.
    assert rows[no_app.id] == STATUS_RANK["Found"] == 7
    # Unknown literal status → ELSE 99.
    assert rows[weird.id] == 99
