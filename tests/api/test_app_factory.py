"""Task 7 smoke tests — app factory wiring, error envelope shape."""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.api import app as module_app, create_app


def test_create_app_returns_fastapi_instance() -> None:
    a = create_app()
    assert a.title == "job-finder API"
    assert a.version == "2.0"


def test_module_level_app_is_singleton_per_import() -> None:
    from app.api import app as again
    assert again is module_app


def test_404_error_envelope_shape() -> None:
    # Unregistered path hits the HTTPException handler → uniform envelope.
    client = TestClient(module_app)
    r = client.get("/api/does-not-exist")
    assert r.status_code == 404
    body = r.json()
    assert "error" in body
    assert set(body["error"]) >= {"code", "message", "details"}
