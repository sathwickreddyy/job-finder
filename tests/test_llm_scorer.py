"""LLM scorer resilience — every failure mode must degrade to the rule score.

The refiner is meant to be a bonus layer, not a dependency. These tests
force each failure path (HTTP 429, timeout, malformed JSON, missing keys,
invalid payload shape) and assert the original ScoredJob is returned
unchanged.
"""
from __future__ import annotations

from dataclasses import replace
from typing import Any

import httpx
import pytest

from app.config import Settings
from app.models import Job, Priority, ScoredJob
from app.scoring import llm_scorer
from app.utils import stable_job_id


def _scored() -> ScoredJob:
    j = Job(
        id=stable_job_id("Acme", "Senior Backend", "https://x/1"),
        role="Senior Backend",
        company="Acme",
        url="https://x/1",
        source="ycombinator",
        description="Python, FastAPI, PostgreSQL",
    )
    return ScoredJob(
        job=j,
        fit_score=72,
        priority=Priority.P1,
        level_match="Senior",
        matched_skills=["python", "fastapi"],
        missing_skills=["aws"],
        reasons=["skill match"],
        risks=[],
    )


def _settings_anthropic() -> Settings:
    base = Settings()
    return replace(base, anthropic_api_key="test-key", llm_model="claude-sonnet-4-6")


def _settings_openai() -> Settings:
    base = Settings()
    return replace(
        base,
        anthropic_api_key=None,
        openai_api_key="test-key",
        llm_model="gpt-4o-mini",
    )


# ── 429 rate-limit (HTTPStatusError → HTTPError) ─────────────────────────
def test_refine_falls_back_on_429(monkeypatch):
    settings = _settings_anthropic()

    def _raise_429(*_args, **_kwargs):
        req = httpx.Request("POST", llm_scorer.ANTHROPIC_URL)
        resp = httpx.Response(status_code=429, request=req)
        raise httpx.HTTPStatusError("429", request=req, response=resp)

    monkeypatch.setattr(llm_scorer, "_call_anthropic", _raise_429)
    before = _scored()
    after = llm_scorer.refine_scored_job(before, {}, {}, settings)
    assert after == before


# ── timeout ──────────────────────────────────────────────────────────────
def test_refine_falls_back_on_timeout(monkeypatch):
    settings = _settings_anthropic()

    def _timeout(*_args, **_kwargs):
        raise httpx.TimeoutException("read timeout")

    monkeypatch.setattr(llm_scorer, "_call_anthropic", _timeout)
    before = _scored()
    after = llm_scorer.refine_scored_job(before, {}, {}, settings)
    assert after == before


# ── malformed JSON (not in a code fence) ─────────────────────────────────
def test_refine_falls_back_on_malformed_json(monkeypatch):
    settings = _settings_anthropic()
    monkeypatch.setattr(
        llm_scorer, "_call_anthropic", lambda *_a, **_kw: "not json at all"
    )
    before = _scored()
    after = llm_scorer.refine_scored_job(before, {}, {}, settings)
    assert after == before


def test_refine_falls_back_on_truncated_json(monkeypatch):
    """Claude can cut off mid-object when max_tokens is tight."""
    settings = _settings_anthropic()
    monkeypatch.setattr(
        llm_scorer,
        "_call_anthropic",
        lambda *_a, **_kw: '{"score_delta": 5, "reasons": ["good'
    )
    before = _scored()
    after = llm_scorer.refine_scored_job(before, {}, {}, settings)
    assert after == before


# ── JSON wrapped in code fence (happy path, should parse) ────────────────
def test_refine_parses_fenced_json(monkeypatch):
    settings = _settings_anthropic()
    monkeypatch.setattr(
        llm_scorer,
        "_call_anthropic",
        lambda *_a, **_kw: '```json\n{"score_delta": 5, "reasons": ["good fit"]}\n```',
    )
    before = _scored()
    after = llm_scorer.refine_scored_job(before, {}, {}, settings)
    assert after.fit_score == before.fit_score + 5
    assert "good fit" in after.reasons


