"""Ashby public job board API.

Endpoint (public): https://api.ashbyhq.com/posting-api/job-board/{org_slug}
Ashby has published this read-only feed for many companies; if a given
company uses the non-public API we simply get a 404 and skip.
"""
from __future__ import annotations

from typing import Any

import httpx

from ..models import Job
from ..utils import get_logger, stable_job_id
from .base import Source, http_get_json, strip_html

log = get_logger("sources.ashby")

URL_TEMPLATE = "https://api.ashbyhq.com/posting-api/job-board/{org_slug}?includeCompensation=true"


class AshbySource(Source):
    name = "ashby"

    def fetch(self, settings: dict[str, Any]) -> list[Job]:
        if not settings.get("enabled", True):
            return []
        companies: list[dict[str, Any]] = settings.get("companies") or []
        if not companies:
            return []
        out: list[Job] = []
        for c in companies:
            slug = c.get("org_slug")
            if not slug:
                continue
            try:
                data = http_get_json(URL_TEMPLATE.format(org_slug=slug))
            except httpx.HTTPError as e:
                log.warning("ashby fetch failed for %s: %s", c.get("name"), e)
                continue
            for item in data.get("jobs", []):
                try:
                    out.append(self._to_job(item, c.get("name") or slug))
                except Exception as e:
                    log.warning("ashby: skipping bad item: %s", e)
        log.info("ashby collected %d jobs", len(out))
        return out

    @staticmethod
    def _to_job(item: dict[str, Any], company_name: str) -> Job:
        role = item.get("title") or ""
        url = item.get("jobUrl") or item.get("applyUrl") or ""
        loc = item.get("locationName")
        is_remote = bool(item.get("isRemote"))
        description = strip_html(item.get("descriptionHtml") or item.get("descriptionPlain"))
        return Job(
            id=stable_job_id(company_name, role, url),
            role=role.strip(),
            company=company_name,
            url=url,
            source="ashby",
            location=loc,
            remote_type="remote" if is_remote else None,
            posted_date=item.get("publishedDate"),
            description=description,
            raw=item,
        )
