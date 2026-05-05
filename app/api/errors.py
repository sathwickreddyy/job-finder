"""Uniform error envelope {error: {code, message, details}}."""
from __future__ import annotations

from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException


def _envelope(code: str, message: str, details: Any = None, status: int = 400) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content={"error": {"code": code, "message": message, "details": details or {}}},
    )


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError):
        return _envelope("validation", "request validation failed", exc.errors(), status=422)

    @app.exception_handler(HTTPException)
    async def _http(_: Request, exc: HTTPException):
        return _envelope(
            exc.headers.get("X-Error-Code", "http_error") if exc.headers else "http_error",
            str(exc.detail),
            None,
            status=exc.status_code,
        )

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, exc: Exception):
        return _envelope("internal", "unexpected server error", {"type": type(exc).__name__}, status=500)
