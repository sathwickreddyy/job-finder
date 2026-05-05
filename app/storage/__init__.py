"""Storage package."""
from __future__ import annotations

from ..config import Settings
from .base import Store
from .json_export import export_all
from .sqlite_store import SQLiteStore


def build_store(settings: Settings) -> SQLiteStore:
    backend = (settings.storage_backend or "sqlite").lower()
    if backend != "sqlite":
        raise NotImplementedError(f"storage backend '{backend}' not supported in v1")
    return SQLiteStore(settings.sqlite_db_path)


__all__ = ["Store", "SQLiteStore", "build_store", "export_all"]
