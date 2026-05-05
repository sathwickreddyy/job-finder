"""Sources package + pipeline-level fetch_all.

`fetch_all` is fault-tolerant at the source level: a bad Ashby endpoint
never blocks Remotive + Greenhouse + manual jobs from landing.
"""
from __future__ import annotations

from typing import Any

from ..config_repo import ConfigRepository
from ..models import Job
from ..utils import get_logger
from .ashby import AshbySource
from .base import Source
from .greenhouse import GreenhouseSource
from .lever import LeverSource
from .manual import ManualSource
from .remotive import RemotiveSource

log = get_logger("sources.pipeline")


def _companies_with(ats_type: str, companies_cfg: dict[str, Any]) -> list[dict]:
    rows: list[dict] = companies_cfg.get("companies") or []
    return [c for c in rows if (c.get("ats_type") or "").lower() == ats_type]


def fetch_all(
    repo: ConfigRepository,
    sources_cfg: dict[str, Any],
    companies_cfg: dict[str, Any],
) -> list[Job]:
    """Run every enabled source and merge the results.

    `sources_cfg` is the parsed `sources.yaml`. Companies needing ATS-specific
    tokens/slugs come from `companies.yaml` and are injected per source.
    """
    out: list[Job] = []

    # Manual first so paste-in jobs win dedupe ordering over aggregators.
    try:
        manual_cfg = sources_cfg.get("manual") or {}
        out += ManualSource(repo).fetch(manual_cfg)
    except Exception as e:
        log.warning("manual source errored: %s", e)

    try:
        out += RemotiveSource().fetch(sources_cfg.get("remotive") or {})
    except Exception as e:
        log.warning("remotive source errored: %s", e)

    try:
        cfg = dict(sources_cfg.get("greenhouse") or {})
        cfg.setdefault("companies", _companies_with("greenhouse", companies_cfg))
        out += GreenhouseSource().fetch(cfg)
    except Exception as e:
        log.warning("greenhouse source errored: %s", e)

    try:
        cfg = dict(sources_cfg.get("ashby") or {})
        cfg.setdefault("companies", _companies_with("ashby", companies_cfg))
        out += AshbySource().fetch(cfg)
    except Exception as e:
        log.warning("ashby source errored: %s", e)

    try:
        cfg = dict(sources_cfg.get("lever") or {})
        cfg.setdefault("companies", _companies_with("lever", companies_cfg))
        out += LeverSource().fetch(cfg)
    except Exception as e:
        log.warning("lever source errored: %s", e)

    log.info("fetch_all collected %d total jobs (pre-dedupe)", len(out))
    return out


__all__ = [
    "Source",
    "ManualSource",
    "RemotiveSource",
    "GreenhouseSource",
    "AshbySource",
    "LeverSource",
    "fetch_all",
]
