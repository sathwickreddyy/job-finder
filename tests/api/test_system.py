"""Task 8 — /api/health and /api/capabilities routes."""
from __future__ import annotations

from fastapi.testclient import TestClient


def test_health(client: TestClient) -> None:
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert set(body) >= {"status", "llm_enabled", "notion_enabled", "outlook_enabled", "gmail_enabled"}


def test_capabilities(client: TestClient) -> None:
    r = client.get("/api/capabilities")
    assert r.status_code == 200
    body = r.json()
    assert "llm_enabled" in body
    assert "resume_source" in body


def test_health_flags_reflect_env_config(tmp_path, monkeypatch) -> None:
    """BDD: toggling env credentials flips the capability flags in /api/health."""
    from fastapi.testclient import TestClient

    # First: set the env and assert flags are True.
    monkeypatch.setenv("SQLITE_DB_PATH", str(tmp_path / "t.db"))
    monkeypatch.setenv("CONFIG_DIR", str(tmp_path / "config"))
    monkeypatch.setenv("RESUME_DIR", str(tmp_path / "resumes"))
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-xxx")
    monkeypatch.setenv("NOTION_TOKEN", "secret")
    monkeypatch.setenv("NOTION_JOBS_DATABASE_ID", "abc")

    from app.api.deps import get_settings
    get_settings.cache_clear()
    from app.api import create_app
    c = TestClient(create_app())

    body = c.get("/api/health").json()
    assert body["llm_enabled"] is True
    assert body["notion_enabled"] is True

    # Now: clear the env and assert flags are False.
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("NOTION_TOKEN", raising=False)
    monkeypatch.delenv("NOTION_JOBS_DATABASE_ID", raising=False)

    get_settings.cache_clear()
    c2 = TestClient(create_app())
    body2 = c2.get("/api/health").json()
    assert body2["llm_enabled"] is False
    assert body2["notion_enabled"] is False


def test_capabilities_resume_source_none_when_no_resume(tmp_path, monkeypatch) -> None:
    """BDD: with no resume md on the portfolio path and no resumes/master.md in cwd,
    /api/capabilities should report resume_source='none'."""
    from fastapi.testclient import TestClient

    monkeypatch.setenv("SQLITE_DB_PATH", str(tmp_path / "t.db"))
    monkeypatch.setenv("CONFIG_DIR", str(tmp_path / "config"))
    monkeypatch.setenv("RESUME_DIR", str(tmp_path / "resumes"))
    monkeypatch.delenv("RESUME_MD_PATH", raising=False)
    monkeypatch.delenv("RESUME_PDF_PATH", raising=False)
    monkeypatch.delenv("RESUME_DOCX_PATH", raising=False)
    # Put cwd into tmp_path so the local resumes/master.md fallback cannot resolve.
    monkeypatch.chdir(tmp_path)

    from app.api.deps import get_settings
    get_settings.cache_clear()
    from app.api import create_app
    c = TestClient(create_app())

    body = c.get("/api/capabilities").json()
    assert body["resume_source"] == "none"
