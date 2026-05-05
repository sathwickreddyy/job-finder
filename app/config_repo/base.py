"""ConfigRepository interface.

Callers depend on this interface only. Concrete backends are chosen at
startup via `Settings.config_backend`. In v1 we ship:

    - LocalConfigRepository  (default: read/write YAML + resumes from disk)
    - RemoteHttpReadOnlyConfigRepository  (read-only, fetched from URL)

A later GitHubConfigRepository can implement the same interface by
committing changes through the GitHub Contents API. Keeping the write
methods on the base (even though http raises) makes that extension
straightforward.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

# Canonical filenames the app expects.
PROFILE_YAML = "profile.yaml"
COMPANIES_YAML = "companies.yaml"
SCORING_YAML = "scoring.yaml"
SOURCES_YAML = "sources.yaml"
MANUAL_JOBS_YAML = "manual_jobs.yaml"

ALL_CONFIG_FILES = [
    PROFILE_YAML,
    COMPANIES_YAML,
    SCORING_YAML,
    SOURCES_YAML,
    MANUAL_JOBS_YAML,
]


class ConfigRepositoryError(RuntimeError):
    """Raised when a config read/write cannot complete."""


class ReadOnlyRepositoryError(ConfigRepositoryError):
    """Raised when a write is attempted against a read-only backend."""


class ConfigRepository(ABC):
    """Abstract config + resume store."""

    is_read_only: bool = False

    # -- YAML config ---------------------------------------------------------
    @abstractmethod
    def load_yaml(self, filename: str) -> dict[str, Any]:
        """Return parsed YAML dict. Missing file returns {} (v1 default)."""

    @abstractmethod
    def save_yaml(self, filename: str, data: dict[str, Any]) -> None:
        """Persist `data` atomically as YAML."""

    # -- Resume markdown -----------------------------------------------------
    @abstractmethod
    def load_resume(self, rel_path: str) -> str:
        """Return resume markdown contents; '' if missing."""

    @abstractmethod
    def save_resume(self, rel_path: str, content: str) -> None:
        """Persist resume markdown atomically."""

    @abstractmethod
    def list_resume_files(self) -> list[str]:
        """Return resume filenames available in the backend."""

    # -- Convenience ---------------------------------------------------------
    def describe(self) -> str:
        return f"{self.__class__.__name__}(read_only={self.is_read_only})"
