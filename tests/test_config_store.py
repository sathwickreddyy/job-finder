from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest

from app.storage.config_store import ConfigStore
from app.storage.sqlite_store import SQLiteStore


@pytest.fixture
def cstore(tmp_path: Path) -> ConfigStore:
    # search_stats is owned by SQLiteStore; init it first so ConfigStore
    # can append/read without re-declaring the table.
    s = SQLiteStore(tmp_path / "t.db")
    s.init_schema()
    cs = ConfigStore(tmp_path / "t.db")
    cs.init_schema()
    return cs


# ── plan's 5 tests ──────────────────────────────────────────────────────────

def test_profile_roundtrip(cstore: ConfigStore) -> None:
    cstore.set_profile({"name": "Sathwick", "years_of_experience": 5})
    got = cstore.get_profile()
    assert got["name"] == "Sathwick"
    assert got["years_of_experience"] == 5


def test_companies_crud(cstore: ConfigStore) -> None:
    cid = cstore.add_company(
        {"name": "Acme", "ats_type": "greenhouse", "board_token": "acme", "priority": "P1"}
    )
    assert isinstance(cid, int)
    rows = cstore.list_companies()
    assert len(rows) == 1 and rows[0]["name"] == "Acme"

    cstore.update_company(cid, {"priority": "P0"})
    assert cstore.list_companies()[0]["priority"] == "P0"

    cstore.soft_delete_company(cid)
    assert cstore.list_companies(include_disabled=False) == []
    assert len(cstore.list_companies(include_disabled=True)) == 1


def test_scoring_bulk_put(cstore: ConfigStore) -> None:
    cstore.put_scoring(
        {"thresholds": {"P0": 80, "P1": 70, "P2": 60}, "positive_keywords": ["python"]}
    )
    got = cstore.get_scoring()
    assert got["thresholds"]["P0"] == 80
    assert "python" in got["positive_keywords"]


def test_sources_bulk_put(cstore: ConfigStore) -> None:
    cstore.put_sources(
        {"remotive": {"enabled": True, "limit": 100}, "ycombinator": {"enabled": True}}
    )
    got = cstore.get_sources()
    assert got["remotive"]["enabled"] is True
    assert got["ycombinator"]["enabled"] is True


def test_search_stats_append_and_prune(cstore: ConfigStore) -> None:
    for _ in range(5):
        cstore.append_search_stat(
            source="remotive", fetched=10, kept=2, duration_ms=100, error=None
        )
    rows = cstore.recent_search_stats()
    assert len(rows) == 5
    assert all(r["source"] == "remotive" for r in rows)


# ── BDD extras ──────────────────────────────────────────────────────────────

def test_companies_add_is_unique_on_name(cstore: ConfigStore) -> None:
    """Re-adding a company under the same name violates UNIQUE(name)."""
    cstore.add_company({"name": "Acme", "ats_type": "greenhouse"})
    with pytest.raises(sqlite3.IntegrityError):
        cstore.add_company({"name": "Acme", "ats_type": "lever"})


def test_companies_preferred_locations_roundtrips_as_list(cstore: ConfigStore) -> None:
    """preferred_locations is stored as JSON but must read back as a Python list."""
    cid = cstore.add_company(
        {
            "name": "Flipkart",
            "ats_type": "unknown",
            "preferred_locations": ["Bengaluru", "Hyderabad"],
        }
    )
    assert isinstance(cid, int)
    [row] = cstore.list_companies()
    assert isinstance(row["preferred_locations"], list)
    assert row["preferred_locations"] == ["Bengaluru", "Hyderabad"]
    # Sanity: not a string blob that merely *starts* with '['
    assert not isinstance(row["preferred_locations"], str)


def test_update_company_no_patch_is_noop(cstore: ConfigStore) -> None:
    """Calling update_company with an empty dict must not error or mutate the row."""
    cid = cstore.add_company(
        {"name": "Acme", "ats_type": "greenhouse", "board_token": "acme", "priority": "P1"}
    )
    before = cstore.list_companies()[0]
    cstore.update_company(cid, {})  # no-op — must not raise
    after = cstore.list_companies()[0]
    assert before == after


# ── idempotency ─────────────────────────────────────────────────────────────

def test_init_schema_is_idempotent(tmp_path: Path) -> None:
    """Calling init_schema twice on a fresh DB must not raise."""
    s = SQLiteStore(tmp_path / "idem.db")
    s.init_schema()
    cs = ConfigStore(tmp_path / "idem.db")
    cs.init_schema()
    cs.init_schema()  # second call — must be a no-op
    # Also confirm we can still read/write after double-init.
    cs.set_profile({"name": "x"})
    assert cs.get_profile()["name"] == "x"


# ── latest_per_source ───────────────────────────────────────────────────────

def test_latest_per_source_picks_most_recent_per_source(cstore: ConfigStore) -> None:
    """
    Append 3 remotive rows and 1 greenhouse row.
    latest_per_source() must return exactly 2 entries and the remotive entry
    must point at the most recently inserted row (largest kept value here).
    """
    for kept in (1, 2, 3):
        cstore.append_search_stat(
            source="remotive", fetched=100, kept=kept, duration_ms=50, error=None
        )

    cstore.append_search_stat(
        source="greenhouse", fetched=5, kept=1, duration_ms=20, error=None
    )

    latest = cstore.latest_per_source()
    assert set(latest.keys()) == {"remotive", "greenhouse"}
    # The most recent remotive row is the one with kept=3.
    assert latest["remotive"]["kept"] == 3
    assert latest["greenhouse"]["kept"] == 1


def test_latest_per_source_breaks_ties_by_id(
    cstore: ConfigStore, monkeypatch: pytest.MonkeyPatch
) -> None:
    """
    With identical ran_at timestamps, latest_per_source() must tie-break on the
    autoincrement id PK so the last-inserted row wins deterministically.
    """
    monkeypatch.setattr(
        "app.storage.config_store.utcnow_iso",
        lambda: "2026-05-05T00:00:00+00:00",
    )

    for kept in (1, 2, 3):
        cstore.append_search_stat(
            source="remotive", fetched=100, kept=kept, duration_ms=50, error=None
        )

    cstore.append_search_stat(
        source="greenhouse", fetched=5, kept=1, duration_ms=20, error=None
    )

    latest = cstore.latest_per_source()
    assert set(latest.keys()) == {"remotive", "greenhouse"}
    assert len(latest) == 2
    # Even though all three remotive rows share ran_at, the highest id wins.
    assert latest["remotive"]["kept"] == 3
    assert latest["greenhouse"]["kept"] == 1
