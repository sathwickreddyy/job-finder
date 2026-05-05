"""Resolve the active resume markdown + PDF/DOCX paths.

Read order for the markdown:
  1. Settings.resume_md_path if the file exists  → source="portfolio"
  2. resumes/master.md in the current working dir → source="local"
  3. return empty string                          → source="none"

PDF/DOCX paths are returned only if the file actually exists; UI decides
whether to render "Download" links."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Literal, Optional

from ..config import Settings


@dataclass
class ResumeBundle:
    markdown: Optional[str]
    pdf_path: Optional[Path]
    docx_path: Optional[Path]
    source: Literal["portfolio", "local", "none"]


def read_resume(settings: Settings) -> ResumeBundle:
    import os

    md_env = os.environ.get("RESUME_MD_PATH") or getattr(settings, "resume_md_path", "")
    pdf_env = os.environ.get("RESUME_PDF_PATH") or getattr(settings, "resume_pdf_path", "")
    docx_env = os.environ.get("RESUME_DOCX_PATH") or getattr(settings, "resume_docx_path", "")

    portfolio_md = Path(md_env) if md_env else None
    if portfolio_md and portfolio_md.is_file():
        return ResumeBundle(
            markdown=portfolio_md.read_text(encoding="utf-8"),
            pdf_path=_path_if_exists(pdf_env),
            docx_path=_path_if_exists(docx_env),
            source="portfolio",
        )

    local = Path("resumes/master.md")
    if local.is_file():
        return ResumeBundle(
            markdown=local.read_text(encoding="utf-8"),
            pdf_path=_path_if_exists(pdf_env),
            docx_path=_path_if_exists(docx_env),
            source="local",
        )

    return ResumeBundle(markdown=None, pdf_path=None, docx_path=None, source="none")


def _path_if_exists(raw: str) -> Optional[Path]:
    if not raw:
        return None
    p = Path(raw)
    return p if p.is_file() else None
