# v2 — React SPA, On-Demand Search, India Sources — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Streamlit UI with a React SPA backed by FastAPI, move config from YAML to SQLite, add an India-first source with status-aware tracker sorting, and wire Docker compose to two images.

**Architecture:** Monolithic FastAPI reuses every existing `app/` module; React 18 + TS (strict) + Tailwind + shadcn/ui + React Router + TanStack Query talks to the API over a typed client generated from OpenAPI. Two Dockerfiles (one Python, one Node→nginx) so dep trees rebuild independently.

**Tech Stack:** Python 3.13, FastAPI, SQLite, Vite, React 18, TypeScript, Tailwind, shadcn/ui, TanStack Query v5, React Router v6, openapi-typescript, openapi-fetch, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-05-05-v2-react-spa-and-india-sources-design.md`

---

## Phase A — Foundation (backend data model, sources, scoring, resume)

### Task 1: Extend `applications` table with interview fields and add `search_stats`

**Files:**
- Modify: `app/storage/sqlite_store.py` — add ALTER statements guarded by `PRAGMA table_info`; add `search_stats` CREATE
- Test: `tests/test_sqlite_store.py` — new cases

- [ ] **Step 1: Write the failing test for `applications` column additions**

Add to `tests/test_sqlite_store.py`:
```python
def test_applications_has_interview_and_lifecycle_columns(store: SQLiteStore) -> None:
    with store._conn() as c:
        cols = {row["name"] for row in c.execute("PRAGMA table_info(applications)").fetchall()}
    assert {"next_interview_at", "interview_notes", "applied_at", "rejected_at"} <= cols


