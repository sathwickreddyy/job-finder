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


# ─── Regression: disable/delete-all does NOT resurrect YAML seed ───────────
def test_companies_all_disabled_returns_empty_not_yaml(cstore: ConfigStore) -> None:
    """Bug scenario: user adds a company in UI, disables it via the toggle
    (soft_delete). On next search run, the pipeline MUST see an empty list,
    not resurrect the YAML seed. That would pull in companies the user just
    removed."""
    repo = _FakeRepo(
        {
            "companies.yaml": {
                "companies": [
                    {"name": "YamlGhost1", "priority": "P2"},
                    {"name": "YamlGhost2", "priority": "P1"},
                ],
            }
        }
    )
    cid = cstore.add_company({"name": "OnceWanted", "priority": "P0"})
    cstore.soft_delete_company(cid)

    out = resolve_companies(cstore, repo)
    # Store has a row → store wins, even though the enabled subset is empty.
    assert out == {"companies": []}
    assert "YamlGhost1" not in [c.get("name", "") for c in out["companies"]]


def test_profile_empty_dict_persists_does_not_fall_back(cstore: ConfigStore) -> None:
    """If the user clears their profile to {} in the UI, we must honor that
    (return {}), not fall back to YAML."""
    repo = _FakeRepo(
        {"profile.yaml": {"name": "SeedShouldNotAppear", "years_of_experience": 99}}
    )
    cstore.set_profile({})
    out = resolve_profile(cstore, repo)
    assert out == {}
    assert "SeedShouldNotAppear" not in str(out)


def test_sources_all_disabled_persists_does_not_fall_back(cstore: ConfigStore) -> None:
    """User disabled every source via the UI → search runs should skip them
    all, not silently turn them back on via YAML fallback."""
    repo = _FakeRepo({"sources.yaml": {"remotive": {"enabled": True}}})
    cstore.put_sources({"remotive": {"enabled": False}, "ycombinator": {"enabled": False}})
    out = resolve_sources(cstore, repo)
    assert out["remotive"]["enabled"] is False
    assert out["ycombinator"]["enabled"] is False


def test_scoring_empty_dict_honored(cstore: ConfigStore) -> None:
    """Writing an empty scoring dict via ConfigStore should be returned as
    empty, not fall back to the YAML seed's thresholds."""
    repo = _FakeRepo(
        {"scoring.yaml": {"thresholds": {"P0": 80, "P1": 70, "P2": 60}}}
    )
    cstore.put_scoring({})  # writes nothing because put_scoring only iterates SCORING_KEYS
    # Note: put_scoring({}) doesn't write any row, so this is the "unseeded"
    # case. Verify that the TRUE empty-but-seeded case (one of the keys set
    # to an empty mapping) still returns that empty value rather than seeding.
    cstore.put_scoring({"thresholds": {}})
    out = resolve_scoring(cstore, repo)
    assert out == {"thresholds": {}}
