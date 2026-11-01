import hmac
import os
from contextlib import asynccontextmanager
from typing import Annotated

import anyio
from anyio import to_process
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.exceptions import RequestValidationError
from pydantic import ValidationError
from starlette.responses import JSONResponse

from scoring.engine import ENGINE_VERSION, METHODS, calculate
from scoring.extraction import MAX_PDF_BYTES, DocumentError
from scoring.models import Assessment, Metadata, TextRequest

MAX_BODY_BYTES = 11 * 1024 * 1024
PROCESS_TIMEOUT_SECONDS = 20


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.slots = anyio.Semaphore(2)
    yield


app = FastAPI(
    title="Resume compatibility scoring",
    version="0.1.0",
    lifespan=lifespan,
    description="Independent stateless lexical scoring. No employer ATS or interview predictions. "
    "PDFs are processed in memory and results are not stored by this service.",
)


class RequestBoundary:
    """Reject browser cross-origin access; bound uploads before multipart/JSON parsing."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        headers = {key.lower(): value for key, value in scope["headers"]}
        key = os.environ.get("SCORING_API_KEY", "")
        error = None
        if scope["path"] != "/health":
            if key and not hmac.compare_digest(headers.get(b"x-api-key", b""), key.encode()):
                error = JSONResponse({"error": "Invalid or missing X-API-Key"}, status_code=401)
            # Service-to-service and terminal requests only. Browser UI goes through JobOps.
            elif b"origin" in headers or headers.get(b"sec-fetch-site") == b"cross-site":
                error = JSONResponse(
                    {"error": "Use the JobOps server to call this API"}, status_code=403
                )
        if error:
            return await error(scope, receive, send)

        async def private_send(message):
            if message["type"] == "http.response.start":
                message["headers"] = [
                    *message.get("headers", []),
                    (b"cache-control", b"no-store"),
                    (b"x-content-type-options", b"nosniff"),
                ]
            await send(message)

        if scope["method"] in ("POST", "PUT", "PATCH"):
            try:
                declared = int(headers.get(b"content-length", b"0"))
            except ValueError:
                return await JSONResponse({"error": "Invalid Content-Length"}, 400)(
                    scope, receive, private_send
                )
            chunks = []
            size = 0
            while True:
                if declared > MAX_BODY_BYTES or size > MAX_BODY_BYTES:
                    return await JSONResponse({"error": "Request exceeds 11 MiB"}, 413)(
                        scope, receive, private_send
                    )
                message = await receive()
                if message["type"] == "http.disconnect":
                    return
                chunk = message.get("body", b"")
                size += len(chunk)
                if size > MAX_BODY_BYTES:
                    return await JSONResponse({"error": "Request exceeds 11 MiB"}, 413)(
                        scope, receive, private_send
                    )
                chunks.append(chunk)
                if not message.get("more_body", False):
                    break
            buffered = b"".join(chunks)
            delivered = False

            async def replay():
                nonlocal delivered
                if not delivered:
                    delivered = True
                    return {"type": "http.request", "body": buffered, "more_body": False}
                return await receive()

            return await self.app(scope, replay, private_send)
        return await self.app(scope, receive, private_send)


app.add_middleware(RequestBoundary)


def invalid_fields(errors: list[dict]) -> JSONResponse:
    # Pydantic includes input values by default; these can be an entire private resume.
    return JSONResponse(
        {
            "error": "Invalid assessment request",
            "issues": [{"location": list(error["loc"]), "type": error["type"]} for error in errors],
        },
        status_code=422,
    )


@app.exception_handler(RequestValidationError)
async def validation_error(_request, error):
    return invalid_fields(error.errors())


@app.get("/health")
def health():
    return {"status": "ok", "engine_version": ENGINE_VERSION}


@app.get("/v1/scoring-methods")
def methods():
    return {
        "engine": "jobops-lexical",
        "engine_version": ENGINE_VERSION,
        "methods": METHODS,
        "missing_values": "null means unavailable, never zero",
        "offsets": "Unicode code point offsets into resume_text or original JD; end exclusive",
        "boxes": "1-based page, PDF points, top-left origin, using returned page width/height",
        "persistence": "none; caller stores the response against exact input versions",
    }


async def run_assessment(data: str | bytes, metadata: Metadata, input_kind: str):
    try:
        app.state.slots.acquire_nowait()
    except anyio.WouldBlock as exc:
        raise HTTPException(
            429, "Scoring capacity is busy; retry later", headers={"Retry-After": "2"}
        ) from exc
    try:
        # A cancellation kills this subprocess, rather than leaving a runaway parser thread.
        with anyio.fail_after(PROCESS_TIMEOUT_SECONDS):
            return await to_process.run_sync(
                calculate, data, metadata.model_dump(), input_kind, cancellable=True
            )
    except TimeoutError as exc:
        raise HTTPException(504, "Document processing timed out") from exc
    except DocumentError as exc:
        raise HTTPException(422, str(exc)) from exc
    except Exception as exc:
        raise HTTPException(503, "Assessment worker unavailable; retry later") from exc
    finally:
        app.state.slots.release()


@app.post("/v1/assessments", response_model=Assessment)
async def assess_text(payload: TextRequest):
    metadata = Metadata.model_validate(payload.model_dump(exclude={"resume_text"}))
    return await run_assessment(payload.resume_text, metadata, "text")


@app.post("/v1/assessments/pdf", response_model=Assessment)
async def assess_pdf(
    resume: Annotated[UploadFile, File(description="Text-based PDF, at most 10 MiB / 12 pages")],
    metadata: Annotated[str, Form(description="JSON conforming to the Metadata schema")],
):
    try:
        if len(metadata) > 300_000:
            raise HTTPException(413, "Metadata exceeds 300,000 characters")
        try:
            parsed = Metadata.model_validate_json(metadata)
        except ValidationError as exc:
            return invalid_fields(exc.errors())
        data = await resume.read(MAX_PDF_BYTES + 1)
        if len(data) > MAX_PDF_BYTES:
            raise HTTPException(413, "PDF exceeds 10 MiB")
        return await run_assessment(data, parsed, "pdf")
    finally:
        await resume.close()


@app.get("/v1/metadata-schema")
def metadata_schema():
    """Multipart metadata schema for generated clients and external assistants."""
    return Metadata.model_json_schema()


original_openapi = app.openapi


def openapi():
    schema = original_openapi()
    schema.setdefault("components", {}).setdefault("securitySchemes", {})["ServiceKey"] = {
        "type": "apiKey",
        "in": "header",
        "name": "X-API-Key",
        "description": "Required with SCORING_API_KEY; otherwise trusted local access only.",
    }
    schema["security"] = [{"ServiceKey": []}]
    schema["paths"]["/health"]["get"]["security"] = []
    return schema


app.openapi = openapi
