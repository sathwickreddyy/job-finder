"""Prompt templates used by the resume tailor."""
from __future__ import annotations

from ..models import ScoredJob
from ..utils import truncate

TAILOR_SYSTEM = """You are a senior engineering hiring manager and resume coach.
You must never fabricate experience or skills the candidate does not have.
You may only restate, emphasize, or reorder existing resume material.
Output STRICT markdown following the section order the user requests.
Do not add extra commentary before or after the markdown.
"""


def build_tailor_user_prompt(
    *,
    resume_text: str,
    scored: ScoredJob,
    profile: dict,
) -> str:
    return f"""CANDIDATE_PROFILE:
  years_experience: {profile.get('years_of_experience')}
  target_roles: {profile.get('target_roles')}
  target_levels: {profile.get('target_levels')}
  strong_skills: {profile.get('strong_skills')}
  secondary_skills: {profile.get('secondary_skills')}
  preferred_locations: {profile.get('preferred_locations')}

JOB:
  role: {scored.job.role}
  company: {scored.job.company}
  url: {scored.job.url}
  location: {scored.job.location}
  remote_type: {scored.job.remote_type}
  description: {truncate(scored.job.description, 3000)}

RULE_SCORE:
  fit_score: {scored.fit_score}
  priority: {scored.priority}
  matched_skills: {scored.matched_skills}
  missing_skills: {scored.missing_skills}
  recommended_resume_variant: {scored.recommended_resume_variant}

RESUME_MARKDOWN:
---
{resume_text}
---

Produce the following markdown sections, in order, using h2 headings:

## 1. Fit Score
## 2. Priority
## 3. Why this role fits
## 4. Risks / gaps
## 5. Keywords to add (non-fabricated)
## 6. Resume bullet improvements (before → after)
## 7. Recommended resume variant
## 8. 3-line recruiter pitch
## 9. Referral message draft (short, polite, Indian context friendly)
## 10. Final recommendation (Apply / Referral first / Skip)

Do NOT invent experience. Use only material present in RESUME_MARKDOWN.
"""
