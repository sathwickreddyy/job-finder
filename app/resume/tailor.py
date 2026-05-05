"""Resume tailoring: build a markdown suggestion sheet per job.

v1 has two modes:
    - If an LLM key is configured, generate the full tailor markdown via the LLM.
    - If not, emit a deterministic template filled from the ScoredJob and
      profile, so the user still gets actionable guidance without any API.

Never mutates the master resume file.
"""
from __future__ import annotations

import httpx

from ..config import Settings
from ..models import Priority, ScoredJob
from ..scoring.llm_scorer import _call_llm
from ..utils import get_logger
from .prompts import TAILOR_SYSTEM, build_tailor_user_prompt

log = get_logger("resume.tailor")


def _deterministic_tailor_markdown(
    scored: ScoredJob, profile: dict, resume_text: str
) -> str:
    recommended = scored.recommended_resume_variant or "master"
    reasons = "\n".join(f"- {r}" for r in scored.reasons) or "- (no reasons captured)"
    risks = "\n".join(f"- {r}" for r in scored.risks) or "- (no risks captured)"
    missing = ", ".join(scored.missing_skills) or "—"
    matched = ", ".join(scored.matched_skills) or "—"
    final = {
        Priority.P0: "Apply today",
        Priority.P1: "Referral first, then apply",
        Priority.P2: "Review when queue is empty",
        Priority.IGNORE: "Skip",
    }[scored.priority]
    resume_excerpt = resume_text.strip().splitlines()[:8]
    resume_preview = "\n".join(resume_excerpt) if resume_excerpt else "(master resume is empty)"

    return f"""# Tailor Sheet — {scored.job.role} @ {scored.job.company}

## 1. Fit Score
**{scored.fit_score}/100**

## 2. Priority
**{scored.priority}** — target level: {scored.level_match or 'Unknown'}

## 3. Why this role fits
{reasons}

## 4. Risks / gaps
{risks}

## 5. Keywords to add (non-fabricated)
Matched already: {matched}

Missing (only add if truly present in your experience): {missing}

## 6. Resume bullet improvements
_Deterministic stub — run with an LLM key for concrete rewrites._

Master resume (first lines):
```
{resume_preview}
```

## 7. Recommended resume variant
`{recommended}`

## 8. 3-line recruiter pitch
- Senior backend/platform engineer (~5 YoE) with strength in {matched or 'Python, APIs, distributed systems'}.
- Targeting {', '.join(profile.get('target_roles', [])[:3]) or 'SDE2/Senior SWE roles'} in {', '.join(profile.get('preferred_locations', [])[:2]) or 'India/Remote'}.
- Interested in {scored.job.role} at {scored.job.company} — would welcome a quick intro chat.

## 9. Referral message draft
> Hi [Name], hope you're doing well. I noticed {scored.job.company} has an opening for {scored.job.role}
> ({scored.job.url}). Based on my {profile.get('years_of_experience', '5')}+ years
> in backend/platform engineering with {matched or 'Python, APIs, distributed systems'}, I think it's a strong fit.
> Would you be open to referring me, or connecting me with someone on the hiring team?

## 10. Final recommendation
**{final}**
"""


def tailor(
    *,
    resume_text: str,
    scored: ScoredJob,
    profile: dict,
    settings: Settings,
) -> str:
    """Return a markdown tailor sheet. Never raises."""
    if not settings.llm_enabled:
        return _deterministic_tailor_markdown(scored, profile, resume_text)

    user = build_tailor_user_prompt(resume_text=resume_text, scored=scored, profile=profile)
    try:
        text = _call_llm(settings, TAILOR_SYSTEM, user)
        if not text.strip():
            raise RuntimeError("empty LLM response")
        return text.strip()
    except (httpx.HTTPError, RuntimeError) as e:
        log.warning("LLM tailor failed (%s); using deterministic template", e)
        return _deterministic_tailor_markdown(scored, profile, resume_text)
