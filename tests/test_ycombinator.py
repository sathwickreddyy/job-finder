from __future__ import annotations

import json
import logging
from pathlib import Path

import httpx

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
    # `app.utils.get_logger` sets propagate=False on the module logger, so
    # records never reach caplog's root-attached handler. Attach caplog's
    # handler directly to the module logger for the duration of this test
    # (removed on teardown) so production propagation settings stay intact.
    logger = logging.getLogger("sources.ycombinator")
    logger.addHandler(caplog.handler)
    caplog.set_level(logging.WARNING, logger="sources.ycombinator")
    try:
        _patched_fetch(monkeypatch, _load("missing_title.json"))
        jobs = YCombinatorSource().fetch({"enabled": True, "known_companies": []})
        assert len(jobs) == 1  # good one passes, bad one skipped
        assert any("missing title" in r.getMessage().lower() or "title" in r.getMessage().lower()
                   for r in caplog.records)
    finally:
        logger.removeHandler(caplog.handler)


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


def test_raw_payload_preserved_on_accepted_job(monkeypatch) -> None:
    """BDD: the full original YC posting must survive in Job.raw for debugging."""
    payload = _load("happy_bengaluru.json")
    _patched_fetch(monkeypatch, payload)
    jobs = YCombinatorSource().fetch({"enabled": True, "known_companies": []})
    assert len(jobs) == 1
    # Full payload round-trips — not a subset, not a mutated copy.
    assert jobs[0].raw == payload[0]


def test_stable_id_is_deterministic_across_calls(monkeypatch) -> None:
    """BDD: fetching the same posting twice yields identical content-hashed IDs."""
    _patched_fetch(monkeypatch, _load("happy_bengaluru.json"))
    first = YCombinatorSource().fetch({"enabled": True, "known_companies": []})
    _patched_fetch(monkeypatch, _load("happy_bengaluru.json"))
    second = YCombinatorSource().fetch({"enabled": True, "known_companies": []})
    assert first[0].id == second[0].id
