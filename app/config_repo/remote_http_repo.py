"""Read-only HTTP-backed config + resume repository.

v1 treats remote config as read-only. Writes raise so the UI can
disable save buttons up-front rather than attempting HTTP PUT."""
from __future__ import annotations

from typing import Any
from urllib.parse import urljoin

import httpx
import yaml

from ..utils import get_logger
from .base import ConfigRepository, ConfigRepositoryError, ReadOnlyRepositoryError

log = get_logger("config_repo.http")


class RemoteHttpReadOnlyConfigRepository(ConfigRepository):
    is_read_only = True

    def __init__(self, config_source_url: str, resume_source_url: str) -> None:
        # Ensure trailing slash so urljoin resolves correctly.
        self.config_base = self._with_trailing_slash(config_source_url)
        self.resume_base = self._with_trailing_slash(resume_source_url)
        self._client = httpx.Client(timeout=10.0, follow_redirects=True)

    @staticmethod
    def _with_trailing_slash(url: str) -> str:
        if not url:
            return ""
        return url if url.endswith("/") else url + "/"

    def _get(self, base: str, name: str) -> str:
        if not base:
            raise ConfigRepositoryError(
                "remote config backend selected but URL is not configured"
            )
        url = urljoin(base, name)
        try:
            resp = self._client.get(url)
            resp.raise_for_status()
            return resp.text
        except httpx.HTTPError as e:
            raise ConfigRepositoryError(f"failed to fetch {url}: {e}") from e

    def load_yaml(self, filename: str) -> dict[str, Any]:
        try:
            text = self._get(self.config_base, filename)
        except ConfigRepositoryError:
            # Allow missing optional files (e.g., manual_jobs.yaml) to act as empty.
            log.info("remote %s not available, treating as empty", filename)
            return {}
        try:
            data = yaml.safe_load(text) or {}
        except yaml.YAMLError as e:
            raise ConfigRepositoryError(
                f"invalid YAML in remote {filename}: {e}"
            ) from e
        if not isinstance(data, dict):
            raise ConfigRepositoryError(
                f"remote {filename} must be a YAML mapping at top level"
            )
        return data

    def save_yaml(self, filename: str, data: dict[str, Any]) -> None:
        raise ReadOnlyRepositoryError(
            "remote HTTP config backend is read-only in v1; "
            "switch CONFIG_BACKEND=local to save changes"
        )

    def load_resume(self, rel_path: str) -> str:
        name = rel_path.rsplit("/", 1)[-1]  # strip any resume_dir prefix
        try:
            return self._get(self.resume_base, name)
        except ConfigRepositoryError:
            log.warning("remote resume %s not available", name)
            return ""

    def save_resume(self, rel_path: str, content: str) -> None:
        raise ReadOnlyRepositoryError(
            "remote HTTP config backend is read-only in v1"
        )

    def list_resume_files(self) -> list[str]:
        # The backend doesn't expose directory listings. Callers should rely
        # on `profile.yaml.resume_variants` (source of truth for names).
        return []
