"""Task 13 — GET/PUT /api/resume + binary downloads.

The resume source module (Task 6) resolves markdown from portfolio-first → local
fallback → none. This module exposes it over HTTP and adds:

* PUT /api/resume — writes ONLY to local ``resumes/master.md`` so the
  portfolio repo is never touched. Reject writes when the active source is
  portfolio: returning 409 keeps the GET→PUT contract honest (PUT wouldn't
  change what GET returns).
* GET /api/resume/pdf and /api/resume/docx — stream the resolved binary
  paths (portfolio-first), 404 when the file is not configured/present.
"""
from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse

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
    # When the portfolio is the active source, PUT would silently no-op
    # because GET keeps reading the portfolio path. Reject the write so the
    # UI can surface a clear message instead.
    bundle_before = read_resume(settings)
    if bundle_before.source == "portfolio":
        raise HTTPException(
            status_code=409,
            detail=(
                "Resume source is 'portfolio' (read-only). Edit the markdown "
                "in the portfolio repo, or unset RESUME_MD_PATH to edit the "
                "local copy."
            ),
        )
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


@router.get("/resume/pdf")
def get_resume_pdf(settings: Settings = Depends(get_settings)) -> FileResponse:
    bundle = read_resume(settings)
    if bundle.pdf_path is None:
        raise HTTPException(status_code=404, detail="resume PDF not available")
    return FileResponse(
        path=bundle.pdf_path,
        media_type="application/pdf",
        filename="resume.pdf",
    )


@router.get("/resume/docx")
def get_resume_docx(settings: Settings = Depends(get_settings)) -> FileResponse:
    bundle = read_resume(settings)
    if bundle.docx_path is None:
        raise HTTPException(status_code=404, detail="resume DOCX not available")
    return FileResponse(
        path=bundle.docx_path,
        media_type=(
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        ),
        filename="resume.docx",
    )
