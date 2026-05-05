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
        self._migrate_applications_columns()
        log.info("sqlite schema initialized at %s", self.db_path)

    def _migrate_applications_columns(self) -> None:
        """Idempotent ALTER — add interview + lifecycle columns if missing."""
        needed = {
            "next_interview_at": "TEXT",
            "interview_notes":   "TEXT",
            "applied_at":        "TEXT",
            "rejected_at":       "TEXT",
        }
        with self._conn() as c:
            existing = {
                row["name"]
                for row in c.execute("PRAGMA table_info(applications)").fetchall()
            }
            for col, coltype in needed.items():
                if col not in existing:
                    c.execute(
                        f"ALTER TABLE applications ADD COLUMN {col} {coltype}"
                    )

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

    # -- rich query + application setters (Task 9) -------------------------
    def list_scored_with_filters(
        self,
        *,
        priorities: Optional[list[str]] = None,
        statuses: Optional[list[str]] = None,
        company: Optional[str] = None,
        source: Optional[str] = None,
        remote_type: Optional[str] = None,
        location_contains: Optional[str] = None,
        q: Optional[str] = None,
        sort: str = "status_rank",
        limit: int = 500,
        offset: int = 0,
    ) -> list[tuple[ScoredJob, Optional[dict]]]:
        """JOIN scored_jobs + jobs LEFT JOIN applications with filters.

        Default sort pins Interviewing/Recruiter-reply rows to the top via
        the STATUS_RANK CASE expression, then sorts by upcoming-interview
        ascending (NULLs last), then by fit_score desc, then found_at desc.
        """
        status_case = _status_rank_case_sql()
        sql = f"""
        SELECT j.*,
               s.fit_score, s.priority, s.level_match,
               s.matched_skills_json, s.missing_skills_json, s.reasons_json, s.risks_json,
               s.recommended_resume_variant, s.next_action,
               applications.status AS app_status, applications.notes AS app_notes,
               applications.next_interview_at, applications.interview_notes,
               applications.applied_at, applications.rejected_at,
               applications.updated_at AS app_updated_at,
               ({status_case}) AS status_rank
        FROM scored_jobs s
        JOIN jobs j ON j.id = s.job_id
        LEFT JOIN applications ON applications.job_id = s.job_id
        WHERE 1=1
        """
        params: list = []
        if priorities:
            sql += f" AND s.priority IN ({','.join(['?'] * len(priorities))})"
            params += priorities
        if statuses:
            sql += (
                f" AND COALESCE(applications.status, 'Found') IN"
                f" ({','.join(['?'] * len(statuses))})"
            )
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
            sql += (
                " AND (LOWER(j.role) LIKE ? OR LOWER(j.company) LIKE ?"
                " OR LOWER(j.description) LIKE ?)"
            )
            needle = f"%{q.lower()}%"
            params += [needle, needle, needle]

        if sort == "fit":
            sql += " ORDER BY s.fit_score DESC, j.found_at DESC"
        elif sort == "found_at":
            sql += " ORDER BY j.found_at DESC"
        else:
            sql += (
                " ORDER BY status_rank ASC,"
                " applications.next_interview_at ASC NULLS LAST,"
                " s.fit_score DESC, j.found_at DESC"
            )
        sql += " LIMIT ? OFFSET ?"
        params += [limit, offset]

        with self._conn() as c:
            rows = c.execute(sql, params).fetchall()

        out: list[tuple[ScoredJob, Optional[dict]]] = []
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

    def get_application(self, job_id: str) -> Optional[dict]:
        with self._conn() as c:
            row = c.execute(
                "SELECT * FROM applications WHERE job_id = ?", (job_id,)
            ).fetchone()
        return dict(row) if row else None

    def get_scored_by_id(self, job_id: str) -> Optional[ScoredJob]:
        """Return the ScoredJob for one job_id, or None if not scored.

        O(1) lookup by primary key; use this instead of filtering the full list
        when you only need one row."""
        sql = """
        SELECT j.*,
               s.fit_score, s.priority, s.level_match,
               s.matched_skills_json, s.missing_skills_json, s.reasons_json, s.risks_json,
               s.recommended_resume_variant, s.next_action
        FROM scored_jobs s
        JOIN jobs j ON j.id = s.job_id
        WHERE s.job_id = ?
        """
        with self._conn() as c:
            row = c.execute(sql, (job_id,)).fetchone()
        return _row_to_scored(row) if row else None

    def set_application_status_rich(
        self,
        job_id: str,
        status: ApplicationStatus,
        *,
        notes: Optional[str] = None,
        next_interview_at: Optional[str] = None,
        interview_notes: Optional[str] = None,
    ) -> None:
        """UPSERT applications row with lifecycle-timestamp stamping.

        `applied_at` is stamped when the transition lands on "Applied";
        `rejected_at` on "Rejected". Both use COALESCE so once stamped
        they persist across subsequent PATCHes."""
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
            c.execute(
                sql,
                (
                    job_id,
                    status_str,
                    notes,
                    next_interview_at,
                    interview_notes,
                    applied_at,
                    rejected_at,
                    now,
                ),
            )

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
