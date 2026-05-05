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
