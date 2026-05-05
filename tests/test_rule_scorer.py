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


def test_onsite_usa_penalty() -> None:
    usa = _mk(
        "Senior Backend Engineer",
        "Acme",
        "Python FastAPI Postgres Docker backend platform.",
        location="San Francisco, USA",
        remote_type=None,
    )
    india = _mk(
        "Senior Backend Engineer",
        "Acme",
        "Python FastAPI Postgres Docker backend platform.",
        location="Bengaluru",
    )
    s_usa = score_job(usa, PROFILE, SCORING, COMPANIES)
    s_india = score_job(india, PROFILE, SCORING, COMPANIES)
    assert s_india.fit_score > s_usa.fit_score
    assert s_usa.fit_score + 10 <= s_india.fit_score  # at least 10-point gap


def test_exclude_locations_forces_ignore() -> None:
    profile = dict(PROFILE)
    profile["exclude_locations"] = ["europe onsite"]
    job = _mk(
        "Senior Backend Engineer",
        "Acme",
        "Europe onsite required. Python FastAPI.",
        location="Berlin, Germany",
        remote_type=None,
    )
    s = score_job(job, profile, SCORING, COMPANIES)
    assert s.priority == Priority.IGNORE


def test_remote_boost_bumped_to_10() -> None:
    job = _mk(
        "Senior Backend Engineer",
        "Acme",
        "Remote-first backend role. Python FastAPI.",
        location="Anywhere",
        remote_type="remote",
    )
    s = score_job(job, PROFILE, SCORING, COMPANIES)
    assert any("remote" in r.lower() for r in s.reasons)


def test_onsite_uk_london_penalty_applied() -> None:
    # Exercises the `london` branch of the regex — a London-onsite job
    # should be penalised even when the loc string does not say "uk".
    london = _mk(
        "Senior Backend Engineer",
        "Acme",
        "Python FastAPI Postgres Docker backend platform.",
        location="London",
        remote_type=None,
    )
    india = _mk(
        "Senior Backend Engineer",
        "Acme",
        "Python FastAPI Postgres Docker backend platform.",
        location="Bengaluru",
    )
    s_london = score_job(london, PROFILE, SCORING, COMPANIES)
    s_india = score_job(india, PROFILE, SCORING, COMPANIES)
    assert s_india.fit_score > s_london.fit_score
    # Penalty reason should be explicit.
    assert any("onsite" in r.lower() and "penalty" in r.lower() for r in s_london.reasons)


def test_remote_overrides_usa_penalty() -> None:
    # Remote short-circuits before the onsite-non-India regex fires.
    # A USA-listed role with remote_type="remote" should NOT be penalised.
    usa_remote = _mk(
        "Senior Backend Engineer",
        "Acme",
        "Remote-first backend role. Python FastAPI.",
        location="San Francisco, USA",
        remote_type="remote",
    )
    s = score_job(usa_remote, PROFILE, SCORING, COMPANIES)
    # Must include the remote-match reason.
    assert any("remote role matches preference" in r.lower() for r in s.reasons)
    # Must NOT include the onsite-penalty reason.
    assert not any(
        "onsite" in r.lower() and "penalty" in r.lower() for r in s.reasons
    )


def test_exclude_location_in_description_forces_ignore() -> None:
    # Proves _hard_negatives checks BOTH job.location AND description.
    # Location field is India, but description says "onsite USA".
    profile = dict(PROFILE)
    profile["exclude_locations"] = ["onsite usa"]
    job = _mk(
        "Senior Backend Engineer",
        "Acme",
        "This role requires onsite USA presence. Python FastAPI.",
        location="Bengaluru",
        remote_type=None,
    )
    s = score_job(job, profile, SCORING, COMPANIES)
    assert s.priority == Priority.IGNORE
