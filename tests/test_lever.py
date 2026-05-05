"""Lever public postings API tests."""
from __future__ import annotations

import httpx

from app.sources import lever
from app.sources.lever import LeverSource


def _patch(monkeypatch, payloads_by_slug: dict):
    def fake(url: str, params=None):
        for slug, payload in payloads_by_slug.items():
            if f"/postings/{slug}" in url:
                if isinstance(payload, Exception):
                    raise payload
                return payload
        raise AssertionError(f"unexpected URL: {url}")

    monkeypatch.setattr(lever, "http_get_json", fake)


def test_parses_direct_list_payload(monkeypatch):
    """Lever typically returns a bare list, not an envelope."""
    _patch(
        monkeypatch,
        {
            "razorpay": [
                {
                    "text": "Senior Software Engineer",
                    "hostedUrl": "https://jobs.lever.co/razorpay/abc",
                    "categories": {
                        "location": "Bengaluru",
                        "commitment": "Full-time",
                    },
                    "workplaceType": "Hybrid",
                    "descriptionPlain": "build fintech",
                }
            ]
        },
    )
    out = LeverSource().fetch(
        {"enabled": True, "companies": [{"name": "Razorpay", "company_slug": "razorpay"}]}
    )
    assert len(out) == 1
    j = out[0]
    assert j.source == "lever"
    assert j.role == "Senior Software Engineer"
    assert j.remote_type == "hybrid"
    assert j.notes == "Full-time"


def test_parses_envelope_payload(monkeypatch):
    """Documents the {"data": [...]} fallback branch — rarely seen but
    the code handles it, so make sure it doesn't regress silently."""
    _patch(
        monkeypatch,
        {
            "slug": {
                "data": [
                    {
                        "text": "Eng",
                        "hostedUrl": "https://x/1",
                        "categories": {"location": "Remote"},
                        "workplaceType": "Remote",
                    }
                ]
            }
        },
    )
    out = LeverSource().fetch(
        {"enabled": True, "companies": [{"name": "Slug", "company_slug": "slug"}]}
    )
    assert [j.role for j in out] == ["Eng"]


def test_404_skips_company(monkeypatch):
    req = httpx.Request("GET", "https://api.lever.co")
    err = httpx.HTTPStatusError(
        "404", request=req, response=httpx.Response(404, request=req)
    )
    _patch(
        monkeypatch,
        {
            "bad": err,
            "ok": [{"text": "R", "hostedUrl": "https://x/r"}],
        },
    )
    out = LeverSource().fetch(
        {
            "enabled": True,
            "companies": [
                {"name": "Bad", "company_slug": "bad"},
                {"name": "OK", "company_slug": "ok"},
            ],
        }
    )
    assert [j.company for j in out] == ["OK"]


def test_skips_companies_without_slug(monkeypatch):
    _patch(monkeypatch, {})
    assert (
        LeverSource().fetch(
            {"enabled": True, "companies": [{"name": "NoSlug"}]}
        )
        == []
    )


def test_disabled_source_is_noop():
    assert LeverSource().fetch({"enabled": False, "companies": [{"name": "X"}]}) == []


def test_unknown_workplace_type_becomes_none(monkeypatch):
    """workplaceType="spaceship" → remote_type None, don't invent a value."""
    _patch(
        monkeypatch,
        {
            "slug": [
                {
                    "text": "R",
                    "hostedUrl": "https://x/r",
                    "workplaceType": "spaceship",
                }
            ]
        },
    )
    out = LeverSource().fetch(
        {"enabled": True, "companies": [{"name": "X", "company_slug": "slug"}]}
    )
    assert out[0].remote_type is None
