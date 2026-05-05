"""Task 9 — /api/jobs list + detail + status patch, plus BDD sort/pagination."""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.models import ApplicationStatus, Job, Priority, ScoredJob
from app.storage.sqlite_store import SQLiteStore
from app.utils import stable_job_id


def _seed(store: SQLiteStore) -> list[str]:
    """Minimal 2-job seed used by most tests. Returns the job ids."""
    j1 = Job(
        id=stable_job_id("Acme", "Senior Backend", "https://x/1"),
        role="Senior Backend",
        company="Acme",
        url="https://x/1",
        source="manual",
        description="Python FastAPI",
    )
    j2 = Job(
        id=stable_job_id("Beta", "SDE2", "https://x/2"),
        role="SDE2",
        company="Beta",
        url="https://x/2",
        source="manual",
        description="Java",
    )
    store.upsert_jobs([j1, j2])
    store.upsert_scored_jobs(
        [
            ScoredJob(
                job=j1,
                fit_score=85,
                priority=Priority.P0,
                level_match="SDE2",
                next_action="Apply today",
            ),
            ScoredJob(
                job=j2,
                fit_score=72,
                priority=Priority.P1,
                level_match="Senior",
                next_action="Tailor and apply",
            ),
        ]
    )
    return [j1.id, j2.id]


# ── plan-verbatim tests ────────────────────────────────────────────────
def test_list_jobs_returns_all(client: TestClient) -> None:
    from app.api.deps import get_store

    ids = _seed(get_store())
    r = client.get("/api/jobs")
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 2
    assert {b["job"]["id"] for b in body} == set(ids)


def test_list_jobs_filter_by_priority(client: TestClient) -> None:
    from app.api.deps import get_store

    _seed(get_store())
    r = client.get("/api/jobs", params={"priority": "P0"})
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 1
    assert body[0]["priority"] == "P0"


def test_list_jobs_free_text_search(client: TestClient) -> None:
    from app.api.deps import get_store

    _seed(get_store())
    r = client.get("/api/jobs", params={"q": "java"})
    assert r.status_code == 200
    assert len(r.json()) == 1


def test_get_job_detail(client: TestClient) -> None:
    from app.api.deps import get_store

    ids = _seed(get_store())
    r = client.get(f"/api/jobs/{ids[0]}")
    assert r.status_code == 200
    body = r.json()
    assert body["job"]["id"] == ids[0]
    assert body["scored"]["priority"] == "P0"


def test_patch_status_sets_interview(client: TestClient) -> None:
    from app.api.deps import get_store

    ids = _seed(get_store())
    r = client.patch(
        f"/api/jobs/{ids[0]}/status",
        json={
            "status": "Interviewing",
            "next_interview_at": "2026-05-10T15:00:00Z",
            "interview_notes": "With Rajesh",
        },
    )
    assert r.status_code == 200

    r2 = client.get(f"/api/jobs/{ids[0]}")
    app = r2.json()["application"]
    assert app["status"] == "Interviewing"
    assert app["next_interview_at"].startswith("2026-05-10")


def test_patch_status_records_applied_at(client: TestClient) -> None:
    from app.api.deps import get_store

    ids = _seed(get_store())
    client.patch(f"/api/jobs/{ids[0]}/status", json={"status": "Applied"})
    r = client.get(f"/api/jobs/{ids[0]}")
    assert r.json()["application"]["applied_at"] is not None


def test_interview_sort_pins_to_top(client: TestClient) -> None:
    from app.api.deps import get_store

    ids = _seed(get_store())
    # Raise j2 (P1) to Interviewing — it should now come before j1 (P0, Found).
    client.patch(
        f"/api/jobs/{ids[1]}/status",
        json={
            "status": "Interviewing",
            "next_interview_at": "2026-05-06T10:00:00Z",
        },
    )
    r = client.get("/api/jobs")
    body = r.json()
    assert body[0]["job"]["id"] == ids[1]