def test_search_stats_table_exists(store: SQLiteStore) -> None:
    with store._conn() as c:
        names = {r["name"] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
    assert "search_stats" in names
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/bin/pytest tests/test_sqlite_store.py::test_applications_has_interview_and_lifecycle_columns tests/test_sqlite_store.py::test_search_stats_table_exists -v`
Expected: FAIL — missing columns / table.

- [ ] **Step 3: Extend `SCHEMA_SQL` in `app/storage/sqlite_store.py`**

In `app/storage/sqlite_store.py`, append to `SCHEMA_SQL`:
```sql
CREATE TABLE IF NOT EXISTS search_stats (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    ran_at        TEXT NOT NULL,
    source        TEXT NOT NULL,
    fetched       INTEGER NOT NULL DEFAULT 0,
    kept          INTEGER NOT NULL DEFAULT 0,
    duration_ms   INTEGER NOT NULL DEFAULT 0,
    error         TEXT
);
CREATE INDEX IF NOT EXISTS idx_search_stats_ran_at ON search_stats(ran_at);
```

Then add a guarded migration method:
```python
def _migrate_applications_columns(self) -> None:
    """Idempotent ALTER — add interview + lifecycle columns if missing."""
    needed = {
        "next_interview_at": "TEXT",
        "interview_notes":   "TEXT",
        "applied_at":        "TEXT",
        "rejected_at":       "TEXT",
    }
    with self._conn() as c:
        existing = {row["name"] for row in c.execute("PRAGMA table_info(applications)").fetchall()}
        for col, coltype in needed.items():
            if col not in existing:
                c.execute(f"ALTER TABLE applications ADD COLUMN {col} {coltype}")
```

And call it from `init_schema`:
```python
def init_schema(self) -> None:
    with self._conn() as c:
        c.executescript(SCHEMA_SQL)
    self._migrate_applications_columns()
    log.info("sqlite schema initialized at %s", self.db_path)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/bin/pytest tests/test_sqlite_store.py -v`
Expected: PASS (all tests including the existing ones).

- [ ] **Step 5: Commit**

```bash
git add app/storage/sqlite_store.py tests/test_sqlite_store.py
git commit -m "feat(storage): add interview fields on applications and search_stats table

- ALTER TABLE applications add {next_interview_at, interview_notes, applied_at, rejected_at}
  guarded by PRAGMA table_info() so re-running init-db is safe
- new search_stats table for per-source outcomes of /api/search runs

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Add `STATUS_RANK` and `_status_rank_case_sql` helper

**Files:**
- Modify: `app/storage/sqlite_store.py` — add module-level constants and helper
- Test: `tests/test_sqlite_store.py` — new case

- [ ] **Step 1: Write the failing test**

Add to `tests/test_sqlite_store.py`:
```python
from app.storage.sqlite_store import STATUS_RANK, _status_rank_case_sql


def test_status_rank_ordering() -> None:
    assert STATUS_RANK["Interviewing"] < STATUS_RANK["Applied"]
    assert STATUS_RANK["Applied"] < STATUS_RANK["Rejected"]
    assert STATUS_RANK["Rejected"] < STATUS_RANK["Archived"]


def test_status_rank_case_sql_renders_all_statuses() -> None:
    sql = _status_rank_case_sql()
    assert "CASE COALESCE(applications.status, 'Found')" in sql
    for status in STATUS_RANK:
        assert f"WHEN '{status}'" in sql
    assert "ELSE 99" in sql
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/pytest tests/test_sqlite_store.py::test_status_rank_ordering tests/test_sqlite_store.py::test_status_rank_case_sql_renders_all_statuses -v`
Expected: FAIL — `ImportError: cannot import name 'STATUS_RANK'`.

- [ ] **Step 3: Add `STATUS_RANK` and helper to `app/storage/sqlite_store.py`**

Add near the top of the file, after the imports:
```python
STATUS_RANK: dict[str, int] = {
    "Interviewing":       0,
    "Assessment Pending": 1,
    "Recruiter Reply":    2,
    "Applied":            3,
    "Tailoring Resume":   4,
    "Need Referral":      5,
    "Shortlisted":        6,
    "Found":              7,
    "Rejected":           8,
    "Archived":           9,
}


def _status_rank_case_sql() -> str:
    """Render STATUS_RANK as a SQL CASE expression.

    Values are compile-time constants (no user input), so direct
    interpolation is safe. Fallback bucket is 99 — unknown statuses
    sink below Archived."""
    branches = "\n    ".join(
        f"WHEN '{status}' THEN {rank}" for status, rank in STATUS_RANK.items()
    )
    return f"CASE COALESCE(applications.status, 'Found')\n    {branches}\n    ELSE 99\n  END"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/bin/pytest tests/test_sqlite_store.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/storage/sqlite_store.py tests/test_sqlite_store.py
git commit -m "feat(storage): add STATUS_RANK and status_rank CASE SQL helper

Query-time status-rank rendering — never a stored column. When
STATUS_RANK changes, no migration is required.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: New `app/storage/config_store.py` — CRUD for settings/companies/scoring/sources/search_stats

**Files:**
- Create: `app/storage/config_store.py`
- Test: `tests/test_config_store.py`

- [ ] **Step 1: Write the failing tests**

Create `tests/test_config_store.py`:
```python
from __future__ import annotations

from pathlib import Path

import pytest

from app.storage.config_store import ConfigStore
from app.storage.sqlite_store import SQLiteStore


@pytest.fixture
def cstore(tmp_path: Path) -> ConfigStore:
    s = SQLiteStore(tmp_path / "t.db")
    s.init_schema()
    cs = ConfigStore(tmp_path / "t.db")
    cs.init_schema()
    return cs


def test_profile_roundtrip(cstore: ConfigStore) -> None:
    cstore.set_profile({"name": "Sathwick", "years_of_experience": 5})
    got = cstore.get_profile()
    assert got["name"] == "Sathwick"
    assert got["years_of_experience"] == 5


def test_companies_crud(cstore: ConfigStore) -> None:
    cid = cstore.add_company({"name": "Acme", "ats_type": "greenhouse", "board_token": "acme", "priority": "P1"})
    assert isinstance(cid, int)
    rows = cstore.list_companies()
    assert len(rows) == 1 and rows[0]["name"] == "Acme"

    cstore.update_company(cid, {"priority": "P0"})
    assert cstore.list_companies()[0]["priority"] == "P0"

    cstore.soft_delete_company(cid)
    assert cstore.list_companies(include_disabled=False) == []
    assert len(cstore.list_companies(include_disabled=True)) == 1


def test_scoring_bulk_put(cstore: ConfigStore) -> None:
    cstore.put_scoring({"thresholds": {"P0": 80, "P1": 70, "P2": 60}, "positive_keywords": ["python"]})
    got = cstore.get_scoring()
    assert got["thresholds"]["P0"] == 80
    assert "python" in got["positive_keywords"]


def test_sources_bulk_put(cstore: ConfigStore) -> None:
    cstore.put_sources({"remotive": {"enabled": True, "limit": 100}, "ycombinator": {"enabled": True}})
    got = cstore.get_sources()
    assert got["remotive"]["enabled"] is True
    assert got["ycombinator"]["enabled"] is True


def test_search_stats_append_and_prune(cstore: ConfigStore) -> None:
    for i in range(5):
        cstore.append_search_stat(source="remotive", fetched=10, kept=2, duration_ms=100, error=None)
    rows = cstore.recent_search_stats()
    assert len(rows) == 5
    assert all(r["source"] == "remotive" for r in rows)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/bin/pytest tests/test_config_store.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.storage.config_store'`.

- [ ] **Step 3: Create `app/storage/config_store.py`**

```python
"""CRUD for v2 config tables: settings, companies_cfg, scoring_cfg, sources_cfg, search_stats.

Uses the same DB file as SQLiteStore. Kept as a sibling class (not a method on SQLiteStore)
so the config surface can evolve without touching job storage."""
from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

from ..utils import utcnow_iso


SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS settings (
    key          TEXT PRIMARY KEY,
    value_json   TEXT NOT NULL,
    updated_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS companies_cfg (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    name                  TEXT NOT NULL UNIQUE,
    careers_url           TEXT,
    ats_type              TEXT NOT NULL DEFAULT 'unknown',
    board_token           TEXT,
    org_slug              TEXT,
    company_slug          TEXT,
    preferred_locations   TEXT,
    priority              TEXT NOT NULL DEFAULT 'P2',
    notes                 TEXT,
    enabled               INTEGER NOT NULL DEFAULT 1,
    updated_at            TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS scoring_cfg (
    key          TEXT PRIMARY KEY,
    value_json   TEXT NOT NULL,
    updated_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sources_cfg (
    source       TEXT PRIMARY KEY,
    enabled      INTEGER NOT NULL DEFAULT 1,
    options_json TEXT,
    updated_at   TEXT NOT NULL
);
"""


class ConfigStore:
    def __init__(self, db_path: Path) -> None:
        self.db_path = Path(db_path)

    @contextmanager
    def _conn(self) -> Iterator[sqlite3.Connection]:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def init_schema(self) -> None:
        with self._conn() as c:
            c.executescript(SCHEMA_SQL)

    # ── settings (profile etc.) ─────────────────────────────────────────
    def _set_kv(self, key: str, value: dict) -> None:
        with self._conn() as c:
            c.execute(
                """INSERT INTO settings (key, value_json, updated_at) VALUES (?, ?, ?)
                   ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json, updated_at=excluded.updated_at""",
                (key, json.dumps(value, ensure_ascii=False), utcnow_iso()),
            )

    def _get_kv(self, key: str) -> dict:
        with self._conn() as c:
            row = c.execute("SELECT value_json FROM settings WHERE key=?", (key,)).fetchone()
        return json.loads(row["value_json"]) if row else {}

    def set_profile(self, profile: dict) -> None:
        self._set_kv("profile", profile)

    def get_profile(self) -> dict:
        return self._get_kv("profile")

    # ── companies_cfg ────────────────────────────────────────────────────
    def add_company(self, row: dict) -> int:
        with self._conn() as c:
            cur = c.execute(
                """INSERT INTO companies_cfg
                   (name, careers_url, ats_type, board_token, org_slug, company_slug,
                    preferred_locations, priority, notes, enabled, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)""",
                (
                    row["name"], row.get("careers_url"), row.get("ats_type", "unknown"),
                    row.get("board_token"), row.get("org_slug"), row.get("company_slug"),
                    json.dumps(row.get("preferred_locations") or []),
                    row.get("priority", "P2"), row.get("notes"), utcnow_iso(),
                ),
            )
            return cur.lastrowid

    def list_companies(self, include_disabled: bool = False) -> list[dict]:
        sql = "SELECT * FROM companies_cfg"
        if not include_disabled:
            sql += " WHERE enabled=1"
        sql += " ORDER BY name COLLATE NOCASE"
        with self._conn() as c:
            rows = c.execute(sql).fetchall()
        out = []
        for r in rows:
            d = dict(r)
            d["preferred_locations"] = json.loads(d["preferred_locations"] or "[]")
            d["enabled"] = bool(d["enabled"])
            out.append(d)
        return out

    def update_company(self, cid: int, patch: dict) -> None:
        cols: list[str] = []
        vals: list[Any] = []
        for k in ("name", "careers_url", "ats_type", "board_token", "org_slug",
                  "company_slug", "priority", "notes"):
            if k in patch:
                cols.append(f"{k}=?")
                vals.append(patch[k])
        if "preferred_locations" in patch:
            cols.append("preferred_locations=?")
            vals.append(json.dumps(patch["preferred_locations"]))
        if "enabled" in patch:
            cols.append("enabled=?")
            vals.append(1 if patch["enabled"] else 0)
        if not cols:
            return
        cols.append("updated_at=?")
        vals.append(utcnow_iso())
        vals.append(cid)
        with self._conn() as c:
            c.execute(f"UPDATE companies_cfg SET {', '.join(cols)} WHERE id=?", vals)

    def soft_delete_company(self, cid: int) -> None:
        self.update_company(cid, {"enabled": False})

    # ── scoring_cfg ─────────────────────────────────────────────────────
    SCORING_KEYS = (
        "thresholds", "positive_keywords", "negative_keywords",
        "location_boosts", "domain_boosts", "company_boosts",
        "source_quality_boosts", "resume_variant_rules",
    )

    def put_scoring(self, data: dict) -> None:
        with self._conn() as c:
            for key in self.SCORING_KEYS:
                if key in data:
                    c.execute(
                        """INSERT INTO scoring_cfg (key, value_json, updated_at) VALUES (?, ?, ?)
                           ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json, updated_at=excluded.updated_at""",
                        (key, json.dumps(data[key]), utcnow_iso()),
                    )

    def get_scoring(self) -> dict:
        with self._conn() as c:
            rows = c.execute("SELECT key, value_json FROM scoring_cfg").fetchall()
        return {r["key"]: json.loads(r["value_json"]) for r in rows}

    # ── sources_cfg ─────────────────────────────────────────────────────
    def put_sources(self, data: dict) -> None:
        with self._conn() as c:
            for source, cfg in data.items():
                enabled = 1 if cfg.get("enabled", True) else 0
                options = {k: v for k, v in cfg.items() if k != "enabled"}
                c.execute(
                    """INSERT INTO sources_cfg (source, enabled, options_json, updated_at) VALUES (?, ?, ?, ?)
                       ON CONFLICT(source) DO UPDATE SET enabled=excluded.enabled,
                       options_json=excluded.options_json, updated_at=excluded.updated_at""",
                    (source, enabled, json.dumps(options), utcnow_iso()),
                )

    def get_sources(self) -> dict:
        with self._conn() as c:
            rows = c.execute("SELECT source, enabled, options_json FROM sources_cfg").fetchall()
        out: dict[str, dict] = {}
        for r in rows:
            cfg = json.loads(r["options_json"] or "{}")
            cfg["enabled"] = bool(r["enabled"])
            out[r["source"]] = cfg
        return out

    # ── search_stats ─────────────────────────────────────────────────────
    def append_search_stat(self, *, source: str, fetched: int, kept: int,
                           duration_ms: int, error: str | None) -> None:
        with self._conn() as c:
            c.execute(
                """INSERT INTO search_stats (ran_at, source, fetched, kept, duration_ms, error)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (utcnow_iso(), source, fetched, kept, duration_ms, error),
            )

    def recent_search_stats(self, limit: int = 20) -> list[dict]:
        with self._conn() as c:
            rows = c.execute(
                "SELECT * FROM search_stats ORDER BY ran_at DESC LIMIT ?", (limit,)
            ).fetchall()
        return [dict(r) for r in rows]

    def latest_per_source(self) -> dict[str, dict]:
        with self._conn() as c:
            rows = c.execute(
                """SELECT s.* FROM search_stats s
                   JOIN (SELECT source, MAX(ran_at) AS m FROM search_stats GROUP BY source) x
                   ON x.source = s.source AND x.m = s.ran_at"""
            ).fetchall()
        return {r["source"]: dict(r) for r in rows}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/bin/pytest tests/test_config_store.py -v`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add app/storage/config_store.py tests/test_config_store.py
git commit -m "feat(storage): add ConfigStore with settings/companies/scoring/sources/search_stats

Sibling to SQLiteStore — same DB file, distinct responsibility. JSON-backed
value columns let profile / scoring / sources evolve without schema churn.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: YC Combinator source with field-level tolerance

**Files:**
- Create: `app/sources/ycombinator.py`
- Create: `tests/fixtures/ycombinator/` (13 fixture files — listed in Task 4 Step 3)
- Create: `tests/test_ycombinator.py`
- Modify: `app/sources/__init__.py` — register source in `fetch_all`

- [ ] **Step 1: Write the failing tests**

Create `tests/test_ycombinator.py`:
```python
from __future__ import annotations

import json
from pathlib import Path

import httpx
import pytest

from app.sources.ycombinator import YCombinatorSource

FIXTURES = Path(__file__).parent / "fixtures" / "ycombinator"


def _load(name: str) -> list[dict]:
    return json.loads((FIXTURES / name).read_text())


def _patched_fetch(monkeypatch, payload):
    def fake_http_get_json(url, params=None):
        return payload
    monkeypatch.setattr("app.sources.ycombinator.http_get_json", fake_http_get_json)


def test_happy_path_bengaluru(monkeypatch) -> None:
    _patched_fetch(monkeypatch, _load("happy_bengaluru.json"))
    jobs = YCombinatorSource().fetch({"enabled": True, "known_companies": []})
    assert len(jobs) == 1
    j = jobs[0]
    assert j.company == "Razorpay"
    assert "bengaluru" in (j.location or "").lower()
    assert j.source == "ycombinator"


def test_remote_only_passes(monkeypatch) -> None:
    _patched_fetch(monkeypatch, _load("remote_only.json"))
    jobs = YCombinatorSource().fetch({"enabled": True, "known_companies": []})
    assert len(jobs) == 1
    assert jobs[0].remote_type == "remote"


def test_company_matched_passes(monkeypatch) -> None:
    _patched_fetch(monkeypatch, _load("company_matched.json"))
    jobs = YCombinatorSource().fetch({"enabled": True, "known_companies": ["CRED"]})
    assert len(jobs) == 1


def test_rejected_location(monkeypatch) -> None:
    _patched_fetch(monkeypatch, _load("rejected_london.json"))
    jobs = YCombinatorSource().fetch({"enabled": True, "known_companies": []})
    assert jobs == []


def test_missing_title_skipped(monkeypatch, caplog) -> None:
    _patched_fetch(monkeypatch, _load("missing_title.json"))
    jobs = YCombinatorSource().fetch({"enabled": True, "known_companies": []})
    assert len(jobs) == 1  # good one passes, bad one skipped
    assert any("missing title" in r.getMessage().lower() or "title" in r.getMessage().lower()
               for r in caplog.records)


def test_missing_company_skipped(monkeypatch) -> None:
    _patched_fetch(monkeypatch, _load("missing_company.json"))
    jobs = YCombinatorSource().fetch({"enabled": True, "known_companies": []})
    assert jobs == []


def test_missing_url_synthesized(monkeypatch) -> None:
    _patched_fetch(monkeypatch, _load("missing_url.json"))
    jobs = YCombinatorSource().fetch({"enabled": True, "known_companies": []})
    assert len(jobs) == 1
    assert jobs[0].url.startswith("ycombinator://")


def test_missing_location_falls_through(monkeypatch) -> None:
    _patched_fetch(monkeypatch, _load("missing_location_remote.json"))
    jobs = YCombinatorSource().fetch({"enabled": True, "known_companies": []})
    assert len(jobs) == 1


def test_missing_remote_type_falls_through(monkeypatch) -> None:
    _patched_fetch(monkeypatch, _load("missing_remote_type_bengaluru.json"))
    jobs = YCombinatorSource().fetch({"enabled": True, "known_companies": []})
    assert len(jobs) == 1


def test_malformed_posted_date_becomes_none(monkeypatch) -> None:
    _patched_fetch(monkeypatch, _load("malformed_date.json"))
    jobs = YCombinatorSource().fetch({"enabled": True, "known_companies": []})
    assert len(jobs) == 1
    assert jobs[0].posted_date is None


def test_epoch_and_iso_dates(monkeypatch) -> None:
    _patched_fetch(monkeypatch, _load("epoch_and_iso.json"))
    jobs = YCombinatorSource().fetch({"enabled": True, "known_companies": []})
    assert len(jobs) == 2
    assert all(j.posted_date is not None for j in jobs)


def test_mixed_batch(monkeypatch) -> None:
    _patched_fetch(monkeypatch, _load("mixed_batch.json"))
    jobs = YCombinatorSource().fetch({"enabled": True, "known_companies": []})
    # fixture contains 10 postings: 7 valid, 3 malformed
    assert len(jobs) == 7


def test_network_failure_returns_empty(monkeypatch) -> None:
    def boom(url, params=None):
        raise httpx.HTTPError("network down")
    monkeypatch.setattr("app.sources.ycombinator.http_get_json", boom)
    assert YCombinatorSource().fetch({"enabled": True, "known_companies": []}) == []
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/bin/pytest tests/test_ycombinator.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.sources.ycombinator'` or `FileNotFoundError` on fixtures.

- [ ] **Step 3: Create all 13 fixture files**

Create `tests/fixtures/ycombinator/happy_bengaluru.json`:
```json
[
  {
    "id": 1,
    "title": "Senior Backend Engineer",
    "company_name": "Razorpay",
    "location": "Bengaluru, India",
    "remote": false,
    "url": "https://www.ycombinator.com/companies/razorpay/jobs/1",
    "description": "Build payments infra.",
    "posted_at": 1714700000
  }
]
```

Create `tests/fixtures/ycombinator/remote_only.json`:
```json
[
  {
    "id": 2,
    "title": "Staff Platform Engineer",
    "company_name": "Remote Co",
    "location": "Worldwide",
    "remote": true,
    "url": "https://www.ycombinator.com/companies/remote-co/jobs/2",
    "description": "Remote platform role.",
    "posted_at": 1714700000
  }
]
```

Create `tests/fixtures/ycombinator/company_matched.json`:
```json
[
  {
    "id": 3,
    "title": "Senior Engineer",
    "company_name": "CRED",
    "location": "Singapore",
    "remote": false,
    "url": "https://www.ycombinator.com/companies/cred/jobs/3",
    "description": "Fintech role.",
    "posted_at": 1714700000
  }
]
```

Create `tests/fixtures/ycombinator/rejected_london.json`:
```json
[
  {
    "id": 4,
    "title": "Engineer",
    "company_name": "Totally UK Co",
    "location": "London, UK",
    "remote": false,
    "url": "https://www.ycombinator.com/companies/uk-co/jobs/4",
    "description": "Onsite UK.",
    "posted_at": 1714700000
  }
]
```

Create `tests/fixtures/ycombinator/missing_title.json`:
```json
[
  {"id": 5, "company_name": "Acme", "location": "Bengaluru", "remote": false},
  {"id": 6, "title": "Good Role", "company_name": "Good Co", "location": "Bengaluru", "remote": false,
   "url": "https://x/6", "description": "x"}
]
```

Create `tests/fixtures/ycombinator/missing_company.json`:
```json
[
  {"id": 7, "title": "Role", "location": "Bengaluru", "remote": false,
   "url": "https://x/7", "description": "x"}
]
```

Create `tests/fixtures/ycombinator/missing_url.json`:
```json
[
  {"id": 8, "title": "Senior Backend", "company_name": "NoURL Co",
   "location": "Bengaluru", "remote": false, "description": "x"}
]
```

Create `tests/fixtures/ycombinator/missing_location_remote.json`:
```json
[
  {"id": 9, "title": "Senior Engineer", "company_name": "NoLoc Co",
   "remote": true, "url": "https://x/9", "description": "x"}
]
```

Create `tests/fixtures/ycombinator/missing_remote_type_bengaluru.json`:
```json
[
  {"id": 10, "title": "Senior Engineer", "company_name": "NoRemote Co",
   "location": "Bengaluru, India", "url": "https://x/10", "description": "x"}
]
```

Create `tests/fixtures/ycombinator/malformed_date.json`:
```json
[
  {"id": 11, "title": "Senior Engineer", "company_name": "Bad Date Co",
   "location": "Bengaluru", "remote": false, "url": "https://x/11",
   "description": "x", "posted_at": "not-a-date"}
]
```

Create `tests/fixtures/ycombinator/epoch_and_iso.json`:
```json
[
  {"id": 12, "title": "R1", "company_name": "C1", "location": "Bengaluru",
   "remote": false, "url": "https://x/12", "description": "x", "posted_at": 1714700000},
  {"id": 13, "title": "R2", "company_name": "C2", "location": "Bengaluru",
   "remote": false, "url": "https://x/13", "description": "x",
   "posted_at": "2026-05-01T12:00:00Z"}
]
```

Create `tests/fixtures/ycombinator/mixed_batch.json`:
```json
[
  {"id": 20, "title": "Good 1", "company_name": "C1", "location": "Bengaluru", "remote": false, "url": "https://x/20", "description": "x"},
  {"id": 21, "title": "Good 2", "company_name": "C2", "location": "Hyderabad", "remote": false, "url": "https://x/21", "description": "x"},
  {"id": 22, "title": "Good 3", "company_name": "C3", "location": "Mumbai", "remote": false, "url": "https://x/22", "description": "x"},
  {"id": 23, "title": "Good 4", "company_name": "C4", "remote": true, "url": "https://x/23", "description": "x"},
  {"id": 24, "title": "Good 5", "company_name": "C5", "location": "Delhi", "remote": false, "url": "https://x/24", "description": "x"},
  {"id": 25, "title": "Good 6", "company_name": "C6", "location": "Pune", "remote": false, "url": "https://x/25", "description": "x"},
  {"id": 26, "title": "Good 7", "company_name": "C7", "location": "India", "remote": false, "url": "https://x/26", "description": "x"},
  {"id": 27, "company_name": "BadNoTitle", "location": "Bengaluru", "remote": false},
  {"id": 28, "title": "BadNoCompany", "location": "Bengaluru", "remote": false},
  {"id": 29, "title": "BadRejectedLondon", "company_name": "UK Co", "location": "London, UK", "remote": false, "url": "https://x/29", "description": "x"}
]
```

- [ ] **Step 4: Create `app/sources/ycombinator.py`**

```python
"""Y Combinator Work-at-a-Startup public feed.

Endpoint: https://www.ycombinator.com/companies/all/jobs.json (no auth).
Applies an India-first filter at normalize time. Per-field tolerance rules
per spec §8.1 — malformed individual postings never kill the batch.
"""
from __future__ import annotations

import re
from datetime import datetime
from typing import Any

import httpx

from ..models import Job
from ..utils import get_logger, stable_job_id
from .base import Source, http_get_json, strip_html

log = get_logger("sources.ycombinator")

URL = "https://www.ycombinator.com/companies/all/jobs.json"

_INDIA_RE = re.compile(
    r"\b(india|bengaluru|bangalore|hyderabad|mumbai|delhi|noida|gurgaon|pune|remote)\b",
    re.IGNORECASE,
)


def _first_present(d: dict, keys: tuple[str, ...]) -> Any:
    for k in keys:
        v = d.get(k)
        if v is not None:
            return v
    return None


def _parse_posted(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        try:
            return datetime.utcfromtimestamp(int(value)).isoformat() + "Z"
        except (OverflowError, ValueError, OSError):
            return None
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00")).isoformat()
        except ValueError:
            return None
    return None


def _infer_remote_type(item: dict) -> str | None:
    rt = item.get("remote_type")
    if isinstance(rt, str) and rt.strip():
        return rt.strip().lower()
    r = item.get("remote")
    if r is True:
        return "remote"
    return None


def _passes_india_filter(
    location: str | None, remote_type: str | None, company: str, known_companies: list[str]
) -> bool:
    if location and _INDIA_RE.search(location):
        return True
    if remote_type == "remote":
        return True
    if company and company in set(known_companies or []):
        return True
    return False


class YCombinatorSource(Source):
    name = "ycombinator"

    def fetch(self, settings: dict[str, Any]) -> list[Job]:
        if not settings.get("enabled", True):
            return []
        try:
            data = http_get_json(URL)
        except httpx.HTTPError as e:
            log.warning("ycombinator fetch failed: %s", e)
            return []

        postings: list[dict] = data if isinstance(data, list) else data.get("jobs") or []
        known_companies = settings.get("known_companies") or []

        out: list[Job] = []
        for item in postings:
            try:
                job = self._to_job(item, known_companies)
                if job:
                    out.append(job)
            except Exception as e:  # noqa: BLE001
                log.warning("ycombinator: skipped posting id=%s reason=%s", item.get("id"), e)
        log.info("ycombinator collected %d jobs", len(out))
        return out

    def _to_job(self, item: dict, known_companies: list[str]) -> Job | None:
        role = _first_present(item, ("title", "position_title"))
        if not role or not str(role).strip():
            log.warning("ycombinator: missing title in posting id=%s", item.get("id"))
            return None
        role = str(role).strip()

        company_raw = _first_present(item, ("company_name", "startup_name"))
        if isinstance(item.get("company"), dict):
            company_raw = company_raw or item["company"].get("name")
        if isinstance(item.get("startup"), dict):
            company_raw = company_raw or item["startup"].get("name")
        if not company_raw or not str(company_raw).strip():
            log.warning("ycombinator: missing company in posting id=%s", item.get("id"))
            return None
        company = str(company_raw).strip()

        url = _first_present(item, ("url", "apply_url", "job_url"))
        if not url:
            url = f"ycombinator://{company}/{role}"
        else:
            url = str(url).strip()

        location = _first_present(item, ("location", "office_locations", "remote_location"))
        if isinstance(location, list):
            location = ", ".join(str(x) for x in location) if location else None
        elif location is not None:
            location = str(location)

        remote_type = _infer_remote_type(item)

        if not _passes_india_filter(location, remote_type, company, known_companies):
            return None

        posted_date = _parse_posted(
            _first_present(item, ("published_at", "posted_at", "created_at"))
        )

        description = _first_present(item, ("description", "body", "details"))
        description = strip_html(description) if description else ""

        return Job(
            id=stable_job_id(company, role, url),
            role=role,
            company=company,
            url=url,
            source="ycombinator",
            location=location,
            remote_type=remote_type,
            posted_date=posted_date,
            description=description,
            raw=item,
        )
```

- [ ] **Step 5: Register in `app/sources/__init__.py`**

Add import near the top:
```python
from .ycombinator import YCombinatorSource
```

In `fetch_all`, after the `ashby` block and before `lever`, add:
```python
try:
    cfg = dict(sources_cfg.get("ycombinator") or {})
    known = [c.get("name") for c in (companies_cfg.get("companies") or []) if c.get("name")]
    cfg.setdefault("known_companies", known)
    out += YCombinatorSource().fetch(cfg)
except Exception as e:
    log.warning("ycombinator source errored: %s", e)
```

Add `"YCombinatorSource"` to `__all__`.

- [ ] **Step 6: Run tests to verify they pass**

Run: `.venv/bin/pytest tests/test_ycombinator.py -v`
Expected: PASS (13 tests).

Run full suite: `.venv/bin/pytest -q`
Expected: all existing tests still green.

- [ ] **Step 7: Commit**

```bash
git add app/sources/ycombinator.py app/sources/__init__.py tests/test_ycombinator.py tests/fixtures/ycombinator/
git commit -m "feat(sources): add YC Work-at-a-Startup with India filter and field tolerance

- 13 fixture-driven tests cover happy path, remote-only, company-match,
  rejected location, missing title/company/url/location/remote_type,
  malformed date, epoch vs ISO, 10-item mixed batch, HTTP failure
- field-level tolerance per spec §8.1: try multiple source keys, log
  per-posting skips with id for debugging, synthesize url when absent,
  raw payload always preserved on accepted jobs
- India filter: location regex OR remote_type=='remote' OR known company

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Scorer harshening — onsite-USA penalty, remote boost, exclude_locations

**Files:**
- Modify: `app/scoring/rule_scorer.py`
- Modify: `tests/test_rule_scorer.py`

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_rule_scorer.py`:
```python
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/bin/pytest tests/test_rule_scorer.py::test_onsite_usa_penalty tests/test_rule_scorer.py::test_exclude_locations_forces_ignore tests/test_rule_scorer.py::test_remote_boost_bumped_to_10 -v`
Expected: FAIL.

- [ ] **Step 3: Update `app/scoring/rule_scorer.py`**

In `_location_points`, replace the existing function body with:
```python
def _location_points(job: Job, profile: dict, cfg: dict) -> tuple[int, list[str]]:
    preferred = [normalize_text(l) for l in profile.get("preferred_locations", [])]
    remote_prefs = [normalize_text(r) for r in (profile.get("remote_preferences") or [])]
    location_boosts: dict = cfg.get("location_boosts") or {}
    reasons: list[str] = []

    loc = normalize_text(job.location or "")
    remote_type = normalize_text(job.remote_type or "")

    # Harshen onsite non-India roles (spec §8.2)
    onsite_non_india = re.search(
        r"\b(usa|united states|europe|uk|london|germany|canada|australia)\b", loc
    )
    if onsite_non_india and remote_type != "remote":
        reasons.append(f"Onsite non-India location ({loc[:30]}); −15 penalty.")
        return -15, reasons

    # Remote match — bumped to +10 from +8
    if remote_type == "remote" and "remote" in " ".join(remote_prefs):
        reasons.append("Remote role matches preference.")
        return 10, reasons

    for p in preferred:
        if p and p in loc:
            reasons.append(f"Location matches preferred: {p}.")
            return 10, reasons

    for key, bump in location_boosts.items():
        if normalize_text(key) in loc:
            reasons.append(f"Location boost via '{key}' (+{bump}).")
            return int(bump), reasons

    if loc:
        return 2, reasons
    return 0, reasons
```

Add `import re` to the top of `rule_scorer.py` if not already present.

Modify `_hard_negatives` to also consult `profile.exclude_locations`:
```python
def _hard_negatives(job: Job, profile: dict, cfg: dict) -> list[str]:
    haystack = normalize_text(f"{job.role} {job.description or ''}")
    loc_hay = normalize_text(job.location or "")
    hits: list[str] = []
    for n in cfg.get("negative_keywords") or _NEGATIVE_DEFAULT:
        if normalize_text(n) in haystack:
            hits.append(n)
    for n in profile.get("avoid_skills") or []:
        if normalize_text(n) in haystack and n not in hits:
            hits.append(n)
    # Spec §8.2: exclude_locations force-ignore same as negative keywords
    for n in profile.get("exclude_locations") or []:
        if normalize_text(n) in loc_hay or normalize_text(n) in haystack:
            if n not in hits:
                hits.append(n)
    return hits
```

Update the score aggregation in `score_job` so the `-15` from location is allowed to go negative but the total is still clamped to `[0, 100]` (existing clamp is already there; just verify it handles the negative input).

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/bin/pytest tests/test_rule_scorer.py -v`
Expected: PASS (all including the 3 new).

- [ ] **Step 5: Commit**

```bash
git add app/scoring/rule_scorer.py tests/test_rule_scorer.py
git commit -m "feat(scoring): harshen onsite-USA, bump remote boost, add exclude_locations

- Onsite USA/Europe/UK/Germany/Canada/Australia without remote: -15 penalty
- Remote+profile preference bumped 8 -> 10 so Bengaluru/Hyderabad/remote
  roles rank higher over US-remote noise
- profile.exclude_locations force-ignores same as negative keywords

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Resume source module (`app/resume/source.py`)

**Files:**
- Create: `app/resume/source.py`
- Modify: `app/resume/__init__.py` — export `read_resume`, `ResumeBundle`
- Create: `tests/test_resume_source.py`

- [ ] **Step 1: Write the failing tests**

Create `tests/test_resume_source.py`:
```python
from __future__ import annotations

from dataclasses import replace
from pathlib import Path

import pytest

from app.config import Settings
from app.resume.source import ResumeBundle, read_resume


@pytest.fixture
def base_settings(tmp_path: Path) -> Settings:
    # Settings is a frozen dataclass; default values are fine for these tests
    return Settings()


def test_portfolio_md_wins_when_present(tmp_path: Path, monkeypatch) -> None:
    portfolio = tmp_path / "resume.md"
    portfolio.write_text("# Portfolio Resume\n\nfrom portfolio", encoding="utf-8")
    monkeypatch.setenv("RESUME_MD_PATH", str(portfolio))
    bundle = read_resume(Settings())
    assert bundle.source == "portfolio"
    assert "Portfolio Resume" in (bundle.markdown or "")


def test_local_fallback_when_portfolio_missing(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("RESUME_MD_PATH", str(tmp_path / "does-not-exist.md"))
    monkeypatch.chdir(tmp_path)
    (tmp_path / "resumes").mkdir()
    (tmp_path / "resumes" / "master.md").write_text("# Local Resume", encoding="utf-8")
    bundle = read_resume(Settings())
    assert bundle.source == "local"
    assert "Local Resume" in (bundle.markdown or "")


def test_none_source_when_both_missing(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("RESUME_MD_PATH", str(tmp_path / "does-not-exist.md"))
    monkeypatch.chdir(tmp_path)
    bundle = read_resume(Settings())
    assert bundle.source == "none"
    assert bundle.markdown in (None, "")


def test_pdf_and_docx_paths_reflect_existence(tmp_path: Path, monkeypatch) -> None:
    pdf = tmp_path / "resume.pdf"
    pdf.write_bytes(b"%PDF-1.4\n")
    monkeypatch.setenv("RESUME_PDF_PATH", str(pdf))
    monkeypatch.setenv("RESUME_DOCX_PATH", str(tmp_path / "nope.docx"))
    bundle = read_resume(Settings())
    assert bundle.pdf_path == pdf
    assert bundle.docx_path is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/bin/pytest tests/test_resume_source.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.resume.source'`.

- [ ] **Step 3: Create `app/resume/source.py`**

```python
"""Resolve the active resume markdown + PDF/DOCX paths.

Read order for the markdown:
  1. Settings.resume_md_path if the file exists  → source="portfolio"
  2. resumes/master.md in the current working dir → source="local"
  3. return empty string                          → source="none"

PDF/DOCX paths are returned only if the file actually exists; UI decides
whether to render "Download" links."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Literal, Optional

from ..config import Settings


@dataclass
class ResumeBundle:
    markdown: Optional[str]
    pdf_path: Optional[Path]
    docx_path: Optional[Path]
    source: Literal["portfolio", "local", "none"]


def read_resume(settings: Settings) -> ResumeBundle:
    import os

    md_env = os.environ.get("RESUME_MD_PATH") or getattr(settings, "resume_md_path", "")
    pdf_env = os.environ.get("RESUME_PDF_PATH") or getattr(settings, "resume_pdf_path", "")
    docx_env = os.environ.get("RESUME_DOCX_PATH") or getattr(settings, "resume_docx_path", "")

    portfolio_md = Path(md_env) if md_env else None
    if portfolio_md and portfolio_md.is_file():
        return ResumeBundle(
            markdown=portfolio_md.read_text(encoding="utf-8"),
            pdf_path=_path_if_exists(pdf_env),
            docx_path=_path_if_exists(docx_env),
            source="portfolio",
        )

    local = Path("resumes/master.md")
    if local.is_file():
        return ResumeBundle(
            markdown=local.read_text(encoding="utf-8"),
            pdf_path=_path_if_exists(pdf_env),
            docx_path=_path_if_exists(docx_env),
            source="local",
        )

    return ResumeBundle(markdown=None, pdf_path=None, docx_path=None, source="none")


def _path_if_exists(raw: str) -> Optional[Path]:
    if not raw:
        return None
    p = Path(raw)
    return p if p.is_file() else None
```

- [ ] **Step 4: Update `app/resume/__init__.py`**

Replace with:
```python
"""Resume tailoring + source resolution."""
from __future__ import annotations

from .source import ResumeBundle, read_resume
from .tailor import tailor

__all__ = ["tailor", "read_resume", "ResumeBundle"]
```

- [ ] **Step 5: Extend `Settings` in `app/config.py` to include resume paths**

In `app/config.py`, add fields to the `Settings` dataclass near the other env-derived ones:
```python
    resume_md_path: str = field(default_factory=lambda: _env("RESUME_MD_PATH"))
    resume_pdf_path: str = field(default_factory=lambda: _env("RESUME_PDF_PATH"))
    resume_docx_path: str = field(default_factory=lambda: _env("RESUME_DOCX_PATH"))
```

Append to `.env.example`:
```
# ─── Resume source (absolute host paths; portfolio sister repo) ────────────
RESUME_MD_PATH=
RESUME_PDF_PATH=
RESUME_DOCX_PATH=
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `.venv/bin/pytest tests/test_resume_source.py -v`
Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
git add app/resume/source.py app/resume/__init__.py app/config.py .env.example tests/test_resume_source.py
git commit -m "feat(resume): read from portfolio path with local fallback

ResumeBundle dataclass carries {markdown, pdf_path, docx_path, source}.
Source precedence: portfolio (RESUME_MD_PATH) > local resumes/master.md > none.
PDF/DOCX paths returned only when files exist. Env vars let the Docker
bind-mount map host paths to in-container /portfolio/pdfs/*.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase B — FastAPI surface

### Task 7: Install FastAPI deps and create app factory

**Files:**
- Modify: `requirements.txt` — add fastapi, uvicorn, python-multipart, httpx (already present)
- Create: `app/api/__init__.py`
- Create: `app/api/main.py`
- Create: `app/api/deps.py`
- Create: `app/api/errors.py`

- [ ] **Step 1: Update `requirements.txt`**

Replace file with:
```
pydantic>=2.6,<3
httpx>=0.27,<1
python-dotenv>=1.0,<2
typer>=0.12,<1
pyyaml>=6.0,<7
notion-client>=2.2,<3
fastapi>=0.110,<1
uvicorn[standard]>=0.27,<1
python-multipart>=0.0.9,<1
pytest>=8.0,<9
ruff>=0.5,<1
```

Note: `streamlit` removed (deletion happens in Task 29).

- [ ] **Step 2: Install deps**

Run: `.venv/bin/pip install -r requirements.txt`
Expected: installs fastapi + uvicorn + python-multipart; uninstalls streamlit later in Task 29.

- [ ] **Step 3: Create `app/api/deps.py`**

```python
"""FastAPI dependency-injection helpers — load settings/store once per request."""
from __future__ import annotations

from functools import lru_cache

from ..config import Settings, load_settings
from ..config_repo import ConfigRepository, build_config_repository
from ..storage import SQLiteStore, build_store
from ..storage.config_store import ConfigStore


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return load_settings()


def get_store() -> SQLiteStore:
    return build_store(get_settings())


def get_config_store() -> ConfigStore:
    s = get_settings()
    cs = ConfigStore(s.sqlite_db_path)
    cs.init_schema()
    return cs


def get_config_repo() -> ConfigRepository:
    return build_config_repository(get_settings())
```

- [ ] **Step 4: Create `app/api/errors.py`**

```python
"""Uniform error envelope {error: {code, message, details}}."""
from __future__ import annotations

from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException


def _envelope(code: str, message: str, details: Any = None, status: int = 400) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content={"error": {"code": code, "message": message, "details": details or {}}},
    )


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError):
        return _envelope("validation", "request validation failed", exc.errors(), status=422)

    @app.exception_handler(HTTPException)
    async def _http(_: Request, exc: HTTPException):
        return _envelope(
            exc.headers.get("X-Error-Code", "http_error") if exc.headers else "http_error",
            str(exc.detail),
            None,
            status=exc.status_code,
        )

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, exc: Exception):
        return _envelope("internal", "unexpected server error", {"type": type(exc).__name__}, status=500)
