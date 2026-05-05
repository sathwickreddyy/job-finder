from __future__ import annotations

from app.models import Job, Priority
from app.scoring.rule_scorer import score_job
from app.utils import stable_job_id


PROFILE = {
    "years_of_experience": 5,
    "target_roles": ["SDE2", "Senior Software Engineer"],
    "target_levels": ["sde2", "senior", "mid"],
    "strong_skills": ["python", "fastapi", "postgres", "docker", "backend"],
    "secondary_skills": ["kubernetes", "aws", "kafka"],
    "avoid_skills": ["frontend only", "qa"],
    "preferred_locations": ["Bengaluru", "Hyderabad", "Remote India"],
    "remote_preferences": ["remote"],
    "preferred_domains": ["fintech", "platform"],
    "avoid_domains": [],
    "resume_variants": [{"name": "master"}, {"name": "backend_platform"}],
}

SCORING = {
    "thresholds": {"P0": 80, "P1": 70, "P2": 60},
    "positive_keywords": ["backend", "platform", "python", "microservices"],
    "negative_keywords": [
        "frontend only",
        "qa",
        "intern",
        "10+ years required",
        "php only",
    ],
    "location_boosts": {"bengaluru": 10, "india": 6, "remote": 8},
    "domain_boosts": {"fintech": 5, "platform": 4},
    "company_boosts": {"razorpay": 4, "amazon": 3},
    "source_quality_boosts": {"greenhouse": 3, "manual": 2},
    "resume_variant_rules": [
        {"variant": "backend_platform", "any": ["platform", "kubernetes"]},
        {"variant": "master", "any": ["python", "fastapi"]},
    ],
}

COMPANIES = {
    "companies": [
        {"name": "Razorpay", "priority": "P0"},
        {"name": "Acme QA", "priority": "P2"},
    ]
}


def _mk(role: str, company: str, desc: str, **kw) -> Job:
    url = kw.pop("url", f"https://x/{company.lower()}/{role.lower()}")
    return Job(
        id=stable_job_id(company, role, url),
        role=role,
        company=company,
        url=url,
        source=kw.pop("source", "manual"),
        description=desc,
        location=kw.pop("location", "Bengaluru"),
        remote_type=kw.pop("remote_type", None),
    )


def test_backend_role_beats_qa_role() -> None:
    backend = _mk(
        "Senior Backend Engineer",
        "Razorpay",
        "Build backend microservices in Python using FastAPI and Postgres. "
        "Own API platform. Bengaluru office, hybrid.",
    )
    qa = _mk(
        "QA Automation Engineer",
        "Acme QA",
        "Write Selenium tests and maintain QA pipelines. Testing only role.",
    )
    s_backend = score_job(backend, PROFILE, SCORING, COMPANIES)
    s_qa = score_job(qa, PROFILE, SCORING, COMPANIES)
    assert s_backend.fit_score > s_qa.fit_score
    # QA role should be forced to IGNORE due to negative signal.
    assert s_qa.priority == Priority.IGNORE


def test_frontend_only_is_ignored() -> None:
    fe = _mk(
        "Senior Frontend Engineer",
        "Acme",
        "Frontend only role. React and TypeScript. No backend scope.",
    )
    s = score_job(fe, PROFILE, SCORING, COMPANIES)
    assert s.priority == Priority.IGNORE


def test_intern_is_ignored() -> None:
    intern = _mk(
        "Software Engineer Intern",
        "Acme",
        "Internship program for freshers. Python, APIs.",
    )
    s = score_job(intern, PROFILE, SCORING, COMPANIES)
    assert s.priority == Priority.IGNORE


def test_priority_comes_from_thresholds() -> None:
    # High-fit backend role at a P0 target → expect P0 or at worst P1.
    high = _mk(
        "Senior Software Engineer II (SDE2)",
        "Razorpay",
        "Python, FastAPI, Postgres, Docker backend platform for payments. "
        "Microservices, Kubernetes, AWS. Fintech.",
        location="Bengaluru",
        source="greenhouse",
    )
    s = score_job(high, PROFILE, SCORING, COMPANIES)
    assert s.priority in {Priority.P0, Priority.P1}
    assert "python" in s.matched_skills
    assert s.recommended_resume_variant in {"master", "backend_platform"}


def test_target_company_floor_for_sparse_jd() -> None:
    # Very thin JD, but from a P0 company — shouldn't be IGNORE-d entirely.
    thin = _mk("Software Engineer", "Razorpay", "Join us.")
    s = score_job(thin, PROFILE, SCORING, COMPANIES)
    assert s.priority != Priority.IGNORE
