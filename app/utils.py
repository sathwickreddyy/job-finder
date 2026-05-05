"""Small, dependency-free helpers used across the app."""
from __future__ import annotations

import hashlib
import logging
import os
import re
import sys
from datetime import datetime, timezone
from typing import Iterable

_LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO").upper()


def get_logger(name: str) -> logging.Logger:
    """Uniform stderr logger; safe to call repeatedly."""
    logger = logging.getLogger(name)
    if not logger.handlers:
        handler = logging.StreamHandler(sys.stderr)
        handler.setFormatter(
            logging.Formatter("%(asctime)s %(levelname)-5s %(name)s: %(message)s")
        )
        logger.addHandler(handler)
        logger.setLevel(_LOG_LEVEL)
        logger.propagate = False
    return logger


def utcnow_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


_WS_RE = re.compile(r"\s+")


def normalize_text(s: str | None) -> str:
    if not s:
        return ""
    return _WS_RE.sub(" ", s).strip().lower()


def stable_job_id(company: str, role: str, url: str) -> str:
    """Content-hash id — same company+role+url always hashes to same id.

    Using the URL keeps different postings of the same role (e.g., two
    Greenhouse jobs) distinct, while lowercasing absorbs trivial casing
    differences between sources."""
    key = f"{normalize_text(company)}|{normalize_text(role)}|{(url or '').strip().lower()}"
    return hashlib.sha256(key.encode("utf-8")).hexdigest()[:16]


def any_contains(haystack: str, needles: Iterable[str]) -> list[str]:
    """Return the subset of `needles` that appear in `haystack` (case-insensitive)."""
    h = normalize_text(haystack)
    return [n for n in needles if n and normalize_text(n) in h]


def truncate(s: str | None, n: int = 400) -> str:
    if not s:
        return ""
    s = s.strip()
    return s if len(s) <= n else s[: n - 1] + "…"
