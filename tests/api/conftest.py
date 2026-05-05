from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(tmp_path: Path, monkeypatch) -> TestClient:
    # Point settings at an isolated DB for each test session
    monkeypatch.setenv("SQLITE_DB_PATH", str(tmp_path / "t.db"))
    monkeypatch.setenv("CONFIG_DIR", str(tmp_path / "config"))
    monkeypatch.setenv("RESUME_DIR", str(tmp_path / "resumes"))
    # Bust the lru_cache on Settings
    from app.api.deps import get_settings
    get_settings.cache_clear()
    from app.api import create_app
    return TestClient(create_app())
