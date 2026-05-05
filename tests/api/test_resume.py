"""Task 13 — GET/PUT /api/resume routes."""
from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient


# ── plan tests ─────────────────────────────────────────────────────────
def test_resume_returns_none_when_absent(client: TestClient, tmp_path: Path, monkeypatch) -> None:
    # chdir into an empty tmp so the local resumes/master.md fallback cannot resolve.
    monkeypatch.chdir(tmp_path)
    r = client.get("/api/resume")
    assert r.status_code == 200
    body = r.json()
    assert body["md_source"] == "none"
    assert body["markdown"] == ""


def test_put_resume_writes_local(client: TestClient, tmp_path: Path, monkeypatch) -> None:
    monkeypatch.chdir(tmp_path)
    (tmp_path / "resumes").mkdir()
    r = client.put("/api/resume", json={"markdown": "# New Resume\n\nhi"})
    assert r.status_code == 200
    assert (tmp_path / "resumes" / "master.md").read_text().startswith("# New Resume")


# ── BDD additions ──────────────────────────────────────────────────────
def test_put_resume_rejects_save_when_source_is_portfolio(tmp_path: Path, monkeypatch) -> None:
    """BDD: PUT /api/resume is rejected with 409 when the active source is
    portfolio — otherwise a successful save would silently no-op (GET keeps
    reading the unchanged portfolio file). Portfolio path must stay
    untouched, and no local file is created."""
    portfolio = tmp_path / "portfolio_resume.md"
    original_content = "# Portfolio Resume\n\nuntouched"
    portfolio.write_text(original_content, encoding="utf-8")

    monkeypatch.setenv("SQLITE_DB_PATH", str(tmp_path / "t.db"))
    monkeypatch.setenv("CONFIG_DIR", str(tmp_path / "config"))
    monkeypatch.setenv("RESUME_DIR", str(tmp_path / "resumes"))
    monkeypatch.setenv("RESUME_MD_PATH", str(portfolio))
    monkeypatch.chdir(tmp_path)

    from app.api.deps import get_settings
    get_settings.cache_clear()
    from app.api import create_app
    c = TestClient(create_app())

    r = c.put("/api/resume", json={"markdown": "# Overwrite attempt"})
    assert r.status_code == 409

    # Portfolio path untouched.
    assert portfolio.read_text(encoding="utf-8") == original_content
    # Local should not be created since write was rejected.
    local = tmp_path / "resumes" / "master.md"
    assert not local.exists() or local.read_text() != "# Overwrite attempt"


def test_resume_get_reports_portfolio_source_when_env_set(tmp_path: Path, monkeypatch) -> None:
    """BDD: GET /api/resume returns md_source='portfolio' and the portfolio file's
    content when RESUME_MD_PATH points at an existing file."""
    portfolio = tmp_path / "portfolio.md"
    portfolio.write_text("# Portfolio\n\nHello", encoding="utf-8")

    monkeypatch.setenv("SQLITE_DB_PATH", str(tmp_path / "t.db"))
    monkeypatch.setenv("CONFIG_DIR", str(tmp_path / "config"))
    monkeypatch.setenv("RESUME_DIR", str(tmp_path / "resumes"))
    monkeypatch.setenv("RESUME_MD_PATH", str(portfolio))
    monkeypatch.chdir(tmp_path)

    from app.api.deps import get_settings
    get_settings.cache_clear()
    from app.api import create_app
    c = TestClient(create_app())

    body = c.get("/api/resume").json()
    assert body["md_source"] == "portfolio"
    assert body["markdown"] == "# Portfolio\n\nHello"


