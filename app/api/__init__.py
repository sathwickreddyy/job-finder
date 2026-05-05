"""FastAPI app factory.

Routes are registered by including each router module. No business logic lives here."""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .errors import install_error_handlers


def create_app() -> FastAPI:
    app = FastAPI(
        title="job-finder API",
        version="2.0",
        docs_url="/docs",
        redoc_url=None,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:47130"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    install_error_handlers(app)

    # Register routers
    from .routes import system, jobs, search, dashboard, resume, settings  # noqa: WPS433 (late import, avoids circular deps)
    app.include_router(system.router, prefix="/api")
    app.include_router(jobs.router, prefix="/api")
    app.include_router(search.router, prefix="/api")
    app.include_router(dashboard.router, prefix="/api")
    app.include_router(resume.router, prefix="/api")
    app.include_router(settings.router, prefix="/api")

    return app


app = create_app()
