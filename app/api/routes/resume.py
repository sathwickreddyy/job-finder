"""Task 13 — GET/PUT /api/resume.

The resume source module (Task 6) resolves markdown from portfolio-first → local
fallback → none. This module exposes it over HTTP and adds a PUT endpoint that
writes ONLY to local ``resumes/master.md`` — the portfolio repo is never touched
to preserve the one-way read contract."""
from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends

from ...config import Settings
from ...resume.source import read_resume
from ..deps import get_settings
from ..schemas import ResumeIn, ResumeResponse

router = APIRouter(tags=["resume"])


@router.get("/resume", response_model=ResumeResponse)
def get_resume(settings: Settings = Depends(get_settings)) -> ResumeResponse:
    bundle = read_resume(settings)
    return ResumeResponse(
        md_source=bundle.source,
        markdown=bundle.markdown or "",
        has_pdf=bundle.pdf_path is not None,
        has_docx=bundle.docx_path is not None,
    )


@router.put("/resume", response_model=ResumeResponse)
def put_resume(body: ResumeIn, settings: Settings = Depends(get_settings)) -> ResumeResponse:
    local = Path("resumes/master.md")
    local.parent.mkdir(parents=True, exist_ok=True)
    local.write_text(body.markdown, encoding="utf-8")
    bundle = read_resume(settings)
    return ResumeResponse(
        md_source=bundle.source,
        markdown=bundle.markdown or "",
        has_pdf=bundle.pdf_path is not None,
        has_docx=bundle.docx_path is not None,
    )
