"""Y Combinator Work-at-a-Startup public feed.

Endpoint: https://www.ycombinator.com/companies/all/jobs.json (no auth).
Applies an India-first filter at normalize time. Per-field tolerance rules
per spec §8.1 — malformed individual postings never kill the batch.
"""
from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any

import httpx

from ..models import Job
from ..utils import get_logger, stable_job_id
from .base import Source, http_get_json, strip_html

log = get_logger("sources.ycombinator")

URL = "https://www.ycombinator.com/companies/all/jobs.json"

_INDIA_RE = re.compile(
    r"\b(india|bengaluru|bangalore|hyderabad|mumbai|delhi|noida|gurgaon|pune|remote)\b",
    re.IGNORECASE,
)


def _first_present(d: dict, keys: tuple[str, ...]) -> Any:
    for k in keys:
        v = d.get(k)
        if v is not None:
            return v
    return None


def _parse_posted(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        try:
            return (
                datetime.fromtimestamp(int(value), tz=timezone.utc)
                .isoformat()
                .replace("+00:00", "Z")
            )
        except (OverflowError, ValueError, OSError):
            return None
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00")).isoformat()
        except ValueError:
            return None
    return None


def _infer_remote_type(item: dict) -> str | None:
    rt = item.get("remote_type")
    if isinstance(rt, str) and rt.strip():
        return rt.strip().lower()
    r = item.get("remote")
    if r is True:
        return "remote"
    return None


def _passes_india_filter(
    location: str | None, remote_type: str | None, company: str, known_companies: list[str]
) -> bool:
    if location and _INDIA_RE.search(location):
        return True
    if remote_type == "remote":
        return True
    if company and company in set(known_companies or []):
        return True
    return False


class YCombinatorSource(Source):
    name = "ycombinator"

    def fetch(self, settings: dict[str, Any]) -> list[Job]:
        if not settings.get("enabled", True):
            return []
        try:
            data = http_get_json(URL)
        except httpx.HTTPError as e:
            log.warning("ycombinator fetch failed: %s", e)
            return []

        postings: list[dict] = data if isinstance(data, list) else data.get("jobs") or []
        known_companies = settings.get("known_companies") or []

        out: list[Job] = []
        for item in postings:
            try:
                job = self._to_job(item, known_companies)
                if job:
                    out.append(job)
            except Exception as e:  # noqa: BLE001
                log.warning("ycombinator: skipped posting id=%s reason=%s", item.get("id"), e)
        log.info("ycombinator collected %d jobs", len(out))
        return out

    def _to_job(self, item: dict, known_companies: list[str]) -> Job | None:
        role = _first_present(item, ("title", "position_title"))
        if not role or not str(role).strip():
            log.warning("ycombinator: missing title in posting id=%s", item.get("id"))
            return None
        role = str(role).strip()

        company_raw = _first_present(item, ("company_name", "startup_name"))
        if isinstance(item.get("company"), dict):
            company_raw = company_raw or item["company"].get("name")
        if isinstance(item.get("startup"), dict):
            company_raw = company_raw or item["startup"].get("name")
        if not company_raw or not str(company_raw).strip():
            log.warning("ycombinator: missing company in posting id=%s", item.get("id"))
            return None
        company = str(company_raw).strip()

        url = _first_present(item, ("url", "apply_url", "job_url"))
        if not url:
            url = f"ycombinator://{company}/{role}"
        else:
            url = str(url).strip()

        location = _first_present(item, ("location", "office_locations", "remote_location"))
        if isinstance(location, list):
            location = ", ".join(str(x) for x in location) if location else None
        elif location is not None:
            location = str(location)

        remote_type = _infer_remote_type(item)

        if not _passes_india_filter(location, remote_type, company, known_companies):
            return None

        posted_date = _parse_posted(
            _first_present(item, ("published_at", "posted_at", "created_at"))
        )

        description = _first_present(item, ("description", "body", "details"))
        description = strip_html(description) if description else ""

        return Job(
            id=stable_job_id(company, role, url),
            role=role,
            company=company,
            url=url,
            source="ycombinator",
            location=location,
            remote_type=remote_type,
            posted_date=posted_date,
            description=description,
            raw=item,
        )
