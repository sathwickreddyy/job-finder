import anyio
import pytest
from fastapi.testclient import TestClient

from scoring import api
from tests.test_scoring import make_pdf, metadata


@pytest.fixture
def client(monkeypatch):
    monkeypatch.delenv("SCORING_API_KEY", raising=False)
    with TestClient(api.app) as instance:
        yield instance


def payload():
    return {**metadata().model_dump(), "resume_text": "Built Python, SQL and Docker services."}


def test_text_api_uses_real_worker_and_has_versioned_contract(client):
    response = client.post("/v1/assessments", json=payload())
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["status"] == "completed"
    assert data["resume_version_id"] == "version-a"
    assert data["scores"][0]["value"] == 100
    assert data["engine_version"] == "1.0.0"
    assert response.headers["cache-control"] == "no-store"
    assert client.get("/v1/scoring-methods").status_code == 200
    assert "job_description" in client.get("/v1/metadata-schema").json()["properties"]
    assert "/v1/assessments/pdf" in client.get("/openapi.json").json()["paths"]


def test_pdf_api_uses_real_worker_and_returns_highlights(client):
    response = client.post(
        "/v1/assessments/pdf",
        data={"metadata": metadata().model_dump_json()},
        files={
            "resume": (
                "sample.pdf",
                make_pdf(
                    [
                        "Synthetic Candidate - Software Engineer",
                        "Built Python, SQL and Docker services.",
                    ]
                ),
                "application/pdf",
            )
        },
    )
    assert response.status_code == 200, response.text
    assert response.json()["findings"][0]["resume_evidence"][0]["boxes"][0]["page"] == 1


def test_original_unicode_text_and_whitespace_offsets_are_preserved(client):
    data = payload()
    data["resume_text"] = "  👋 Python SQL Docker  "
    data["job_description"] = "  👋 " + data["job_description"] + "\n"
    response = client.post("/v1/assessments", json=data)
    assert response.status_code == 200
    result = response.json()
    assert result["resume_text"] == data["resume_text"]
    finding = result["findings"][0]
    jd = finding["jd_evidence"]
    assert data["job_description"][jd["start"] : jd["end"]] == jd["text"]
    evidence = finding["resume_evidence"][0]
    assert data["resume_text"][evidence["start"] : evidence["end"]] == "Python"


def test_key_and_origin_checks_happen_before_parsing(client, monkeypatch):
    monkeypatch.setenv("SCORING_API_KEY", "synthetic-test-key")
    assert client.get("/health").status_code == 200
    assert client.post("/v1/assessments", content="invalid").status_code == 401
    assert client.get("/v1/scoring-methods", headers={"X-API-Key": "wrong"}).status_code == 401
    key = {"X-API-Key": "synthetic-test-key"}
    assert client.get("/v1/scoring-methods", headers=key).status_code == 200
    assert (
        client.post(
            "/v1/assessments", json=payload(), headers={**key, "Origin": "https://other.example"}
        ).status_code
        == 403
    )


def test_invalid_input_never_echoes_private_document_contents(client):
    response = client.post(
        "/v1/assessments", json={**payload(), "private_unknown_field": "PRIVATE_RESUME_CONTENT"}
    )
    assert response.status_code == 422
    assert "PRIVATE_RESUME_CONTENT" not in response.text
    response = client.post(
        "/v1/assessments/pdf",
        data={"metadata": "PRIVATE_RESUME_CONTENT"},
        files={"resume": ("private.pdf", b"invalid", "application/pdf")},
    )
    assert response.status_code == 422
    assert "PRIVATE_RESUME_CONTENT" not in response.text


def test_invalid_pdf_and_size_limits(client):
    response = client.post(
        "/v1/assessments/pdf",
        data={"metadata": metadata().model_dump_json()},
        files={"resume": ("sample.pdf", b"invalid", "application/pdf")},
    )
    assert response.status_code == 422
    response = client.post(
        "/v1/assessments", content=b"{}", headers={"content-length": str(api.MAX_BODY_BYTES + 1)}
    )
    assert response.status_code == 413
    # Streaming bodies are limited too, even when no Content-Length is supplied.
    response = client.post("/v1/assessments", content=iter([b"x" * (api.MAX_BODY_BYTES + 1)]))
    assert response.status_code == 413


def test_timeout_returns_capacity_and_keeps_health_available(client, monkeypatch):
    async def slow(*args, **kwargs):
        await anyio.sleep(1)

    original = api.to_process.run_sync
    monkeypatch.setattr(api.to_process, "run_sync", slow)
    monkeypatch.setattr(api, "PROCESS_TIMEOUT_SECONDS", 0.01)
    assert client.post("/v1/assessments", json=payload()).status_code == 504
    assert api.app.state.slots.value == 2
    assert client.get("/health").status_code == 200
    monkeypatch.setattr(api.to_process, "run_sync", original)
    monkeypatch.setattr(api, "PROCESS_TIMEOUT_SECONDS", 20)
    assert client.post("/v1/assessments", json=payload()).status_code == 200


def test_busy_service_returns_retry_after(client, monkeypatch):
    class Busy:
        def acquire_nowait(self):
            raise anyio.WouldBlock

    monkeypatch.setattr(api.app.state, "slots", Busy())
    response = client.post("/v1/assessments", json=payload())
    assert response.status_code == 429
    assert response.headers["retry-after"] == "2"
