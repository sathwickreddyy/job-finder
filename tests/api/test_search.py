"""Task 11 — POST /api/search with per-source stats.

One plan-verbatim test plus three BDD additions that verify:
* search_stats rows are appended (dashboard consumes them)
* body.sources filters the sources_cfg passed to the fetch pipeline
* store.mark_run() bumps the last_run_at timestamp
"""
from __future__ import annotations

from fastapi.testclient import TestClient


def test_search_returns_source_stats(client: TestClient, monkeypatch) -> None:
    from app.api.routes import search as search_module
    from app.models import Job
    from app.utils import stable_job_id

    def fake_fetch(*_args, **_kwargs):
        j = Job(
            id=stable_job_id("Acme", "Senior Backend", "https://x/1"),
            role="Senior Backend", company="Acme", url="https://x/1",
            source="ycombinator", description="Python FastAPI",
        )
        return [j], {
            "ycombinator": {"fetched": 1, "kept": 1, "duration_ms": 10, "error": None},
            "remotive": {"fetched": 0, "kept": 0, "duration_ms": 5, "error": "timeout"},
        }

    monkeypatch.setattr(search_module, "_fetch_with_stats", fake_fetch)

    r = client.post("/api/search", json={"use_llm": False})
    assert r.status_code == 200
    body = r.json()
    assert "source_stats" in body
    assert body["source_stats"]["remotive"]["error"] == "timeout"
    assert body["source_stats"]["ycombinator"]["kept"] == 1
    assert len(body["jobs"]) == 1


# ── BDD additions ──────────────────────────────────────────────────────
def test_search_persists_search_stats(client: TestClient, monkeypatch) -> None:
    """BDD: every per-source stat from a search run lands in search_stats,
    so the Dashboard's latest_per_source query has rows to read."""
    from app.api.deps import get_config_store
    from app.api.routes import search as search_module

    def fake_fetch(*_args, **_kwargs):
        return [], {
            "ycombinator": {"fetched": 3, "kept": 3, "duration_ms": 42, "error": None},
            "remotive": {"fetched": 0, "kept": 0, "duration_ms": 7, "error": "timeout"},
        }

    monkeypatch.setattr(search_module, "_fetch_with_stats", fake_fetch)

    r = client.post("/api/search", json={"use_llm": False})
    assert r.status_code == 200

    cstore = get_config_store()
    rows = cstore.recent_search_stats(limit=20)
    by_source = {row["source"]: row for row in rows}
    assert "ycombinator" in by_source
    assert "remotive" in by_source
    assert by_source["ycombinator"]["kept"] == 3
    assert by_source["ycombinator"]["error"] is None
    assert by_source["remotive"]["error"] == "timeout"
    assert by_source["remotive"]["kept"] == 0


def test_search_filters_sources_when_body_specifies(
    client: TestClient, monkeypatch
) -> None:
    """BDD: body.sources narrows the sources_cfg dict passed into the fetch
    pipeline — only requested sources flow through."""
    from app.api.routes import search as search_module

    captured: dict[str, dict] = {}

    def fake_fetch(_repo, sources_cfg, _companies_cfg):
        captured["sources_cfg"] = sources_cfg
        return [], {
            "ycombinator": {"fetched": 0, "kept": 0, "duration_ms": 1, "error": None},
        }

    monkeypatch.setattr(search_module, "_fetch_with_stats", fake_fetch)

    # Seed every source into the repo-loaded sources_cfg so we have a real
    # reduction to verify. We write via the LocalConfigRepository the client
    # fixture points at.
    from app.api.deps import get_config_repo
    from app.config_repo import SOURCES_YAML

    repo = get_config_repo()
    repo.save_yaml(
        SOURCES_YAML,
        {
            "manual": {"enabled": True},
            "remotive": {"enabled": True},
            "greenhouse": {"enabled": True},
            "ashby": {"enabled": True},
            "ycombinator": {"enabled": True},
            "lever": {"enabled": True},
        },
    )

    r = client.post(
        "/api/search", json={"sources": ["ycombinator"], "use_llm": False}
    )
    assert r.status_code == 200
    assert set(captured["sources_cfg"].keys()) == {"ycombinator"}


def test_search_uses_config_store_companies_when_populated(
    client: TestClient, monkeypatch
) -> None:
    """ConfigStore is source of truth: if the user added a company via the
    Settings UI, /api/search must see that list rather than the YAML seed."""
    from app.api.deps import get_config_store
    from app.api.routes import search as search_module

    captured: dict = {}

    def fake_fetch(_repo, _sources_cfg, companies_cfg):
        captured["companies_cfg"] = companies_cfg
        return [], {
            "ycombinator": {"fetched": 0, "kept": 0, "duration_ms": 1, "error": None},
        }

    monkeypatch.setattr(search_module, "_fetch_with_stats", fake_fetch)

    cstore = get_config_store()
    cstore.add_company({"name": "AcmeFromUI", "ats_type": "greenhouse", "priority": "P0"})

    r = client.post("/api/search", json={"use_llm": False})
    assert r.status_code == 200
    names = {c["name"] for c in captured["companies_cfg"].get("companies", [])}
    assert "AcmeFromUI" in names


