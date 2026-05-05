"""Pydantic request/response schemas for the API.

Kept in one file so `openapi-typescript` can emit a clean TS type bundle."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from ..models import ApplicationStatus, Priority


# ── system ─────────────────────────────────────────────────────────────
class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"
    llm_enabled: bool
    notion_enabled: bool
    outlook_enabled: bool
    gmail_enabled: bool


class CapabilitiesResponse(BaseModel):
    llm_enabled: bool
    llm_provider: str = ""
    notion_enabled: bool
    outlook_enabled: bool
    gmail_enabled: bool
    resume_source: Literal["portfolio", "local", "none"]


# ── jobs ───────────────────────────────────────────────────────────────
class JobOut(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    role: str
    company: str
    url: str
    source: str
    location: Optional[str] = None
    remote_type: Optional[str] = None
    posted_date: Optional[str] = None
    description: Optional[str] = None
    notes: Optional[str] = None


class ScoredJobOut(BaseModel):
    job: JobOut
    fit_score: int
    priority: Priority
    level_match: str = ""
    matched_skills: list[str] = Field(default_factory=list)
    missing_skills: list[str] = Field(default_factory=list)
    reasons: list[str] = Field(default_factory=list)
    risks: list[str] = Field(default_factory=list)
    recommended_resume_variant: Optional[str] = None
    next_action: str = ""
    # Joined application state — null when the user has not tracked the job yet.
    application: Optional["ApplicationOut"] = None


class ApplicationOut(BaseModel):
    status: ApplicationStatus = ApplicationStatus.FOUND
    notes: Optional[str] = None
    next_interview_at: Optional[str] = None
    interview_notes: Optional[str] = None
    applied_at: Optional[str] = None
    rejected_at: Optional[str] = None
    updated_at: Optional[str] = None


class JobDetailOut(BaseModel):
    job: JobOut
    scored: Optional[ScoredJobOut] = None
    application: Optional[ApplicationOut] = None


class StatusPatch(BaseModel):
    status: ApplicationStatus
    notes: Optional[str] = None
    next_interview_at: Optional[str] = None
    interview_notes: Optional[str] = None


class ManualJobIn(BaseModel):
    role: str = Field(min_length=1)
    company: str = Field(min_length=1)
    url: str = Field(min_length=1)
    location: Optional[str] = None
    description: Optional[str] = None
    notes: Optional[str] = None


class TailorOut(BaseModel):
    mode: Literal["deterministic", "llm"]
    ai_pending: bool
    markdown: str


# ── search ─────────────────────────────────────────────────────────────
class SearchRequest(BaseModel):
    location: Optional[str] = None
    keyword: Optional[str] = None
    sources: Optional[list[str]] = None
    use_llm: bool = True


class SourceStat(BaseModel):
    fetched: int = 0
    kept: int = 0
    duration_ms: int = 0
    error: Optional[str] = None


class SearchResponse(BaseModel):
    jobs: list[ScoredJobOut]
    source_stats: dict[str, SourceStat]
    ran_at: str
    duration_ms: int


# ── dashboard ──────────────────────────────────────────────────────────
class UpcomingInterview(BaseModel):
    job_id: str
    role: str
    company: str
    next_interview_at: str


class DashboardResponse(BaseModel):
    counts_by_priority: dict[str, int]
    total_jobs: int
    last_run_at: Optional[str] = None
    upcoming_interviews: list[UpcomingInterview]
    shortlist_top: list[ScoredJobOut]
    latest_source_stats: dict[str, SourceStat] = Field(default_factory=dict)


# ── resume ─────────────────────────────────────────────────────────────
class ResumeResponse(BaseModel):
    md_source: Literal["portfolio", "local", "none"]
    markdown: str = ""
    has_pdf: bool = False
    has_docx: bool = False


class ResumeIn(BaseModel):
    markdown: str


# ── settings ───────────────────────────────────────────────────────────
class ProfileIn(BaseModel):
    model_config = ConfigDict(extra="allow")
    name: Optional[str] = None
    years_of_experience: Optional[int] = None


class CompanyIn(BaseModel):
    model_config = ConfigDict(extra="allow")
    name: str = Field(min_length=1)
    careers_url: Optional[str] = None
    ats_type: str = "unknown"
    board_token: Optional[str] = None
    org_slug: Optional[str] = None
    company_slug: Optional[str] = None
    preferred_locations: list[str] = Field(default_factory=list)
    priority: str = "P2"
    notes: Optional[str] = None
    enabled: bool = True


class CompanyPatch(BaseModel):
    model_config = ConfigDict(extra="allow")
    name: Optional[str] = None
    careers_url: Optional[str] = None
    ats_type: Optional[str] = None
    board_token: Optional[str] = None
    org_slug: Optional[str] = None
    company_slug: Optional[str] = None
    preferred_locations: Optional[list[str]] = None
    priority: Optional[str] = None
    notes: Optional[str] = None
    enabled: Optional[bool] = None


class ScoringIn(BaseModel):
    model_config = ConfigDict(extra="allow")
    thresholds: dict[str, int] = Field(default_factory=dict)
    positive_keywords: list[str] = Field(default_factory=list)
    negative_keywords: list[str] = Field(default_factory=list)
    location_boosts: dict[str, int] = Field(default_factory=dict)
    domain_boosts: dict[str, int] = Field(default_factory=dict)
    company_boosts: dict[str, int] = Field(default_factory=dict)
    source_quality_boosts: dict[str, int] = Field(default_factory=dict)
    resume_variant_rules: list[dict[str, Any]] = Field(default_factory=list)


class SourcesIn(BaseModel):
    model_config = ConfigDict(extra="allow")
    # Each key is a source name → its options dict (with {"enabled": bool} key present).
    # Pydantic would over-constrain; keep permissive.


# Silence unused import warnings
_ = datetime