# ── OpenAI: missing "choices" key ────────────────────────────────────────
def test_refine_falls_back_on_openai_missing_choices(monkeypatch):
    """When OpenAI returns {"error": ...} in a 200 response, accessing
    data["choices"] raises KeyError — which the caller must catch."""
    settings = _settings_openai()
    # We can't easily intercept _call_openai's internals because it does
    # the KeyError lookup. Patch at the _call_openai boundary to simulate
    # what happens when the inner data.get("choices") fails.
    def _raise_key_error(*_args, **_kwargs):
        raise KeyError("choices")

    monkeypatch.setattr(llm_scorer, "_call_openai", _raise_key_error)
    before = _scored()
    after = llm_scorer.refine_scored_job(before, {}, {}, settings)
    assert after == before


# ── valid JSON but garbage values (score_delta as string) ────────────────
def test_refine_tolerates_non_int_score_delta(monkeypatch):
    """int(verdict.get('score_delta', 0)) on {'score_delta': 'huge'} raises
    ValueError — the refiner should NOT crash the whole run."""
    settings = _settings_anthropic()
    monkeypatch.setattr(
        llm_scorer,
        "_call_anthropic",
        lambda *_a, **_kw: '{"score_delta": "huge", "reasons": []}',
    )
    before = _scored()
    after = llm_scorer.refine_scored_job(before, {}, {}, settings)
    # ValueError is currently not in the except tuple — this test documents
    # the expected behavior. If the implementation protects this, we pass;
    # otherwise we'll see the failure and add ValueError to the except.
    assert after == before


# ── verdict missing optional keys (happy robustness) ─────────────────────
def test_refine_tolerates_partial_verdict(monkeypatch):
    settings = _settings_anthropic()
    monkeypatch.setattr(
        llm_scorer,
        "_call_anthropic",
        lambda *_a, **_kw: '{"score_delta": 3}',
    )
    before = _scored()
    after = llm_scorer.refine_scored_job(before, {}, {}, settings)
    assert after.fit_score == before.fit_score + 3
    # No new reasons/risks — original preserved.
    assert after.reasons == before.reasons
    assert after.risks == before.risks


# ── refine_all should keep the rule score for every job on provider error
def test_refine_all_returns_rule_scores_when_every_call_fails(monkeypatch):
    settings = _settings_anthropic()

    def _boom(*_args, **_kwargs):
        raise httpx.HTTPStatusError(
            "429",
            request=httpx.Request("POST", llm_scorer.ANTHROPIC_URL),
            response=httpx.Response(
                429, request=httpx.Request("POST", llm_scorer.ANTHROPIC_URL)
            ),
        )

    monkeypatch.setattr(llm_scorer, "_call_anthropic", _boom)
    jobs = [_scored()]
    # Second job will be Ignored and should be skipped entirely.
    j2 = Job(
        id=stable_job_id("Skipped", "Role", "https://x/2"),
        role="Role",
        company="Skipped",
        url="https://x/2",
        source="ycombinator",
    )
    jobs.append(
        ScoredJob(job=j2, fit_score=30, priority=Priority.IGNORE)
    )
    out = llm_scorer.refine_all(jobs, {}, {}, settings)
    assert [o.fit_score for o in out] == [72, 30]


def test_refine_skipped_when_llm_not_enabled(monkeypatch):
    """No API key → llm_enabled is False → refine_scored_job returns the
    input unchanged without any HTTP attempt."""
    s = _settings_anthropic()
    s = replace(s, anthropic_api_key=None, openai_api_key=None)
    # Make sure no HTTP call would succeed by patching to raise.
    monkeypatch.setattr(
        llm_scorer,
        "_call_anthropic",
        lambda *_a, **_kw: pytest.fail("should not be called"),
    )
    before = _scored()
    assert llm_scorer.refine_scored_job(before, {}, {}, s) == before


# ── Unknown provider shape ───────────────────────────────────────────────
def test_refine_falls_back_when_provider_is_unknown(monkeypatch):
    """If llm_enabled reports True but provider is somehow neither, the
    RuntimeError inside _call_llm must not propagate."""
    settings = _settings_anthropic()
    # Make llm_provider evaluate to something neither branch matches.
    monkeypatch.setattr(type(settings), "llm_provider", property(lambda self: "other"))
    before = _scored()
    after = llm_scorer.refine_scored_job(before, {}, {}, settings)
    assert after == before


# silence unused import when pytest removes it optimizing
_: Any = Settings
