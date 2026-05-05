"""Sources package + pipeline-level fetch_all.

`fetch_all` is fault-tolerant at the source level: a bad Ashby endpoint
never blocks Remotive + Greenhouse + manual jobs from landing.
"""
from __future__ import annotations

import time as _time
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
from .ycombinator import YCombinatorSource

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
        cfg = dict(sources_cfg.get("ycombinator") or {})
        known = [c.get("name") for c in (companies_cfg.get("companies") or []) if c.get("name")]
        cfg.setdefault("known_companies", known)
        out += YCombinatorSource().fetch(cfg)
    except Exception as e:
        log.warning("ycombinator source errored: %s", e)

    try:
        cfg = dict(sources_cfg.get("lever") or {})
        cfg.setdefault("companies", _companies_with("lever", companies_cfg))
        out += LeverSource().fetch(cfg)
    except Exception as e:
        log.warning("lever source errored: %s", e)

    log.info("fetch_all collected %d total jobs (pre-dedupe)", len(out))
    return out


def fetch_all_with_stats(
    repo: ConfigRepository,
    sources_cfg: dict[str, Any],
    companies_cfg: dict[str, Any],
) -> tuple[list[Job], dict[str, dict]]:
    """Like fetch_all but returns per-source {fetched, kept, duration_ms, error}.

    `fetched` here equals the count kept by the source normalizer (our sources
    don't expose raw counts separately). This is an acceptable approximation
    for v2 surface — we surface errors and latency, which is what matters."""
    stats: dict[str, dict] = {}
    all_jobs: list[Job] = []

    def _run(name: str, fn):
        t0 = _time.monotonic()
        kept = 0
        error: str | None = None
        try:
            res = fn()
            kept = len(res)
            all_jobs.extend(res)
        except Exception as e:  # noqa: BLE001
            error = str(e)
        stats[name] = {
            "fetched": kept,
            "kept": kept,
            "duration_ms": int((_time.monotonic() - t0) * 1000),
            "error": error,
        }

    _run("manual", lambda: ManualSource(repo).fetch(sources_cfg.get("manual") or {}))
    _run("remotive", lambda: RemotiveSource().fetch(sources_cfg.get("remotive") or {}))

    def _gh():
        cfg = dict(sources_cfg.get("greenhouse") or {})
        cfg.setdefault("companies", _companies_with("greenhouse", companies_cfg))
        return GreenhouseSource().fetch(cfg)
    _run("greenhouse", _gh)

    def _ashby():
        cfg = dict(sources_cfg.get("ashby") or {})
        cfg.setdefault("companies", _companies_with("ashby", companies_cfg))
        return AshbySource().fetch(cfg)
    _run("ashby", _ashby)

    def _yc():
        cfg = dict(sources_cfg.get("ycombinator") or {})
        known = [c.get("name") for c in (companies_cfg.get("companies") or []) if c.get("name")]
        cfg.setdefault("known_companies", known)
        return YCombinatorSource().fetch(cfg)
    _run("ycombinator", _yc)

    def _lever():
        cfg = dict(sources_cfg.get("lever") or {})
        cfg.setdefault("companies", _companies_with("lever", companies_cfg))
        return LeverSource().fetch(cfg)
    _run("lever", _lever)

    return all_jobs, stats


__all__ = [
    "Source",
    "ManualSource",
    "RemotiveSource",
    "GreenhouseSource",
    "AshbySource",
    "LeverSource",
    "YCombinatorSource",
    "fetch_all",
    "fetch_all_with_stats",
]
