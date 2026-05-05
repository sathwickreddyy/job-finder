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
def test_put_resume_never_writes_to_portfolio_path(tmp_path: Path, monkeypatch) -> None:
    """BDD: PUT /api/resume must write only to the local resumes/master.md path,
    never to the portfolio RESUME_MD_PATH. Proves the one-way read contract."""
    # Seed a portfolio-style resume file and point RESUME_MD_PATH at it.
    portfolio = tmp_path / "portfolio_resume.md"
    original_content = "# Portfolio Resume\n\nuntouched"
    portfolio.write_text(original_content, encoding="utf-8")

    monkeypatch.setenv("SQLITE_DB_PATH", str(tmp_path / "t.db"))
    monkeypatch.setenv("CONFIG_DIR", str(tmp_path / "config"))
    monkeypatch.setenv("RESUME_DIR", str(tmp_path / "resumes"))
    monkeypatch.setenv("RESUME_MD_PATH", str(portfolio))
    # chdir into tmp_path so the PUT writes to tmp_path/resumes/master.md, not the real repo.
    monkeypatch.chdir(tmp_path)

    from app.api.deps import get_settings
    get_settings.cache_clear()
    from app.api import create_app
    c = TestClient(create_app())

    r = c.put("/api/resume", json={"markdown": "# Overwrite attempt"})
    assert r.status_code == 200

    # Portfolio path must be untouched.
    assert portfolio.read_text(encoding="utf-8") == original_content
    # Local write must have happened.
    assert (tmp_path / "resumes" / "master.md").read_text(encoding="utf-8").startswith("# Overwrite attempt")


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
