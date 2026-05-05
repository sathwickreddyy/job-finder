"""Resolve runtime config from ConfigStore with YAML fallback.

Settings UI writes to ConfigStore (SQLite). The search/scoring/CLI pipelines
historically read from YAML via ConfigRepository. This resolver is the seam
that lets UI edits actually affect collection/scoring: if the ConfigStore
table has rows, those win; otherwise we fall back to the YAML repo.

The resolvers always return shapes the downstream pipeline already expects —
e.g. ``resolve_companies`` returns ``{"companies": [...]}`` so
``_companies_with`` keeps working unchanged.
"""
from __future__ import annotations

from typing import Any

from ..config_repo import (
    COMPANIES_YAML,
    PROFILE_YAML,
    SCORING_YAML,
    SOURCES_YAML,
    ConfigRepository,
)
from .config_store import ConfigStore


def resolve_profile(cstore: ConfigStore, repo: ConfigRepository) -> dict[str, Any]:
    db = cstore.get_profile()
    if db:
        return db
    return repo.load_yaml(PROFILE_YAML)


def resolve_scoring(cstore: ConfigStore, repo: ConfigRepository) -> dict[str, Any]:
    db = cstore.get_scoring()
    if db:
        return db
    return repo.load_yaml(SCORING_YAML)


def resolve_sources(cstore: ConfigStore, repo: ConfigRepository) -> dict[str, Any]:
    db = cstore.get_sources()
    if db:
        return db
    return repo.load_yaml(SOURCES_YAML)


def resolve_companies(cstore: ConfigStore, repo: ConfigRepository) -> dict[str, Any]:
    """Return {"companies": [...]} — matches YAML shape.

    Disabled rows are excluded at the ConfigStore layer so the pipeline never
    fetches from companies the user has soft-deleted in the UI."""
    rows = cstore.list_companies(include_disabled=False)
    if rows:
        return {"companies": rows}
    return repo.load_yaml(COMPANIES_YAML)
