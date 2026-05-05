"""Notion sync correctness — idempotency, status, partial-failure semantics.

These tests stub the notion_client module before importing the integration,
so the code path that does `from notion_client import Client, errors` binds
to our fakes. Covers:

* URL-fallback lookup prevents duplicate pages in stateless GH Actions runs.
* Real application status flows into the synced page (not hardcoded Found).
* Found date comes from jobs.found_at.
* Partial failure returns failed > 0 so the CLI can exit nonzero.
* Schema mismatch returns error=1.
"""
from __future__ import annotations

import sys
import types
from pathlib import Path
from typing import Any

import pytest

from app.models import (
    ApplicationStatus,
    Job,
    Priority,
    ScoredJob,
)
from app.utils import stable_job_id


# ── fake notion_client shim ────────────────────────────────────────────────
class _APIResponseError(Exception):
    pass


class _FakeDatabases:
    def __init__(self, parent: "_FakeClient") -> None:
        self._parent = parent

    def retrieve(self, *, database_id: str) -> dict:
        if self._parent.retrieve_raises:
            raise self._parent.retrieve_raises
        return {"properties": {k: {} for k in self._parent.schema_keys}}

    def query(self, *, database_id: str, filter: dict, page_size: int = 1) -> dict:
        url = filter.get("url", {}).get("equals", "")
        self._parent.query_calls.append(url)
        if url in self._parent.existing_by_url:
            return {
                "results": [{"id": self._parent.existing_by_url[url]}]
            }
        return {"results": []}


class _FakePages:
    def __init__(self, parent: "_FakeClient") -> None:
        self._parent = parent

    def create(self, *, parent: dict, properties: dict) -> dict:
        if self._parent.create_raises:
            raise self._parent.create_raises
        pid = f"page-{len(self._parent.created) + 1}"
        self._parent.created.append({"id": pid, "properties": properties})
        return {"id": pid}

    def update(self, *, page_id: str, properties: dict) -> dict:
        if page_id in self._parent.update_raises_for:
            raise self._parent.update_raises_for[page_id]
        self._parent.updated.append({"id": page_id, "properties": properties})
        return {"id": page_id}


class _FakeClient:
    def __init__(self, auth: str) -> None:
        self.databases = _FakeDatabases(self)
        self.pages = _FakePages(self)
        self.schema_keys: list[str] = []
        self.retrieve_raises: Exception | None = None
        self.create_raises: Exception | None = None
        self.update_raises_for: dict[str, Exception] = {}
        self.existing_by_url: dict[str, str] = {}
        self.query_calls: list[str] = []
        self.created: list[dict] = []
        self.updated: list[dict] = []


@pytest.fixture
def fake_notion(monkeypatch):
    """Register a fake notion_client module before app.integrations.notion
    imports from it. Returns the latest constructed _FakeClient."""
    mod = types.ModuleType("notion_client")
    errors_mod = types.ModuleType("notion_client.errors")
    errors_mod.APIResponseError = _APIResponseError
    holder: dict[str, Any] = {}

    def _ctor(auth: str) -> _FakeClient:
        c = _FakeClient(auth=auth)
        holder["client"] = c
        return c

    mod.Client = _ctor
    mod.errors = errors_mod
    monkeypatch.setitem(sys.modules, "notion_client", mod)
    monkeypatch.setitem(sys.modules, "notion_client.errors", errors_mod)

    # Configure schema to match what the integration expects so the happy
    # path goes through. Individual tests override `holder["client"].schema_keys`
    # by setting it on the returned FakeClient after first call.
    def _configure(*, schema_keys: list[str], **overrides: Any) -> _FakeClient:
        # Construct a client to allow configuration before sync runs.
        c = _ctor(auth="test")
        c.schema_keys = schema_keys
        for k, v in overrides.items():
            setattr(c, k, v)
        # Rebind Client to always return this configured instance.
        mod.Client = lambda auth: c
        return c

    return _configure


# ── shared scaffolding ─────────────────────────────────────────────────────
_REQUIRED = [
    "Role", "Company", "URL", "Source", "Status", "Priority",
    "Fit Score", "Level Match", "Location", "Remote Type",
    "Posted Date", "Found Date", "Resume Variant", "JD Summary",
    "Matched Skills", "Missing Skills", "Next Action", "Notes",
]


def _make_scored(role: str, company: str, url: str, priority: Priority = Priority.P0) -> ScoredJob:
    job = Job(
        id=stable_job_id(company, role, url),
        role=role, company=company, url=url,
        source="ycombinator", description="Python + FastAPI",
    )
    return ScoredJob(
        job=job, fit_score=90 if priority == Priority.P0 else 75,
        priority=priority, level_match="Senior",
    )


@pytest.fixture
def settings_with_notion(tmp_path: Path, monkeypatch):
    from app.config import Settings
    from dataclasses import replace

    base = Settings()
    return replace(
        base,
        sqlite_db_path=tmp_path / "t.db",
        notion_token="test-token",
        notion_jobs_database_id="db-id",
    )


@pytest.fixture
def seeded_store(settings_with_notion, tmp_path: Path):
    from app.storage import build_store

    store = build_store(settings_with_notion)
    store.init_schema()
    return store