```

- [ ] **Step 5: Create `app/api/__init__.py` with app factory**

```python
"""FastAPI app factory.

Routes are registered by including each router module. No business logic lives here."""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .errors import install_error_handlers


def create_app() -> FastAPI:
    app = FastAPI(
        title="job-finder API",
        version="2.0",
        docs_url="/docs",
        redoc_url=None,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:47130"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    install_error_handlers(app)

    # Route registration happens here once the router modules exist (Tasks 8–13).
    from .routes import system  # noqa: WPS433 (late import, avoids circular deps)
    app.include_router(system.router, prefix="/api")
    return app


app = create_app()
```

- [ ] **Step 6: Create `app/api/main.py` as the uvicorn entrypoint**

```python
"""uvicorn entrypoint: `python -m app.api.main`."""
from __future__ import annotations

import uvicorn


def main() -> None:
    uvicorn.run("app.api:app", host="0.0.0.0", port=47131, reload=False, log_level="info")


if __name__ == "__main__":
    main()
```

- [ ] **Step 7: Commit**

```bash
git add requirements.txt app/api/__init__.py app/api/main.py app/api/deps.py app/api/errors.py
git commit -m "feat(api): scaffold FastAPI app factory with uniform error envelope

- requirements: add fastapi, uvicorn[standard], python-multipart
- deps.py provides cached Settings + per-request store/config_store/repo
- errors.py installs handlers that wrap every failure in {error: {code, message, details}}
- main.py: python -m app.api.main → serves on 0.0.0.0:47131

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: System routes — `/api/health` and `/api/capabilities`

**Files:**
- Create: `app/api/routes/__init__.py` (empty)
- Create: `app/api/routes/system.py`
- Create: `app/api/schemas.py`
- Create: `tests/api/__init__.py` (empty)
- Create: `tests/api/conftest.py` — shared `TestClient` fixture
- Create: `tests/api/test_system.py`

- [ ] **Step 1: Write the failing tests**

Create `tests/api/conftest.py`:
```python
from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(tmp_path: Path, monkeypatch) -> TestClient:
    # Point settings at an isolated DB for each test session
    monkeypatch.setenv("SQLITE_DB_PATH", str(tmp_path / "t.db"))
    monkeypatch.setenv("CONFIG_DIR", str(tmp_path / "config"))
    monkeypatch.setenv("RESUME_DIR", str(tmp_path / "resumes"))
    # Bust the lru_cache on Settings
    from app.api.deps import get_settings
    get_settings.cache_clear()
    from app.api import create_app
    return TestClient(create_app())
```

Create `tests/api/test_system.py`:
```python
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/bin/pytest tests/api/test_system.py -v`
Expected: FAIL — 404 on both routes.

- [ ] **Step 3: Create `app/api/schemas.py`**

```python
"""Pydantic request/response schemas for the API.

Kept in one file so `openapi-typescript` can emit a clean TS type bundle."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from ..models import ApplicationStatus, Priority


# ── system ─────────────────────────────────────────────────────────────
class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"
    llm_enabled: bool
    notion_enabled: bool
    outlook_enabled: bool
    gmail_enabled: bool


class CapabilitiesResponse(BaseModel):
    llm_enabled: bool
    llm_provider: str = ""
    notion_enabled: bool
    outlook_enabled: bool
    gmail_enabled: bool
    resume_source: Literal["portfolio", "local", "none"]


# ── jobs ───────────────────────────────────────────────────────────────
class JobOut(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    role: str
    company: str
    url: str
    source: str
    location: Optional[str] = None
    remote_type: Optional[str] = None
    posted_date: Optional[str] = None
    description: Optional[str] = None
    notes: Optional[str] = None


class ScoredJobOut(BaseModel):
    job: JobOut
    fit_score: int
    priority: Priority
    level_match: str = ""
    matched_skills: list[str] = Field(default_factory=list)
    missing_skills: list[str] = Field(default_factory=list)
    reasons: list[str] = Field(default_factory=list)
    risks: list[str] = Field(default_factory=list)
    recommended_resume_variant: Optional[str] = None
    next_action: str = ""


class ApplicationOut(BaseModel):
    status: ApplicationStatus = ApplicationStatus.FOUND
    notes: Optional[str] = None
    next_interview_at: Optional[str] = None
    interview_notes: Optional[str] = None
    applied_at: Optional[str] = None
    rejected_at: Optional[str] = None
    updated_at: Optional[str] = None


class JobDetailOut(BaseModel):
    job: JobOut
    scored: Optional[ScoredJobOut] = None
    application: Optional[ApplicationOut] = None


class StatusPatch(BaseModel):
    status: ApplicationStatus
    notes: Optional[str] = None
    next_interview_at: Optional[str] = None
    interview_notes: Optional[str] = None


class ManualJobIn(BaseModel):
    role: str = Field(min_length=1)
    company: str = Field(min_length=1)
    url: str = Field(min_length=1)
    location: Optional[str] = None
    description: Optional[str] = None
    notes: Optional[str] = None


class TailorOut(BaseModel):
    mode: Literal["deterministic", "llm"]
    ai_pending: bool
    markdown: str


# ── search ─────────────────────────────────────────────────────────────
class SearchRequest(BaseModel):
    location: Optional[str] = None
    keyword: Optional[str] = None
    sources: Optional[list[str]] = None
    use_llm: bool = True


class SourceStat(BaseModel):
    fetched: int = 0
    kept: int = 0
    duration_ms: int = 0
    error: Optional[str] = None


class SearchResponse(BaseModel):
    jobs: list[ScoredJobOut]
    source_stats: dict[str, SourceStat]
    ran_at: str
    duration_ms: int


# ── dashboard ──────────────────────────────────────────────────────────
class UpcomingInterview(BaseModel):
    job_id: str
    role: str
    company: str
    next_interview_at: str


class DashboardResponse(BaseModel):
    counts_by_priority: dict[str, int]
    total_jobs: int
    last_run_at: Optional[str] = None
    upcoming_interviews: list[UpcomingInterview]
    shortlist_top: list[ScoredJobOut]
    latest_source_stats: dict[str, SourceStat] = Field(default_factory=dict)


# ── resume ─────────────────────────────────────────────────────────────
class ResumeResponse(BaseModel):
    md_source: Literal["portfolio", "local", "none"]
    markdown: str = ""
    has_pdf: bool = False
    has_docx: bool = False


class ResumeIn(BaseModel):
    markdown: str


# ── settings ───────────────────────────────────────────────────────────
class ProfileIn(BaseModel):
    model_config = ConfigDict(extra="allow")
    name: Optional[str] = None
    years_of_experience: Optional[int] = None


class CompanyIn(BaseModel):
    model_config = ConfigDict(extra="allow")
    name: str = Field(min_length=1)
    careers_url: Optional[str] = None
    ats_type: str = "unknown"
    board_token: Optional[str] = None
    org_slug: Optional[str] = None
    company_slug: Optional[str] = None
    preferred_locations: list[str] = Field(default_factory=list)
    priority: str = "P2"
    notes: Optional[str] = None
    enabled: bool = True


class CompanyPatch(BaseModel):
    model_config = ConfigDict(extra="allow")
    name: Optional[str] = None
    careers_url: Optional[str] = None
    ats_type: Optional[str] = None
    board_token: Optional[str] = None
    org_slug: Optional[str] = None
    company_slug: Optional[str] = None
    preferred_locations: Optional[list[str]] = None
    priority: Optional[str] = None
    notes: Optional[str] = None
    enabled: Optional[bool] = None


class ScoringIn(BaseModel):
    model_config = ConfigDict(extra="allow")
    thresholds: dict[str, int] = Field(default_factory=dict)
    positive_keywords: list[str] = Field(default_factory=list)
    negative_keywords: list[str] = Field(default_factory=list)
    location_boosts: dict[str, int] = Field(default_factory=dict)
    domain_boosts: dict[str, int] = Field(default_factory=dict)
    company_boosts: dict[str, int] = Field(default_factory=dict)
    source_quality_boosts: dict[str, int] = Field(default_factory=dict)
    resume_variant_rules: list[dict[str, Any]] = Field(default_factory=list)


class SourcesIn(BaseModel):
    model_config = ConfigDict(extra="allow")
    # Each key is a source name → its options dict (with {"enabled": bool} key present).
    # Pydantic would over-constrain; keep permissive.


class ImportYamlResponse(BaseModel):
    imported: dict[str, int]  # filename → rows-imported count
    imported_at: str


# Silence unused import warnings
_ = datetime
```

- [ ] **Step 4: Create `app/api/routes/__init__.py`** (empty file)

- [ ] **Step 5: Create `app/api/routes/system.py`**

```python
from __future__ import annotations

from fastapi import APIRouter, Depends

from ...config import Settings
from ...resume.source import read_resume
from ..deps import get_settings
from ..schemas import CapabilitiesResponse, HealthResponse

router = APIRouter(tags=["system"])


@router.get("/health", response_model=HealthResponse)
def health(settings: Settings = Depends(get_settings)) -> HealthResponse:
    return HealthResponse(
        llm_enabled=settings.llm_enabled,
        notion_enabled=settings.notion_enabled,
        outlook_enabled=settings.outlook_enabled,
        gmail_enabled=settings.gmail_enabled,
    )


@router.get("/capabilities", response_model=CapabilitiesResponse)
def capabilities(settings: Settings = Depends(get_settings)) -> CapabilitiesResponse:
    bundle = read_resume(settings)
    return CapabilitiesResponse(
        llm_enabled=settings.llm_enabled,
        llm_provider=settings.llm_provider,
        notion_enabled=settings.notion_enabled,
        outlook_enabled=settings.outlook_enabled,
        gmail_enabled=settings.gmail_enabled,
        resume_source=bundle.source,
    )
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `.venv/bin/pytest tests/api/test_system.py -v`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add app/api/schemas.py app/api/routes/ tests/api/
git commit -m "feat(api): add /api/health and /api/capabilities + schemas module

Schemas cover every v2 endpoint in one file so openapi-typescript emits
a clean TS type bundle. System routes report integration + resume-source
capability so the UI can render 'AI integration pending' badges.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Jobs routes — list, detail, status patch

**Files:**
- Create: `app/api/routes/jobs.py`
- Modify: `app/api/__init__.py` — register router
- Modify: `app/storage/sqlite_store.py` — add `list_jobs_with_filters`, `get_application`, richer `set_application_status`
- Create: `tests/api/test_jobs.py`

- [ ] **Step 1: Write the failing tests**

Create `tests/api/test_jobs.py`:
```python
from __future__ import annotations

from fastapi.testclient import TestClient

from app.models import ApplicationStatus, Job, Priority, ScoredJob
from app.storage.sqlite_store import SQLiteStore
from app.utils import stable_job_id


def _seed(store: SQLiteStore) -> list[str]:
    j1 = Job(id=stable_job_id("Acme", "Senior Backend", "https://x/1"),
             role="Senior Backend", company="Acme", url="https://x/1",
             source="manual", description="Python FastAPI")
    j2 = Job(id=stable_job_id("Beta", "SDE2", "https://x/2"),
             role="SDE2", company="Beta", url="https://x/2",
             source="manual", description="Java")
    store.upsert_jobs([j1, j2])
    store.upsert_scored_jobs([
        ScoredJob(job=j1, fit_score=85, priority=Priority.P0, level_match="SDE2",
                  next_action="Apply today"),
        ScoredJob(job=j2, fit_score=72, priority=Priority.P1, level_match="Senior",
                  next_action="Tailor and apply"),
    ])
    return [j1.id, j2.id]


def test_list_jobs_returns_all(client: TestClient) -> None:
    from app.api.deps import get_store
    ids = _seed(get_store())
    r = client.get("/api/jobs")
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 2
    assert {b["job"]["id"] for b in body} == set(ids)


def test_list_jobs_filter_by_priority(client: TestClient) -> None:
    from app.api.deps import get_store
    _seed(get_store())
    r = client.get("/api/jobs", params={"priority": "P0"})
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 1
    assert body[0]["priority"] == "P0"


def test_list_jobs_free_text_search(client: TestClient) -> None:
    from app.api.deps import get_store
    _seed(get_store())
    r = client.get("/api/jobs", params={"q": "java"})
    assert r.status_code == 200
    assert len(r.json()) == 1


def test_get_job_detail(client: TestClient) -> None:
    from app.api.deps import get_store
    ids = _seed(get_store())
    r = client.get(f"/api/jobs/{ids[0]}")
    assert r.status_code == 200
    body = r.json()
    assert body["job"]["id"] == ids[0]
    assert body["scored"]["priority"] == "P0"


def test_patch_status_sets_interview(client: TestClient) -> None:
    from app.api.deps import get_store
    ids = _seed(get_store())
    r = client.patch(f"/api/jobs/{ids[0]}/status", json={
        "status": "Interviewing",
        "next_interview_at": "2026-05-10T15:00:00Z",
        "interview_notes": "With Rajesh",
    })
    assert r.status_code == 200

    r2 = client.get(f"/api/jobs/{ids[0]}")
    app = r2.json()["application"]
    assert app["status"] == "Interviewing"
    assert app["next_interview_at"].startswith("2026-05-10")


def test_patch_status_records_applied_at(client: TestClient) -> None:
    from app.api.deps import get_store
    ids = _seed(get_store())
    client.patch(f"/api/jobs/{ids[0]}/status", json={"status": "Applied"})
    r = client.get(f"/api/jobs/{ids[0]}")
    assert r.json()["application"]["applied_at"] is not None


def test_interview_sort_pins_to_top(client: TestClient) -> None:
    from app.api.deps import get_store
    ids = _seed(get_store())
    # Raise j2 (P1) to Interviewing — it should now come before j1 (P0, Found).
    client.patch(f"/api/jobs/{ids[1]}/status", json={
        "status": "Interviewing",
        "next_interview_at": "2026-05-06T10:00:00Z",
    })
    r = client.get("/api/jobs")
    body = r.json()
    assert body[0]["job"]["id"] == ids[1]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/bin/pytest tests/api/test_jobs.py -v`
Expected: FAIL — 404 on routes.

- [ ] **Step 3: Extend `SQLiteStore` with richer query + setter methods**

In `app/storage/sqlite_store.py`, add:
```python
    def list_scored_with_filters(
        self,
        *,
        priorities: list[str] | None = None,
        statuses: list[str] | None = None,
        company: str | None = None,
        source: str | None = None,
        remote_type: str | None = None,
        location_contains: str | None = None,
        q: str | None = None,
        sort: str = "status_rank",
        limit: int = 500,
        offset: int = 0,
    ) -> list[tuple["ScoredJob", dict | None]]:
        from .sqlite_store import STATUS_RANK, _status_rank_case_sql  # self-import ok

        status_case = _status_rank_case_sql()
        sql = f"""
        SELECT j.*,
               s.fit_score, s.priority, s.level_match,
               s.matched_skills_json, s.missing_skills_json, s.reasons_json, s.risks_json,
               s.recommended_resume_variant, s.next_action,
               a.status AS app_status, a.notes AS app_notes,
               a.next_interview_at, a.interview_notes,
               a.applied_at, a.rejected_at, a.updated_at AS app_updated_at,
               ({status_case}) AS status_rank
        FROM scored_jobs s
        JOIN jobs j ON j.id = s.job_id
        LEFT JOIN applications a ON a.job_id = s.job_id
        WHERE 1=1
        """
        params: list = []
        if priorities:
            sql += f" AND s.priority IN ({','.join(['?'] * len(priorities))})"
            params += priorities
        if statuses:
            sql += f" AND COALESCE(a.status, 'Found') IN ({','.join(['?'] * len(statuses))})"
            params += statuses
        if company:
            sql += " AND LOWER(j.company) LIKE ?"
            params.append(f"%{company.lower()}%")
        if source:
            sql += " AND j.source = ?"
            params.append(source)
        if remote_type:
            sql += " AND j.remote_type = ?"
            params.append(remote_type)
        if location_contains:
            sql += " AND LOWER(j.location) LIKE ?"
            params.append(f"%{location_contains.lower()}%")
        if q:
            sql += " AND (LOWER(j.role) LIKE ? OR LOWER(j.company) LIKE ? OR LOWER(j.description) LIKE ?)"
            needle = f"%{q.lower()}%"
            params += [needle, needle, needle]

        if sort == "fit":
            sql += " ORDER BY s.fit_score DESC, j.found_at DESC"
        elif sort == "found_at":
            sql += " ORDER BY j.found_at DESC"
        else:
            sql += " ORDER BY status_rank ASC, a.next_interview_at ASC NULLS LAST, s.fit_score DESC, j.found_at DESC"
        sql += " LIMIT ? OFFSET ?"
        params += [limit, offset]

        with self._conn() as c:
            rows = c.execute(sql, params).fetchall()

        out: list[tuple[ScoredJob, dict | None]] = []
        for r in rows:
            scored = _row_to_scored(r)
            app = None
            if r["app_status"]:
                app = {
                    "status": r["app_status"],
                    "notes": r["app_notes"],
                    "next_interview_at": r["next_interview_at"],
                    "interview_notes": r["interview_notes"],
                    "applied_at": r["applied_at"],
                    "rejected_at": r["rejected_at"],
                    "updated_at": r["app_updated_at"],
                }
            out.append((scored, app))
        return out

    def get_application(self, job_id: str) -> dict | None:
        with self._conn() as c:
            row = c.execute("SELECT * FROM applications WHERE job_id = ?", (job_id,)).fetchone()
        return dict(row) if row else None

    def set_application_status_rich(
        self,
        job_id: str,
        status: "ApplicationStatus",
        *,
        notes: str | None = None,
        next_interview_at: str | None = None,
        interview_notes: str | None = None,
    ) -> None:
        now = utcnow_iso()
        status_str = str(status)
        applied_at = now if status_str == "Applied" else None
        rejected_at = now if status_str == "Rejected" else None

        sql = """
        INSERT INTO applications
            (job_id, status, notes, next_interview_at, interview_notes,
             applied_at, rejected_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(job_id) DO UPDATE SET
            status             = excluded.status,
            notes              = COALESCE(excluded.notes, applications.notes),
            next_interview_at  = COALESCE(excluded.next_interview_at, applications.next_interview_at),
            interview_notes    = COALESCE(excluded.interview_notes, applications.interview_notes),
            applied_at         = COALESCE(excluded.applied_at, applications.applied_at),
            rejected_at        = COALESCE(excluded.rejected_at, applications.rejected_at),
            updated_at         = excluded.updated_at;
        """
        with self._conn() as c:
            c.execute(sql, (job_id, status_str, notes, next_interview_at,
                            interview_notes, applied_at, rejected_at, now))
```

- [ ] **Step 4: Create `app/api/routes/jobs.py`**

```python
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from ...models import ApplicationStatus
from ...storage.sqlite_store import SQLiteStore
from ..deps import get_store
from ..schemas import ApplicationOut, JobDetailOut, JobOut, ScoredJobOut, StatusPatch

router = APIRouter(tags=["jobs"])


def _to_scored_out(scored, app) -> ScoredJobOut:
    return ScoredJobOut(
        job=JobOut.model_validate(scored.job.model_dump()),
        fit_score=scored.fit_score,
        priority=scored.priority,
        level_match=scored.level_match,
        matched_skills=scored.matched_skills,
        missing_skills=scored.missing_skills,
        reasons=scored.reasons,
        risks=scored.risks,
        recommended_resume_variant=scored.recommended_resume_variant,
        next_action=scored.next_action,
    )


@router.get("/jobs", response_model=list[ScoredJobOut])
def list_jobs(
    priority: Optional[list[str]] = Query(default=None),
    status: Optional[list[str]] = Query(default=None),
    company: Optional[str] = None,
    source: Optional[str] = None,
    remote_type: Optional[str] = None,
    location_contains: Optional[str] = None,
    q: Optional[str] = None,
    sort: str = "status_rank",
    limit: int = 500,
    offset: int = 0,
    store: SQLiteStore = Depends(get_store),
):
    rows = store.list_scored_with_filters(
        priorities=priority, statuses=status, company=company, source=source,
        remote_type=remote_type, location_contains=location_contains,
        q=q, sort=sort, limit=limit, offset=offset,
    )
    return [_to_scored_out(s, a) for s, a in rows]


@router.get("/jobs/{job_id}", response_model=JobDetailOut)
def get_job(job_id: str, store: SQLiteStore = Depends(get_store)) -> JobDetailOut:
    job = store.get_job(job_id)
    if not job:
        raise HTTPException(404, detail=f"job {job_id} not found")
    scored_rows = store.list_scored_with_filters(q=None, limit=1, offset=0)
    scored_match = next((s for s, _ in scored_rows if s.job.id == job_id), None)
    app_row = store.get_application(job_id)

    scored_out = _to_scored_out(scored_match, app_row) if scored_match else None
    app_out = ApplicationOut(**{k: v for k, v in (app_row or {}).items() if k != "job_id"}) if app_row else None
    return JobDetailOut(
        job=JobOut.model_validate(job.model_dump()),
        scored=scored_out,
        application=app_out,
    )


@router.patch("/jobs/{job_id}/status", response_model=ApplicationOut)
def patch_status(job_id: str, body: StatusPatch, store: SQLiteStore = Depends(get_store)) -> ApplicationOut:
    if not store.get_job(job_id):
        raise HTTPException(404, detail=f"job {job_id} not found")
    store.set_application_status_rich(
        job_id,
        ApplicationStatus(body.status),
        notes=body.notes,
        next_interview_at=body.next_interview_at,
        interview_notes=body.interview_notes,
    )
    app = store.get_application(job_id) or {}
    return ApplicationOut(**{k: v for k, v in app.items() if k != "job_id"})
```

- [ ] **Step 5: Register router in `app/api/__init__.py`**

Replace the route registration block with:
```python
    from .routes import system, jobs  # noqa: WPS433
    app.include_router(system.router, prefix="/api")
    app.include_router(jobs.router, prefix="/api")
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `.venv/bin/pytest tests/api/test_jobs.py -v`
Expected: PASS (7 tests).

- [ ] **Step 7: Commit**

```bash
git add app/api/routes/jobs.py app/api/__init__.py app/storage/sqlite_store.py tests/api/test_jobs.py
git commit -m "feat(api): /api/jobs list + detail + status patch with interview scheduling

- list_scored_with_filters uses status_rank CASE for default sort so
  Interviewing always pins to the top
- status patch auto-stamps applied_at / rejected_at based on transition
- LEFT JOIN applications surfaces the rich application row in /api/jobs
  and /api/jobs/{id} without N+1

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Manual job + tailor routes

**Files:**
- Modify: `app/api/routes/jobs.py` — add `POST /api/jobs/manual` and `POST /api/jobs/{id}/tailor`
- Modify: `tests/api/test_jobs.py` — add cases

- [ ] **Step 1: Write the failing tests**

Append to `tests/api/test_jobs.py`:
```python
def test_post_manual_job(client: TestClient) -> None:
    r = client.post("/api/jobs/manual", json={
        "role": "Senior Backend Engineer",
        "company": "Acme",
        "url": "https://acme.example.com/jobs/1",
        "notes": "referred by @sathwick",
    })
    assert r.status_code == 200
    body = r.json()
    assert body["job"]["company"] == "Acme"
    assert body["scored"]["fit_score"] >= 0


def test_tailor_returns_deterministic_when_no_llm(client: TestClient) -> None:
    from app.api.deps import get_store
    ids = _seed(get_store())
    r = client.post(f"/api/jobs/{ids[0]}/tailor")
    assert r.status_code == 200
    body = r.json()
    assert body["mode"] == "deterministic"
    assert body["ai_pending"] is True
    assert "# Tailor Sheet" in body["markdown"]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/bin/pytest tests/api/test_jobs.py::test_post_manual_job tests/api/test_jobs.py::test_tailor_returns_deterministic_when_no_llm -v`
Expected: FAIL.

- [ ] **Step 3: Add the two routes to `app/api/routes/jobs.py`**

Append to the file (and add the necessary imports at the top):
```python
from ...config import Settings
from ...config_repo import (
    COMPANIES_YAML,
    PROFILE_YAML,
    SCORING_YAML,
    ConfigRepository,
)
from ...dedupe import dedupe_jobs
from ...models import Job
from ...resume.source import read_resume
from ...resume.tailor import tailor as run_tailor
from ...scoring.rule_scorer import score_job
from ...utils import stable_job_id
from ..deps import get_config_repo, get_settings
from ..schemas import JobDetailOut, ManualJobIn, TailorOut


@router.post("/jobs/manual", response_model=JobDetailOut)
def add_manual_job(
    body: ManualJobIn,
    store: SQLiteStore = Depends(get_store),
    repo: ConfigRepository = Depends(get_config_repo),
) -> JobDetailOut:
    job = Job(
        id=stable_job_id(body.company, body.role, body.url),
        role=body.role, company=body.company, url=body.url, source="manual",
        location=body.location, description=body.description, notes=body.notes,
    )
    store.upsert_jobs(dedupe_jobs([job]))

    profile = repo.load_yaml(PROFILE_YAML)
    scoring = repo.load_yaml(SCORING_YAML)
    companies = repo.load_yaml(COMPANIES_YAML)
    scored = score_job(job, profile, scoring, companies)
    store.upsert_scored_jobs([scored])

    return JobDetailOut(
        job=JobOut.model_validate(job.model_dump()),
        scored=_to_scored_out(scored, None),
        application=None,
    )


@router.post("/jobs/{job_id}/tailor", response_model=TailorOut)
def tailor_job(
    job_id: str,
    store: SQLiteStore = Depends(get_store),
    repo: ConfigRepository = Depends(get_config_repo),
    settings: Settings = Depends(get_settings),
) -> TailorOut:
    if not store.get_job(job_id):
        raise HTTPException(404, detail=f"job {job_id} not found")

    scored_rows = store.list_scored_with_filters(q=None, limit=1000, offset=0)
    scored_match = next((s for s, _ in scored_rows if s.job.id == job_id), None)
    if not scored_match:
        raise HTTPException(404, detail=f"job {job_id} not scored yet")

    bundle = read_resume(settings)
    profile = repo.load_yaml(PROFILE_YAML)
    markdown = run_tailor(
        resume_text=(bundle.markdown or ""),
        scored=scored_match,
        profile=profile,
        settings=settings,
    )
    ai_pending = not settings.llm_enabled
    mode = "llm" if settings.llm_enabled and "deterministic stub" not in markdown.lower() else "deterministic"
    return TailorOut(mode=mode, ai_pending=ai_pending, markdown=markdown)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/bin/pytest tests/api/test_jobs.py -v`
Expected: all 9 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/routes/jobs.py tests/api/test_jobs.py
git commit -m "feat(api): add POST /jobs/manual and POST /jobs/{id}/tailor

- manual path: stable_job_id from (company, role, url), scored inline, returns full detail
- tailor: returns {mode, ai_pending, markdown}. ai_pending=True when no LLM
  key so the UI renders the 'AI integration pending' banner explicitly.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Search route with per-source stats

**Files:**
- Create: `app/api/routes/search.py`
- Modify: `app/api/__init__.py` — register router
- Modify: `app/sources/__init__.py` — add `fetch_all_with_stats` variant
- Create: `tests/api/test_search.py`

- [ ] **Step 1: Write the failing tests**

Create `tests/api/test_search.py`:
```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/pytest tests/api/test_search.py -v`
Expected: FAIL — 404.

- [ ] **Step 3: Create `app/api/routes/search.py`**

```python
from __future__ import annotations

import time
from typing import Any

from fastapi import APIRouter, Depends

from ...config import Settings
from ...config_repo import (
    COMPANIES_YAML,
    PROFILE_YAML,
    SCORING_YAML,
    SOURCES_YAML,
    ConfigRepository,
)
from ...dedupe import dedupe_jobs
from ...scoring import refine_all, score_all
from ...sources import fetch_all_with_stats
from ...storage.config_store import ConfigStore
from ...storage.sqlite_store import SQLiteStore
from ...utils import utcnow_iso
from ..deps import get_config_repo, get_config_store, get_settings, get_store
from ..schemas import SearchRequest, SearchResponse, SourceStat
from .jobs import _to_scored_out

router = APIRouter(tags=["search"])


def _fetch_with_stats(repo, sources_cfg, companies_cfg):
    """Extracted so tests can monkeypatch it."""
    return fetch_all_with_stats(repo, sources_cfg, companies_cfg)


@router.post("/search", response_model=SearchResponse)
def search(
    body: SearchRequest,
    store: SQLiteStore = Depends(get_store),
    cstore: ConfigStore = Depends(get_config_store),
    repo: ConfigRepository = Depends(get_config_repo),
    settings: Settings = Depends(get_settings),
) -> SearchResponse:
    started = time.monotonic()
    sources_cfg: dict[str, Any] = repo.load_yaml(SOURCES_YAML)
    companies_cfg = repo.load_yaml(COMPANIES_YAML)
    profile = repo.load_yaml(PROFILE_YAML)
    scoring_cfg = repo.load_yaml(SCORING_YAML)

    if body.sources:
        sources_cfg = {k: v for k, v in sources_cfg.items() if k in set(body.sources)}

    jobs, stats = _fetch_with_stats(repo, sources_cfg, companies_cfg)
    unique = dedupe_jobs(jobs)
    store.upsert_jobs(unique)

    scored = score_all(unique, profile, scoring_cfg, companies_cfg)
    if body.use_llm and settings.llm_enabled:
        scored = refine_all(scored, profile, scoring_cfg, settings, max_refine=20)
    store.upsert_scored_jobs(scored)

    for source, stat in stats.items():
        cstore.append_search_stat(
            source=source, fetched=stat["fetched"], kept=stat["kept"],
            duration_ms=stat["duration_ms"], error=stat.get("error"),
        )

    store.mark_run()

    rows = store.list_scored_with_filters(sort="status_rank", limit=1000, offset=0)
    return SearchResponse(
        jobs=[_to_scored_out(s, a) for s, a in rows],
        source_stats={k: SourceStat(**v) for k, v in stats.items()},
        ran_at=utcnow_iso(),
        duration_ms=int((time.monotonic() - started) * 1000),
    )
```

- [ ] **Step 4: Add `fetch_all_with_stats` to `app/sources/__init__.py`**

Append below the existing `fetch_all`:
```python
import time as _time


def fetch_all_with_stats(
    repo: ConfigRepository,
    sources_cfg: dict[str, Any],
    companies_cfg: dict[str, Any],
) -> tuple[list[Job], dict[str, dict]]:
    """Like fetch_all but returns per-source {fetched, kept, duration_ms, error}.

    `fetched` here equals the count kept by the source normalizer (our sources
    don't expose raw counts separately). This is an acceptable approximation
    for v2 surface — we surface errors and latency, which is what matters."""
    stats: dict[str, dict] = {}
    all_jobs: list[Job] = []

    def _run(name: str, fn):
        t0 = _time.monotonic()
        kept = 0
        error: str | None = None
        try:
            res = fn()
            kept = len(res)
            all_jobs.extend(res)
        except Exception as e:  # noqa: BLE001
            error = str(e)
        stats[name] = {
            "fetched": kept,
            "kept": kept,
            "duration_ms": int((_time.monotonic() - t0) * 1000),
            "error": error,
        }

    _run("manual", lambda: ManualSource(repo).fetch(sources_cfg.get("manual") or {}))
    _run("remotive", lambda: RemotiveSource().fetch(sources_cfg.get("remotive") or {}))

    def _gh():
        cfg = dict(sources_cfg.get("greenhouse") or {})
        cfg.setdefault("companies", _companies_with("greenhouse", companies_cfg))
        return GreenhouseSource().fetch(cfg)
    _run("greenhouse", _gh)

    def _ashby():
        cfg = dict(sources_cfg.get("ashby") or {})
        cfg.setdefault("companies", _companies_with("ashby", companies_cfg))
        return AshbySource().fetch(cfg)
    _run("ashby", _ashby)

    def _yc():
        cfg = dict(sources_cfg.get("ycombinator") or {})
        known = [c.get("name") for c in (companies_cfg.get("companies") or []) if c.get("name")]
        cfg.setdefault("known_companies", known)
        return YCombinatorSource().fetch(cfg)
    _run("ycombinator", _yc)

    def _lever():
        cfg = dict(sources_cfg.get("lever") or {})
        cfg.setdefault("companies", _companies_with("lever", companies_cfg))
        return LeverSource().fetch(cfg)
    _run("lever", _lever)

    return all_jobs, stats
```

Add `"fetch_all_with_stats"` to `__all__`.

- [ ] **Step 5: Register search router in `app/api/__init__.py`**

Update the imports block:
```python
    from .routes import system, jobs, search  # noqa: WPS433
    app.include_router(system.router, prefix="/api")
    app.include_router(jobs.router, prefix="/api")
    app.include_router(search.router, prefix="/api")
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `.venv/bin/pytest tests/api/test_search.py -v`
Expected: PASS.

Run full suite: `.venv/bin/pytest -q`
Expected: all tests green.

- [ ] **Step 7: Commit**

```bash
git add app/api/routes/search.py app/api/__init__.py app/sources/__init__.py tests/api/test_search.py
git commit -m "feat(api): POST /api/search with per-source stats and partial-failure visibility

Returns {jobs, source_stats, ran_at, duration_ms}. fetch_all_with_stats
wraps each source run with duration + error capture so one timeout never
hides the successful sources. Every search run appends to search_stats.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Dashboard route

**Files:**
- Create: `app/api/routes/dashboard.py`
- Modify: `app/api/__init__.py` — register router
- Modify: `app/storage/sqlite_store.py` — add `upcoming_interviews()`
- Create: `tests/api/test_dashboard.py`

- [ ] **Step 1: Write the failing test**

Create `tests/api/test_dashboard.py`:
```python
from __future__ import annotations

from fastapi.testclient import TestClient


def test_dashboard_shape(client: TestClient) -> None:
    r = client.get("/api/dashboard")
    assert r.status_code == 200
    body = r.json()
    assert set(body) >= {
        "counts_by_priority", "total_jobs", "last_run_at",
        "upcoming_interviews", "shortlist_top", "latest_source_stats",
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/pytest tests/api/test_dashboard.py -v`
Expected: FAIL — 404.

- [ ] **Step 3: Add `upcoming_interviews` to `SQLiteStore`**

In `app/storage/sqlite_store.py`:
```python
    def upcoming_interviews(self, limit: int = 10) -> list[dict]:
        sql = """
        SELECT j.id AS job_id, j.role, j.company, a.next_interview_at
        FROM applications a
        JOIN jobs j ON j.id = a.job_id
        WHERE a.status = 'Interviewing' AND a.next_interview_at IS NOT NULL
        ORDER BY a.next_interview_at ASC
        LIMIT ?
        """
        with self._conn() as c:
            rows = c.execute(sql, (limit,)).fetchall()
        return [dict(r) for r in rows]
```

- [ ] **Step 4: Create `app/api/routes/dashboard.py`**

```python
from __future__ import annotations

from fastapi import APIRouter, Depends

from ...storage.config_store import ConfigStore
from ...storage.sqlite_store import SQLiteStore
from ..deps import get_config_store, get_store
from ..schemas import DashboardResponse, SourceStat, UpcomingInterview
from .jobs import _to_scored_out

router = APIRouter(tags=["dashboard"])


@router.get("/dashboard", response_model=DashboardResponse)
def dashboard(
    store: SQLiteStore = Depends(get_store),
    cstore: ConfigStore = Depends(get_config_store),
) -> DashboardResponse:
    counts = store.count_by_priority()
    total = store.total_jobs()
    last_run = store.last_run_at()
    upcoming = [UpcomingInterview(**row) for row in store.upcoming_interviews(limit=10)]

    rows = store.list_scored_with_filters(sort="status_rank", limit=10, offset=0)
    shortlist = [_to_scored_out(s, a) for s, a in rows]

    latest = cstore.latest_per_source()
    latest_stats = {
        src: SourceStat(fetched=r["fetched"], kept=r["kept"],
                        duration_ms=r["duration_ms"], error=r.get("error"))
        for src, r in latest.items()
    }

    return DashboardResponse(
        counts_by_priority=counts,
        total_jobs=total,
        last_run_at=last_run,
        upcoming_interviews=upcoming,
        shortlist_top=shortlist,
        latest_source_stats=latest_stats,
    )
```

- [ ] **Step 5: Register router in `app/api/__init__.py`**

Append `dashboard` to the imports and `app.include_router` calls.

- [ ] **Step 6: Run tests to verify they pass**

Run: `.venv/bin/pytest tests/api/test_dashboard.py -v`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/api/routes/dashboard.py app/api/__init__.py app/storage/sqlite_store.py tests/api/test_dashboard.py
git commit -m "feat(api): GET /api/dashboard with counts, upcoming interviews, source health

upcoming_interviews() powers the pinned section on /tracker and the
Dashboard card. latest_per_source() from ConfigStore surfaces source
health without re-running search.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: Resume routes

**Files:**
- Create: `app/api/routes/resume.py`
- Modify: `app/api/__init__.py` — register router
- Create: `tests/api/test_resume.py`

- [ ] **Step 1: Write the failing tests**

Create `tests/api/test_resume.py`:
```python
from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient


def test_resume_returns_none_when_absent(client: TestClient) -> None:
    r = client.get("/api/resume")
    assert r.status_code == 200
    body = r.json()
    assert body["md_source"] == "none"
    assert body["markdown"] == ""


def test_put_resume_writes_local(client: TestClient, tmp_path: Path, monkeypatch) -> None:
    monkeypatch.chdir(tmp_path)
    (tmp_path / "resumes").mkdir()
    r = client.put("/api/resume", json={"markdown": "# New Resume\n\nhi"})
    assert r.status_code == 200
    assert (tmp_path / "resumes" / "master.md").read_text().startswith("# New Resume")
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/bin/pytest tests/api/test_resume.py -v`
Expected: FAIL — 404.

- [ ] **Step 3: Create `app/api/routes/resume.py`**

```python
from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends

from ...config import Settings
from ...resume.source import read_resume
from ..deps import get_settings
from ..schemas import ResumeIn, ResumeResponse

router = APIRouter(tags=["resume"])


@router.get("/resume", response_model=ResumeResponse)
def get_resume(settings: Settings = Depends(get_settings)) -> ResumeResponse:
    bundle = read_resume(settings)
    return ResumeResponse(
        md_source=bundle.source,
        markdown=bundle.markdown or "",
        has_pdf=bundle.pdf_path is not None,
        has_docx=bundle.docx_path is not None,
    )


@router.put("/resume", response_model=ResumeResponse)
def put_resume(body: ResumeIn, settings: Settings = Depends(get_settings)) -> ResumeResponse:
    local = Path("resumes/master.md")
    local.parent.mkdir(parents=True, exist_ok=True)
    local.write_text(body.markdown, encoding="utf-8")
    bundle = read_resume(settings)
    return ResumeResponse(
        md_source=bundle.source,
        markdown=bundle.markdown or "",
        has_pdf=bundle.pdf_path is not None,
        has_docx=bundle.docx_path is not None,
    )
```

- [ ] **Step 4: Register router in `app/api/__init__.py`**

Append `resume` to the imports and `app.include_router` calls.

- [ ] **Step 5: Run tests to verify they pass**

Run: `.venv/bin/pytest tests/api/test_resume.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/api/routes/resume.py app/api/__init__.py tests/api/test_resume.py
git commit -m "feat(api): GET/PUT /api/resume with portfolio-first read path

PUT always writes to local resumes/master.md — never touches the
portfolio repo. GET reports md_source so UI can distinguish
portfolio-vs-local-vs-none.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: Settings routes + YAML import

**Files:**
- Create: `app/api/routes/settings.py`
- Modify: `app/api/__init__.py` — register router
- Create: `tests/api/test_settings.py`
- Add: `app/main.py` — new `import-config` CLI subcommand (shares code with settings endpoint)

- [ ] **Step 1: Write the failing tests**

Create `tests/api/test_settings.py`:
```python
from __future__ import annotations

from fastapi.testclient import TestClient


def test_profile_put_then_get(client: TestClient) -> None:
    r = client.put("/api/settings/profile", json={
        "name": "Sathwick",
        "years_of_experience": 5,
        "strong_skills": ["python", "fastapi"],
    })
    assert r.status_code == 200

    r2 = client.get("/api/settings/profile")
    body = r2.json()
    assert body["name"] == "Sathwick"
    assert "python" in body["strong_skills"]


def test_companies_crud(client: TestClient) -> None:
    r = client.post("/api/settings/companies", json={
        "name": "Acme", "ats_type": "greenhouse", "board_token": "acme", "priority": "P1",
    })
    assert r.status_code == 200
    cid = r.json()["id"]

    r2 = client.get("/api/settings/companies")
    assert any(c["name"] == "Acme" for c in r2.json())

    r3 = client.patch(f"/api/settings/companies/{cid}", json={"priority": "P0"})
    assert r3.status_code == 200

    r4 = client.delete(f"/api/settings/companies/{cid}")
    assert r4.status_code == 200
    assert all(c["name"] != "Acme" for c in client.get("/api/settings/companies").json())


def test_scoring_put_get(client: TestClient) -> None:
    r = client.put("/api/settings/scoring", json={
        "thresholds": {"P0": 80, "P1": 70, "P2": 60},
        "positive_keywords": ["python", "fastapi"],
    })
    assert r.status_code == 200
    body = client.get("/api/settings/scoring").json()
    assert body["thresholds"]["P0"] == 80
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/bin/pytest tests/api/test_settings.py -v`
Expected: FAIL — 404.

- [ ] **Step 3: Create `app/api/routes/settings.py`**

```python
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from ...config_repo import (
    COMPANIES_YAML,
    PROFILE_YAML,
    SCORING_YAML,
    SOURCES_YAML,
    ConfigRepository,
)
from ...storage.config_store import ConfigStore
from ...utils import utcnow_iso
from ..deps import get_config_repo, get_config_store
from ..schemas import (
    CompanyIn,
    CompanyPatch,
    ImportYamlResponse,
    ProfileIn,
    ScoringIn,
)

router = APIRouter(prefix="/settings", tags=["settings"])


# ── profile ────────────────────────────────────────────────────────────
@router.get("/profile")
def get_profile(cstore: ConfigStore = Depends(get_config_store)) -> dict:
    return cstore.get_profile()


@router.put("/profile")
def put_profile(body: ProfileIn, cstore: ConfigStore = Depends(get_config_store)) -> dict:
    cstore.set_profile(body.model_dump(exclude_none=True))
    return cstore.get_profile()


# ── companies ──────────────────────────────────────────────────────────
@router.get("/companies")
def list_companies(cstore: ConfigStore = Depends(get_config_store)) -> list[dict]:
    return cstore.list_companies()


@router.post("/companies")
def add_company(body: CompanyIn, cstore: ConfigStore = Depends(get_config_store)) -> dict:
    cid = cstore.add_company(body.model_dump())
    return {"id": cid}


@router.patch("/companies/{cid}")
def update_company(cid: int, body: CompanyPatch, cstore: ConfigStore = Depends(get_config_store)) -> dict:
    cstore.update_company(cid, body.model_dump(exclude_none=True))
    return {"ok": True}


@router.delete("/companies/{cid}")
def delete_company(cid: int, cstore: ConfigStore = Depends(get_config_store)) -> dict:
    cstore.soft_delete_company(cid)
    return {"ok": True}


# ── scoring / sources ──────────────────────────────────────────────────
@router.get("/scoring")
def get_scoring(cstore: ConfigStore = Depends(get_config_store)) -> dict:
    return cstore.get_scoring()


@router.put("/scoring")
def put_scoring(body: ScoringIn, cstore: ConfigStore = Depends(get_config_store)) -> dict:
    cstore.put_scoring(body.model_dump())
    return cstore.get_scoring()


@router.get("/sources")
def get_sources(cstore: ConfigStore = Depends(get_config_store)) -> dict:
    return cstore.get_sources()


@router.put("/sources")
def put_sources(body: dict[str, Any], cstore: ConfigStore = Depends(get_config_store)) -> dict:
    cstore.put_sources(body)
    return cstore.get_sources()


# ── import from YAML ───────────────────────────────────────────────────
@router.post("/import-yaml", response_model=ImportYamlResponse)
def import_yaml(
    cstore: ConfigStore = Depends(get_config_store),
    repo: ConfigRepository = Depends(get_config_repo),
) -> ImportYamlResponse:
    counts: dict[str, int] = {}

    try:
        profile = repo.load_yaml(PROFILE_YAML)
        if profile:
            cstore.set_profile(profile)
        counts[PROFILE_YAML] = 1 if profile else 0
    except Exception as e:  # noqa: BLE001
        raise HTTPException(400, detail=f"profile import failed: {e}")

    scoring = repo.load_yaml(SCORING_YAML)
    if scoring:
        cstore.put_scoring(scoring)
    counts[SCORING_YAML] = 1 if scoring else 0

    sources = repo.load_yaml(SOURCES_YAML)
    if sources:
        cstore.put_sources(sources)
    counts[SOURCES_YAML] = 1 if sources else 0

    companies = (repo.load_yaml(COMPANIES_YAML) or {}).get("companies") or []
    n = 0
    for c in companies:
        try:
            cstore.add_company(c)
            n += 1
        except Exception:
            # Company already exists via UNIQUE(name) — update instead
            existing = next((x for x in cstore.list_companies(include_disabled=True)
                             if x["name"].lower() == c["name"].lower()), None)
            if existing:
                cstore.update_company(existing["id"], c)
                n += 1
    counts[COMPANIES_YAML] = n

    return ImportYamlResponse(imported=counts, imported_at=utcnow_iso())
```

- [ ] **Step 4: Register router in `app/api/__init__.py`**

Append `settings` to the imports block and include it with `prefix="/api"` (the router itself already carries `/settings`).

- [ ] **Step 5: Add `import-config` CLI command in `app/main.py`**

Add a new Typer command that reuses the same logic:
```python
@app.command("import-config", help="Import config/*.yaml into SQLite tables.")
def import_config() -> None:
    from .api.routes.settings import import_yaml as _impl
    from .storage.config_store import ConfigStore
    settings = load_settings()
    cstore = ConfigStore(settings.sqlite_db_path)
    cstore.init_schema()
    repo = build_config_repository(settings)
    result = _impl(cstore=cstore, repo=repo)  # type: ignore[arg-type]
    typer.echo(f"imported: {result.imported} at {result.imported_at}")
```

Add the needed imports at the top of `main.py`:
```python
from .config_repo import build_config_repository
from .config import load_settings
```

(If they're already there, skip — many are.)

- [ ] **Step 6: Run tests to verify they pass**

Run: `.venv/bin/pytest tests/api/test_settings.py -v`
Expected: PASS (3 tests).

Run full suite: `.venv/bin/pytest -q`
Expected: all tests green.

- [ ] **Step 7: Commit**

```bash
git add app/api/routes/settings.py app/api/__init__.py app/main.py tests/api/test_settings.py
git commit -m "feat(api): /api/settings profile+companies+scoring+sources + YAML import

Profile/scoring/sources use bulk PUT. Companies has full CRUD with
soft-delete via enabled=0 so notion_page_id references survive.
POST /settings/import-yaml is the escape hatch — also exposed as the
\`import-config\` CLI command for scripted seeding.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase C — Frontend foundation

### Task 15: Bootstrap Vite + React + TS + Tailwind

**Files:**
- Create: `web/package.json`
- Create: `web/tsconfig.json`
- Create: `web/tsconfig.node.json`
- Create: `web/vite.config.ts`
- Create: `web/tailwind.config.ts`
- Create: `web/postcss.config.js`
- Create: `web/index.html`
- Create: `web/src/main.tsx`
- Create: `web/src/App.tsx`
- Create: `web/src/styles/globals.css`
- Create: `web/.gitignore`
- Modify: `.gitignore` — add `web/node_modules`, `web/dist`

- [ ] **Step 1: Create `web/package.json`**

```json
{
  "name": "job-finder-web",
  "private": true,
  "version": "2.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite --host 0.0.0.0 --port 47130",
    "build": "tsc -b && vite build",
    "preview": "vite preview --port 47130",
    "lint": "eslint src --ext ts,tsx --max-warnings 0",
    "test": "vitest run",
    "types": "openapi-typescript http://localhost:47131/openapi.json -o src/lib/api-types.ts"
  },
  "dependencies": {
    "@tanstack/react-query": "^5.32.0",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.1",
    "date-fns": "^3.6.0",
    "lucide-react": "^0.395.0",
    "openapi-fetch": "^0.10.2",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-hook-form": "^7.52.1",
    "react-markdown": "^9.0.1",
    "react-router-dom": "^6.24.1",
    "remark-gfm": "^4.0.0",
    "tailwind-merge": "^2.3.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@typescript-eslint/eslint-plugin": "^7.16.0",
    "@typescript-eslint/parser": "^7.16.0",
    "@vitejs/plugin-react": "^4.3.1",
    "@testing-library/jest-dom": "^6.4.6",
    "@testing-library/react": "^16.0.0",
    "@testing-library/user-event": "^14.5.2",
    "autoprefixer": "^10.4.19",
    "eslint": "^8.57.0",
    "eslint-plugin-react-hooks": "^4.6.2",
    "eslint-plugin-react-refresh": "^0.4.7",
    "jsdom": "^24.1.0",
    "msw": "^2.3.1",
    "openapi-typescript": "^7.0.0",
    "postcss": "^8.4.38",
    "tailwindcss": "^3.4.4",
    "typescript": "^5.5.3",
    "vite": "^5.3.3",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: Create `web/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 3: Create `web/tsconfig.node.json`**

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 4: Create `web/vite.config.ts`**

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  server: {
    host: "0.0.0.0",
    port: 47130,
    proxy: { "/api": "http://localhost:47131" },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
  },
});
```

- [ ] **Step 5: Create `web/tailwind.config.ts`**

```ts
import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: "var(--surface)",
        "surface-hover": "var(--surface-hover)",
        border: "var(--border)",
        "border-strong": "var(--border-strong)",
        text: "var(--text)",
        "text-muted": "var(--text-muted)",
        "text-faint": "var(--text-faint)",
        accent: "var(--accent)",
        "accent-amber": "var(--accent-amber)",
        "accent-muted": "var(--accent-muted)",
        danger: "var(--danger)",
        success: "var(--success)",
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "system-ui", "sans-serif"],
        mono: ["Geist Mono", "JetBrains Mono", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
```

- [ ] **Step 6: Create `web/postcss.config.js`**

```js
export default {
  plugins: { tailwindcss: {}, autoprefixer: {} },
};
```

- [ ] **Step 7: Create `web/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1280" />
    <title>job-finder</title>
    <link rel="preconnect" href="https://rsms.me/" />
    <link rel="stylesheet" href="https://rsms.me/inter/inter.css" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 8: Create `web/src/styles/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --bg: #0f1115;
  --bg-gradient-start: #1a1f2e;
  --surface: rgba(255, 255, 255, 0.03);
  --surface-hover: rgba(255, 255, 255, 0.06);
  --border: rgba(255, 255, 255, 0.08);
  --border-strong: rgba(255, 255, 255, 0.12);
  --text: #f5f6f8;
  --text-muted: #9ca3af;
  --text-faint: #6b7280;
  --accent: #22d3ee;
  --accent-amber: #fbbf24;
  --accent-muted: #6b7280;
  --danger: #f87171;
  --success: #34d399;
  --ring: rgba(34, 211, 238, 0.4);
}

html,
body,
#root {
  min-height: 100vh;
  background: radial-gradient(ellipse at top left, var(--bg-gradient-start) 0%, var(--bg) 60%);
  color: var(--text);
  font-family: Inter, -apple-system, system-ui, sans-serif;
}

* {
  box-sizing: border-box;
}
```

- [ ] **Step 9: Create `web/src/main.tsx`**

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import "./styles/globals.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: false },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
```

- [ ] **Step 10: Create `web/src/App.tsx` (skeleton)**

```tsx
export default function App() {
  return (
    <main className="min-h-screen p-6">
      <h1 className="text-2xl font-semibold">job-finder</h1>
      <p className="text-text-muted mt-2">v2 — scaffolding in place</p>
    </main>
  );
}
```

- [ ] **Step 11: Create `web/.gitignore`**

```
node_modules
dist
.eslintcache
coverage
```

- [ ] **Step 12: Update root `.gitignore`**

Append:
```
web/node_modules
web/dist
```

- [ ] **Step 13: Install deps and verify build**

Run (from the repo root):
```
cd web && npm install && npm run build && cd ..
```
Expected: `dist/` is produced under `web/`, no TS errors.

- [ ] **Step 14: Commit**

```bash
git add web/ .gitignore
git commit -m "feat(web): scaffold Vite + React 18 + TS strict + Tailwind + React Query

- npm deps: react-router-dom, @tanstack/react-query, openapi-fetch,
  react-markdown, react-hook-form, zod, tailwind, shadcn helpers
  (clsx, tailwind-merge, class-variance-authority)
- dev server proxies /api → http://localhost:47131; build outputs to web/dist
- globals.css sets the warm-dark tokens and radial gradient bg

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 16: OpenAPI → TypeScript types generation

**Files:**
- Create: `web/src/test/setup.ts`
- Create: `web/src/lib/api-types.ts` (generated)
- Create: `web/src/lib/api-client.ts`
- Create: `Makefile`

- [ ] **Step 1: Create `web/src/test/setup.ts`**

```ts
import "@testing-library/jest-dom";
```

- [ ] **Step 2: Create `Makefile` at repo root**

```makefile
.PHONY: types api web test lint

types:
	cd web && npx openapi-typescript http://localhost:47131/openapi.json -o src/lib/api-types.ts

api:
	docker compose up -d api

web:
	docker compose up -d web

test:
	.venv/bin/pytest -q && cd web && npm test

lint:
	.venv/bin/ruff check app tests && cd web && npm run lint
```

- [ ] **Step 3: Start API locally and generate types**

Run:
```
.venv/bin/python -m app.api.main &
sleep 2
curl -fsS http://localhost:47131/api/health
cd web && npx openapi-typescript http://localhost:47131/openapi.json -o src/lib/api-types.ts
cd ..
kill %1 2>/dev/null || true
```
Expected: `web/src/lib/api-types.ts` is written with a valid `paths` and `components.schemas` map.

- [ ] **Step 4: Create `web/src/lib/api-client.ts`**

```ts
import createClient from "openapi-fetch";
import type { paths } from "./api-types";

// Relative base URL — the Vite dev server proxies /api → :47131,
// and in prod nginx does the same. Never hardcode the host.
export const api = createClient<paths>({ baseUrl: "" });

export type Schemas = paths;
```

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/api-types.ts web/src/lib/api-client.ts web/src/test/setup.ts Makefile
git commit -m "feat(web): generate TS types from OpenAPI and wire openapi-fetch

- make types regenerates web/src/lib/api-types.ts from the live API
- api-client.ts is the typed openapi-fetch instance every hook uses
- Makefile documents: make types / make api / make web / make test / make lint

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 17: AppShell, router, nav bar, theme

**Files:**
- Create: `web/src/components/layout/AppShell.tsx`
- Create: `web/src/components/layout/NavBar.tsx`
- Modify: `web/src/App.tsx` — add routes

- [ ] **Step 1: Create `web/src/components/layout/NavBar.tsx`**

```tsx
import { NavLink } from "react-router-dom";

const LINKS = [
  { to: "/", label: "Dashboard" },
  { to: "/search", label: "Search" },
  { to: "/tracker", label: "Tracker" },
  { to: "/resume", label: "Resume" },
  { to: "/settings", label: "Settings" },
];

export function NavBar() {
  return (
    <header className="flex items-center gap-6 px-6 py-4 border-b border-border">
      <div className="flex items-center gap-2">
        <span className="w-6 h-6 rounded bg-gradient-to-br from-accent to-blue-500 flex items-center justify-center text-black font-bold text-xs">
          jf
        </span>
        <span className="font-semibold tracking-tight">job-finder</span>
      </div>
      <nav className="flex items-center gap-5 text-sm text-text-muted">
        {LINKS.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.to === "/"}
            className={({ isActive }) =>
              isActive ? "text-text font-medium" : "hover:text-text"
            }
          >
            {l.label}
          </NavLink>
        ))}
      </nav>
    </header>
  );
}
```

- [ ] **Step 2: Create `web/src/components/layout/AppShell.tsx`**

```tsx
import { Outlet } from "react-router-dom";
import { NavBar } from "./NavBar";

