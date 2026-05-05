"""Task 9 — Jobs API routes.

Three endpoints over `scored_jobs` JOIN `jobs` LEFT JOIN `applications`:

* `GET  /api/jobs`                — filterable list with pagination and
  status-rank aware sort (Interviewing pinned to the top)
* `GET  /api/jobs/{job_id}`       — full detail with optional ScoredJob
  and Application blocks
* `PATCH /api/jobs/{job_id}/status`— UPSERT the applications row with
  automatic `applied_at` / `rejected_at` stamping

The module-level `_to_scored_out` helper is re-exported so later tasks
(manual-job POST, search, dashboard) can reuse the row→DTO shape without
duplicating field plumbing."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from ...config import Settings
from ...config_repo import (
    COMPANIES_YAML,
    PROFILE_YAML,
    SCORING_YAML,
    ConfigRepository,
)
from ...dedupe import dedupe_jobs
from ...models import ApplicationStatus, Job, ScoredJob
from ...resume.source import read_resume
from ...resume.tailor import tailor as run_tailor
from ...scoring.rule_scorer import score_job
from ...storage.sqlite_store import SQLiteStore
from ...utils import stable_job_id
from ..deps import get_config_repo, get_settings, get_store
from ..schemas import (
    ApplicationOut,
    JobDetailOut,
    JobOut,
    ManualJobIn,
    ScoredJobOut,
    StatusPatch,
    TailorOut,
)

router = APIRouter(tags=["jobs"])


def _to_scored_out(scored: ScoredJob, app: Optional[dict]) -> ScoredJobOut:
    """Build a ScoredJobOut from a ScoredJob.

    `app` is unused today but kept in the signature so downstream callers
    (Tasks 10–12) can pass the joined application row without a second
    query — future refactors may surface application fields into the
    row-level DTO for the Tracker table."""
    return ScoredJobOut(
        job=JobOut.model_validate(scored.job.model_dump()),
        fit_score=scored.fit_score,
        priority=scored.priority,
        level_match=scored.level_match,
        matched_skills=scored.matched_skills,
        missing_skills=scored.missing_skills,
        reasons=scored.reasons,
        risks=scored.risks,
        recommended_resume_variant=scored.recommended_resume_variant,
        next_action=scored.next_action,
    )


@router.get("/jobs", response_model=list[ScoredJobOut])
def list_jobs(
    priority: Optional[list[str]] = Query(default=None),
    status: Optional[list[str]] = Query(default=None),
    company: Optional[str] = None,
    source: Optional[str] = None,
    remote_type: Optional[str] = None,
    location_contains: Optional[str] = None,
    q: Optional[str] = None,
    sort: str = "status_rank",
    limit: int = 500,
    offset: int = 0,
    store: SQLiteStore = Depends(get_store),
) -> list[ScoredJobOut]:
    rows = store.list_scored_with_filters(
        priorities=priority,
        statuses=status,
        company=company,
        source=source,
        remote_type=remote_type,
        location_contains=location_contains,
        q=q,
        sort=sort,
        limit=limit,
        offset=offset,
    )
    return [_to_scored_out(s, a) for s, a in rows]


@router.get("/jobs/{job_id}", response_model=JobDetailOut)
def get_job(job_id: str, store: SQLiteStore = Depends(get_store)) -> JobDetailOut:
    job = store.get_job(job_id)
    if not job:
        raise HTTPException(404, detail=f"job {job_id} not found")

    # O(1) PK lookup — much cheaper than scanning the whole filtered list.
    scored_match = store.get_scored_by_id(job_id)
    app_row = store.get_application(job_id)

    scored_out = _to_scored_out(scored_match, app_row) if scored_match else None
    app_out = (
        ApplicationOut(**{k: v for k, v in app_row.items() if k != "job_id"})
        if app_row
        else None
    )
    return JobDetailOut(
        job=JobOut.model_validate(job.model_dump()),
        scored=scored_out,
        application=app_out,
    )


@router.patch("/jobs/{job_id}/status", response_model=ApplicationOut)
def patch_status(
    job_id: str,
    body: StatusPatch,
    store: SQLiteStore = Depends(get_store),
) -> ApplicationOut:
    if not store.get_job(job_id):
        raise HTTPException(404, detail=f"job {job_id} not found")
    store.set_application_status_rich(
        job_id,
        ApplicationStatus(body.status),
        notes=body.notes,
        next_interview_at=body.next_interview_at,
        interview_notes=body.interview_notes,
    )
    app = store.get_application(job_id) or {}
    return ApplicationOut(**{k: v for k, v in app.items() if k != "job_id"})


@router.post("/jobs/manual", response_model=JobDetailOut)
def add_manual_job(
    body: ManualJobIn,
    store: SQLiteStore = Depends(get_store),
    repo: ConfigRepository = Depends(get_config_repo),
) -> JobDetailOut:
    """Insert a manually-entered job, score it, and return the detail blob.

    `source` is hard-wired to "manual" — the DTO has no source field so the
    user cannot override it. `stable_job_id` makes repeated POSTs of the
    same (company, role, url) idempotent: the second POST upserts the same
    row instead of creating a duplicate."""
    job = Job(
        id=stable_job_id(body.company, body.role, body.url),
        role=body.role,
        company=body.company,
        url=body.url,
        source="manual",
        location=body.location,
        description=body.description,
        notes=body.notes,
    )
    store.upsert_jobs(dedupe_jobs([job]))

    profile = repo.load_yaml(PROFILE_YAML)
    scoring = repo.load_yaml(SCORING_YAML)
    companies = repo.load_yaml(COMPANIES_YAML)
    scored = score_job(job, profile, scoring, companies)
    store.upsert_scored_jobs([scored])

    return JobDetailOut(
        job=JobOut.model_validate(job.model_dump()),
        scored=_to_scored_out(scored, None),
        application=None,
    )


@router.post("/jobs/{job_id}/tailor", response_model=TailorOut)
def tailor_job(
    job_id: str,
    store: SQLiteStore = Depends(get_store),
    repo: ConfigRepository = Depends(get_config_repo),
    settings: Settings = Depends(get_settings),
) -> TailorOut:
    """Generate a tailor sheet for one scored job.

    Returns `{mode, ai_pending, markdown}`. When no LLM is configured we
    still produce the deterministic template (so the UI always has
    something to show) but flip `ai_pending=True` so the frontend can
    render the "AI integration pending" banner explicitly."""
    if not store.get_job(job_id):
        raise HTTPException(404, detail=f"job {job_id} not found")

    # O(1) PK lookup — avoids scanning the full filtered list for one row.
    scored_match = store.get_scored_by_id(job_id)
    if not scored_match:
        raise HTTPException(404, detail=f"job {job_id} not scored yet")

    bundle = read_resume(settings)
    profile = repo.load_yaml(PROFILE_YAML)
    markdown = run_tailor(
        resume_text=(bundle.markdown or ""),
        scored=scored_match,
        profile=profile,
        settings=settings,
    )
    ai_pending = not settings.llm_enabled
    mode = (
        "llm"
        if settings.llm_enabled and "deterministic stub" not in markdown.lower()
        else "deterministic"
    )
    return TailorOut(mode=mode, ai_pending=ai_pending, markdown=markdown)
