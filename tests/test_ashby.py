"""Ashby public job-board API tests."""
from __future__ import annotations

import httpx

from app.sources import ashby
from app.sources.ashby import AshbySource


def _patch(monkeypatch, payloads_by_slug: dict):
    def fake(url: str, params=None):
        for slug, payload in payloads_by_slug.items():
            if f"/job-board/{slug}" in url:
                if isinstance(payload, Exception):
                    raise payload
                return payload
        raise AssertionError(f"unexpected URL: {url}")

    monkeypatch.setattr(ashby, "http_get_json", fake)


def test_parses_happy_payload(monkeypatch):
    _patch(
        monkeypatch,
        {
            "rippling": {
                "jobs": [
                    {
                        "title": "Senior Backend Engineer",
                        "jobUrl": "https://jobs.ashbyhq.com/rippling/abc",
                        "locationName": "Bengaluru",
                        "isRemote": False,
                        "publishedDate": "2026-05-01",
                        "descriptionHtml": "<p>Python</p>",
                    }
                ]
            }
        },
    )
    out = AshbySource().fetch(
        {"enabled": True, "companies": [{"name": "Rippling", "org_slug": "rippling"}]}
    )
    assert len(out) == 1
    j = out[0]
    assert j.source == "ashby"
    assert j.role == "Senior Backend Engineer"
    assert j.company == "Rippling"
    assert j.remote_type is None  # isRemote=False


def test_remote_flag_mapped(monkeypatch):
    _patch(
        monkeypatch,
        {
            "r": {
                "jobs": [
                    {
                        "title": "Remote Role",
                        "jobUrl": "https://x/r",
                        "isRemote": True,
                    }
                ]
            }
        },
    )
    out = AshbySource().fetch(
        {"enabled": True, "companies": [{"name": "Remoto", "org_slug": "r"}]}
    )
    assert out[0].remote_type == "remote"


def test_falls_back_to_applyUrl_when_jobUrl_missing(monkeypatch):
    _patch(
        monkeypatch,
        {
            "acme": {
                "jobs": [
                    {
                        "title": "Engineer",
                        "applyUrl": "https://apply.example.com/acme/1",
                        "isRemote": False,
                    }
                ]
            }
        },
    )
    out = AshbySource().fetch(
        {"enabled": True, "companies": [{"name": "Acme", "org_slug": "acme"}]}
    )
    assert out[0].url == "https://apply.example.com/acme/1"


def test_404_skips_without_killing_batch(monkeypatch):
    req = httpx.Request("GET", "https://api.ashbyhq.com")
    err = httpx.HTTPStatusError(
        "404", request=req, response=httpx.Response(404, request=req)
    )
    _patch(
        monkeypatch,
        {
            "bad": err,
            "good": {"jobs": [{"title": "R", "jobUrl": "https://x/r", "isRemote": False}]},
        },
    )
    out = AshbySource().fetch(
        {
            "enabled": True,
            "companies": [
                {"name": "Bad", "org_slug": "bad"},
                {"name": "Good", "org_slug": "good"},
            ],
        }
    )
    assert [j.company for j in out] == ["Good"]


def test_skips_companies_without_slug(monkeypatch):
    _patch(monkeypatch, {})
    out = AshbySource().fetch(
        {"enabled": True, "companies": [{"name": "NoSlug"}]}
    )
    assert out == []


def test_disabled_source_is_noop():
    assert AshbySource().fetch({"enabled": False, "companies": [{"name": "X"}]}) == []
