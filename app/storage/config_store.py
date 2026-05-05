"""CRUD for v2 config tables: settings, companies_cfg, scoring_cfg, sources_cfg, search_stats.

Uses the same DB file as SQLiteStore. Kept as a sibling class (not a method on SQLiteStore)
so the config surface can evolve without touching job storage.

Note: the search_stats table itself is created by SQLiteStore.init_schema() (Task 1).
ConfigStore only provides CRUD helpers against it — it does NOT re-declare the schema.
"""
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
        self.db_path.parent.mkdir(parents=True, exist_ok=True)

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

    # ── has_* presence helpers (source-of-truth semantics) ───────────────
    # The resolver needs to distinguish "user hasn't seeded this config
    # table" (fall back to YAML) from "user seeded it and chose to disable
    # everything" (trust the empty state). get_* returning {} is ambiguous,
    # so these presence helpers look at the raw rows.
    def has_profile(self) -> bool:
        with self._conn() as c:
            row = c.execute(
                "SELECT 1 FROM settings WHERE key = 'profile' LIMIT 1"
            ).fetchone()
        return row is not None

    def has_scoring(self) -> bool:
        with self._conn() as c:
            row = c.execute("SELECT 1 FROM scoring_cfg LIMIT 1").fetchone()
        return row is not None

    def has_sources(self) -> bool:
        with self._conn() as c:
            row = c.execute("SELECT 1 FROM sources_cfg LIMIT 1").fetchone()
        return row is not None

    def has_companies(self) -> bool:
        """True if the companies table has *any* row — including disabled.
        Lets ``resolve_companies`` treat 'user disabled everything' as an
        intentional empty list instead of resurrecting the YAML seed."""
        with self._conn() as c:
            row = c.execute("SELECT 1 FROM companies_cfg LIMIT 1").fetchone()
        return row is not None

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
                    row["name"],
                    row.get("careers_url"),
                    row.get("ats_type", "unknown"),
                    row.get("board_token"),
                    row.get("org_slug"),
                    row.get("company_slug"),
                    json.dumps(row.get("preferred_locations") or []),
                    row.get("priority", "P2"),
                    row.get("notes"),
                    utcnow_iso(),
                ),
            )
            rowid = cur.lastrowid
        assert rowid is not None, "INSERT into AUTOINCREMENT PK must populate lastrowid"
        return rowid

    def list_companies(self, include_disabled: bool = False) -> list[dict]:
        sql = "SELECT * FROM companies_cfg"
        if not include_disabled:
            sql += " WHERE enabled=1"
        sql += " ORDER BY name COLLATE NOCASE"
        with self._conn() as c:
            rows = c.execute(sql).fetchall()
        out: list[dict] = []
        for r in rows:
            d = dict(r)
            d["preferred_locations"] = json.loads(d["preferred_locations"] or "[]")
            d["enabled"] = bool(d["enabled"])
            out.append(d)
        return out

    def update_company(self, cid: int, patch: dict) -> None:
        cols: list[str] = []
        vals: list[Any] = []
        for k in (
            "name",
            "careers_url",
            "ats_type",
            "board_token",
            "org_slug",
            "company_slug",
            "priority",
            "notes",
        ):
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
        "thresholds",
        "positive_keywords",
        "negative_keywords",
        "location_boosts",
        "domain_boosts",
        "company_boosts",
        "source_quality_boosts",
        "resume_variant_rules",
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
            rows = c.execute(
                "SELECT source, enabled, options_json FROM sources_cfg"
            ).fetchall()
        out: dict[str, dict] = {}
        for r in rows:
            cfg = json.loads(r["options_json"] or "{}")
            cfg["enabled"] = bool(r["enabled"])
            out[r["source"]] = cfg
        return out

    # ── search_stats ─────────────────────────────────────────────────────
    def append_search_stat(
        self,
        *,
        source: str,
        fetched: int,
        kept: int,
        duration_ms: int,
        error: str | None,
    ) -> None:
        with self._conn() as c:
            c.execute(
                """INSERT INTO search_stats (ran_at, source, fetched, kept, duration_ms, error)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (utcnow_iso(), source, fetched, kept, duration_ms, error),
            )

    def recent_search_stats(self, limit: int = 20) -> list[dict]:
        with self._conn() as c:
            rows = c.execute(
                "SELECT * FROM search_stats ORDER BY ran_at DESC LIMIT ?",
                (limit,),
            ).fetchall()
        return [dict(r) for r in rows]

    def latest_per_source(self) -> dict[str, dict]:
        with self._conn() as c:
            rows = c.execute(
                """SELECT s.* FROM search_stats s
                   WHERE s.id = (
                       SELECT MAX(id) FROM search_stats WHERE source = s.source
                   )"""
            ).fetchall()
        return {r["source"]: dict(r) for r in rows}
