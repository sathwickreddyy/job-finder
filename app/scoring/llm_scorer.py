"""Optional LLM-based score refiner.

Takes a rule-scored ScoredJob, asks the LLM for a short structured JSON
critique, and merges the LLM's verdict into the final ScoredJob:

    - score_delta  (clamped to [-15, +15]) nudges the fit_score
    - reasons / risks strings are appended (dedup'd)
    - recommended_resume_variant is overridden only if LLM returns one

If the call fails, times out, or returns invalid JSON, we silently fall
back to the rule score — this is why the module is a refiner, not a
replacement.
"""
from __future__ import annotations

import json
from typing import Any

import httpx

from ..config import Settings
from ..models import Priority, ScoredJob
from ..utils import get_logger, truncate

log = get_logger("scoring.llm")

ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
OPENAI_URL = "https://api.openai.com/v1/chat/completions"


SYSTEM_PROMPT = """You are an experienced senior engineer hiring manager assessing JD fit
for a backend/platform engineer (~5 YoE) targeting SDE2/SSE roles.
Return STRICT JSON only — no prose, no markdown fences. Schema:

{
  "score_delta": int between -15 and +15,
  "reasons": [short strings, max 5],
  "risks": [short strings, max 5],
  "recommended_resume_variant": string or null,
  "level_match": "SDE2"|"Senior"|"Mid"|"Staff"|"Principal"|"Intern"|"Unknown"
}

Rules:
- Never fabricate experience.
- Penalize frontend-only, QA-only, staff/principal-only roles.
- If JD is too thin to judge, delta should be 0.
"""


def _build_user_prompt(scored: ScoredJob, profile: dict) -> str:
    return (
        f"CANDIDATE_PROFILE:\n"
        f"  years_experience: {profile.get('years_of_experience')}\n"
        f"  target_roles: {profile.get('target_roles')}\n"
        f"  target_levels: {profile.get('target_levels')}\n"
        f"  strong_skills: {profile.get('strong_skills')}\n"
        f"  secondary_skills: {profile.get('secondary_skills')}\n"
        f"  avoid_skills: {profile.get('avoid_skills')}\n"
        f"  preferred_locations: {profile.get('preferred_locations')}\n\n"
        f"JOB:\n"
        f"  role: {scored.job.role}\n"
        f"  company: {scored.job.company}\n"
        f"  location: {scored.job.location}\n"
        f"  remote_type: {scored.job.remote_type}\n"
        f"  source: {scored.job.source}\n"
        f"  url: {scored.job.url}\n"
        f"  description: {truncate(scored.job.description, 2500)}\n\n"
        f"RULE_SCORE:\n"
        f"  fit_score: {scored.fit_score}\n"
        f"  priority: {scored.priority}\n"
        f"  matched_skills: {scored.matched_skills}\n"
        f"  missing_skills: {scored.missing_skills}\n"
    )


def _call_anthropic(settings: Settings, system: str, user: str) -> str:
    model = settings.llm_model or "claude-sonnet-4-6"
    body = {
        "model": model,
        "max_tokens": 700,
        "system": system,
        "messages": [{"role": "user", "content": user}],
    }
    with httpx.Client(timeout=30.0) as client:
        resp = client.post(
            ANTHROPIC_URL,
            json=body,
            headers={
                "x-api-key": settings.anthropic_api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
        )
        resp.raise_for_status()
        data = resp.json()
    parts = data.get("content") or []
    return "".join(p.get("text", "") for p in parts if p.get("type") == "text").strip()


def _call_openai(settings: Settings, system: str, user: str) -> str:
    model = settings.llm_model or "gpt-4o-mini"
    body = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.1,
    }
    with httpx.Client(timeout=30.0) as client:
        resp = client.post(
            OPENAI_URL,
            json=body,
            headers={
                "Authorization": f"Bearer {settings.openai_api_key}",
                "content-type": "application/json",
            },
        )
        resp.raise_for_status()
        data = resp.json()
    return data["choices"][0]["message"]["content"].strip()


def _call_llm(settings: Settings, system: str, user: str) -> str:
    if settings.llm_provider == "anthropic":
        return _call_anthropic(settings, system, user)
    if settings.llm_provider == "openai":
        return _call_openai(settings, system, user)
    raise RuntimeError("no LLM provider configured")


def _parse_json(text: str) -> dict[str, Any]:
    # Some models wrap JSON in code fences; best-effort strip.
    text = text.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if "\n" in text:
            text = text.split("\n", 1)[1]
    return json.loads(text)


def refine_scored_job(
    scored: ScoredJob,
    profile: dict[str, Any],
    scoring_cfg: dict[str, Any],
    settings: Settings,
) -> ScoredJob:
    if not settings.llm_enabled:
        return scored
    try:
        raw = _call_llm(settings, SYSTEM_PROMPT, _build_user_prompt(scored, profile))
        verdict = _parse_json(raw)
    except (httpx.HTTPError, json.JSONDecodeError, RuntimeError, KeyError) as e:
        log.warning("LLM refine failed for %s (%s): %s", scored.job.role, scored.job.company, e)
        return scored

    delta = int(verdict.get("score_delta", 0))
    delta = max(-15, min(15, delta))
    new_score = max(0, min(100, scored.fit_score + delta))

    merged_reasons = list(scored.reasons)
    for r in verdict.get("reasons", []) or []:
        if isinstance(r, str) and r.strip() and r not in merged_reasons:
            merged_reasons.append(r.strip())
    merged_risks = list(scored.risks)
    for r in verdict.get("risks", []) or []:
        if isinstance(r, str) and r.strip() and r not in merged_risks:
            merged_risks.append(r.strip())

    # Recompute priority from updated score, unless risks already forced IGNORE.
    thresholds = scoring_cfg.get("thresholds") or {"P0": 80, "P1": 70, "P2": 60}
    if scored.priority == Priority.IGNORE:
        priority = Priority.IGNORE
    elif new_score >= int(thresholds.get("P0", 80)):
        priority = Priority.P0
    elif new_score >= int(thresholds.get("P1", 70)):
        priority = Priority.P1
    elif new_score >= int(thresholds.get("P2", 60)):
        priority = Priority.P2
    else:
        priority = Priority.IGNORE

    variant = verdict.get("recommended_resume_variant") or scored.recommended_resume_variant
    level = verdict.get("level_match") or scored.level_match

    return scored.model_copy(
        update={
            "fit_score": new_score,
            "priority": priority,
            "reasons": merged_reasons,
            "risks": merged_risks,
            "recommended_resume_variant": variant,
            "level_match": level,
        }
    )


def refine_all(
    scored: list[ScoredJob],
    profile: dict[str, Any],
    scoring_cfg: dict[str, Any],
    settings: Settings,
    max_refine: int | None = None,
) -> list[ScoredJob]:
    if not settings.llm_enabled:
        return scored
    # Only refine promising candidates by default (saves tokens).
    eligible = [s for s in scored if s.priority != Priority.IGNORE]
    if max_refine is not None:
        eligible = eligible[:max_refine]
    eligible_ids = {s.job.id for s in eligible}

    out: list[ScoredJob] = []
    for s in scored:
        out.append(
            refine_scored_job(s, profile, scoring_cfg, settings) if s.job.id in eligible_ids else s
        )
    return out
