"""Source interface + HTTP helpers."""
from __future__ import annotations

import re
from abc import ABC, abstractmethod
from html import unescape
from typing import Any

import httpx

from ..models import Job
from ..utils import get_logger

log = get_logger("sources")

DEFAULT_TIMEOUT = httpx.Timeout(15.0, connect=5.0)
DEFAULT_HEADERS = {"User-Agent": "job-search-agent/0.1 (+local)"}


class Source(ABC):
    name: str = "unknown"

    @abstractmethod
    def fetch(self, settings: dict[str, Any]) -> list[Job]:
        """Return a list of normalized Jobs. Must not raise on network
        failures — should log and return []. Validation/configuration
        errors may raise."""


def http_get_json(url: str, *, params: dict | None = None) -> Any:
    """GET with uniform timeout/headers; returns parsed JSON or raises."""
    with httpx.Client(timeout=DEFAULT_TIMEOUT, headers=DEFAULT_HEADERS) as client:
        resp = client.get(url, params=params)
        resp.raise_for_status()
        return resp.json()


_TAG_RE = re.compile(r"<[^>]+>")


def strip_html(s: str | None) -> str:
    if not s:
        return ""
    text = _TAG_RE.sub(" ", s)
    text = unescape(text)
    return re.sub(r"\s+", " ", text).strip()
