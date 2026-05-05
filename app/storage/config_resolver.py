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
    # has_profile() distinguishes "user saved an empty profile" (trust the
    # empty state) from "profile has never been seeded" (fall back to YAML).
    if cstore.has_profile():
        return cstore.get_profile()
    return repo.load_yaml(PROFILE_YAML)


def resolve_scoring(cstore: ConfigStore, repo: ConfigRepository) -> dict[str, Any]:
    if cstore.has_scoring():
        return cstore.get_scoring()
    return repo.load_yaml(SCORING_YAML)


def resolve_sources(cstore: ConfigStore, repo: ConfigRepository) -> dict[str, Any]:
    if cstore.has_sources():
        return cstore.get_sources()
    return repo.load_yaml(SOURCES_YAML)


def resolve_companies(cstore: ConfigStore, repo: ConfigRepository) -> dict[str, Any]:
    """Return {"companies": [...]} — matches YAML shape.

    If the store has ANY row (even all disabled), that's an explicit user
    choice — return the enabled subset (possibly empty). Only fall back to
    YAML when the store has never been seeded. This prevents the "disable
    all companies in UI → run-daily resurrects them from YAML" bug."""
    if cstore.has_companies():
        return {"companies": cstore.list_companies(include_disabled=False)}
    return repo.load_yaml(COMPANIES_YAML)
