"""Greenhouse job board API.

Endpoint: https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs
Board token comes from companies.yaml. We skip companies without one
instead of guessing slugs.
"""
from __future__ import annotations

from typing import Any

import httpx

from ..models import Job
from ..utils import get_logger, stable_job_id
from .base import Source, http_get_json, strip_html

log = get_logger("sources.greenhouse")

URL_TEMPLATE = (
    "https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs?content=true"
)


class GreenhouseSource(Source):
    name = "greenhouse"

    def fetch(self, settings: dict[str, Any]) -> list[Job]:
        if not settings.get("enabled", True):
            return []
        companies: list[dict[str, Any]] = settings.get("companies") or []
        if not companies:
            log.info("greenhouse: no companies configured, skipping")
            return []
        out: list[Job] = []
        for c in companies:
            token = c.get("board_token")
            if not token:
                continue
            try:
                data = http_get_json(URL_TEMPLATE.format(board_token=token))
            except httpx.HTTPError as e:
                log.warning("greenhouse fetch failed for %s: %s", c.get("name"), e)
                continue
            for item in data.get("jobs", []):
                try:
                    out.append(self._to_job(item, c.get("name") or token))
                except Exception as e:
                    log.warning("greenhouse: skipping bad item: %s", e)
        log.info("greenhouse collected %d jobs", len(out))
        return out

    @staticmethod
    def _to_job(item: dict[str, Any], company_name: str) -> Job:
        role = item.get("title") or ""
        url = item.get("absolute_url") or ""
        loc = (item.get("location") or {}).get("name")
        description = strip_html(item.get("content"))
        return Job(
            id=stable_job_id(company_name, role, url),
            role=role.strip(),
            company=company_name,
            url=url,
            source="greenhouse",
            location=loc,
            remote_type=None,
            posted_date=item.get("updated_at"),
            description=description,
            raw=item,
        )
