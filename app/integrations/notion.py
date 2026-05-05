"""Optional Notion sync for scored jobs.

This module expects a pre-existing Notion database shared with your
integration. We do NOT auto-create the database in v1 — on schema
mismatch we print the required properties clearly so the user can fix
the database by hand.

Property mapping (all lowercase keys in Notion):
    Role            title
    Company         rich_text
    URL             url
    Source          select
    Status          select
    Priority        select
    Fit Score       number
    Level Match     select
    Location        rich_text
    Remote Type     select
    Posted Date     date
    Found Date      date
    Resume Variant  select
    JD Summary      rich_text
    Matched Skills  multi_select
    Missing Skills  multi_select
    Next Action     rich_text
    Notes           rich_text
"""
from __future__ import annotations

from typing import Any, Optional

from ..config import Settings
from ..models import ApplicationStatus, Priority, ScoredJob
from ..storage import SQLiteStore
from ..utils import get_logger, truncate

log = get_logger("integrations.notion")

TARGET = "notion"


def _query_notion_page_by_url(client: Any, db_id: str, url: str) -> Optional[str]:
    """Return the Notion page id whose URL property equals ``url``, or None.

    Stateless GitHub Actions runs start with an empty SQLite sync_state,
    so relying on ``get_sync_state`` alone would create duplicate pages on
    every run. Falling back to a filter query makes the sync idempotent
    across fresh environments; we then write the page id back to
    ``sync_state`` so subsequent runs skip the round-trip."""
    if not url:
        return None
    try:
        resp = client.databases.query(
            database_id=db_id,
            filter={"property": "URL", "url": {"equals": url}},
            page_size=1,
        )
    except Exception as e:  # noqa: BLE001 — tolerate any client failure
        log.warning("notion lookup by URL failed for %s: %s", url, e)
        return None
    results = resp.get("results") or []
    if not results:
        return None
    return results[0].get("id")


def _mk_title(text: str) -> dict[str, Any]:
    return {"title": [{"type": "text", "text": {"content": truncate(text, 2000)}}]}


def _mk_rich(text: str | None) -> dict[str, Any]:
    if not text:
        return {"rich_text": []}
    return {"rich_text": [{"type": "text", "text": {"content": truncate(text, 1900)}}]}


def _mk_select(name: str | None) -> dict[str, Any]:
    if not name:
        return {"select": None}
    return {"select": {"name": truncate(name, 95)}}


def _mk_multi(items: list[str]) -> dict[str, Any]:
    return {
        "multi_select": [
            {"name": truncate(i, 95)} for i in (items or []) if i
        ][:20]
    }


def _mk_url(u: str | None) -> dict[str, Any]:
    return {"url": u or None}


def _mk_number(n: int | None) -> dict[str, Any]:
    return {"number": int(n) if n is not None else None}


def _mk_date(iso_date: str | None) -> dict[str, Any]:
    if not iso_date:
        return {"date": None}
    return {"date": {"start": iso_date[:10]}}


def _properties_for(
    scored: ScoredJob, status: ApplicationStatus, found_date: str | None
) -> dict[str, Any]:
    return {
        "Role": _mk_title(scored.job.role),
        "Company": _mk_rich(scored.job.company),
        "URL": _mk_url(scored.job.url),
        "Source": _mk_select(scored.job.source),
        "Status": _mk_select(str(status)),
        "Priority": _mk_select(str(scored.priority)),
        "Fit Score": _mk_number(scored.fit_score),
        "Level Match": _mk_select(scored.level_match or None),
        "Location": _mk_rich(scored.job.location),
        "Remote Type": _mk_select(scored.job.remote_type),
        "Posted Date": _mk_date(scored.job.posted_date),
        "Found Date": _mk_date(found_date),
        "Resume Variant": _mk_select(scored.recommended_resume_variant),
        "JD Summary": _mk_rich(truncate(scored.job.description, 1800)),
        "Matched Skills": _mk_multi(scored.matched_skills),
        "Missing Skills": _mk_multi(scored.missing_skills),
        "Next Action": _mk_rich(scored.next_action),
        "Notes": _mk_rich(scored.job.notes),
    }


