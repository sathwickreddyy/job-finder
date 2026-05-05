"""Manual jobs from config/manual_jobs.yaml.

This is the primary path for LinkedIn / Naukri / recruiter posts — paste
the posting by hand (or via the UI's Manual Jobs form) and the daily
pipeline scores it like any other source. Never scrape login-gated sites.
"""
from __future__ import annotations

from typing import Any

from ..config_repo import MANUAL_JOBS_YAML, ConfigRepository
from ..models import Job
from ..utils import get_logger, stable_job_id

log = get_logger("sources.manual")


class ManualSource:
    name = "manual"

    def __init__(self, repo: ConfigRepository) -> None:
        self.repo = repo

    def fetch(self, settings: dict[str, Any]) -> list[Job]:
        if not settings.get("enabled", True):
            return []
        try:
            raw = self.repo.load_yaml(MANUAL_JOBS_YAML)
        except Exception as e:
            log.warning("manual: could not load %s: %s", MANUAL_JOBS_YAML, e)
            return []
        entries = raw.get("jobs") or []
        out: list[Job] = []
        for entry in entries:
            role = (entry.get("role") or "").strip()
            company = (entry.get("company") or "").strip()
            url = (entry.get("url") or "").strip()
            if not role or not company:
                log.warning("manual: skipping entry with missing role/company: %s", entry)
                continue
            out.append(
                Job(
                    id=stable_job_id(company, role, url),
                    role=role,
                    company=company,
                    url=url or f"manual://{company}/{role}",
                    source=(entry.get("source") or "manual"),
                    location=entry.get("location"),
                    remote_type=entry.get("remote_type"),
                    posted_date=entry.get("posted_date"),
                    description=entry.get("description"),
                    notes=entry.get("notes"),
                    raw=entry,
                )
            )
        log.info("manual loaded %d jobs from %s", len(out), MANUAL_JOBS_YAML)
        return out
