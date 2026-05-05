"""Lever public postings API.

Endpoint: https://api.lever.co/v0/postings/{company_slug}?mode=json
"""
from __future__ import annotations

from typing import Any

import httpx

from ..models import Job
from ..utils import get_logger, stable_job_id
from .base import Source, http_get_json, strip_html

log = get_logger("sources.lever")

URL_TEMPLATE = "https://api.lever.co/v0/postings/{company_slug}?mode=json"


class LeverSource(Source):
    name = "lever"

    def fetch(self, settings: dict[str, Any]) -> list[Job]:
        if not settings.get("enabled", True):
            return []
        companies: list[dict[str, Any]] = settings.get("companies") or []
        if not companies:
            return []
        out: list[Job] = []
        for c in companies:
            slug = c.get("company_slug")
            if not slug:
                continue
            try:
                data = http_get_json(URL_TEMPLATE.format(company_slug=slug))
            except httpx.HTTPError as e:
                log.warning("lever fetch failed for %s: %s", c.get("name"), e)
                continue
            # Lever returns a list directly
            items = data if isinstance(data, list) else data.get("data") or []
            for item in items:
                try:
                    out.append(self._to_job(item, c.get("name") or slug))
                except Exception as e:
                    log.warning("lever: skipping bad item: %s", e)
        log.info("lever collected %d jobs", len(out))
        return out

    @staticmethod
    def _to_job(item: dict[str, Any], company_name: str) -> Job:
        role = item.get("text") or ""
        url = item.get("hostedUrl") or item.get("applyUrl") or ""
        categories = item.get("categories") or {}
        loc = categories.get("location")
        commitment = categories.get("commitment") or ""
        workplace = (item.get("workplaceType") or "").lower()
        remote_type = workplace if workplace in {"remote", "hybrid", "onsite"} else None
        desc = strip_html(item.get("descriptionPlain") or item.get("description"))
        return Job(
            id=stable_job_id(company_name, role, url),
            role=role.strip(),
            company=company_name,
            url=url,
            source="lever",
            location=loc,
            remote_type=remote_type,
            posted_date=None,  # lever returns createdAt as ms epoch; omit for v1
            description=desc,
            notes=commitment or None,
            raw=item,
        )