export function AppShell() {
  return (
    <div className="min-h-screen flex flex-col">
      <NavBar />
      <main className="flex-1 px-6 py-6 max-w-[1400px] w-full mx-auto">
        <Outlet />
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Create route stubs**

Create `web/src/routes/Dashboard.tsx`:
```tsx
export default function Dashboard() {
  return <h2 className="text-xl font-semibold">Dashboard</h2>;
}
```

Create `web/src/routes/Search.tsx`:
```tsx
export default function Search() {
  return <h2 className="text-xl font-semibold">Search</h2>;
}
```

Create `web/src/routes/Tracker.tsx`:
```tsx
export default function Tracker() {
  return <h2 className="text-xl font-semibold">Tracker</h2>;
}
```

Create `web/src/routes/Resume.tsx`:
```tsx
export default function Resume() {
  return <h2 className="text-xl font-semibold">Resume</h2>;
}
```

Create `web/src/routes/settings/SettingsLayout.tsx`:
```tsx
import { NavLink, Outlet } from "react-router-dom";

const TABS = [
  { to: "/settings/profile", label: "Profile" },
  { to: "/settings/companies", label: "Companies" },
  { to: "/settings/scoring", label: "Scoring" },
  { to: "/settings/sources", label: "Sources" },
];

export default function SettingsLayout() {
  return (
    <div className="flex gap-8">
      <aside className="w-44 space-y-2 text-sm">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            className={({ isActive }) =>
              `block px-2 py-1 rounded ${isActive ? "bg-surface text-text" : "text-text-muted hover:text-text"}`
            }
          >
            {t.label}
          </NavLink>
        ))}
      </aside>
      <div className="flex-1">
        <Outlet />
      </div>
    </div>
  );
}
```

Stubs for nested settings routes — each is a single line:

```tsx
// web/src/routes/settings/Profile.tsx
export default function Profile() { return <h2 className="text-xl font-semibold">Profile</h2>; }
```

(Repeat for `Companies.tsx`, `Scoring.tsx`, `Sources.tsx` with appropriate labels.)

- [ ] **Step 4: Rewrite `web/src/App.tsx` with the router**

```tsx
import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import Dashboard from "./routes/Dashboard";
import Search from "./routes/Search";
import Tracker from "./routes/Tracker";
import Resume from "./routes/Resume";
import SettingsLayout from "./routes/settings/SettingsLayout";
import Profile from "./routes/settings/Profile";
import Companies from "./routes/settings/Companies";
import Scoring from "./routes/settings/Scoring";
import Sources from "./routes/settings/Sources";

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/search" element={<Search />} />
        <Route path="/tracker" element={<Tracker />} />
        <Route path="/resume" element={<Resume />} />
        <Route path="/settings" element={<SettingsLayout />}>
          <Route index element={<Navigate to="profile" replace />} />
          <Route path="profile" element={<Profile />} />
          <Route path="companies" element={<Companies />} />
          <Route path="scoring" element={<Scoring />} />
          <Route path="sources" element={<Sources />} />
        </Route>
      </Route>
    </Routes>
  );
}
```

- [ ] **Step 5: Build and smoke-check**

Run:
```
cd web && npm run build && cd ..
```
Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add web/src/
git commit -m "feat(web): AppShell + NavBar + 5-route skeleton with nested settings

Routes: /, /search, /tracker, /resume, /settings/(profile|companies|scoring|sources).
NavBar uses NavLink's isActive so the current route highlights without
extra state. Settings has a nested layout with its own side-nav.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 18: shadcn-style UI primitives (Button, Card, Input, Select, Badge, Dialog, Sheet)

**Files:**
- Create: `web/src/components/ui/utils.ts`
- Create: `web/src/components/ui/Button.tsx`
- Create: `web/src/components/ui/Input.tsx`
- Create: `web/src/components/ui/Select.tsx`
- Create: `web/src/components/ui/Badge.tsx`
- Create: `web/src/components/ui/Card.tsx`
- Create: `web/src/components/ui/Dialog.tsx`

The plan uses hand-rolled primitives (not the shadcn CLI) to keep dependencies minimal and avoid a setup wizard.

- [ ] **Step 1: Create `web/src/components/ui/utils.ts`**

```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 2: Create `web/src/components/ui/Button.tsx`**

```tsx
import { ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "./utils";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
};

const base =
  "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors " +
  "disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[var(--ring)]";

const variants = {
  primary: "bg-accent text-black hover:bg-cyan-300",
  secondary: "bg-surface hover:bg-surface-hover border border-border",
  ghost: "hover:bg-surface-hover",
  danger: "bg-danger/20 text-danger hover:bg-danger/30 border border-danger/40",
};

const sizes = { sm: "h-7 px-2 text-xs", md: "h-9 px-3 text-sm" };

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { className, variant = "secondary", size = "md", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(base, variants[variant], sizes[size], className)}
      {...rest}
    />
  );
});
```

- [ ] **Step 3: Create `web/src/components/ui/Input.tsx`**

```tsx
import { InputHTMLAttributes, forwardRef } from "react";
import { cn } from "./utils";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          "h-9 w-full rounded-md border border-border bg-surface px-3 text-sm",
          "placeholder:text-text-faint focus:outline-none focus:border-accent/50 focus:ring-2 focus:ring-[var(--ring)]",
          className,
        )}
        {...rest}
      />
    );
  },
);
```

- [ ] **Step 4: Create `web/src/components/ui/Select.tsx`**

```tsx
import { SelectHTMLAttributes, forwardRef } from "react";
import { cn } from "./utils";

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...rest }, ref) {
    return (
      <select
        ref={ref}
        className={cn(
          "h-8 rounded-md border border-border bg-surface px-2 text-xs text-text",
          "focus:outline-none focus:border-accent/50",
          className,
        )}
        {...rest}
      >
        {children}
      </select>
    );
  },
);
```

- [ ] **Step 5: Create `web/src/components/ui/Badge.tsx`**

```tsx
import { HTMLAttributes } from "react";
import { cn } from "./utils";

