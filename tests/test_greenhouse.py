"""Greenhouse public-boards API tests.

The orchestrator-level tests in test_fetch_all_with_stats only mock every
source's .fetch() — so the parsing, URL construction, and per-company
error handling here have been drifting without cover.
"""
from __future__ import annotations

import httpx
import pytest

from app.sources import greenhouse
from app.sources.greenhouse import GreenhouseSource


def _patch_http(monkeypatch, payloads_by_token: dict):
    """Stub http_get_json keyed by the board token in the URL."""

    def fake(url: str, params=None):
        for token, payload in payloads_by_token.items():
            if f"/boards/{token}/jobs" in url:
                if isinstance(payload, Exception):
                    raise payload
                return payload
        raise AssertionError(f"unexpected URL: {url}")

    monkeypatch.setattr(greenhouse, "http_get_json", fake)


def test_parses_happy_payload(monkeypatch):
    _patch_http(
        monkeypatch,
        {
            "rubrik": {
                "jobs": [
                    {
                        "title": "Staff Backend Engineer",
                        "absolute_url": "https://boards.greenhouse.io/rubrik/jobs/1",
                        "location": {"name": "Bengaluru, India"},
                        "content": "<p>Python + Go</p>",
                        "updated_at": "2026-05-01T00:00:00Z",
                    }
                ]
            }
        },
    )
    out = GreenhouseSource().fetch(
        {
            "enabled": True,
            "companies": [{"name": "Rubrik", "board_token": "rubrik"}],
        }
    )
    assert len(out) == 1
    j = out[0]
    assert j.source == "greenhouse"
    assert j.role == "Staff Backend Engineer"
    assert j.company == "Rubrik"
    assert "Python + Go" in (j.description or "")
    assert j.location == "Bengaluru, India"
    assert j.posted_date == "2026-05-01T00:00:00Z"


def test_empty_board_returns_empty_list(monkeypatch):
    """An empty `jobs: []` is not an error — just return [] without
    warnings. Common when a company has no current openings."""
    _patch_http(monkeypatch, {"rubrik": {"jobs": []}})
    out = GreenhouseSource().fetch(
        {"enabled": True, "companies": [{"name": "Rubrik", "board_token": "rubrik"}]}
    )
    assert out == []


def test_404_on_bad_token_logs_and_continues(monkeypatch, caplog):
    """404 for company A must not kill company B's fetch."""
    req = httpx.Request("GET", "https://boards-api.greenhouse.io")
    err404 = httpx.HTTPStatusError(
        "404", request=req, response=httpx.Response(404, request=req)
    )
    _patch_http(
        monkeypatch,
        {
            "badtoken": err404,
            "rubrik": {
                "jobs": [
                    {
                        "title": "Engineer",
                        "absolute_url": "https://x/1",
                        "location": {"name": "Bangalore"},
                        "content": "",
                    }
                ]
            },
        },
    )
    logger = greenhouse.log
    logger.addHandler(caplog.handler)
    try:
        out = GreenhouseSource().fetch(
            {
                "enabled": True,
                "companies": [
                    {"name": "Unknown", "board_token": "badtoken"},
                    {"name": "Rubrik", "board_token": "rubrik"},
                ],
            }
        )
    finally:
        logger.removeHandler(caplog.handler)

    assert [j.company for j in out] == ["Rubrik"]
    assert any("Unknown" in r.message or "badtoken" in r.message for r in caplog.records)


def test_skips_companies_without_token(monkeypatch):
    """Companies with ats_type=greenhouse but no board_token are silently
    skipped — that's user-config incomplete, not an API error."""
    _patch_http(monkeypatch, {})
    out = GreenhouseSource().fetch(
        {"enabled": True, "companies": [{"name": "NoToken"}]}
    )
    assert out == []


def test_fetch_is_noop_when_disabled():
    out = GreenhouseSource().fetch({"enabled": False, "companies": [{"name": "X"}]})
    assert out == []


def test_skips_items_with_missing_fields(monkeypatch):
    """Greenhouse occasionally returns partial rows; `_to_job` is tolerant
    but if stable_job_id can't build an ID (all inputs empty) we skip the
    row rather than blow up the batch."""
    _patch_http(
        monkeypatch,
        {
            "rubrik": {
                "jobs": [
                    {
                        # missing title and url — produces a degenerate
                        # stable_id but no crash
                        "location": {"name": "Remote"},
                        "content": "job blob",
                    },
                    {
                        "title": "Real Role",
                        "absolute_url": "https://x/real",
                        "location": None,
                        "content": None,
                    },
                ]
            }
        },
    )
    out = GreenhouseSource().fetch(
        {"enabled": True, "companies": [{"name": "Rubrik", "board_token": "rubrik"}]}
    )
    roles = {j.role for j in out}
    assert "Real Role" in roles


# Keep pytest marker import for the conftest's sake
_ = pytest