def test_search_uses_config_store_profile_when_populated(
    client: TestClient, monkeypatch
) -> None:
    """Setting the profile via ConfigStore must propagate to scoring — we
    verify the scorer sees profile.strong_skills by monkeypatching score_all
    to capture its profile argument."""
    from app.api.deps import get_config_store
    from app.api.routes import search as search_module

    captured: dict = {}

    def fake_fetch(*_args, **_kwargs):
        return [], {
            "ycombinator": {"fetched": 0, "kept": 0, "duration_ms": 1, "error": None},
        }

    def fake_score_all(_jobs, profile, _scoring_cfg, _companies_cfg):
        captured["profile"] = profile
        return []

    monkeypatch.setattr(search_module, "_fetch_with_stats", fake_fetch)
    monkeypatch.setattr(search_module, "score_all", fake_score_all)

    cstore = get_config_store()
    cstore.set_profile(
        {"name": "UI User", "strong_skills": ["rust"], "years_of_experience": 5}
    )

    r = client.post("/api/search", json={"use_llm": False})
    assert r.status_code == 200
    assert captured["profile"]["strong_skills"] == ["rust"]
    assert captured["profile"]["name"] == "UI User"


def test_search_applies_location_filter_to_response(
    client: TestClient, monkeypatch
) -> None:
    """body.location narrows the response rows via location_contains — two
    jobs in different cities, filter='bengaluru' returns only one."""
    from app.api.routes import search as search_module
    from app.models import Job
    from app.utils import stable_job_id

    def fake_fetch(*_args, **_kwargs):
        j1 = Job(
            id=stable_job_id("A", "R1", "https://x/1"),
            role="R1", company="A", url="https://x/1",
            source="ycombinator", location="Bengaluru, India",
            description="Python",
        )
        j2 = Job(
            id=stable_job_id("B", "R2", "https://x/2"),
            role="R2", company="B", url="https://x/2",
            source="ycombinator", location="San Francisco, USA",
            description="Python",
        )
        return [j1, j2], {
            "ycombinator": {"fetched": 2, "kept": 2, "duration_ms": 1, "error": None},
        }

    monkeypatch.setattr(search_module, "_fetch_with_stats", fake_fetch)

    r = client.post("/api/search", json={"location": "bengaluru", "use_llm": False})
    assert r.status_code == 200
    body = r.json()
    locs = [row["job"]["location"] for row in body["jobs"]]
    assert all("bengaluru" in (loc or "").lower() for loc in locs)
    assert len(body["jobs"]) == 1


def test_search_applies_keyword_filter_to_response(
    client: TestClient, monkeypatch
) -> None:
    """body.keyword narrows via the q parameter (role/company/description)."""
    from app.api.routes import search as search_module
    from app.models import Job
    from app.utils import stable_job_id

    def fake_fetch(*_args, **_kwargs):
        j1 = Job(
            id=stable_job_id("A", "Backend Engineer", "https://x/1"),
            role="Backend Engineer", company="A", url="https://x/1",
            source="ycombinator", description="Python",
        )
        j2 = Job(
            id=stable_job_id("B", "Frontend Engineer", "https://x/2"),
            role="Frontend Engineer", company="B", url="https://x/2",
            source="ycombinator", description="React",
        )
        return [j1, j2], {
            "ycombinator": {"fetched": 2, "kept": 2, "duration_ms": 1, "error": None},
        }

    monkeypatch.setattr(search_module, "_fetch_with_stats", fake_fetch)

    r = client.post("/api/search", json={"keyword": "backend", "use_llm": False})
    assert r.status_code == 200
    body = r.json()
    assert len(body["jobs"]) == 1
    assert "backend" in body["jobs"][0]["job"]["role"].lower()


def test_search_sets_last_run_timestamp(client: TestClient, monkeypatch) -> None:
    """BDD: store.mark_run() was invoked — store.last_run_at() returns a
    non-null ISO timestamp after a search."""
    from app.api.deps import get_store
    from app.api.routes import search as search_module

    store = get_store()
    assert store.last_run_at() is None  # pristine DB — nothing has run yet

    def fake_fetch(*_args, **_kwargs):
        return [], {
            "ycombinator": {"fetched": 0, "kept": 0, "duration_ms": 1, "error": None},
        }

    monkeypatch.setattr(search_module, "_fetch_with_stats", fake_fetch)

    r = client.post("/api/search", json={"use_llm": False})
    assert r.status_code == 200

    assert get_store().last_run_at() is not None