type Tone = "cyan" | "amber" | "grey" | "red" | "green";

const TONES: Record<Tone, string> = {
  cyan: "bg-accent/15 text-accent",
  amber: "bg-accent-amber/15 text-accent-amber",
  grey: "bg-white/10 text-text-muted",
  red: "bg-danger/15 text-danger",
  green: "bg-success/15 text-success",
};

export function Badge({
  tone = "grey",
  className,
  ...rest
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold tracking-wide",
        TONES[tone],
        className,
      )}
      {...rest}
    />
  );
}
```

- [ ] **Step 6: Create `web/src/components/ui/Card.tsx`**

```tsx
import { HTMLAttributes } from "react";
import { cn } from "./utils";

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("bg-surface border border-border rounded-xl p-4", className)}
      {...rest}
    />
  );
}
```

- [ ] **Step 7: Create `web/src/components/ui/Dialog.tsx`**

```tsx
import { useEffect } from "react";
import { cn } from "./utils";

export function Dialog({
  open,
  onClose,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={cn(
          "bg-[var(--bg)] border border-border-strong rounded-xl shadow-2xl",
          "w-full max-w-2xl max-h-[85vh] overflow-auto p-5",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Build and verify**

Run: `cd web && npm run build && cd ..`
Expected: build succeeds.

- [ ] **Step 9: Commit**

```bash
git add web/src/components/ui/
git commit -m "feat(web): add hand-rolled UI primitives (Button, Input, Select, Badge, Card, Dialog)

No shadcn CLI — plain React with cn() utility over clsx + tailwind-merge.
Tones on Badge map to the warm-dark palette (cyan=P0, amber=P1, grey=P2).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 19: Shared helpers — PriorityBadge, FitScoreCell, format.ts, constants.ts

**Files:**
- Create: `web/src/lib/format.ts`
- Create: `web/src/lib/constants.ts`
- Create: `web/src/components/job/PriorityBadge.tsx`
- Create: `web/src/components/job/FitScoreCell.tsx`
- Create: `web/src/components/job/AiPendingBadge.tsx`
- Create: `web/src/components/shared/{EmptyState,LoadingState,ErrorState}.tsx`

- [ ] **Step 1: Create `web/src/lib/constants.ts`**

```ts
// Mirrors app/storage/sqlite_store.py STATUS_RANK. Order matters for sorts.
export const STATUS_RANK = {
  Interviewing: 0,
  "Assessment Pending": 1,
  "Recruiter Reply": 2,
  Applied: 3,
  "Tailoring Resume": 4,
  "Need Referral": 5,
  Shortlisted: 6,
  Found: 7,
  Rejected: 8,
  Archived: 9,
} as const;

export type ApplicationStatus = keyof typeof STATUS_RANK;
export const ALL_STATUSES = Object.keys(STATUS_RANK) as ApplicationStatus[];
export const ALL_PRIORITIES = ["P0", "P1", "P2", "Ignore"] as const;
export type Priority = (typeof ALL_PRIORITIES)[number];
```

- [ ] **Step 2: Create `web/src/lib/format.ts`**

```ts
import { format, formatDistanceToNow, parseISO } from "date-fns";

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return format(parseISO(iso), "MMM d, yyyy");
  } catch {
    return iso;
  }
}

export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return `${formatDistanceToNow(parseISO(iso))} ago`;
  } catch {
    return iso;
  }
}