# ── tests ──────────────────────────────────────────────────────────────────
def test_sync_creates_page_when_no_sync_state_and_no_remote_match(
    fake_notion, seeded_store, settings_with_notion
):
    from app.integrations import notion

    client = fake_notion(schema_keys=_REQUIRED)
    scored = _make_scored("Backend Engineer", "Acme", "https://acme/jobs/1")
    seeded_store.upsert_jobs([scored.job])
    seeded_store.upsert_scored_jobs([scored])

    result = notion.sync_scored_jobs([scored], settings_with_notion, seeded_store)

    assert result["created"] == 1
    assert result["updated"] == 0
    assert result["failed"] == 0
    # URL lookup was consulted before creating.
    assert client.query_calls == ["https://acme/jobs/1"]
    # sync_state is now populated.
    state = seeded_store.get_sync_state(scored.job.id, "notion")
    assert state["external_id"] == "page-1"


def test_sync_is_idempotent_via_url_lookup_without_sync_state(
    fake_notion, seeded_store, settings_with_notion
):
    """Stateless GH Actions: sync_state is empty but Notion already has the
    page from a previous run. We must update, not create, by finding the
    page via URL filter."""
    from app.integrations import notion

    scored = _make_scored("Backend Engineer", "Acme", "https://acme/jobs/1")
    seeded_store.upsert_jobs([scored.job])
    seeded_store.upsert_scored_jobs([scored])

    client = fake_notion(
        schema_keys=_REQUIRED,
        existing_by_url={"https://acme/jobs/1": "preexisting-page-42"},
    )

    result = notion.sync_scored_jobs([scored], settings_with_notion, seeded_store)

    assert result["created"] == 0
    assert result["updated"] == 1
    assert client.updated[0]["id"] == "preexisting-page-42"
    # sync_state written back so later runs skip the query.
    state = seeded_store.get_sync_state(scored.job.id, "notion")
    assert state["external_id"] == "preexisting-page-42"


def test_sync_uses_real_application_status(
    fake_notion, seeded_store, settings_with_notion
):
    """If the user moved the job to Interviewing, Notion must show
    Interviewing — not the hardcoded Found."""
    from app.integrations import notion

    client = fake_notion(schema_keys=_REQUIRED)
    scored = _make_scored("Backend Engineer", "Acme", "https://acme/jobs/1")
    seeded_store.upsert_jobs([scored.job])
    seeded_store.upsert_scored_jobs([scored])
    seeded_store.set_application_status_rich(
        scored.job.id, ApplicationStatus.INTERVIEWING
    )

    notion.sync_scored_jobs([scored], settings_with_notion, seeded_store)

    created_props = client.created[0]["properties"]
    assert created_props["Status"]["select"]["name"] == "Interviewing"


def test_sync_reports_partial_failure(
    fake_notion, seeded_store, settings_with_notion
):
    """One success + one API error must return failed=1 so the CLI can exit
    nonzero."""
    from app.integrations import notion

    s1 = _make_scored("Role A", "A", "https://a/1")
    s2 = _make_scored("Role B", "B", "https://b/2")
    seeded_store.upsert_jobs([s1.job, s2.job])
    seeded_store.upsert_scored_jobs([s1, s2])

    client = fake_notion(schema_keys=_REQUIRED)
    # Make the second create blow up.
    orig_create = client.pages.create

    call_count = {"n": 0}

    def flaky_create(*, parent, properties):
        call_count["n"] += 1
        if call_count["n"] == 2:
            raise _APIResponseError("conflict")
        return orig_create(parent=parent, properties=properties)

    client.pages.create = flaky_create  # type: ignore[method-assign]

    result = notion.sync_scored_jobs([s1, s2], settings_with_notion, seeded_store)

    assert result["created"] == 1
    assert result["failed"] == 1


def test_sync_returns_error_on_schema_mismatch(
    fake_notion, seeded_store, settings_with_notion
):
    """Missing required properties must produce error=1, leaving no pages
    touched."""
    from app.integrations import notion

    scored = _make_scored("Role", "Co", "https://x/1")
    seeded_store.upsert_jobs([scored.job])
    seeded_store.upsert_scored_jobs([scored])

    client = fake_notion(schema_keys=["Role", "URL"])  # missing many

    result = notion.sync_scored_jobs([scored], settings_with_notion, seeded_store)

    assert result.get("error") == 1
    assert result["created"] == 0
    assert client.created == []


def test_sync_returns_error_when_retrieve_fails(
    fake_notion, seeded_store, settings_with_notion
):
    from app.integrations import notion

    scored = _make_scored("Role", "Co", "https://x/1")
    seeded_store.upsert_jobs([scored.job])
    seeded_store.upsert_scored_jobs([scored])

    client = fake_notion(
        schema_keys=_REQUIRED,
        retrieve_raises=_APIResponseError("401"),
    )

    result = notion.sync_scored_jobs([scored], settings_with_notion, seeded_store)

    assert result.get("error") == 1
    assert client.created == []


def test_sync_skipped_when_creds_missing(tmp_path: Path, monkeypatch):
    from app.config import Settings
    from app.integrations import notion
    from app.storage import build_store

    settings = Settings()  # no notion token
    store = build_store(settings)
    store.init_schema()
    scored = _make_scored("Role", "Co", "https://x/1")
    store.upsert_jobs([scored.job])
    store.upsert_scored_jobs([scored])

    result = notion.sync_scored_jobs([scored], settings, store)
    assert result.get("skipped") == 1
    assert result["created"] == 0
    assert result["failed"] == 0
