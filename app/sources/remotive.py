"""Remotive.com public jobs API.

Docs: https://remotive.com/api-documentation — no auth, CORS-friendly.
We filter to software/backend-ish categories and skip obvious noise in
the scorer downstream."""
from __future__ import annotations

from typing import Any

import httpx

from ..models import Job
from ..utils import get_logger, stable_job_id
from .base import Source, http_get_json, strip_html

log = get_logger("sources.remotive")

URL = "https://remotive.com/api/remote-jobs"
# Remotive uses these category keys
DEFAULT_CATEGORIES = [
    "software-dev",
    "devops",
    "data",
]


class RemotiveSource(Source):
    name = "remotive"

    def fetch(self, settings: dict[str, Any]) -> list[Job]:
        if not settings.get("enabled", True):
            return []
        categories = settings.get("categories") or DEFAULT_CATEGORIES
        limit = int(settings.get("limit", 200))
        jobs: list[Job] = []
        for cat in categories:
            try:
                data = http_get_json(URL, params={"category": cat, "limit": limit})
            except httpx.HTTPError as e:
                log.warning("remotive fetch failed for category=%s: %s", cat, e)
                continue
            for item in data.get("jobs", []):
                try:
                    jobs.append(self._to_job(item))
                except Exception as e:  # normalization errors only
                    log.warning("remotive: skipping bad item: %s", e)
        log.info("remotive collected %d jobs", len(jobs))
        return jobs

    @staticmethod
    def _to_job(item: dict[str, Any]) -> Job:
        role = item.get("title") or ""
        company = item.get("company_name") or ""
        url = item.get("url") or ""
        return Job(
            id=stable_job_id(company, role, url),
            role=role.strip(),
            company=company.strip(),
            url=url,
            source="remotive",
            location=item.get("candidate_required_location") or "Remote",
            remote_type="remote",
            posted_date=item.get("publication_date"),
            description=strip_html(item.get("description")),
            raw=item,
        )