export function fitScoreTone(score: number): "cyan" | "amber" | "grey" | "red" {
  if (score >= 80) return "cyan";
  if (score >= 70) return "amber";
  if (score >= 60) return "grey";
  return "red";
}
```

- [ ] **Step 3: Create `web/src/components/job/PriorityBadge.tsx`**

```tsx
import { Badge } from "../ui/Badge";
import type { Priority } from "../../lib/constants";

const TONE = { P0: "cyan", P1: "amber", P2: "grey", Ignore: "red" } as const;

export function PriorityBadge({ priority }: { priority: Priority }) {
  return <Badge tone={TONE[priority]}>{priority}</Badge>;
}
```

- [ ] **Step 4: Create `web/src/components/job/FitScoreCell.tsx`**

```tsx
import { fitScoreTone } from "../../lib/format";

const COLOR = {
  cyan: "text-accent",
  amber: "text-accent-amber",
  grey: "text-text-muted",
  red: "text-danger",
} as const;

export function FitScoreCell({ score }: { score: number }) {
  return (
    <span className={`font-semibold tabular-nums ${COLOR[fitScoreTone(score)]}`}>
      {score}
    </span>
  );
}
```

- [ ] **Step 5: Create `web/src/components/job/AiPendingBadge.tsx`**

```tsx
import { Sparkles } from "lucide-react";
import { Badge } from "../ui/Badge";

export function AiPendingBadge({ pending }: { pending: boolean }) {
  if (!pending) return null;
  return (
    <Badge tone="amber" className="gap-1">
      <Sparkles className="w-3 h-3" />
      AI integration pending
    </Badge>
  );
}
```

- [ ] **Step 6: Create the shared state components**

`web/src/components/shared/EmptyState.tsx`:
```tsx
export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="text-center py-16">
      <p className="text-text-muted text-sm">{title}</p>
      {hint && <p className="text-text-faint text-xs mt-2">{hint}</p>}
    </div>
  );
}
```

`web/src/components/shared/LoadingState.tsx`:
```tsx
export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return <p className="text-text-muted text-sm py-8">{label}</p>;
}
```

`web/src/components/shared/ErrorState.tsx`:
```tsx
export function ErrorState({ message }: { message: string }) {
  return (
    <div className="bg-danger/10 border border-danger/40 rounded-lg p-4 text-sm text-danger">
      {message}
    </div>
  );
}
```

- [ ] **Step 7: Build and verify**

Run: `cd web && npm run build && cd ..`
Expected: build succeeds.

- [ ] **Step 8: Commit**

```bash
git add web/src/lib/ web/src/components/job/ web/src/components/shared/
git commit -m "feat(web): shared helpers — format, constants, PriorityBadge, FitScoreCell, AiPendingBadge

constants.ts mirrors the Python STATUS_RANK so sort order is consistent
across backend and frontend. fitScoreTone in format.ts maps 80+/70+/60+
to cyan/amber/grey for per-cell color. AiPendingBadge is the app-wide
'LLM not configured' indicator referenced throughout the spec.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase D — Frontend features

### Task 20: JobTable with click-to-expand — the shared component

**Files:**
- Create: `web/src/components/job/JobTable.tsx`
- Create: `web/src/components/job/JobTableRow.tsx`
- Create: `web/src/components/job/JobTableExpandedRow.tsx`
- Create: `web/src/components/job/StatusCell.tsx`
- Create: `web/src/components/job/InterviewSchedulePopover.tsx`

- [ ] **Step 1: Create `web/src/components/job/StatusCell.tsx`**

```tsx
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Select } from "../ui/Select";
import { api } from "../../lib/api-client";
import { ALL_STATUSES, type ApplicationStatus } from "../../lib/constants";
import { InterviewSchedulePopover } from "./InterviewSchedulePopover";

export function StatusCell({
  jobId,
  value,
  nextInterviewAt,
}: {
  jobId: string;
  value: ApplicationStatus;
  nextInterviewAt: string | null;
}) {
  const qc = useQueryClient();
  const [local, setLocal] = useState<ApplicationStatus>(value);
  const [pickerOpen, setPickerOpen] = useState(false);

  const patch = useMutation({
    mutationFn: async (body: {
      status: ApplicationStatus;
      next_interview_at?: string;
      interview_notes?: string;
    }) => {
      const { error } = await api.PATCH("/api/jobs/{job_id}/status", {
        params: { path: { job_id: jobId } },
        body,
      });
      if (error) throw new Error(error.error?.message || "update failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["jobs"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  function onChange(next: ApplicationStatus) {
    setLocal(next);
    if (next === "Interviewing") {
      setPickerOpen(true);
    } else {
      patch.mutate({ status: next });
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Select value={local} onChange={(e) => onChange(e.target.value as ApplicationStatus)}>
        {ALL_STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </Select>
      {pickerOpen && (
        <InterviewSchedulePopover
          jobId={jobId}
          initial={nextInterviewAt}
          onSubmit={(next_interview_at, interview_notes) => {
            patch.mutate({
              status: "Interviewing",
              next_interview_at,
              interview_notes,
            });
            setPickerOpen(false);
          }}
          onCancel={() => {
            setPickerOpen(false);
            setLocal(value);
          }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create `web/src/components/job/InterviewSchedulePopover.tsx`**

```tsx
import { useState } from "react";
import { Dialog } from "../ui/Dialog";
import { Input } from "../ui/Input";
import { Button } from "../ui/Button";

export function InterviewSchedulePopover({
  jobId,
  initial,
  onSubmit,
  onCancel,
}: {
  jobId: string;
  initial: string | null;
  onSubmit: (nextAt: string, notes: string) => void;
  onCancel: () => void;
}) {
  const [when, setWhen] = useState(initial?.slice(0, 16) || "");
  const [notes, setNotes] = useState("");

  return (
    <Dialog open={true} onClose={onCancel} className="max-w-md">
      <h3 className="text-lg font-semibold mb-4">Schedule interview</h3>
      <label className="block text-xs text-text-muted mb-1">Date & time</label>
      <Input
        type="datetime-local"
        value={when}
        onChange={(e) => setWhen(e.target.value)}
      />
      <label className="block text-xs text-text-muted mb-1 mt-4">Notes (optional)</label>
      <Input
        placeholder="e.g. phone screen with Priya"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      <div className="flex justify-end gap-2 mt-5">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant="primary"
          disabled={!when}
          onClick={() => onSubmit(new Date(when).toISOString(), notes)}
        >
          Save
        </Button>
      </div>
      <p className="text-text-faint text-xs mt-3">job: {jobId}</p>
    </Dialog>
  );
}
```

- [ ] **Step 3: Create `web/src/components/job/JobTableExpandedRow.tsx`**

```tsx
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ExternalLink, Sparkles } from "lucide-react";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { AiPendingBadge } from "./AiPendingBadge";
import { api } from "../../lib/api-client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Scored = {
  job: { id: string; url: string; description: string | null };
  matched_skills: string[];
  missing_skills: string[];
  reasons: string[];
  recommended_resume_variant: string | null;
};

export function JobTableExpandedRow({ scored }: { scored: Scored }) {
  const [tailor, setTailor] = useState<{ markdown: string; ai_pending: boolean } | null>(null);

  const run = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST("/api/jobs/{job_id}/tailor", {
        params: { path: { job_id: scored.job.id } },
      });
      if (error) throw new Error(error.error?.message || "tailor failed");
      return data!;
    },
    onSuccess: (d) => setTailor({ markdown: d.markdown, ai_pending: d.ai_pending }),
  });

  return (
    <div className="bg-surface border-l-2 border-accent/40 px-5 py-4 text-sm space-y-3">
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <div>
          <span className="text-success font-medium">Fits:</span>{" "}
          <span className="text-text-muted">{scored.matched_skills.join(", ") || "—"}</span>
        </div>
        <div>
          <span className="text-danger font-medium">Gaps:</span>{" "}
          <span className="text-text-muted">{scored.missing_skills.join(", ") || "—"}</span>
        </div>
        {scored.recommended_resume_variant && (
          <div>
            <span className="font-medium">Resume variant:</span>{" "}
            <code className="text-accent">{scored.recommended_resume_variant}</code>
          </div>
        )}
      </div>
      {scored.reasons.length > 0 && (
        <p className="text-text-muted text-xs">{scored.reasons.join(" · ")}</p>
      )}
      <div className="flex gap-2">
        <Button size="sm" variant="primary" onClick={() => run.mutate()} disabled={run.isPending}>
          <Sparkles className="w-3 h-3" />
          {run.isPending ? "Tailoring…" : "Tailor Resume"}
        </Button>
        <Button size="sm" variant="secondary" asChild={undefined} onClick={() => window.open(scored.job.url, "_blank")}>
          <ExternalLink className="w-3 h-3" />
          Open JD
        </Button>
      </div>
      {tailor && (
        <Dialog open onClose={() => setTailor(null)}>
          <div className="flex items-center gap-3 mb-3">
            <h3 className="text-lg font-semibold">Tailor sheet</h3>
            <AiPendingBadge pending={tailor.ai_pending} />
          </div>
          {tailor.ai_pending && (
            <div className="bg-accent-amber/10 border border-accent-amber/40 rounded-md p-3 text-xs text-accent-amber mb-3">
              AI integration pending — add <code>OPENAI_API_KEY</code> or <code>ANTHROPIC_API_KEY</code> to <code>.env</code> for AI-drafted rewrites. Deterministic template shown below.
            </div>
          )}
          <article className="prose prose-invert prose-sm max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{tailor.markdown}</ReactMarkdown>
          </article>
        </Dialog>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Create `web/src/components/job/JobTableRow.tsx`**

```tsx
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "../ui/utils";
import { PriorityBadge } from "./PriorityBadge";
import { FitScoreCell } from "./FitScoreCell";
import { StatusCell } from "./StatusCell";
import { JobTableExpandedRow } from "./JobTableExpandedRow";
import type { ApplicationStatus } from "../../lib/constants";

type ScoredJobRow = {
  job: {
    id: string;
    role: string;
    company: string;
    url: string;
    location: string | null;
    source: string;
    description: string | null;
  };
  fit_score: number;
  priority: "P0" | "P1" | "P2" | "Ignore";
  matched_skills: string[];
  missing_skills: string[];
  reasons: string[];
  recommended_resume_variant: string | null;
};

export function JobTableRow({
  scored,
  application,
  expanded,
  onToggle,
}: {
  scored: ScoredJobRow;
  application: { status: ApplicationStatus; next_interview_at: string | null } | null;
  expanded: boolean;
  onToggle: () => void;
}) {
  const Chevron = expanded ? ChevronDown : ChevronRight;
  const status = (application?.status ?? "Found") as ApplicationStatus;

  return (
    <>
      <tr
        className={cn(
          "border-t border-border cursor-pointer hover:bg-surface-hover",
          expanded && "bg-surface",
        )}
      >
        <td className="px-4 py-3" onClick={onToggle}>
          <div className="flex items-center gap-2 font-medium text-text">
            <Chevron className="w-3 h-3 text-text-faint" />
            {scored.job.company}
          </div>
        </td>
        <td className="px-4 py-3 text-text-muted" onClick={onToggle}>
          {scored.job.role}
        </td>
        <td className="px-4 py-3" onClick={onToggle}>
          <FitScoreCell score={scored.fit_score} />
        </td>
        <td className="px-4 py-3" onClick={onToggle}>
          <PriorityBadge priority={scored.priority} />
        </td>
        <td className="px-4 py-3 text-xs text-text-muted" onClick={onToggle}>
          {scored.job.location || "—"}
        </td>
        <td className="px-4 py-3 text-xs text-text-muted" onClick={onToggle}>
          {scored.job.source}
        </td>
        <td className="px-4 py-3">
          <StatusCell
            jobId={scored.job.id}
            value={status}
            nextInterviewAt={application?.next_interview_at ?? null}
          />
        </td>
      </tr>
      {expanded && (
        <tr className="border-t border-border">
          <td colSpan={7} className="p-0">
            <JobTableExpandedRow scored={scored} />
          </td>
        </tr>
      )}
    </>
  );
}
```

- [ ] **Step 5: Create `web/src/components/job/JobTable.tsx`**

```tsx
import { useState } from "react";
import { JobTableRow } from "./JobTableRow";
import { EmptyState } from "../shared/EmptyState";

type Row = Parameters<typeof JobTableRow>[0]["scored"];
type App = Parameters<typeof JobTableRow>[0]["application"];

export function JobTable({
  rows,
  applicationsByJobId = {},
}: {
  rows: Row[];
  applicationsByJobId?: Record<string, App>;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  if (rows.length === 0) {
    return <EmptyState title="No jobs match your filters." hint="Try widening the search." />;
  }

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] uppercase tracking-widest text-text-muted">
            <th className="text-left px-4 py-3 font-medium">Company</th>
            <th className="text-left px-4 py-3 font-medium">Role</th>
            <th className="text-left px-4 py-3 font-medium">Fit</th>
            <th className="text-left px-4 py-3 font-medium">Pri</th>
            <th className="text-left px-4 py-3 font-medium">Location</th>
            <th className="text-left px-4 py-3 font-medium">Source</th>
            <th className="text-left px-4 py-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((scored) => (
            <JobTableRow
              key={scored.job.id}
              scored={scored}
              application={applicationsByJobId[scored.job.id] || null}
              expanded={expanded.has(scored.job.id)}
              onToggle={() => toggle(scored.job.id)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 6: Verify build**

Run: `cd web && npm run build && cd ..`
Expected: build passes.

- [ ] **Step 7: Commit**

```bash
git add web/src/components/job/
git commit -m "feat(web): JobTable with click-to-expand, StatusCell, interview scheduler

- JobTable is shared by /search and /tracker; expanded state is local Set<string>
- JobTableExpandedRow shows Fits/Gaps/Reasons + Tailor/Open JD actions;
  Tailor opens a Dialog rendering the markdown plus AiPendingBadge when
  ai_pending=true
- StatusCell swaps to Interviewing → opens InterviewSchedulePopover so
  next_interview_at lands in the PATCH body atomically with the status change

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 21: Dashboard route — stat cards, upcoming interviews, shortlist

**Files:**
- Modify: `web/src/routes/Dashboard.tsx`

- [ ] **Step 1: Rewrite `web/src/routes/Dashboard.tsx`**

```tsx
import { useQuery } from "@tanstack/react-query";
import { Card } from "../components/ui/Card";
import { JobTable } from "../components/job/JobTable";
import { LoadingState } from "../components/shared/LoadingState";
import { ErrorState } from "../components/shared/ErrorState";
import { api } from "../lib/api-client";
import { formatRelative, formatDate } from "../lib/format";

export default function Dashboard() {
  const q = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/dashboard");
      if (error) throw new Error(error.error?.message || "load failed");
      return data!;
    },
  });

  if (q.isLoading) return <LoadingState />;
  if (q.isError) return <ErrorState message={(q.error as Error).message} />;
  const d = q.data!;

  const cards = [
    { label: "P0", value: d.counts_by_priority.P0 ?? 0, tone: "text-accent" },
    { label: "P1", value: d.counts_by_priority.P1 ?? 0, tone: "text-accent-amber" },
    { label: "P2", value: d.counts_by_priority.P2 ?? 0, tone: "text-text-muted" },
    { label: "Total", value: d.total_jobs, tone: "text-text" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-baseline gap-3">
        <h2 className="text-2xl font-semibold tracking-tight">Dashboard</h2>
        <span className="text-xs text-text-muted">
          Last run: {d.last_run_at ? formatRelative(d.last_run_at) : "never"}
        </span>
      </div>

      <div className="grid grid-cols-4 gap-3">
        {cards.map((c) => (
          <Card key={c.label}>
            <div className="text-[10px] uppercase tracking-widest text-text-muted font-semibold">
              {c.label}
            </div>
            <div className={`text-3xl font-bold mt-1 ${c.tone}`}>
              {String(c.value).padStart(2, "0")}
            </div>
          </Card>
        ))}
      </div>

      {d.upcoming_interviews.length > 0 && (
        <Card>
          <h3 className="text-sm font-semibold mb-3">Upcoming interviews</h3>
          <ul className="space-y-2 text-sm">
            {d.upcoming_interviews.map((u) => (
              <li key={u.job_id} className="flex justify-between">
                <span>
                  <span className="font-medium">{u.company}</span>{" "}
                  <span className="text-text-muted">· {u.role}</span>
                </span>
                <span className="text-accent tabular-nums">{formatDate(u.next_interview_at)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div>
        <h3 className="text-sm font-semibold mb-3">Top shortlist</h3>
        <JobTable rows={d.shortlist_top as any} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `cd web && npm run build && cd ..`
Expected: build passes.

- [ ] **Step 3: Commit**

```bash
git add web/src/routes/Dashboard.tsx
git commit -m "feat(web): Dashboard route with stat cards, upcoming interviews, top-10 shortlist

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 22: Search route with per-source stats strip + elapsed timer

**Files:**
- Modify: `web/src/routes/Search.tsx`
- Create: `web/src/components/job/SourceStatsBar.tsx`
- Create: `web/src/components/job/ManualJobDialog.tsx`

- [ ] **Step 1: Create `web/src/components/job/SourceStatsBar.tsx`**

```tsx
import { Check, TriangleAlert } from "lucide-react";
import { cn } from "../ui/utils";

export function SourceStatsBar({
  stats,
}: {
  stats: Record<string, { fetched: number; kept: number; duration_ms: number; error: string | null }>;
}) {
  const entries = Object.entries(stats);
  if (entries.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 text-xs">
      {entries.map(([source, s]) => (
        <span
          key={source}
          className={cn(
            "inline-flex items-center gap-1 px-2 py-1 rounded border",
            s.error
              ? "border-danger/40 bg-danger/10 text-danger"
              : "border-border bg-surface text-text-muted",
          )}
          title={s.error || `${s.kept}/${s.fetched} kept in ${s.duration_ms}ms`}
        >
          {s.error ? <TriangleAlert className="w-3 h-3" /> : <Check className="w-3 h-3 text-success" />}
          <strong className="text-text">{source}</strong>
          <span>
            {s.kept}/{s.fetched}
          </span>
          <span className="text-text-faint">({(s.duration_ms / 1000).toFixed(1)}s)</span>
        </span>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create `web/src/components/job/ManualJobDialog.tsx`**

```tsx
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog } from "../ui/Dialog";
import { Input } from "../ui/Input";
import { Button } from "../ui/Button";
import { AiPendingBadge } from "./AiPendingBadge";
import { api } from "../../lib/api-client";

export function ManualJobDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [role, setRole] = useState("");
  const [company, setCompany] = useState("");
  const [url, setUrl] = useState("");
  const [notes, setNotes] = useState("");
  const qc = useQueryClient();

  const add = useMutation({
    mutationFn: async () => {
      const { error } = await api.POST("/api/jobs/manual", {
        body: { role, company, url, notes: notes || null },
      });
      if (error) throw new Error(error.error?.message || "add failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["jobs"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      setRole("");
      setCompany("");
      setUrl("");
      setNotes("");
      onClose();
    },
  });

  return (
    <Dialog open={open} onClose={onClose}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Add manual job</h3>
        <AiPendingBadge pending={true} />
      </div>
      <p className="text-xs text-text-muted mb-4">
        AI-powered JD import from URL is pending. For now, fill in role + company + URL; we'll add it with the URL as the primary reference.
      </p>
      <div className="space-y-3">
        <Input placeholder="Role (required)" value={role} onChange={(e) => setRole(e.target.value)} />
        <Input placeholder="Company (required)" value={company} onChange={(e) => setCompany(e.target.value)} />
        <Input placeholder="URL (required)" value={url} onChange={(e) => setUrl(e.target.value)} />
        <Input placeholder="Notes — referral contact, recruiter name (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button
          variant="primary"
          disabled={!role || !company || !url || add.isPending}
          onClick={() => add.mutate()}
        >
          {add.isPending ? "Adding…" : "Add"}
        </Button>
      </div>
    </Dialog>
  );
}
```

- [ ] **Step 3: Rewrite `web/src/routes/Search.tsx`**

```tsx
import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Play, X, Plus } from "lucide-react";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { JobTable } from "../components/job/JobTable";
import { SourceStatsBar } from "../components/job/SourceStatsBar";
import { ManualJobDialog } from "../components/job/ManualJobDialog";
import { ErrorState } from "../components/shared/ErrorState";
import { api } from "../lib/api-client";

export default function Search() {
  const [location, setLocation] = useState("");
  const [keyword, setKeyword] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<any | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const qc = useQueryClient();

  const run = useMutation({
    mutationFn: async () => {
      abortRef.current = new AbortController();
      const started = Date.now();
      const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 500);
      try {
        const { data, error } = await api.POST("/api/search", {
          body: { location: location || undefined, keyword: keyword || undefined, use_llm: true },
          signal: abortRef.current.signal,
        });
        if (error) throw new Error(error.error?.message || "search failed");
        return data!;
      } finally {
        clearInterval(timer);
      }
    },
    onSuccess: (d) => {
      setResult(d);
      setElapsed(0);
      setCancelError(null);
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["jobs"] });
    },
    onError: (e: Error) => {
      if (e.name === "AbortError") {
        setCancelError("Search cancelled.");
      } else if (e.message.includes("timeout") || e.message.includes("exceeded 120")) {
        setCancelError(
          "Search exceeded 120s — some sources are very slow. Try disabling ycombinator or greenhouse in Sources settings.",
        );
      } else {
        setCancelError(e.message);
      }
      setElapsed(0);
    },
  });

  function cancel() {
    abortRef.current?.abort();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h2 className="text-2xl font-semibold tracking-tight">Search</h2>
        <Button variant="secondary" size="sm" onClick={() => setManualOpen(true)}>
          <Plus className="w-3 h-3" />
          Add manual job
        </Button>
      </div>

      <Card>
        <div className="flex gap-3">
          <Input
            placeholder="Location filter (Bengaluru, India, remote…)"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            disabled={run.isPending}
          />
          <Input
            placeholder="Keyword / role"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            disabled={run.isPending}
          />
          {run.isPending ? (
            <>
              <Button variant="primary" disabled>
                Searching… ({elapsed}s)
              </Button>
              <Button variant="danger" onClick={cancel}>
                <X className="w-3 h-3" />
                Cancel
              </Button>
            </>
          ) : (
            <Button variant="primary" onClick={() => run.mutate()}>
              <Play className="w-3 h-3" />
              Run search
            </Button>
          )}
        </div>
      </Card>

      {cancelError && <ErrorState message={cancelError} />}

      {result && (
        <>
          <SourceStatsBar stats={result.source_stats} />
          <JobTable rows={result.jobs} />
        </>
      )}

      <ManualJobDialog open={manualOpen} onClose={() => setManualOpen(false)} />
    </div>
  );
}
```

- [ ] **Step 4: Verify build**

Run: `cd web && npm run build && cd ..`
Expected: build passes.

- [ ] **Step 5: Commit**

```bash
git add web/src/routes/Search.tsx web/src/components/job/SourceStatsBar.tsx web/src/components/job/ManualJobDialog.tsx
git commit -m "feat(web): Search route with elapsed timer, AbortController cancel, source stats

