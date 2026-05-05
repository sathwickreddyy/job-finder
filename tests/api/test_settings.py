"""Task 14 — /api/settings/* routes + YAML import + `import-config` CLI."""
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


def test_import_yaml_seeds_from_config_dir(
    tmp_path: Path, monkeypatch
) -> None:
    """BDD: POST /api/settings/import-yaml reads all 4 YAMLs from CONFIG_DIR
    and seeds them into the SQLite config tables."""
    cfg_dir = tmp_path / "config"
    cfg_dir.mkdir()

    (cfg_dir / "profile.yaml").write_text(
        yaml.safe_dump({"name": "Sathwick", "years_of_experience": 5}),
        encoding="utf-8",
    )
    (cfg_dir / "scoring.yaml").write_text(
        yaml.safe_dump({"thresholds": {"P0": 80, "P1": 70, "P2": 60}}),
        encoding="utf-8",
    )
    (cfg_dir / "sources.yaml").write_text(
        yaml.safe_dump({"ycombinator": {"enabled": True}}),
        encoding="utf-8",
    )
    (cfg_dir / "companies.yaml").write_text(
        yaml.safe_dump({"companies": [{"name": "Acme", "priority": "P0"}]}),
        encoding="utf-8",
    )

    monkeypatch.setenv("SQLITE_DB_PATH", str(tmp_path / "t.db"))
    monkeypatch.setenv("CONFIG_DIR", str(cfg_dir))
    monkeypatch.setenv("RESUME_DIR", str(tmp_path / "resumes"))

    from app.api.deps import get_settings

    get_settings.cache_clear()
    from app.api import create_app

    c = TestClient(create_app())

    r = c.post("/api/settings/import-yaml")
    assert r.status_code == 200
    body = r.json()
    assert set(body["imported"].keys()) == {
        "profile.yaml",
        "scoring.yaml",
        "sources.yaml",
        "companies.yaml",
    }
    assert body["imported"]["profile.yaml"] >= 1
    assert body["imported"]["scoring.yaml"] >= 1
    assert body["imported"]["sources.yaml"] >= 1
    assert body["imported"]["companies.yaml"] >= 1

    # Verify the data was imported.
    profile = c.get("/api/settings/profile").json()
    assert profile["name"] == "Sathwick"

    companies = c.get("/api/settings/companies").json()
    assert any(x["name"] == "Acme" and x["priority"] == "P0" for x in companies)


def test_import_yaml_updates_existing_company(tmp_path: Path, monkeypatch) -> None:
    """BDD: calling import-yaml twice with the same companies.yaml must NOT
    IntegrityError on UNIQUE(name) -- the handler falls back to update_company.
    Assert exactly 1 Acme after two imports."""
    cfg_dir = tmp_path / "config"
    cfg_dir.mkdir()

    (cfg_dir / "companies.yaml").write_text(
        yaml.safe_dump({"companies": [{"name": "Acme", "priority": "P1"}]}),
        encoding="utf-8",
    )

    monkeypatch.setenv("SQLITE_DB_PATH", str(tmp_path / "t.db"))
    monkeypatch.setenv("CONFIG_DIR", str(cfg_dir))
    monkeypatch.setenv("RESUME_DIR", str(tmp_path / "resumes"))

    from app.api.deps import get_settings

    get_settings.cache_clear()
    from app.api import create_app

    c = TestClient(create_app())

    r1 = c.post("/api/settings/import-yaml")
    assert r1.status_code == 200

    # Now flip the priority via the same YAML -- second call must not raise.
    (cfg_dir / "companies.yaml").write_text(
        yaml.safe_dump({"companies": [{"name": "Acme", "priority": "P0"}]}),
        encoding="utf-8",
    )
    r2 = c.post("/api/settings/import-yaml")
    assert r2.status_code == 200

    companies = c.get("/api/settings/companies").json()
    acmes = [x for x in companies if x["name"] == "Acme"]
    assert len(acmes) == 1
    assert acmes[0]["priority"] == "P0"


def test_import_config_cli_command_runs(tmp_path: Path, monkeypatch) -> None:
    """BDD: the `import-config` Typer command reuses the HTTP handler and
    prints `imported: {...}` on success."""
    cfg_dir = tmp_path / "config"
    cfg_dir.mkdir()
    (cfg_dir / "profile.yaml").write_text(
        yaml.safe_dump({"name": "CLI Sathwick", "years_of_experience": 6}),
        encoding="utf-8",
    )

    monkeypatch.setenv("SQLITE_DB_PATH", str(tmp_path / "cli.db"))
    monkeypatch.setenv("CONFIG_DIR", str(cfg_dir))
    monkeypatch.setenv("RESUME_DIR", str(tmp_path / "resumes"))

    from app.api.deps import get_settings

    get_settings.cache_clear()
    from app.main import app as cli_app

    runner = CliRunner()
    result = runner.invoke(cli_app, ["import-config"])
    assert result.exit_code == 0, result.output
    assert "imported:" in result.output
