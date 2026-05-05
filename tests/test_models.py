from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.models import ApplicationStatus, Job, Priority, ScoredJob


def _job(**overrides) -> Job:
    base = dict(
        id="abc123",
        role="Senior Backend Engineer",
        company="Acme",
        url="https://example.com/jobs/1",
        source="manual",
    )
    base.update(overrides)
    return Job(**base)


def test_job_defaults() -> None:
    j = _job()
    assert j.location is None
    assert j.remote_type is None
    assert j.posted_date is None
    assert j.description is None
    assert j.raw == {}


def test_scored_job_fit_score_range() -> None:
    j = _job()
    with pytest.raises(ValidationError):
        ScoredJob(job=j, fit_score=120, priority=Priority.P0)
    with pytest.raises(ValidationError):
        ScoredJob(job=j, fit_score=-1, priority=Priority.IGNORE)

    s = ScoredJob(job=j, fit_score=85, priority=Priority.P0)
    assert s.priority == Priority.P0
    assert s.matched_skills == []
    assert s.missing_skills == []


def test_priority_enum_value() -> None:
    assert Priority.P0.value == "P0"
    assert Priority.IGNORE.value == "Ignore"


def test_application_status_enum_value() -> None:
    assert ApplicationStatus.APPLIED.value == "Applied"
    assert ApplicationStatus.RECRUITER_REPLY.value == "Recruiter Reply"
    assert str(ApplicationStatus.NEED_REFERRAL) == "Need Referral"
