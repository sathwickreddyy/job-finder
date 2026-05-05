"""ConfigStore-backed resolver precedence tests.

These prove the critical invariant: once the Settings UI writes to
ConfigStore, the search/scoring/CLI pipelines see those edits rather than
the seed YAML.
"""
from __future__ import annotations

from pathlib import Path

import pytest

from app.config_repo.base import ConfigRepository
from app.storage.config_resolver import (
    resolve_companies,
    resolve_profile,
    resolve_scoring,
    resolve_sources,
)
from app.storage.config_store import ConfigStore


class _FakeRepo(ConfigRepository):
    """Minimal stub: returns fixed YAML-like dicts per filename."""

    is_read_only = False

    def __init__(self, payload: dict[str, dict]) -> None:
        self.payload = payload

    def load_yaml(self, filename: str) -> dict:
        return dict(self.payload.get(filename, {}))

    def save_yaml(self, filename: str, data: dict) -> None:
        self.payload[filename] = dict(data)

    def load_resume(self, rel_path: str) -> str:
        return ""

    def save_resume(self, rel_path: str, content: str) -> None:
        pass

    def list_resume_files(self) -> list[str]:
        return []


@pytest.fixture
def cstore(tmp_path: Path) -> ConfigStore:
    c = ConfigStore(tmp_path / "c.db")
    c.init_schema()
    return c


def test_profile_prefers_config_store_when_populated(cstore: ConfigStore) -> None:
    repo = _FakeRepo({"profile.yaml": {"name": "YAML", "years_of_experience": 1}})
    cstore.set_profile({"name": "DB wins", "years_of_experience": 7})
    out = resolve_profile(cstore, repo)
    assert out == {"name": "DB wins", "years_of_experience": 7}


def test_profile_falls_back_to_yaml_when_store_empty(cstore: ConfigStore) -> None:
    repo = _FakeRepo({"profile.yaml": {"name": "YAML", "years_of_experience": 1}})
    out = resolve_profile(cstore, repo)
    assert out == {"name": "YAML", "years_of_experience": 1}


def test_scoring_prefers_store_when_populated(cstore: ConfigStore) -> None:
    repo = _FakeRepo({"scoring.yaml": {"thresholds": {"P0": 80, "P1": 70, "P2": 60}}})
    cstore.put_scoring({"thresholds": {"P0": 90, "P1": 80, "P2": 70}})
    out = resolve_scoring(cstore, repo)
    assert out["thresholds"]["P0"] == 90


def test_sources_prefers_store_when_populated(cstore: ConfigStore) -> None:
    repo = _FakeRepo({"sources.yaml": {"remotive": {"enabled": True}}})
    cstore.put_sources({"remotive": {"enabled": False}, "greenhouse": {"enabled": True}})
    out = resolve_sources(cstore, repo)
    assert out["remotive"]["enabled"] is False
    assert out["greenhouse"]["enabled"] is True


def test_companies_prefers_store_and_excludes_disabled(cstore: ConfigStore) -> None:
    repo = _FakeRepo(
        {
            "companies.yaml": {
                "companies": [{"name": "YamlCorp", "priority": "P2"}],
            }
        }
    )
    cstore.add_company({"name": "Visible", "priority": "P0"})
    c2 = cstore.add_company({"name": "Hidden", "priority": "P1"})
    cstore.soft_delete_company(c2)
    out = resolve_companies(cstore, repo)
    names = {c["name"] for c in out["companies"]}
    assert names == {"Visible"}
    # Return id too (store shape) — pipeline `_companies_with` only needs
    # `name` and ats_type fields, both present on the store row.
    assert all("name" in c for c in out["companies"])


def test_companies_falls_back_to_yaml_when_store_empty(cstore: ConfigStore) -> None:
    repo = _FakeRepo(
        {
            "companies.yaml": {
                "companies": [{"name": "YamlCorp", "priority": "P2"}],
            }
        }
    )
    out = resolve_companies(cstore, repo)
    assert out["companies"][0]["name"] == "YamlCorp"
