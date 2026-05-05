"""Deterministic rule-based scorer.

Rubric (max 100):
    40  skills match
    20  level match
    10  location match
    15  domain/company relevance
    10  recency / source quality
     5  target-company / referral boost

Then:
    - strong negative signals force Priority.IGNORE regardless of score
    - score → priority via thresholds from scoring.yaml
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Any

from ..models import Job, Priority, ScoredJob
from ..utils import any_contains, get_logger, normalize_text

log = get_logger("scoring.rule")

# Default thresholds if scoring.yaml omits them.
DEFAULT_THRESHOLDS = {"P0": 80, "P1": 70, "P2": 60}

# Level vocabulary (lowercased). Matching logic compares job role+description.
LEVEL_HINTS = {
    "sde2": ["sde 2", "sde ii", "sde2", "software engineer ii", "software engineer 2"],
    "senior": ["senior software", "senior engineer", "senior backend", "sse", "sde iii", "sde 3"],
    "mid": ["software engineer", "backend engineer", "platform engineer"],
    "intern": ["intern", "internship", "trainee"],
    "staff": ["staff engineer", "staff software"],
    "principal": ["principal engineer", "principal software"],
}


def _skill_match_points(desc: str, role: str, profile: dict, cfg: dict) -> tuple[int, list[str], list[str]]:
    haystack = f"{role}\n{desc}"
    strong = [s.lower() for s in profile.get("strong_skills", [])]
    secondary = [s.lower() for s in profile.get("secondary_skills", [])]
    positive = [k.lower() for k in cfg.get("positive_keywords", [])]

    matched: list[str] = []
    # Strong skills weigh more than secondary.
    strong_hits = any_contains(haystack, strong)
    secondary_hits = any_contains(haystack, secondary)
    positive_hits = any_contains(haystack, positive)

    points = 0
    points += min(25, 5 * len(strong_hits))           # up to 25 from strong
    points += min(10, 2 * len(secondary_hits))        # up to 10 from secondary
    points += min(5, len(positive_hits))              # up to 5 from positive keywords

    matched = list(dict.fromkeys(strong_hits + secondary_hits + positive_hits))

    # Missing skills: strong skills that did NOT appear (signal for resume tailoring).
    missing = [s for s in strong if s not in [m.lower() for m in matched]]
    return min(40, points), matched, missing


def _level_points(desc: str, role: str, profile: dict) -> tuple[int, str, list[str]]:
    target_levels = [normalize_text(lvl) for lvl in profile.get("target_levels", [])]
    haystack = normalize_text(f"{role} {desc}")

    # Hard negatives first.
    risks: list[str] = []
    if any(h in haystack for h in LEVEL_HINTS["intern"]):
        risks.append("Intern/fresher level; mismatch.")
        return 0, "Intern", risks
    if any(h in haystack for h in LEVEL_HINTS["staff"]) and "staff" not in target_levels:
        risks.append("Staff-level role; likely above current target band.")
        return 2, "Staff", risks
    if any(h in haystack for h in LEVEL_HINTS["principal"]) and "principal" not in target_levels:
        risks.append("Principal-level role; likely above current target band.")
        return 2, "Principal", risks

    for key in ("sde2", "senior", "mid"):
        if any(h in haystack for h in LEVEL_HINTS[key]):
            # Reward level matches that the user actively targets.
            if any(t in key for t in target_levels) or any(key in t for t in target_levels):
                return 20, key.upper() if key == "sde2" else key.capitalize(), risks
            return 12, key.upper() if key == "sde2" else key.capitalize(), risks
    return 8, "Unknown", risks


def _location_points(job: Job, profile: dict, cfg: dict) -> tuple[int, list[str]]:
    preferred = [normalize_text(l) for l in profile.get("preferred_locations", [])]
    remote_prefs = profile.get("remote_preferences", []) or []
    remote_prefs = [normalize_text(r) for r in remote_prefs]
    location_boosts: dict = cfg.get("location_boosts") or {}
    reasons: list[str] = []

    loc = normalize_text(job.location or "")
    remote_type = normalize_text(job.remote_type or "")

    # Remote match
    if remote_type == "remote" and "remote" in " ".join(remote_prefs):
        reasons.append("Remote role matches preference.")
        return 10, reasons

    for p in preferred:
        if p and p in loc:
            reasons.append(f"Location matches preferred: {p}.")
            return 10, reasons

    # Config-provided fuzzy boosts (e.g. "india" → 6)
    for key, bump in location_boosts.items():
        if normalize_text(key) in loc:
            reasons.append(f"Location boost via '{key}' (+{bump}).")
            return int(bump), reasons

    if loc:
        return 2, reasons
    return 0, reasons


def _domain_points(job: Job, profile: dict, cfg: dict) -> tuple[int, list[str]]:
    text = normalize_text(f"{job.role} {job.description or ''} {job.company}")
    reasons: list[str] = []
    pts = 0

    for domain in profile.get("preferred_domains", []) or []:
        if normalize_text(domain) in text:
            pts += 4
            reasons.append(f"Preferred domain: {domain}.")
    for domain in profile.get("avoid_domains", []) or []:
        if normalize_text(domain) in text:
            pts -= 8
            reasons.append(f"Domain on avoid-list: {domain}.")

    # Config-provided boosts
    for key, bump in (cfg.get("domain_boosts") or {}).items():
        if normalize_text(key) in text:
            pts += int(bump)
            reasons.append(f"Domain boost '{key}' (+{bump}).")

    for key, bump in (cfg.get("company_boosts") or {}).items():
        if normalize_text(key) in normalize_text(job.company):
            pts += int(bump)
            reasons.append(f"Company boost '{key}' (+{bump}).")

    return max(0, min(15, pts)), reasons


def _recency_source_points(job: Job, cfg: dict) -> tuple[int, list[str]]:
    reasons: list[str] = []
    pts = 0
    # Source quality boost
    source_boosts: dict = cfg.get("source_quality_boosts") or {}
    src_bump = int(source_boosts.get(job.source, 0))
    if src_bump:
        pts += src_bump
        reasons.append(f"Source quality boost ({job.source}: +{src_bump}).")

    # Recency: award points based on how fresh the posting is.
    if job.posted_date:
        try:
            parsed = datetime.fromisoformat(job.posted_date.replace("Z", "+00:00"))
            days = (datetime.now(tz=parsed.tzinfo).date() - parsed.date()).days
            if days <= 3:
                pts += 5
                reasons.append("Posted within 3 days.")
            elif days <= 14:
                pts += 3
                reasons.append("Posted within 2 weeks.")
            elif days > 45:
                pts -= 2
                reasons.append("Posting older than 45 days.")
        except ValueError:
            pass

    return max(0, min(10, pts)), reasons


def _company_match_points(job: Job, companies_cfg: dict) -> tuple[int, str | None, list[str]]:
    reasons: list[str] = []
    target_priority: str | None = None
    for c in companies_cfg.get("companies", []) or []:
        if normalize_text(c.get("name", "")) == normalize_text(job.company):
            target_priority = c.get("priority")
            if target_priority in {"P0", "P1"}:
                reasons.append(f"Target company ({job.company}, {target_priority}).")
                return 5, target_priority, reasons
            reasons.append(f"Target company ({job.company}).")
            return 3, target_priority, reasons
    return 0, None, reasons


_NEGATIVE_DEFAULT = [
    "frontend only",
    "react only",
    "angular only",
    "qa",
    "testing only",
    "support engineer",
    "wordpress",
    "php only",
    "intern",
    "fresher",
    "10+ years required",
]


def _hard_negatives(job: Job, profile: dict, cfg: dict) -> list[str]:
    haystack = normalize_text(f"{job.role} {job.description or ''}")
    hits: list[str] = []
    for n in cfg.get("negative_keywords") or _NEGATIVE_DEFAULT:
        if normalize_text(n) in haystack:
            hits.append(n)
    # Also honor profile.avoid_skills (e.g., "frontend only", "QA only")
    for n in profile.get("avoid_skills") or []:
        if normalize_text(n) in haystack and n not in hits:
            hits.append(n)
    return hits


def _priority_from_score(score: int, cfg: dict) -> Priority:
    t = cfg.get("thresholds") or DEFAULT_THRESHOLDS
    if score >= int(t.get("P0", 80)):
        return Priority.P0
    if score >= int(t.get("P1", 70)):
        return Priority.P1
    if score >= int(t.get("P2", 60)):
        return Priority.P2
    return Priority.IGNORE


def _recommend_variant(matched: list[str], profile: dict, cfg: dict) -> str | None:
    rules: list[dict] = cfg.get("resume_variant_rules") or []
    low_matched = [m.lower() for m in matched]
    for rule in rules:
        if all(k.lower() in low_matched for k in rule.get("all", [])) and (
            not rule.get("any")
            or any(k.lower() in low_matched for k in rule.get("any", []))
        ):
            return rule.get("variant")
    variants = profile.get("resume_variants") or []
    if variants:
        return variants[0].get("name")
    return None


def score_job(
    job: Job,
    profile: dict[str, Any],
    scoring_cfg: dict[str, Any],
    companies_cfg: dict[str, Any],
) -> ScoredJob:
    reasons: list[str] = []
    risks: list[str] = []

    skill_pts, matched, missing = _skill_match_points(
        job.description or "", job.role, profile, scoring_cfg
    )
    if matched:
        reasons.append(f"Skill match: {', '.join(matched[:6])}.")

    level_pts, level_label, level_risks = _level_points(job.description or "", job.role, profile)
    risks += level_risks

    loc_pts, loc_reasons = _location_points(job, profile, scoring_cfg)
    reasons += loc_reasons

    dom_pts, dom_reasons = _domain_points(job, profile, scoring_cfg)
    reasons += dom_reasons

    rec_pts, rec_reasons = _recency_source_points(job, scoring_cfg)
    reasons += rec_reasons

    co_pts, co_priority, co_reasons = _company_match_points(job, companies_cfg)
    reasons += co_reasons

    total = skill_pts + level_pts + loc_pts + dom_pts + rec_pts + co_pts
    total = max(0, min(100, total))

    negatives = _hard_negatives(job, profile, scoring_cfg)
    if negatives:
        risks.append(f"Negative signals: {', '.join(negatives)}.")
        priority = Priority.IGNORE
    else:
        priority = _priority_from_score(total, scoring_cfg)
        # Target P0 companies get a floor of P2 so they surface even if
        # JD text is thin — unless negatives apply (handled above).
        if co_priority == "P0" and priority == Priority.IGNORE:
            priority = Priority.P2

    recommended = _recommend_variant(matched, profile, scoring_cfg)
    next_action = _next_action(priority, co_priority, negatives)

    return ScoredJob(
        job=job,
        fit_score=total,
        priority=priority,
        level_match=level_label,
        matched_skills=matched,
        missing_skills=missing[:8],
        reasons=reasons,
        risks=risks,
        recommended_resume_variant=recommended,
        next_action=next_action,
    )


def _next_action(priority: Priority, company_priority: str | None, negatives: list[str]) -> str:
    if priority == Priority.IGNORE:
        return "Skip"
    if priority == Priority.P0:
        if company_priority in {"P0", "P1"}:
            return "Referral first, then apply"
        return "Apply today"
    if priority == Priority.P1:
        return "Tailor resume and apply within 48h"
    return "Review when queue is empty"


def score_all(
    jobs: list[Job],
    profile: dict,
    scoring_cfg: dict,
    companies_cfg: dict,
) -> list[ScoredJob]:
    out: list[ScoredJob] = []
    for j in jobs:
        try:
            out.append(score_job(j, profile, scoring_cfg, companies_cfg))
        except Exception as e:
            log.warning("scoring failed for %s (%s): %s", j.role, j.company, e)
    return out


# Silence unused import when date is optimized away by static tools.
_ = date
