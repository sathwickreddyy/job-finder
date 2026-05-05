"""Local filesystem config + resume repository."""
from __future__ import annotations

import os
import tempfile
from pathlib import Path
from typing import Any

import yaml

from ..utils import get_logger
from .base import ConfigRepository, ConfigRepositoryError

log = get_logger("config_repo.local")


class LocalConfigRepository(ConfigRepository):
    is_read_only = False

    def __init__(self, config_dir: Path, resume_dir: Path) -> None:
        self.config_dir = Path(config_dir)
        self.resume_dir = Path(resume_dir)

    # -- YAML ---------------------------------------------------------------
    def _config_path(self, filename: str) -> Path:
        return self.config_dir / filename

    def load_yaml(self, filename: str) -> dict[str, Any]:
        path = self._config_path(filename)
        if not path.exists():
            log.info("config %s missing, returning empty dict", filename)
            return {}
        try:
            with path.open("r", encoding="utf-8") as f:
                data = yaml.safe_load(f) or {}
            if not isinstance(data, dict):
                raise ConfigRepositoryError(
                    f"{filename} must be a YAML mapping at top level"
                )
            return data
        except yaml.YAMLError as e:
            raise ConfigRepositoryError(f"invalid YAML in {filename}: {e}") from e

    def save_yaml(self, filename: str, data: dict[str, Any]) -> None:
        self.config_dir.mkdir(parents=True, exist_ok=True)
        path = self._config_path(filename)
        # Atomic write: temp file in same dir, then rename.
        fd, tmp = tempfile.mkstemp(
            prefix=f".{filename}.", suffix=".tmp", dir=str(self.config_dir)
        )
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                yaml.safe_dump(data, f, sort_keys=False, allow_unicode=True)
            os.replace(tmp, path)
        except Exception:
            # Clean up temp file on failure
            try:
                os.unlink(tmp)
            except OSError:
                pass
            raise

    # -- Resumes ------------------------------------------------------------
    def _resume_path(self, rel_path: str) -> Path:
        # Callers pass repo-relative paths (e.g. "resumes/master.md").
        # Accept either "resumes/master.md" or "master.md".
        p = Path(rel_path)
        if p.is_absolute():
            return p
        if p.parts and p.parts[0] == self.resume_dir.name:
            return Path(*p.parts)  # already includes resume_dir
        return self.resume_dir / p

    def load_resume(self, rel_path: str) -> str:
        path = self._resume_path(rel_path)
        if not path.exists():
            log.warning("resume %s missing", path)
            return ""
        return path.read_text(encoding="utf-8")

    def save_resume(self, rel_path: str, content: str) -> None:
        path = self._resume_path(rel_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp = tempfile.mkstemp(
            prefix=f".{path.name}.", suffix=".tmp", dir=str(path.parent)
        )
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                f.write(content)
            os.replace(tmp, path)
        except Exception:
            try:
                os.unlink(tmp)
            except OSError:
                pass
            raise

    def list_resume_files(self) -> list[str]:
        if not self.resume_dir.exists():
            return []
        return sorted(p.name for p in self.resume_dir.glob("*.md"))
