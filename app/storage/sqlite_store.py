"""SQLite implementation of Store. Source of truth for all app state."""
from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterable, Iterator, Optional

from ..models import (
    ApplicationStatus,
    EmailEvent,
    Job,
    Priority,
    ScoredJob,
)
from ..utils import get_logger, utcnow_iso
from .base import Store

log = get_logger("storage.sqlite")


SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS jobs (
    id           TEXT PRIMARY KEY,
    role         TEXT NOT NULL,
    company      TEXT NOT NULL,
    url          TEXT NOT NULL,
    source       TEXT NOT NULL,
    location     TEXT,
    remote_type  TEXT,
    posted_date  TEXT,
    description  TEXT,
    notes        TEXT,
    raw_json     TEXT,
    found_at     TEXT NOT NULL,
    updated_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_jobs_company ON jobs(company);
CREATE INDEX IF NOT EXISTS idx_jobs_source  ON jobs(source);

CREATE TABLE IF NOT EXISTS scored_jobs (
    job_id                        TEXT PRIMARY KEY REFERENCES jobs(id),
    fit_score                     INTEGER NOT NULL,
    priority                      TEXT NOT NULL,
    level_match                   TEXT,
    matched_skills_json           TEXT,
    missing_skills_json           TEXT,
    reasons_json                  TEXT,
    risks_json                    TEXT,
    recommended_resume_variant    TEXT,
    next_action                   TEXT,
    scored_at                     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_scored_priority ON scored_jobs(priority);
CREATE INDEX IF NOT EXISTS idx_scored_score    ON scored_jobs(fit_score);

CREATE TABLE IF NOT EXISTS applications (
    job_id       TEXT PRIMARY KEY REFERENCES jobs(id),
    status       TEXT NOT NULL,
    notes        TEXT,
    updated_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS email_events (
    id              TEXT PRIMARY KEY,
    received_at     TEXT NOT NULL,
    sender          TEXT,
    subject         TEXT,
    snippet         TEXT,
    classification  TEXT,
    matched_job_id  TEXT
);

CREATE TABLE IF NOT EXISTS sync_state (
    job_id       TEXT NOT NULL,
    target       TEXT NOT NULL,
    external_id  TEXT,
    extra_json   TEXT,
    updated_at   TEXT NOT NULL,
    PRIMARY KEY (job_id, target)
);

CREATE TABLE IF NOT EXISTS runs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    ran_at     TEXT NOT NULL
);
"""


class SQLiteStore(Store):
    def __init__(self, db_path: Path):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)

    @contextmanager
    def _conn(self) -> Iterator[sqlite3.Connection]:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        try:
            conn.execute("PRAGMA foreign_keys = ON;")
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    # -- schema -------------------------------------------------------------
    def init_schema(self) -> None:
        with self._conn() as c:
            c.executescript(SCHEMA_SQL)
        log.info("sqlite schema initialized at %s", self.db_path)

    # -- jobs ---------------------------------------------------------------
    def upsert_jobs(self, jobs: Iterable[Job]) -> int:
        now = utcnow_iso()
        rows = [
            (
                j.id,
                j.role,
                j.company,
                j.url,
                j.source,
                j.location,
                j.remote_type,
                j.posted_date,
                j.description,
                j.notes,
                json.dumps(j.raw, ensure_ascii=False, default=str),
                now,
                now,
            )
            for j in jobs
        ]
        if not rows:
            return 0
        sql = """
        INSERT INTO jobs
            (id, role, company, url, source, location, remote_type, posted_date,
             description, notes, raw_json, found_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            role        = excluded.role,
            company     = excluded.company,
            url         = excluded.url,
            source      = excluded.source,
            location    = COALESCE(excluded.location, jobs.location),
            remote_type = COALESCE(excluded.remote_type, jobs.remote_type),
            posted_date = COALESCE(excluded.posted_date, jobs.posted_date),
            description = COALESCE(excluded.description, jobs.description),
            notes       = COALESCE(excluded.notes, jobs.notes),
            raw_json    = excluded.raw_json,
            updated_at  = excluded.updated_at;
        """
        with self._conn() as c:
            c.executemany(sql, rows)
        return len(rows)

    def get_job(self, job_id: str) -> Optional[Job]:
        with self._conn() as c:
            row = c.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
        return _row_to_job(row) if row else None

    # -- scored -------------------------------------------------------------
    def upsert_scored_jobs(self, scored: Iterable[ScoredJob]) -> int:
        now = utcnow_iso()
        rows = [
            (
                s.job.id,
                int(s.fit_score),
                str(s.priority),
                s.level_match,
                json.dumps(s.matched_skills),
                json.dumps(s.missing_skills),
                json.dumps(s.reasons),
                json.dumps(s.risks),
                s.recommended_resume_variant,
                s.next_action,
                now,
            )
            for s in scored
        ]
        if not rows:
            return 0
        sql = """
        INSERT INTO scored_jobs
            (job_id, fit_score, priority, level_match,
             matched_skills_json, missing_skills_json, reasons_json, risks_json,
             recommended_resume_variant, next_action, scored_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(job_id) DO UPDATE SET
            fit_score                   = excluded.fit_score,
            priority                    = excluded.priority,
            level_match                 = excluded.level_match,
            matched_skills_json         = excluded.matched_skills_json,
            missing_skills_json         = excluded.missing_skills_json,
            reasons_json                = excluded.reasons_json,
            risks_json                  = excluded.risks_json,
            recommended_resume_variant  = excluded.recommended_resume_variant,
            next_action                 = excluded.next_action,
            scored_at                   = excluded.scored_at;
        """
        with self._conn() as c:
            c.executemany(sql, rows)
        return len(rows)

    def get_scored_jobs(self, priorities: Optional[list[str]] = None) -> list[ScoredJob]:
        sql = """
        SELECT j.*,
               s.fit_score, s.priority, s.level_match,
               s.matched_skills_json, s.missing_skills_json, s.reasons_json, s.risks_json,
               s.recommended_resume_variant, s.next_action
        FROM scored_jobs s
        JOIN jobs j ON j.id = s.job_id
        """
        params: tuple = ()
        if priorities:
            placeholders = ",".join(["?"] * len(priorities))
            sql += f" WHERE s.priority IN ({placeholders})"
            params = tuple(priorities)
        sql += " ORDER BY s.fit_score DESC, j.company ASC"
        with self._conn() as c:
            rows = c.execute(sql, params).fetchall()
        return [_row_to_scored(r) for r in rows]

    # -- applications -------------------------------------------------------
    def set_application_status(
        self, job_id: str, status: ApplicationStatus, notes: str | None = None
    ) -> None:
        now = utcnow_iso()
        sql = """
        INSERT INTO applications (job_id, status, notes, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(job_id) DO UPDATE SET
            status = excluded.status,
            notes  = COALESCE(excluded.notes, applications.notes),
            updated_at = excluded.updated_at;
        """
        with self._conn() as c:
            c.execute(sql, (job_id, str(status), notes, now))

    # -- email events -------------------------------------------------------
    def record_email_event(self, event: EmailEvent) -> None:
        sql = """
        INSERT OR REPLACE INTO email_events
            (id, received_at, sender, subject, snippet, classification, matched_job_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """
        with self._conn() as c:
            c.execute(
                sql,
                (
                    event.id,
                    event.received_at,
                    event.sender,
                    event.subject,
                    event.snippet,
                    event.classification,
                    event.matched_job_id,
                ),
            )

    # -- sync state ---------------------------------------------------------
    def set_sync_state(
        self, job_id: str, target: str, external_id: str, extra: str | None = None
    ) -> None:
        now = utcnow_iso()
        sql = """
        INSERT INTO sync_state (job_id, target, external_id, extra_json, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(job_id, target) DO UPDATE SET
            external_id = excluded.external_id,
            extra_json  = excluded.extra_json,
            updated_at  = excluded.updated_at;
        """
        with self._conn() as c:
            c.execute(sql, (job_id, target, external_id, extra, now))

    def get_sync_state(self, job_id: str, target: str) -> Optional[dict]:
        with self._conn() as c:
            row = c.execute(
                "SELECT * FROM sync_state WHERE job_id = ? AND target = ?",
                (job_id, target),
            ).fetchone()
        return dict(row) if row else None

    # -- runs ---------------------------------------------------------------
    def mark_run(self) -> None:
        with self._conn() as c:
            c.execute("INSERT INTO runs (ran_at) VALUES (?)", (utcnow_iso(),))

    def last_run_at(self) -> Optional[str]:
        with self._conn() as c:
            row = c.execute("SELECT MAX(ran_at) AS t FROM runs").fetchone()
        return row["t"] if row and row["t"] else None

    # -- counts (for UI dashboard) -----------------------------------------
    def count_by_priority(self) -> dict[str, int]:
        with self._conn() as c:
            rows = c.execute(
                "SELECT priority, COUNT(*) AS n FROM scored_jobs GROUP BY priority"
            ).fetchall()
        return {r["priority"]: r["n"] for r in rows}

    def total_jobs(self) -> int:
        with self._conn() as c:
            row = c.execute("SELECT COUNT(*) AS n FROM jobs").fetchone()
        return int(row["n"]) if row else 0


# ---------------------------------------------------------------------------
# row → model helpers
# ---------------------------------------------------------------------------
def _row_to_job(row: sqlite3.Row) -> Job:
    raw: dict = {}
    if row["raw_json"]:
        try:
            raw = json.loads(row["raw_json"])
        except json.JSONDecodeError:
            raw = {}
    return Job(
        id=row["id"],
        role=row["role"],
        company=row["company"],
        url=row["url"],
        source=row["source"],
        location=row["location"],
        remote_type=row["remote_type"],
        posted_date=row["posted_date"],
        description=row["description"],
        notes=row["notes"],
        raw=raw,
    )


def _row_to_scored(row: sqlite3.Row) -> ScoredJob:
    job = _row_to_job(row)

    def _load(col: str) -> list:
        v = row[col]
        if not v:
            return []
        try:
            return list(json.loads(v))
        except json.JSONDecodeError:
            return []

    return ScoredJob(
        job=job,
        fit_score=row["fit_score"],
        priority=Priority(row["priority"]),
        level_match=row["level_match"] or "",
        matched_skills=_load("matched_skills_json"),
        missing_skills=_load("missing_skills_json"),
        reasons=_load("reasons_json"),
        risks=_load("risks_json"),
        recommended_resume_variant=row["recommended_resume_variant"],
        next_action=row["next_action"] or "",
    )
