"""/api/settings/* routes + `init-db` config seed CLI."""
from __future__ import annotations

from pathlib import Path

import yaml
from fastapi.testclient import TestClient
from typer.testing import CliRunner


# -- plan tests --------------------------------------------------------------
def test_profile_put_then_get(client: TestClient) -> None:
    r = client.put(
        "/api/settings/profile",
        json={
            "name": "Sathwick",
            "years_of_experience": 5,
            "strong_skills": ["python", "fastapi"],
        },
    )
    assert r.status_code == 200

    r2 = client.get("/api/settings/profile")
    body = r2.json()
    assert body["name"] == "Sathwick"
    assert "python" in body["strong_skills"]


def test_companies_crud(client: TestClient) -> None:
    r = client.post(
        "/api/settings/companies",
        json={
            "name": "Acme",
            "ats_type": "greenhouse",
            "board_token": "acme",
            "priority": "P1",
        },
    )
    assert r.status_code == 200
    cid = r.json()["id"]

    r2 = client.get("/api/settings/companies")
    assert any(c["name"] == "Acme" for c in r2.json())

    r3 = client.patch(f"/api/settings/companies/{cid}", json={"priority": "P0"})
    assert r3.status_code == 200

    r4 = client.delete(f"/api/settings/companies/{cid}")
    assert r4.status_code == 200
    assert all(
        c["name"] != "Acme" for c in client.get("/api/settings/companies").json()
    )


def test_scoring_put_get(client: TestClient) -> None:
    r = client.put(
        "/api/settings/scoring",
        json={
            "thresholds": {"P0": 80, "P1": 70, "P2": 60},
            "positive_keywords": ["python", "fastapi"],
        },
    )
    assert r.status_code == 200
    body = client.get("/api/settings/scoring").json()
    assert body["thresholds"]["P0"] == 80


# -- BDD extras --------------------------------------------------------------
def test_sources_put_get(client: TestClient) -> None:
    """BDD: PUT + GET on /api/settings/sources roundtrips the enabled flag and
    opaque options for multiple sources."""
    r = client.put(
        "/api/settings/sources",
        json={
            "remotive": {"enabled": True, "limit": 100},
            "ycombinator": {"enabled": False},
        },
    )
    assert r.status_code == 200

    body = client.get("/api/settings/sources").json()
    assert body["ycombinator"]["enabled"] is False
    assert body["remotive"]["enabled"] is True
    assert body["remotive"]["limit"] == 100


def test_init_db_cli_seeds_config_from_yaml(tmp_path: Path, monkeypatch) -> None:
    """BDD: the `init-db` Typer command creates the schema and seeds empty
    config surfaces from config/*.yaml in one shot."""
    cfg_dir = tmp_path / "config"
    cfg_dir.mkdir()
    (cfg_dir / "profile.yaml").write_text(
        yaml.safe_dump({"name": "CLI Sathwick", "years_of_experience": 6}),
        encoding="utf-8",
    )
    (cfg_dir / "companies.yaml").write_text(
        yaml.safe_dump({"companies": [{"name": "Acme", "priority": "P0"}]}),
        encoding="utf-8",
    )

    db_path = tmp_path / "cli.db"
    monkeypatch.setenv("SQLITE_DB_PATH", str(db_path))
    monkeypatch.setenv("CONFIG_DIR", str(cfg_dir))
    monkeypatch.setenv("RESUME_DIR", str(tmp_path / "resumes"))

    from app.api.deps import get_settings

    get_settings.cache_clear()
    from app.main import app as cli_app

    runner = CliRunner()
    result = runner.invoke(cli_app, ["init-db"])
    assert result.exit_code == 0, result.output
    assert "seeded:" in result.output

    from app.storage.config_store import ConfigStore

    cs = ConfigStore(db_path)
    assert cs.get_profile()["name"] == "CLI Sathwick"
    assert {c["name"] for c in cs.list_companies()} == {"Acme"}