# ── BDD additions ──────────────────────────────────────────────────────
def test_patch_status_records_rejected_at(client: TestClient) -> None:
    """BDD: PATCH to Rejected stamps rejected_at (mirror of Applied test)
    and leaves applied_at untouched."""
    from app.api.deps import get_store

    ids = _seed(get_store())
    r = client.patch(f"/api/jobs/{ids[0]}/status", json={"status": "Rejected"})
    assert r.status_code == 200

    detail = client.get(f"/api/jobs/{ids[0]}").json()["application"]
    assert detail["status"] == "Rejected"
    assert detail["rejected_at"] is not None
    assert detail["applied_at"] is None


def test_list_jobs_default_sort_is_status_rank(client: TestClient) -> None:
    """BDD: STATUS_RANK drives the default sort — four distinct statuses
    (Archived rank 9, Found 7, Applied 3, Interviewing 0) come back in
    ascending rank order, proving the CASE expression is wired through
    the JOIN."""
    from app.api.deps import get_store
    from app.utils import stable_job_id

    store = get_store()
    store.init_schema()

    jobs = [
        Job(
            id=stable_job_id("Archie Co", "Archived Role", "https://x/archived"),
            role="Archived Role",
            company="Archie Co",
            url="https://x/archived",
            source="manual",
        ),
        Job(
            id=stable_job_id("Foundry", "Found Role", "https://x/found"),
            role="Found Role",
            company="Foundry",
            url="https://x/found",
            source="manual",
        ),
        Job(
            id=stable_job_id("Applesoft", "Applied Role", "https://x/applied"),
            role="Applied Role",
            company="Applesoft",
            url="https://x/applied",
            source="manual",
        ),
        Job(
            id=stable_job_id("Interviewly", "Interviewing Role", "https://x/iv"),
            role="Interviewing Role",
            company="Interviewly",
            url="https://x/iv",
            source="manual",
        ),
    ]
    store.upsert_jobs(jobs)
    store.upsert_scored_jobs(
        [
            ScoredJob(job=jobs[0], fit_score=50, priority=Priority.P2),
            ScoredJob(job=jobs[1], fit_score=50, priority=Priority.P2),
            ScoredJob(job=jobs[2], fit_score=50, priority=Priority.P2),
            ScoredJob(job=jobs[3], fit_score=50, priority=Priority.P2),
        ]
    )
    # jobs[1] has no application row → defaults to Found (rank 7)
    store.set_application_status_rich(jobs[0].id, ApplicationStatus.ARCHIVED)
    store.set_application_status_rich(jobs[2].id, ApplicationStatus.APPLIED)
    store.set_application_status_rich(jobs[3].id, ApplicationStatus.INTERVIEWING)

    r = client.get("/api/jobs")
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 4
    assert [row["job"]["id"] for row in body] == [
        jobs[3].id,  # Interviewing (rank 0)
        jobs[2].id,  # Applied     (rank 3)
        jobs[1].id,  # Found       (rank 7, no application row)
        jobs[0].id,  # Archived    (rank 9)
    ]


def test_list_jobs_pagination(client: TestClient) -> None:
    """BDD: limit+offset trims the page; the offset result set is not the
    first two of the unpaginated list."""
    from app.api.deps import get_store
    from app.utils import stable_job_id

    store = get_store()
    store.init_schema()
    jobs = [
        Job(
            id=stable_job_id(f"Co{i}", f"Role {i}", f"https://x/{i}"),
            role=f"Role {i}",
            company=f"Co{i}",
            url=f"https://x/{i}",
            source="manual",
        )
        for i in range(5)
    ]
    store.upsert_jobs(jobs)
    store.upsert_scored_jobs(
        [
            ScoredJob(
                job=jobs[i],
                # descending fit scores so default sort is deterministic
                fit_score=90 - i,
                priority=Priority.P1,
            )
            for i in range(5)
        ]
    )

    full = client.get("/api/jobs").json()
    assert len(full) == 5

    paged = client.get("/api/jobs", params={"limit": 2, "offset": 1}).json()
    assert len(paged) == 2
    paged_ids = [p["job"]["id"] for p in paged]
    first_two_full = [full[0]["job"]["id"], full[1]["job"]["id"]]
    assert paged_ids != first_two_full
    # The offset=1 window should equal positions 1 and 2 of the full list.
    assert paged_ids == [full[1]["job"]["id"], full[2]["job"]["id"]]


