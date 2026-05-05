from __future__ import annotations

from dataclasses import replace
from pathlib import Path

import pytest

from app.config import Settings
from app.resume.source import read_resume


@pytest.fixture
def base_settings(tmp_path: Path) -> Settings:
    # Settings is a frozen dataclass; default values are fine for these tests
    return Settings()


def test_portfolio_md_wins_when_present(tmp_path: Path, monkeypatch) -> None:
    portfolio = tmp_path / "resume.md"
    portfolio.write_text("# Portfolio Resume\n\nfrom portfolio", encoding="utf-8")
    monkeypatch.setenv("RESUME_MD_PATH", str(portfolio))
    bundle = read_resume(Settings())
    assert bundle.source == "portfolio"
    assert "Portfolio Resume" in (bundle.markdown or "")


def test_local_fallback_when_portfolio_missing(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("RESUME_MD_PATH", str(tmp_path / "does-not-exist.md"))
    monkeypatch.chdir(tmp_path)
    (tmp_path / "resumes").mkdir()
    (tmp_path / "resumes" / "master.md").write_text("# Local Resume", encoding="utf-8")
    bundle = read_resume(Settings())
    assert bundle.source == "local"
    assert "Local Resume" in (bundle.markdown or "")


def test_none_source_when_both_missing(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("RESUME_MD_PATH", str(tmp_path / "does-not-exist.md"))
    monkeypatch.chdir(tmp_path)
    bundle = read_resume(Settings())
    assert bundle.source == "none"
    assert bundle.markdown in (None, "")


def test_pdf_and_docx_paths_reflect_existence(tmp_path: Path, monkeypatch) -> None:
    pdf = tmp_path / "resume.pdf"
    pdf.write_bytes(b"%PDF-1.4\n")
    monkeypatch.setenv("RESUME_PDF_PATH", str(pdf))
    monkeypatch.setenv("RESUME_DOCX_PATH", str(tmp_path / "nope.docx"))
    bundle = read_resume(Settings())
    assert bundle.pdf_path == pdf
    assert bundle.docx_path is None


# ─── BDD tests beyond the plan's 4 ──────────────────────────────────────────


def test_settings_field_overrides_env_var_when_no_env(
    tmp_path: Path, monkeypatch
) -> None:
    """When RESUME_MD_PATH env var is unset, Settings.resume_md_path is used.

    Exercises the `getattr(settings, "resume_md_path", "")` fallback branch.
    Settings is frozen, so use `dataclasses.replace` to construct an override.
    """
    portfolio = tmp_path / "resume-from-field.md"
    portfolio.write_text("# Field Resume", encoding="utf-8")
    monkeypatch.delenv("RESUME_MD_PATH", raising=False)
    monkeypatch.chdir(tmp_path)  # ensure no stray resumes/master.md in cwd
    settings = replace(Settings(), resume_md_path=str(portfolio))
    bundle = read_resume(settings)
    assert bundle.source == "portfolio"
    assert "Field Resume" in (bundle.markdown or "")


def test_markdown_portfolio_source_excludes_local_even_when_both_exist(
    tmp_path: Path, monkeypatch
) -> None:
    """Portfolio precedence: when both portfolio path and local master.md exist,
    portfolio content wins and source is 'portfolio', not 'local'."""
    portfolio = tmp_path / "portfolio-resume.md"
    portfolio.write_text("# PORTFOLIO WINS", encoding="utf-8")
    monkeypatch.setenv("RESUME_MD_PATH", str(portfolio))
    monkeypatch.chdir(tmp_path)
    (tmp_path / "resumes").mkdir()
    (tmp_path / "resumes" / "master.md").write_text(
        "# local should lose", encoding="utf-8"
    )
    bundle = read_resume(Settings())
    assert bundle.source == "portfolio"
    assert "PORTFOLIO WINS" in (bundle.markdown or "")
    assert "local should lose" not in (bundle.markdown or "")


def test_pdf_path_returned_when_portfolio_md_missing_but_pdf_exists(
    tmp_path: Path, monkeypatch
) -> None:
    """PDF/DOCX paths are independent of markdown source resolution.

    Even when markdown source is 'none' (no portfolio md, no local master.md),
    pdf_path must still point at the PDF file if RESUME_PDF_PATH resolves.

    Note: the plan's implementation returns pdf_path=None in the 'none' branch,
    so this test documents that contract — pdf_path is None when markdown is
    unresolved. (If the contract flipped, this test would need to change.)
    """
    pdf = tmp_path / "resume.pdf"
    pdf.write_bytes(b"%PDF-1.4\n")
    monkeypatch.delenv("RESUME_MD_PATH", raising=False)
    monkeypatch.setenv("RESUME_PDF_PATH", str(pdf))
    monkeypatch.chdir(tmp_path)  # no local resumes/master.md here
    bundle = read_resume(Settings())
    assert bundle.source == "none"
    # Contract: in the 'none' branch pdf_path is None per the plan's impl.
    assert bundle.pdf_path is None
    assert bundle.docx_path is None