def sync_scored_jobs(
    scored: list[ScoredJob],
    settings: Settings,
    store: SQLiteStore,
    priorities: list[str] | None = None,
) -> dict[str, int]:
    """Sync P0/P1/P2 scored jobs to Notion.

    Idempotency strategy:

    1. Look up ``sync_state`` first (fast path; covers rooted local runs).
    2. Fall back to querying Notion by URL (covers stateless GH Actions
       runs where sync_state is empty every time). Writeback the page id
       so later stages skip the query.
    3. Otherwise create a new page.

    Status/found-date are read from the real applications + jobs tables
    instead of hardcoding ``Found`` — so a job you've moved to
    ``Interviewing`` reflects that in Notion.

    Returns counts::

        {"created": N, "updated": M, "failed": K, "skipped": S}

    ``failed > 0`` means the caller should exit nonzero. On schema mismatch
    or total inability to retrieve the database, returns
    ``{"error": 1, ...}`` with the same exit-code semantics.
    """
    if not settings.notion_enabled:
        log.info("notion sync skipped (credentials not set)")
        return {"skipped": len(scored), "created": 0, "updated": 0, "failed": 0}

    try:
        from notion_client import Client  # lazy import
        from notion_client.errors import APIResponseError
    except ImportError:
        log.warning("notion-client not installed; skipping sync")
        return {"skipped": len(scored), "created": 0, "updated": 0, "failed": 0}

    client = Client(auth=settings.notion_token)
    db_id = settings.notion_jobs_database_id

    # Sanity check DB schema before doing work.
    try:
        meta = client.databases.retrieve(database_id=db_id)
    except APIResponseError as e:
        log.error("could not retrieve Notion database %s: %s", db_id, e)
        _print_required_properties()
        return {"error": 1, "created": 0, "updated": 0, "failed": 0}

    schema_keys = set(meta.get("properties", {}).keys())
    missing = [k for k in _REQUIRED_PROPS if k not in schema_keys]
    if missing:
        log.error("Notion DB is missing properties: %s", ", ".join(missing))
        _print_required_properties()
        return {"error": 1, "created": 0, "updated": 0, "failed": 0}

    wanted = priorities or [Priority.P0.value, Priority.P1.value, Priority.P2.value]
    targets = [s for s in scored if s.priority.value in wanted]

    created = 0
    updated = 0
    failed = 0
    for s in targets:
        app_row = store.get_application(s.job.id)
        status = (
            ApplicationStatus(app_row["status"])
            if app_row and app_row.get("status")
            else ApplicationStatus.FOUND
        )
        job = store.get_job(s.job.id)
        # `jobs.found_at` is set at insert time and never moves.
        raw_found = None
        if job is not None:
            raw_found = getattr(job, "found_at", None)
        if raw_found is None:
            # Fall back to the joined row surface exposed via sync_state or raw lookups.
            with store._conn() as c:
                row = c.execute(
                    "SELECT found_at FROM jobs WHERE id = ?", (s.job.id,)
                ).fetchone()
            raw_found = row["found_at"] if row else None
        props = _properties_for(s, status, found_date=raw_found)

        # Resolve page id via sync_state → Notion URL lookup → create.
        page_id: Optional[str] = None
        existing = store.get_sync_state(s.job.id, TARGET)
        if existing and existing.get("external_id"):
            page_id = existing["external_id"]
        else:
            page_id = _query_notion_page_by_url(client, db_id, s.job.url)
            if page_id:
                # Remember for later runs even if this run is stateless.
                store.set_sync_state(s.job.id, TARGET, page_id)

        try:
            if page_id:
                client.pages.update(page_id=page_id, properties=props)
                updated += 1
            else:
                page = client.pages.create(
                    parent={"database_id": db_id}, properties=props
                )
                store.set_sync_state(s.job.id, TARGET, page["id"])
                created += 1
        except APIResponseError as e:
            log.warning(
                "notion sync failed for %s @ %s: %s", s.job.role, s.job.company, e
            )
            failed += 1
    log.info(
        "notion sync done: created=%d updated=%d failed=%d", created, updated, failed
    )
    return {
        "created": created,
        "updated": updated,
        "failed": failed,
        "skipped": 0,
    }


_REQUIRED_PROPS = [
    "Role",
    "Company",
    "URL",
    "Source",
    "Status",
    "Priority",
    "Fit Score",
    "Level Match",
    "Location",
    "Remote Type",
    "Posted Date",
    "Found Date",
    "Resume Variant",
    "JD Summary",
    "Matched Skills",
    "Missing Skills",
    "Next Action",
    "Notes",
]


def _print_required_properties() -> None:
    print(
        "\nNotion database schema (v1 expected properties):\n"
        "  - Role (title)\n"
        "  - Company (rich_text)\n"
        "  - URL (url)\n"
        "  - Source (select)\n"
        "  - Status (select)\n"
        "  - Priority (select: P0/P1/P2/Ignore)\n"
        "  - Fit Score (number)\n"
        "  - Level Match (select)\n"
        "  - Location (rich_text)\n"
        "  - Remote Type (select)\n"
        "  - Posted Date (date)\n"
        "  - Found Date (date)\n"
        "  - Resume Variant (select)\n"
        "  - JD Summary (rich_text)\n"
        "  - Matched Skills (multi_select)\n"
        "  - Missing Skills (multi_select)\n"
        "  - Next Action (rich_text)\n"
        "  - Notes (rich_text)\n"
    )
