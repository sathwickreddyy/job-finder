"""Config repository factory."""
from __future__ import annotations

from ..config import Settings
from .base import (
    ALL_CONFIG_FILES,
    COMPANIES_YAML,
    MANUAL_JOBS_YAML,
    PROFILE_YAML,
    SCORING_YAML,
    SOURCES_YAML,
    ConfigRepository,
    ConfigRepositoryError,
    ReadOnlyRepositoryError,
)
from .local_repo import LocalConfigRepository
from .remote_http_repo import RemoteHttpReadOnlyConfigRepository


def build_config_repository(settings: Settings) -> ConfigRepository:
    backend = (settings.config_backend or "local").lower()
    if backend == "http":
        return RemoteHttpReadOnlyConfigRepository(
            settings.config_source_url, settings.resume_source_url
        )
    return LocalConfigRepository(settings.config_dir, settings.resume_dir)


__all__ = [
    "ALL_CONFIG_FILES",
    "COMPANIES_YAML",
    "MANUAL_JOBS_YAML",
    "PROFILE_YAML",
    "SCORING_YAML",
    "SOURCES_YAML",
    "ConfigRepository",
    "ConfigRepositoryError",
    "ReadOnlyRepositoryError",
    "LocalConfigRepository",
    "RemoteHttpReadOnlyConfigRepository",
    "build_config_repository",
]
