"""FastAPI dependency-injection helpers — load settings/store once per request."""
from __future__ import annotations

from functools import lru_cache

from ..config import Settings, load_settings
from ..config_repo import ConfigRepository, build_config_repository
from ..storage import SQLiteStore, build_store
from ..storage.config_store import ConfigStore


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return load_settings()


def get_store() -> SQLiteStore:
    store = build_store(get_settings())
    store.init_schema()
    return store


def get_config_store() -> ConfigStore:
    s = get_settings()
    cs = ConfigStore(s.sqlite_db_path)
    cs.init_schema()
    return cs


def get_config_repo() -> ConfigRepository:
    return build_config_repository(get_settings())