- button swaps to 'Searching… (14s)' while pending; inputs disabled
- Cancel fires AbortController.abort() and shows 'Search cancelled.' without a toast
- 120s timeout maps to an actionable error message referencing Sources settings
- ManualJobDialog marked with AiPendingBadge to advertise future AI JD import
- SourceStatsBar shows per-source kept/fetched + duration; errors highlighted in red

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 23: Tracker route with FilterBar + upcoming-interviews section

**Files:**
- Modify: `web/src/routes/Tracker.tsx`
- Create: `web/src/components/job/FilterBar.tsx`

- [ ] **Step 1: Create `web/src/components/job/FilterBar.tsx`**

```tsx
import { useSearchParams } from "react-router-dom";
import { Input } from "../ui/Input";
import { Select } from "../ui/Select";
import { ALL_PRIORITIES, ALL_STATUSES } from "../../lib/constants";

export function FilterBar() {
  const [params, setParams] = useSearchParams();

  function set(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  }

  return (
    <div className="flex flex-wrap gap-2 items-center">
      <Input
        placeholder="Search role / company / JD…"
        className="max-w-sm"
        defaultValue={params.get("q") ?? ""}
        onBlur={(e) => set("q", e.currentTarget.value)}
      />
      <Select value={params.get("status") ?? ""} onChange={(e) => set("status", e.target.value)}>
        <option value="">All statuses</option>
        {ALL_STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </Select>
      <Select value={params.get("priority") ?? ""} onChange={(e) => set("priority", e.target.value)}>
        <option value="">All priorities</option>
        {ALL_PRIORITIES.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </Select>
      <Input
        placeholder="Location contains"
        className="max-w-xs"
        defaultValue={params.get("location_contains") ?? ""}
        onBlur={(e) => set("location_contains", e.currentTarget.value)}
      />
    </div>
  );
}
```

- [ ] **Step 2: Rewrite `web/src/routes/Tracker.tsx`**

```tsx
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Card } from "../components/ui/Card";
import { FilterBar } from "../components/job/FilterBar";
import { JobTable } from "../components/job/JobTable";
import { LoadingState } from "../components/shared/LoadingState";
import { ErrorState } from "../components/shared/ErrorState";
import { api } from "../lib/api-client";
import { formatDate } from "../lib/format";

export default function Tracker() {
  const [params] = useSearchParams();

  const q = useQuery({
    queryKey: ["jobs", params.toString()],
    queryFn: async () => {
      const query: Record<string, any> = {};
      if (params.get("q")) query.q = params.get("q");
      if (params.get("status")) query.status = [params.get("status")!];
      if (params.get("priority")) query.priority = [params.get("priority")!];
      if (params.get("location_contains")) query.location_contains = params.get("location_contains");
      const { data, error } = await api.GET("/api/jobs", { params: { query } });
      if (error) throw new Error(error.error?.message || "load failed");
      return data!;
    },
  });

  const upcoming = useQuery({
    queryKey: ["dashboard-upcoming-only"],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/dashboard");
      if (error) throw new Error(error.error?.message || "load failed");
      return data!.upcoming_interviews;
    },
  });

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold tracking-tight">Tracker</h2>

      {(upcoming.data?.length ?? 0) > 0 && (
        <Card>
          <h3 className="text-sm font-semibold mb-3">Upcoming interviews</h3>
          <ul className="space-y-2 text-sm">
            {upcoming.data!.map((u) => (
              <li key={u.job_id} className="flex justify-between">
                <span>
                  <span className="font-medium">{u.company}</span>{" "}
                  <span className="text-text-muted">· {u.role}</span>
                </span>
                <span className="text-accent tabular-nums">{formatDate(u.next_interview_at)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <FilterBar />

      {q.isLoading && <LoadingState />}
      {q.isError && <ErrorState message={(q.error as Error).message} />}
      {q.data && <JobTable rows={q.data as any} />}
    </div>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `cd web && npm run build && cd ..`
Expected: build passes.

- [ ] **Step 4: Commit**

```bash
git add web/src/routes/Tracker.tsx web/src/components/job/FilterBar.tsx
git commit -m "feat(web): Tracker route with URL-serialized filters and pinned upcoming interviews

FilterBar uses useSearchParams so back/forward + bookmarking work.
Upcoming-interviews card pinned above the table for at-a-glance status.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 24: Resume route — split view (preview + editor)

**Files:**
- Modify: `web/src/routes/Resume.tsx`

- [ ] **Step 1: Rewrite `web/src/routes/Resume.tsx`**

```tsx
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Download, Save } from "lucide-react";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { LoadingState } from "../components/shared/LoadingState";
import { ErrorState } from "../components/shared/ErrorState";
import { api } from "../lib/api-client";

export default function Resume() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["resume"],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/resume");
      if (error) throw new Error(error.error?.message || "load failed");
      return data!;
    },
  });

  const [draft, setDraft] = useState("");
  useEffect(() => {
    if (q.data) setDraft(q.data.markdown);
  }, [q.data]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await api.PUT("/api/resume", { body: { markdown: draft } });
      if (error) throw new Error(error.error?.message || "save failed");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["resume"] }),
  });

  if (q.isLoading) return <LoadingState />;
  if (q.isError) return <ErrorState message={(q.error as Error).message} />;
  const d = q.data!;

  const sourceTone = d.md_source === "portfolio" ? "cyan" : d.md_source === "local" ? "amber" : "red";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-semibold tracking-tight">Resume</h2>
          <Badge tone={sourceTone}>{d.md_source}</Badge>
        </div>
        <div className="flex gap-2">
          {d.has_pdf && (
            <Button size="sm" variant="secondary" onClick={() => window.open("/api/resume/pdf", "_blank")}>
              <Download className="w-3 h-3" /> PDF
            </Button>
          )}
          <Button size="sm" variant="primary" onClick={() => save.mutate()} disabled={save.isPending || draft === d.markdown}>
            <Save className="w-3 h-3" /> {save.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card className="p-4">
          <div className="text-[10px] uppercase tracking-widest text-text-muted font-semibold mb-3">Preview</div>
          <article className="prose prose-invert prose-sm max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{draft || "_(empty)_"}</ReactMarkdown>
          </article>
        </Card>
        <Card className="p-0">
          <div className="text-[10px] uppercase tracking-widest text-text-muted font-semibold px-4 pt-4 mb-2">Edit</div>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="w-full min-h-[70vh] font-mono text-xs p-4 bg-transparent border-0 resize-none focus:outline-none text-text"
          />
        </Card>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `cd web && npm run build && cd ..`
Expected: build passes.

- [ ] **Step 3: Commit**

```bash
git add web/src/routes/Resume.tsx
git commit -m "feat(web): Resume route with split preview/editor and md_source badge

PUT never targets the portfolio repo — save button writes to the local
resumes/master.md. Badge color reflects source: portfolio=cyan, local=amber,
none=red. PDF download button shows only when has_pdf is true.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 25: Settings Profile page

**Files:**
- Modify: `web/src/routes/settings/Profile.tsx`

- [ ] **Step 1: Rewrite `web/src/routes/settings/Profile.tsx`**

```tsx
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";
import { LoadingState } from "../../components/shared/LoadingState";
import { ErrorState } from "../../components/shared/ErrorState";
import { api } from "../../lib/api-client";

export default function Profile() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["settings", "profile"],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/settings/profile");
      if (error) throw new Error(error.error?.message || "load failed");
      return data!;
    },
  });

  const [draft, setDraft] = useState<any>({});
  useEffect(() => {
    if (q.data) setDraft(q.data);
  }, [q.data]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await api.PUT("/api/settings/profile", { body: draft });
      if (error) throw new Error(error.error?.message || "save failed");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings", "profile"] }),
  });

  if (q.isLoading) return <LoadingState />;
  if (q.isError) return <ErrorState message={(q.error as Error).message} />;

  function setField(key: string, value: any) {
    setDraft({ ...draft, [key]: value });
  }

  function setList(key: string, csv: string) {
    setDraft({ ...draft, [key]: csv.split(",").map((s) => s.trim()).filter(Boolean) });
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <h2 className="text-xl font-semibold tracking-tight">Profile</h2>
      <Card className="space-y-3">
        <label className="block text-xs text-text-muted">Name</label>
        <Input value={draft.name ?? ""} onChange={(e) => setField("name", e.target.value)} />

        <label className="block text-xs text-text-muted">Years of experience</label>
        <Input
          type="number"
          value={draft.years_of_experience ?? 0}
          onChange={(e) => setField("years_of_experience", Number(e.target.value))}
        />

        <label className="block text-xs text-text-muted">Target roles (comma-separated)</label>
        <Input
          value={(draft.target_roles ?? []).join(", ")}
          onChange={(e) => setList("target_roles", e.target.value)}
        />

        <label className="block text-xs text-text-muted">Preferred locations</label>
        <Input
          value={(draft.preferred_locations ?? []).join(", ")}
          onChange={(e) => setList("preferred_locations", e.target.value)}
        />

        <label className="block text-xs text-text-muted">Strong skills</label>
        <Input
          value={(draft.strong_skills ?? []).join(", ")}
          onChange={(e) => setList("strong_skills", e.target.value)}
        />

        <label className="block text-xs text-text-muted">Avoid skills</label>
        <Input
          value={(draft.avoid_skills ?? []).join(", ")}
          onChange={(e) => setList("avoid_skills", e.target.value)}
        />

        <label className="block text-xs text-text-muted">Exclude locations (forces Ignore)</label>
        <Input
          value={(draft.exclude_locations ?? []).join(", ")}
          onChange={(e) => setList("exclude_locations", e.target.value)}
        />

        <div className="flex justify-end">
          <Button variant="primary" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `cd web && npm run build && cd ..`
Expected: build passes.

- [ ] **Step 3: Commit**

```bash
git add web/src/routes/settings/Profile.tsx
git commit -m "feat(web): Settings Profile form with skill/location list fields

Comma-separated inputs give a simple form UX; each save PUTs the
whole profile dict, invalidating the query cache.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 26: Settings Companies page (table with add/edit/delete)

**Files:**
- Modify: `web/src/routes/settings/Companies.tsx`

- [ ] **Step 1: Rewrite `web/src/routes/settings/Companies.tsx`**

```tsx
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2, Plus } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { LoadingState } from "../../components/shared/LoadingState";
import { ErrorState } from "../../components/shared/ErrorState";
import { api } from "../../lib/api-client";

const ATS = ["greenhouse", "ashby", "lever", "workday", "manual", "unknown"];
const PRIORITIES = ["P0", "P1", "P2"];

export default function Companies() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["settings", "companies"],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/settings/companies");
      if (error) throw new Error(error.error?.message || "load failed");
      return data!;
    },
  });

  const [newRow, setNewRow] = useState({ name: "", ats_type: "unknown", priority: "P2" });
  const add = useMutation({
    mutationFn: async () => {
      const { error } = await api.POST("/api/settings/companies", { body: newRow as any });
      if (error) throw new Error(error.error?.message || "add failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings", "companies"] });
      setNewRow({ name: "", ats_type: "unknown", priority: "P2" });
    },
  });

  const patch = useMutation({
    mutationFn: async ({ id, body }: { id: number; body: any }) => {
      const { error } = await api.PATCH("/api/settings/companies/{cid}", {
        params: { path: { cid: id } }, body,
      });
      if (error) throw new Error(error.error?.message || "update failed");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings", "companies"] }),
  });

  const remove = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await api.DELETE("/api/settings/companies/{cid}", {
        params: { path: { cid: id } },
      });
      if (error) throw new Error(error.error?.message || "delete failed");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings", "companies"] }),
  });

  if (q.isLoading) return <LoadingState />;
  if (q.isError) return <ErrorState message={(q.error as Error).message} />;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold tracking-tight">Companies</h2>

      <Card className="flex gap-2 items-end">
        <Input placeholder="Name" value={newRow.name} onChange={(e) => setNewRow({ ...newRow, name: e.target.value })} />
        <Select value={newRow.ats_type} onChange={(e) => setNewRow({ ...newRow, ats_type: e.target.value })}>
          {ATS.map((a) => <option key={a} value={a}>{a}</option>)}
        </Select>
        <Select value={newRow.priority} onChange={(e) => setNewRow({ ...newRow, priority: e.target.value })}>
          {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
        </Select>
        <Button variant="primary" disabled={!newRow.name || add.isPending} onClick={() => add.mutate()}>
          <Plus className="w-3 h-3" /> Add
        </Button>
      </Card>

      <Card className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-widest text-text-muted">
              <th className="text-left px-4 py-3 font-medium">Name</th>
              <th className="text-left px-4 py-3 font-medium">ATS</th>
              <th className="text-left px-4 py-3 font-medium">Token/slug</th>
              <th className="text-left px-4 py-3 font-medium">Priority</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {q.data!.map((c: any) => (
              <tr key={c.id} className="border-t border-border">
                <td className="px-4 py-2 font-medium">{c.name}</td>
                <td className="px-4 py-2 text-text-muted">
                  <Select
                    defaultValue={c.ats_type}
                    onChange={(e) => patch.mutate({ id: c.id, body: { ats_type: e.target.value } })}
                  >
                    {ATS.map((a) => <option key={a} value={a}>{a}</option>)}
                  </Select>
                </td>
                <td className="px-4 py-2 text-text-muted text-xs">
                  {c.board_token || c.org_slug || c.company_slug || "—"}
                </td>
                <td className="px-4 py-2">
                  <Select
                    defaultValue={c.priority}
                    onChange={(e) => patch.mutate({ id: c.id, body: { priority: e.target.value } })}
                  >
                    {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                  </Select>
                </td>
                <td className="px-4 py-2 text-right">
                  <Button size="sm" variant="danger" onClick={() => remove.mutate(c.id)}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

// Badge import retained for future status badges
void Badge;
```

- [ ] **Step 2: Verify build**

Run: `cd web && npm run build && cd ..`
Expected: build passes.

- [ ] **Step 3: Commit**

```bash
git add web/src/routes/settings/Companies.tsx
git commit -m "feat(web): Settings Companies page with inline add/edit/delete

Priority and ats_type Selects fire PATCH on change; DELETE is a soft-delete
via enabled=0 on the backend. Add row at top of table — one click adds.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 27: Settings Scoring page

**Files:**
- Modify: `web/src/routes/settings/Scoring.tsx`

- [ ] **Step 1: Rewrite `web/src/routes/settings/Scoring.tsx`**

```tsx
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";
import { LoadingState } from "../../components/shared/LoadingState";
import { ErrorState } from "../../components/shared/ErrorState";
import { api } from "../../lib/api-client";

export default function Scoring() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["settings", "scoring"],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/settings/scoring");
      if (error) throw new Error(error.error?.message || "load failed");
      return data!;
    },
  });

  const [draft, setDraft] = useState<any>({});
  useEffect(() => {
    if (q.data) setDraft(q.data);
  }, [q.data]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await api.PUT("/api/settings/scoring", { body: draft });
      if (error) throw new Error(error.error?.message || "save failed");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings", "scoring"] }),
  });

  if (q.isLoading) return <LoadingState />;
  if (q.isError) return <ErrorState message={(q.error as Error).message} />;

  function setThreshold(key: "P0" | "P1" | "P2", v: number) {
    setDraft({ ...draft, thresholds: { ...draft.thresholds, [key]: v } });
  }
  function setList(key: string, csv: string) {
    setDraft({ ...draft, [key]: csv.split(",").map((s) => s.trim()).filter(Boolean) });
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <h2 className="text-xl font-semibold tracking-tight">Scoring</h2>

      <Card className="space-y-3">
        <h3 className="text-sm font-semibold">Thresholds</h3>
        {(["P0", "P1", "P2"] as const).map((p) => (
          <div key={p} className="flex items-center gap-3">
            <label className="w-10 text-xs text-text-muted">{p}</label>
            <Input
              type="number"
              value={draft.thresholds?.[p] ?? 0}
              onChange={(e) => setThreshold(p, Number(e.target.value))}
            />
          </div>
        ))}
      </Card>

      <Card className="space-y-3">
        <h3 className="text-sm font-semibold">Keyword lists</h3>
        <label className="block text-xs text-text-muted">Positive keywords</label>
        <Input
          value={(draft.positive_keywords ?? []).join(", ")}
          onChange={(e) => setList("positive_keywords", e.target.value)}
        />
        <label className="block text-xs text-text-muted">Negative keywords (forces Ignore)</label>
        <Input
          value={(draft.negative_keywords ?? []).join(", ")}
          onChange={(e) => setList("negative_keywords", e.target.value)}
        />
      </Card>

      <div className="flex justify-end">
        <Button variant="primary" onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `cd web && npm run build && cd ..`
Expected: build passes.

- [ ] **Step 3: Commit**

```bash
git add web/src/routes/settings/Scoring.tsx
git commit -m "feat(web): Settings Scoring page with thresholds and keyword list editors

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 28: Settings Sources page + YAML import button

**Files:**
- Modify: `web/src/routes/settings/Sources.tsx`

- [ ] **Step 1: Rewrite `web/src/routes/settings/Sources.tsx`**

```tsx
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { LoadingState } from "../../components/shared/LoadingState";
import { ErrorState } from "../../components/shared/ErrorState";
import { api } from "../../lib/api-client";

export default function Sources() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["settings", "sources"],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/settings/sources");
      if (error) throw new Error(error.error?.message || "load failed");
      return data!;
    },
  });

  const [draft, setDraft] = useState<Record<string, any>>({});
  useEffect(() => {
    if (q.data) setDraft(q.data);
  }, [q.data]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await api.PUT("/api/settings/sources", { body: draft });
      if (error) throw new Error(error.error?.message || "save failed");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings", "sources"] }),
  });

  const reimport = useMutation({
    mutationFn: async () => {
      const { error } = await api.POST("/api/settings/import-yaml");
      if (error) throw new Error(error.error?.message || "reimport failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings"] });
    },
  });

  if (q.isLoading) return <LoadingState />;
  if (q.isError) return <ErrorState message={(q.error as Error).message} />;

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-xl font-semibold tracking-tight">Sources</h2>
        <Button variant="secondary" size="sm" onClick={() => reimport.mutate()} disabled={reimport.isPending}>
          <Upload className="w-3 h-3" />
          {reimport.isPending ? "Importing…" : "Re-import YAML"}
        </Button>
      </div>

      <Card className="space-y-3">
        {Object.entries(draft).map(([source, cfg]: [string, any]) => (
          <div key={source} className="flex items-center justify-between">
            <div>
              <div className="font-medium">{source}</div>
              <div className="text-xs text-text-muted">
                {source === "ycombinator"
                  ? "YC Work at a Startup (India filter)"
                  : source === "manual"
                    ? "Paste LinkedIn/Naukri/recruiter posts"
                    : "Public jobs feed"}
              </div>
            </div>
            <label className="text-xs flex items-center gap-2">
              <input
                type="checkbox"
                checked={!!cfg.enabled}
                onChange={(e) =>
                  setDraft({ ...draft, [source]: { ...cfg, enabled: e.target.checked } })
                }
              />
              enabled
            </label>
          </div>
        ))}
      </Card>

      <div className="flex justify-end">
        <Button variant="primary" onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `cd web && npm run build && cd ..`