def test_get_store_auto_initializes_schema(client: TestClient) -> None:
    """get_store() must init schema so callers can seed data immediately."""
    from app.api.deps import get_store
    store = get_store()
    with store._conn() as c:
        tables = {r["name"] for r in c.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).fetchall()}
    # Every table from Task 1's schema must exist
    assert {"jobs", "scored_jobs", "applications", "email_events",
            "sync_state", "runs", "search_stats"} <= tables


# ── Task 10: manual job + tailor routes ─────────────────────────────────
def test_post_manual_job(client: TestClient) -> None:
    r = client.post("/api/jobs/manual", json={
        "role": "Senior Backend Engineer",
        "company": "Acme",
        "url": "https://acme.example.com/jobs/1",
        "notes": "referred by @sathwick",
    })
    assert r.status_code == 200
    body = r.json()
    assert body["job"]["company"] == "Acme"
    assert body["scored"]["fit_score"] >= 0


def test_tailor_returns_deterministic_when_no_llm(client: TestClient) -> None:
    from app.api.deps import get_store
    ids = _seed(get_store())
    r = client.post(f"/api/jobs/{ids[0]}/tailor")
    assert r.status_code == 200
    body = r.json()
    assert body["mode"] == "deterministic"
    assert body["ai_pending"] is True
    assert "# Tailor Sheet" in body["markdown"]


# ── Task 10 BDD additions ───────────────────────────────────────────────
def test_manual_job_upserts_on_duplicate_url(client: TestClient) -> None:
    """BDD: Posting the same (company, role, url) twice must produce one
    row — stable_job_id collapses them and upsert_jobs is idempotent."""
    payload = {
        "role": "Senior Backend Engineer",
        "company": "Acme",
        "url": "https://acme.example.com/jobs/1",
    }
    r1 = client.post("/api/jobs/manual", json=payload)
    r2 = client.post("/api/jobs/manual", json=payload)
    assert r1.status_code == 200
    assert r2.status_code == 200
    assert r1.json()["job"]["id"] == r2.json()["job"]["id"]

    listing = client.get("/api/jobs").json()
    matching = [row for row in listing if row["job"]["id"] == r1.json()["job"]["id"]]
    assert len(matching) == 1


def test_tailor_404_on_unknown_job(client: TestClient) -> None:
    """BDD: Unknown job id → 404 with a 'not found' message."""
    r = client.post("/api/jobs/deadbeef/tailor")
    assert r.status_code == 404
    # error envelope comes from the global handler: {"error": {...,"message":...}}
    body = r.json()
    msg = body.get("error", {}).get("message", "") if isinstance(body.get("error"), dict) else str(body)
    assert "not found" in msg.lower()


def test_tailor_404_on_job_that_exists_but_not_scored(client: TestClient) -> None:
    """BDD: A job row with no matching scored_jobs entry → 404 'not scored'."""
    from app.api.deps import get_store
    from app.models import Job
    from app.utils import stable_job_id

    store = get_store()
    job = Job(
        id=stable_job_id("Nocore", "Lone Role", "https://x/lone"),
        role="Lone Role",
        company="Nocore",
        url="https://x/lone",
        source="manual",
    )
    store.upsert_jobs([job])

    r = client.post(f"/api/jobs/{job.id}/tailor")
    assert r.status_code == 404
    body = r.json()
    msg = body.get("error", {}).get("message", "") if isinstance(body.get("error"), dict) else str(body)
    assert "not scored" in msg.lower()
