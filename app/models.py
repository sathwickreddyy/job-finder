"""Pydantic data models shared across sources, storage, scoring, and UI."""
from __future__ import annotations

from enum import StrEnum
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field, HttpUrl


class Priority(StrEnum):
    P0 = "P0"
    P1 = "P1"
    P2 = "P2"
    IGNORE = "Ignore"


class ApplicationStatus(StrEnum):
    FOUND = "Found"
    SHORTLISTED = "Shortlisted"
    NEED_REFERRAL = "Need Referral"
    TAILORING_RESUME = "Tailoring Resume"
    APPLIED = "Applied"
    RECRUITER_REPLY = "Recruiter Reply"
    ASSESSMENT_PENDING = "Assessment Pending"
    INTERVIEWING = "Interviewing"
    REJECTED = "Rejected"
    ARCHIVED = "Archived"


class Job(BaseModel):
    """Normalized job posting from any source."""

    model_config = ConfigDict(extra="ignore")

    id: str
    role: str
    company: str
    url: str
    source: str
    location: Optional[str] = None
    remote_type: Optional[str] = None  # "remote" | "hybrid" | "onsite" | None
    posted_date: Optional[str] = None  # ISO date string if known
    description: Optional[str] = None
    notes: Optional[str] = None
    raw: dict[str, Any] = Field(default_factory=dict)


class ScoredJob(BaseModel):
    """Scored wrapper around a Job. `job` is embedded so downstream
    consumers (shortlist, Notion, UI) have one object to pass around."""

    model_config = ConfigDict(extra="ignore")

    job: Job
    fit_score: int = Field(ge=0, le=100)
    priority: Priority
    level_match: str = ""  # e.g., "SDE2", "Senior", "Mid", "Unknown"
    matched_skills: list[str] = Field(default_factory=list)
    missing_skills: list[str] = Field(default_factory=list)
    reasons: list[str] = Field(default_factory=list)
    risks: list[str] = Field(default_factory=list)
    recommended_resume_variant: Optional[str] = None
    next_action: str = ""


class EmailEvent(BaseModel):
    """Classified email signal used to advance application status."""

    model_config = ConfigDict(extra="ignore")

    id: str
    received_at: str
    sender: str
    subject: str
    snippet: str = ""
    classification: str = "unknown"
    matched_job_id: Optional[str] = None


# Convenience: exported company record (loaded from companies.yaml).
class CompanyConfig(BaseModel):
    model_config = ConfigDict(extra="allow")

    name: str
    careers_url: Optional[HttpUrl] = None
    ats_type: str = "unknown"  # greenhouse | ashby | lever | workday | manual | unknown
    board_token: Optional[str] = None
    org_slug: Optional[str] = None
    company_slug: Optional[str] = None
    preferred_locations: list[str] = Field(default_factory=list)
    priority: str = "P2"
    notes: Optional[str] = None
