from __future__ import annotations

from app.dedupe import dedupe_jobs
from app.models import Job
from app.utils import stable_job_id


def _mk(company: str, role: str, url: str, source: str = "s") -> Job:
    return Job(
        id=stable_job_id(company, role, url),
        role=role,
        company=company,
        url=url,
        source=source,
    )


def test_dedupe_collapses_duplicate_ids() -> None:
    a = _mk("Acme", "Senior Backend Engineer", "https://x/1")
    a_dup = _mk("Acme", "Senior Backend Engineer", "https://x/1")
    assert a.id == a_dup.id
    out = dedupe_jobs([a, a_dup])
    assert len(out) == 1
    assert out[0].id == a.id


def test_dedupe_collapses_company_role_near_dupes() -> None:
    # Same role+company, different tracker params → different hash but
    # identical company+role, so secondary pass collapses.
    a = _mk("Acme", "Senior Backend Engineer", "https://x/1?utm=a")
    b = _mk("Acme", "Senior Backend Engineer", "https://x/1?utm=b", source="s2")
    out = dedupe_jobs([a, b])
    assert len(out) == 1


def test_dedupe_keeps_different_roles_same_company() -> None:
    a = _mk("Acme", "Senior Backend Engineer", "https://x/1")
    b = _mk("Acme", "Principal Backend Engineer", "https://x/2")
    out = dedupe_jobs([a, b])
    assert {o.role for o in out} == {"Senior Backend Engineer", "Principal Backend Engineer"}


def test_dedupe_preserves_first_seen_order() -> None:
    a = _mk("Acme", "Engineer A", "https://x/a")
    b = _mk("Beta", "Engineer B", "https://x/b")
    out = dedupe_jobs([b, a, b, a])
    assert [o.company for o in out] == ["Beta", "Acme"]