Expected: build passes.

- [ ] **Step 3: Commit**

```bash
git add web/src/routes/settings/Sources.tsx
git commit -m "feat(web): Settings Sources page with per-source enable toggles + Re-import YAML

Re-import button triggers POST /api/settings/import-yaml — the escape
hatch when UI settings and on-disk YAML fall out of sync.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase E — Cleanup, Docker split, CI, verification

### Task 29: Delete Streamlit — UI code, CLI command, compose service, requirement

**Files:**
- Delete: `app/ui/` (entire directory)
- Modify: `app/main.py` — remove `ui` command
- Modify: `requirements.txt` — already removed in Task 7; verify again

- [ ] **Step 1: Write the failing test — `streamlit` import should fail in backend code**

Add to `tests/test_config_store.py` (or create `tests/test_no_streamlit.py`):
```python
import importlib


def test_streamlit_not_imported_by_app() -> None:
    """Fail if any app module still imports streamlit."""
    import pkgutil
    import app as app_pkg

    failures: list[str] = []
    for mod_info in pkgutil.walk_packages(app_pkg.__path__, prefix="app."):
        try:
            m = importlib.import_module(mod_info.name)
        except ImportError as e:
            if "streamlit" in str(e):
                failures.append(mod_info.name)
    assert failures == [], f"modules still importing streamlit: {failures}"
```

- [ ] **Step 2: Run test to verify its expected state**

Run: `.venv/bin/pytest tests/test_config_store.py::test_streamlit_not_imported_by_app -v`
Expected: PASS already if Task 7 removed streamlit — or FAIL because `app/ui/streamlit_app.py` still imports it.

- [ ] **Step 3: Delete `app/ui/`**

```bash
git rm -r app/ui/
```

- [ ] **Step 4: Remove the `ui` Typer command and its imports from `app/main.py`**

Find the block:
```python
@app.command("ui", help="Launch the Streamlit control panel.")
def ui(...)
```
Delete it. Also remove `import subprocess` if no longer used elsewhere in the file (check first).

- [ ] **Step 5: Uninstall streamlit from venv and confirm**

Run:
```
.venv/bin/pip uninstall -y streamlit
.venv/bin/pip freeze | grep -i streamlit || echo "streamlit not installed"
```
Expected: `streamlit not installed`.

- [ ] **Step 6: Run full test suite**

Run: `.venv/bin/pytest -q`
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add app/main.py tests/test_config_store.py
git commit -m "chore: delete Streamlit UI — React SPA is the sole frontend

- remove app/ui/ (streamlit_app.py + __init__.py)
- drop 'ui' Typer command from app/main.py
- test_streamlit_not_imported_by_app locks in the removal — any future
  accidental import fails CI

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 30: Two-Dockerfile compose stack — `api`, `web`, `cli`

**Files:**
- Delete: `Dockerfile`
- Create: `Dockerfile.api`
- Create: `Dockerfile.web`
- Create: `web/nginx.conf`
- Modify: `docker-compose.yml` — replace services

- [ ] **Step 1: Replace `Dockerfile` with `Dockerfile.api`**

```bash
git mv Dockerfile Dockerfile.api
```

Open `Dockerfile.api` and replace the CMD + port:
```dockerfile
# syntax=docker/dockerfile:1.7
FROM python:3.13-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends tini \
 && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --upgrade pip && pip install -r requirements.txt

COPY app/ ./app/
COPY config/ ./config/
COPY resumes/ ./resumes/
COPY README.md ./

EXPOSE 47131
ENV PYTHONPATH=/app

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["python", "-m", "app.api.main"]
```

- [ ] **Step 2: Create `Dockerfile.web`**

```dockerfile
# syntax=docker/dockerfile:1.7

# ── build stage ─────────────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /web
COPY web/package.json web/package-lock.json* ./
RUN npm install
COPY web/ ./
RUN npm run build

# ── runtime ─────────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runtime
COPY web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /web/dist /usr/share/nginx/html
EXPOSE 47130
CMD ["nginx", "-g", "daemon off;"]
```

- [ ] **Step 3: Create `web/nginx.conf`**

```nginx
server {
    listen 47130;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    # SPA fallback
    location / {
        try_files $uri /index.html;
    }

    # Reverse-proxy /api/* to the api service
    location /api/ {
        proxy_pass http://api:47131;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 180s;   # allow a slow /api/search to finish
        proxy_send_timeout 180s;
    }
}
```

- [ ] **Step 4: Replace `docker-compose.yml` contents**

```yaml
# Usage
#   docker compose build
#   docker compose up -d api web               # UI + API
#   docker compose run --rm cli python -m app.main init-db
#   docker compose run --rm cli python -m app.main import-config
#   docker compose run --rm cli python -m app.main seed-resume
#   docker compose logs -f web api
#   docker compose down

x-api: &api-base
  build:
    context: .
    dockerfile: Dockerfile.api
  image: job-finder-api:latest
  env_file:
    - path: .env
      required: false
  environment:
    CONFIG_DIR: /app/config
    RESUME_DIR: /app/resumes
    SQLITE_DB_PATH: /app/data/job_search.db
    RESUME_MD_PATH: /portfolio/pdfs/resume.md
    RESUME_PDF_PATH: /portfolio/pdfs/resume.pdf
    RESUME_DOCX_PATH: /portfolio/pdfs/resume.docx
  volumes:
    - ./data:/app/data
    - ./config:/app/config
    - ./resumes:/app/resumes
    - ../sathwick-portfolio/public/pdfs:/portfolio/pdfs:ro

services:
  api:
    <<: *api-base
    container_name: job-finder-api
    ports:
      - "47131:47131"
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "python -c \"import urllib.request; urllib.request.urlopen('http://localhost:47131/api/health', timeout=3)\" || exit 1"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 15s

  web:
    build:
      context: .
      dockerfile: Dockerfile.web
    image: job-finder-web:latest
    container_name: job-finder-web
    ports:
      - "47130:47130"
    depends_on:
      api:
        condition: service_healthy
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "wget -q --spider http://localhost:47130/ || exit 1"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s

  cli:
    <<: *api-base
    profiles: ["tasks"]
    container_name: job-finder-cli
    entrypoint: ["/usr/bin/tini", "--"]
    command: ["bash"]
    stdin_open: true
    tty: true
```

- [ ] **Step 5: Build both images**

Run: `docker compose build`
Expected: both images build successfully.

- [ ] **Step 6: Smoke-test the stack**

```
docker compose up -d api web
sleep 8
curl -fsS http://localhost:47131/api/health
curl -fsS http://localhost:47130/ | head -3
docker compose ps
docker compose down
```
Expected: health returns `{"status":"ok", ...}`, web returns the SPA index, both containers show `healthy`.

- [ ] **Step 7: Commit**

```bash
git add Dockerfile.api Dockerfile.web web/nginx.conf docker-compose.yml
git commit -m "build(docker): split into Dockerfile.api + Dockerfile.web; ports 47130/47131

- Dockerfile.api (python 3.13-slim + tini) serves FastAPI on 47131
- Dockerfile.web multi-stage (node 20 build → nginx 1.27 runtime) serves
  the React bundle on 47130; nginx proxies /api/* to the api service
- compose portfolio resume path bind-mounted read-only at /portfolio/pdfs
- web depends_on api service_healthy; both have healthchecks
- cli stays under 'tasks' profile for one-off commands

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 31: `seed-resume` CLI command + companies.yaml additions

**Files:**
- Modify: `app/main.py` — add `seed-resume` command
- Modify: `config/companies.yaml` — append 10 India-first companies
- Modify: `config/sources.yaml` — add `ycombinator` block

- [ ] **Step 1: Write the failing test**

Create `tests/test_seed_resume.py`:
```python
from __future__ import annotations

from pathlib import Path

import pytest
from typer.testing import CliRunner

from app.main import app as cli_app

runner = CliRunner()


def test_seed_resume_no_op_when_not_scaffold(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.chdir(tmp_path)
    (tmp_path / "resumes").mkdir()
    (tmp_path / "resumes" / "master.md").write_text("# Real resume content", encoding="utf-8")
    result = runner.invoke(cli_app, ["seed-resume"])
    assert result.exit_code == 0
    assert (tmp_path / "resumes" / "master.md").read_text() == "# Real resume content"


def test_seed_resume_replaces_scaffold_from_portfolio_md(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.chdir(tmp_path)
    (tmp_path / "resumes").mkdir()
    (tmp_path / "resumes" / "master.md").write_text(
        "# scaffold\n\nReplace this scaffold with your real master resume.", encoding="utf-8"
    )
    portfolio = tmp_path / "portfolio.md"
    portfolio.write_text("# Sathwick — From Portfolio", encoding="utf-8")
    monkeypatch.setenv("RESUME_MD_PATH", str(portfolio))
    result = runner.invoke(cli_app, ["seed-resume"])
    assert result.exit_code == 0
    assert "From Portfolio" in (tmp_path / "resumes" / "master.md").read_text()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/pytest tests/test_seed_resume.py -v`
Expected: FAIL — `No such command 'seed-resume'`.

- [ ] **Step 3: Add `seed-resume` command to `app/main.py`**

```python
SCAFFOLD_MARKER = "Replace this scaffold with your real master resume."


@app.command("seed-resume", help="Seed resumes/master.md from portfolio if still scaffold.")
def seed_resume() -> None:
    from pathlib import Path
    import os

    local = Path("resumes/master.md")
    if not local.exists():
        local.parent.mkdir(parents=True, exist_ok=True)
    else:
        if SCAFFOLD_MARKER not in local.read_text(encoding="utf-8"):
            typer.echo("resumes/master.md is not the scaffold — leaving untouched")
            return

    portfolio_md = os.environ.get("RESUME_MD_PATH", "")
    portfolio_path = Path(portfolio_md) if portfolio_md else None
    if portfolio_path and portfolio_path.is_file():
        local.write_text(portfolio_path.read_text(encoding="utf-8"), encoding="utf-8")
        typer.echo(f"seeded from portfolio: {portfolio_path}")
        return

    typer.echo("no portfolio resume.md found at RESUME_MD_PATH — leaving scaffold in place")
```

- [ ] **Step 4: Update `config/sources.yaml`**

Append:
```yaml
ycombinator:
  enabled: true
```

- [ ] **Step 5: Update `config/companies.yaml`**

Append the 10 YC-ecosystem + India-first companies (do not touch existing entries):
```yaml
  - name: CRED
    ats_type: unknown
    priority: P0
    preferred_locations: [Bengaluru]

  - name: Groww
    ats_type: unknown
    priority: P0
    preferred_locations: [Bengaluru]

  - name: Zerodha
    ats_type: unknown
    priority: P1
    preferred_locations: [Bengaluru]

  - name: Dream11
    ats_type: unknown
    priority: P1
    preferred_locations: [Mumbai]

  - name: Pine Labs
    ats_type: unknown
    priority: P1

  - name: Setu
    ats_type: unknown
    priority: P1
    preferred_locations: [Bengaluru]

  - name: Juspay
    ats_type: unknown
    priority: P1
    preferred_locations: [Bengaluru]

  - name: PostmanLabs
    ats_type: unknown
    priority: P1
    preferred_locations: [Bengaluru, Remote India]

  - name: Hasura
    ats_type: unknown
    priority: P1
    preferred_locations: [Bengaluru, Remote India]

  - name: Freshworks
    ats_type: unknown
    priority: P1
    preferred_locations: [Chennai, Bengaluru]
```

- [ ] **Step 6: Run tests**

Run: `.venv/bin/pytest tests/test_seed_resume.py -v`
Expected: PASS.

Run full suite: `.venv/bin/pytest -q`
Expected: all tests green.

- [ ] **Step 7: Commit**

```bash
git add app/main.py config/sources.yaml config/companies.yaml tests/test_seed_resume.py
git commit -m "feat(cli): add seed-resume command + enable ycombinator + 10 India companies

seed-resume: scaffold-guarded one-time copy from RESUME_MD_PATH →
resumes/master.md; never overwrites user-edited content.
sources.yaml: ycombinator enabled out of the box.
companies.yaml: CRED, Groww, Zerodha, Dream11, Pine Labs, Setu, Juspay,
PostmanLabs, Hasura, Freshworks appended as India-first targets.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 32: CI workflow + README update + end-to-end verification

**Files:**
- Create: `.github/workflows/ci.yml`
- Modify: `README.md`
- Modify: `.github/workflows/daily.yml` — update to run `run-daily` on the api image

- [ ] **Step 1: Create `.github/workflows/ci.yml`**

```yaml
name: ci

on:
  push: { branches: [main] }
  pull_request: {}
  workflow_dispatch: {}

jobs:
  python:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.13"
      - name: Install deps
        run: |
          python -m pip install --upgrade pip
          pip install -r requirements.txt
      - name: Lint
        run: ruff check app tests
      - name: Tests
        run: pytest -q

  web:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.13"
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
          cache-dependency-path: web/package-lock.json
      - name: Install python deps (for OpenAPI regen)
        run: |
          python -m pip install --upgrade pip
          pip install -r requirements.txt
      - name: Install web deps
        working-directory: web
        run: npm install
      - name: Regenerate types from live API
        run: |
          python -m app.api.main &
          APIPID=$!
          for i in 1 2 3 4 5 6 7 8 9 10; do
            curl -fsS http://localhost:47131/api/health && break || sleep 1
          done
          cd web && npx openapi-typescript http://localhost:47131/openapi.json -o src/lib/api-types.ts
          kill $APIPID || true
      - name: Typecheck + build
        working-directory: web
        run: npm run build
      - name: Frontend tests
        working-directory: web
        run: npm test
```

- [ ] **Step 2: Update `.github/workflows/daily.yml` to use the api image and new commands**

Replace the `Run daily pipeline` step with:
```yaml
      - name: Init DB + import config + run daily
        env:
          NOTION_TOKEN: ${{ secrets.NOTION_TOKEN }}
          NOTION_JOBS_DATABASE_ID: ${{ secrets.NOTION_JOBS_DATABASE_ID }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: |
          python -m app.main init-db
          python -m app.main import-config
          python -m app.main run-daily
```

- [ ] **Step 3: Update `README.md`**

Replace the Setup section with a Docker-first v2 flow:
```markdown
## Setup (Docker — recommended)

```bash
# 1. Build both images
docker compose build

# 2. Copy env template (optional — app starts without it)
cp .env.example .env

# 3. Initialize DB + import YAML config + seed resume (one-time)
docker compose run --rm cli python -m app.main init-db
docker compose run --rm cli python -m app.main import-config
docker compose run --rm cli python -m app.main seed-resume

# 4. Launch the stack
docker compose up -d api web
# → UI:    http://localhost:47130
# → API:   http://localhost:47131
# → Docs:  http://localhost:47131/docs
```

### Services

| Service | Purpose | How to invoke |
|---|---|---|
| `api` | FastAPI on :47131 | `docker compose up -d api` |
| `web` | React SPA (nginx) on :47130 | `docker compose up -d web` |
| `cli` | Interactive CLI scratchpad | `docker compose run --rm cli python -m app.main <cmd>` |
```

Remove outdated Streamlit mentions. Keep Notion/Actions/LLM sections.

- [ ] **Step 4: Full end-to-end verification from clean state**

Run:
```bash
docker compose down -v
rm -f data/job_search.db
docker compose build
docker compose run --rm cli python -m app.main init-db
docker compose run --rm cli python -m app.main import-config
docker compose run --rm cli python -m app.main seed-resume
docker compose up -d api web
sleep 8
curl -fsS http://localhost:47131/api/health
curl -fsS http://localhost:47130/
curl -fsS -X POST http://localhost:47131/api/search -H "content-type: application/json" -d '{"use_llm": false}' | python -m json.tool | head -40
```
Expected:
- `api/health` returns `{"status":"ok", ...}`
- `/` serves the React bundle HTML
- `/api/search` returns `{"jobs": [...], "source_stats": {...}, "ran_at": "...", "duration_ms": N}`

- [ ] **Step 5: Run full pytest + web tests**

Run:
```
.venv/bin/pytest -q
cd web && npm test && cd ..
```
Expected: all Python tests green, all Vitest specs green.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/ci.yml .github/workflows/daily.yml README.md
git commit -m "ci+docs: add CI workflow, update daily workflow + README for v2 Docker flow

ci.yml: python job (ruff+pytest) and web job (regen types from live API
+ npm build + npm test).
daily.yml: now runs init-db + import-config + run-daily so scheduled runs
honor the v2 config pipeline.
README: Docker-first v2 commands, services table, removed Streamlit refs.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Self-review

- **Spec coverage** —
  - §4 Architecture → Tasks 7, 15–17, 30 (two Dockerfiles, nginx proxy, ports 47130/47131)
  - §5 Data model → Tasks 1, 2, 3 (applications ALTERs, STATUS_RANK helper, new tables)
  - §6 API surface → Tasks 8, 9, 10, 11, 12, 13, 14 (system/jobs/manual+tailor/search/dashboard/resume/settings)
  - §6.2.1 SearchResult shape → Task 11
  - §6.2.2 UX guardrails → Task 22 (timer, cancel, inputs disabled, error mapping)
  - §7 Frontend architecture → Tasks 15–28 (stack + directory + design tokens + every route)
  - §8.1 + §8.1.1 YC source + 13 fixtures → Task 4
  - §8.2 Scorer harshening → Task 5
  - §8.3 Companies additions → Task 31
  - §9.1–9.3 Resume source + seed → Tasks 6, 31
  - §9.4 Tailor AI-pending → Tasks 10 (API), 20 (UI dialog), 22 (manual add)
  - §10 Testing → pytest & vitest referenced in every task + CI in Task 32
  - §11 Migration path → Task 31 (seed-resume), Task 30 (compose), Task 14 (import-config)
  - §12 Risks → addressed throughout
  - §13 Preserved items → no tasks alter them (confirmed)

- **Placeholder scan** — no TBD/TODO/XXX/FIXME strings. Every code step has complete code.

- **Type consistency** —
  - `STATUS_RANK` defined in Task 2 (Python) and Task 19 (TS `constants.ts`). Names match exactly.
  - `ScoredJobOut` / `JobOut` / `ApplicationOut` / `TailorOut` / `SearchResponse` / `SourceStat` defined in Task 8 (schemas.py); referenced consistently in Tasks 9, 11, 12, 13 and consumed by the generated `api-types.ts` in Task 16.
  - `_to_scored_out` helper defined in Task 9 and imported by Tasks 11, 12.
  - Function `list_scored_with_filters` name used in Tasks 9, 10, 11, 12 — consistent.
  - `next_interview_at` snake_case throughout Python; camelCase NOT used at the API boundary. Frontend passes the same key through `openapi-fetch`.

- **Execution order** —
  - Phase A is fully independent — tests never hit network or UI. Can run in parallel if the backend is sharded across agents.
  - Phase B depends on Phase A (`ConfigStore`, `YCombinatorSource`, `read_resume`, `STATUS_RANK` helpers).
  - Phase C depends on Phase B only via Task 16 (types generation needs a running API with all routes).
  - Phase D depends on Phase C (UI primitives + types).
  - Phase E depends on everything before it.

- **Commit cadence** — every task ends in a commit. 32 tasks → 32 commits, one logical unit each, matching the user's project commit rule.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-05-v2-react-spa-and-india-sources.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