def test_resume_pdf_download_streams_file(tmp_path: Path, monkeypatch) -> None:
    """BDD: /api/resume/pdf streams the resolved file with application/pdf
    when RESUME_PDF_PATH points at a real file."""
    md = tmp_path / "resume.md"
    md.write_text("# Resume", encoding="utf-8")
    pdf = tmp_path / "resume.pdf"
    pdf.write_bytes(b"%PDF-1.4 fake\n")

    monkeypatch.setenv("SQLITE_DB_PATH", str(tmp_path / "t.db"))
    monkeypatch.setenv("CONFIG_DIR", str(tmp_path / "config"))
    monkeypatch.setenv("RESUME_DIR", str(tmp_path / "resumes"))
    monkeypatch.setenv("RESUME_MD_PATH", str(md))
    monkeypatch.setenv("RESUME_PDF_PATH", str(pdf))
    monkeypatch.chdir(tmp_path)

    from app.api.deps import get_settings
    get_settings.cache_clear()
    from app.api import create_app
    c = TestClient(create_app())

    r = c.get("/api/resume/pdf")
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/pdf"
    assert r.content.startswith(b"%PDF")


def test_resume_pdf_404_when_missing(tmp_path: Path, monkeypatch) -> None:
    """BDD: /api/resume/pdf returns 404 when the file is not configured or
    does not exist, so the UI can disable the button cleanly."""
    monkeypatch.setenv("SQLITE_DB_PATH", str(tmp_path / "t.db"))
    monkeypatch.setenv("CONFIG_DIR", str(tmp_path / "config"))
    monkeypatch.setenv("RESUME_DIR", str(tmp_path / "resumes"))
    monkeypatch.delenv("RESUME_PDF_PATH", raising=False)
    monkeypatch.chdir(tmp_path)

    from app.api.deps import get_settings
    get_settings.cache_clear()
    from app.api import create_app
    c = TestClient(create_app())

    r = c.get("/api/resume/pdf")
    assert r.status_code == 404


def test_resume_docx_download_streams_file(tmp_path: Path, monkeypatch) -> None:
    md = tmp_path / "resume.md"
    md.write_text("# Resume", encoding="utf-8")
    docx = tmp_path / "resume.docx"
    docx.write_bytes(b"PKfake-docx\n")

    monkeypatch.setenv("SQLITE_DB_PATH", str(tmp_path / "t.db"))
    monkeypatch.setenv("CONFIG_DIR", str(tmp_path / "config"))
    monkeypatch.setenv("RESUME_DIR", str(tmp_path / "resumes"))
    monkeypatch.setenv("RESUME_MD_PATH", str(md))
    monkeypatch.setenv("RESUME_DOCX_PATH", str(docx))
    monkeypatch.chdir(tmp_path)

    from app.api.deps import get_settings
    get_settings.cache_clear()
    from app.api import create_app
    c = TestClient(create_app())

    r = c.get("/api/resume/docx")
    assert r.status_code == 200
    assert "wordprocessingml" in r.headers["content-type"]


def test_resume_has_pdf_flag_reflects_file_presence(tmp_path: Path, monkeypatch) -> None:
    """BDD: has_pdf is True when RESUME_PDF_PATH points at an existing file, and
    False when the path is missing. Flips when the file disappears."""
    # read_resume only populates pdf_path alongside a resolved md source, so seed both.
    md = tmp_path / "resume.md"
    md.write_text("# Resume", encoding="utf-8")
    pdf = tmp_path / "resume.pdf"
    pdf.write_bytes(b"%PDF-1.4 fake")
    missing = tmp_path / "missing.pdf"

    monkeypatch.setenv("SQLITE_DB_PATH", str(tmp_path / "t.db"))
    monkeypatch.setenv("CONFIG_DIR", str(tmp_path / "config"))
    monkeypatch.setenv("RESUME_DIR", str(tmp_path / "resumes"))
    monkeypatch.setenv("RESUME_MD_PATH", str(md))
    monkeypatch.setenv("RESUME_PDF_PATH", str(pdf))
    monkeypatch.chdir(tmp_path)

    from app.api.deps import get_settings
    get_settings.cache_clear()
    from app.api import create_app
    c = TestClient(create_app())

    body = c.get("/api/resume").json()
    assert body["has_pdf"] is True

    # Now point RESUME_PDF_PATH at a file that does not exist; bust the cache and re-check.
    monkeypatch.setenv("RESUME_PDF_PATH", str(missing))
    get_settings.cache_clear()
    c2 = TestClient(create_app())
    body2 = c2.get("/api/resume").json()
    assert body2["has_pdf"] is False
