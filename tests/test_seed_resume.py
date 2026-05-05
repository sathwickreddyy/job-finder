from __future__ import annotations

from pathlib import Path

import pytest
from typer.testing import CliRunner

from app.main import app as cli_app

runner = CliRunner()


def test_seed_resume_no_op_when_not_scaffold(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.chdir(tmp_path)
    (tmp_path / "resumes").mkdir()
    (tmp_path / "resumes" / "master.md").write_text("# Real resume content", encoding="utf-8")
    result = runner.invoke(cli_app, ["seed-resume"])
    assert result.exit_code == 0
    assert (tmp_path / "resumes" / "master.md").read_text() == "# Real resume content"


def test_seed_resume_replaces_scaffold_from_portfolio_md(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.chdir(tmp_path)
    (tmp_path / "resumes").mkdir()
    (tmp_path / "resumes" / "master.md").write_text(
        "# scaffold\n\nReplace this scaffold with your real master resume.", encoding="utf-8"
    )
    portfolio = tmp_path / "portfolio.md"
    portfolio.write_text("# Sathwick — From Portfolio", encoding="utf-8")
    monkeypatch.setenv("RESUME_MD_PATH", str(portfolio))
    result = runner.invoke(cli_app, ["seed-resume"])
    assert result.exit_code == 0
    assert "From Portfolio" in (tmp_path / "resumes" / "master.md").read_text()


def test_seed_resume_leaves_scaffold_when_no_portfolio(tmp_path: Path, monkeypatch) -> None:
    """If resume is scaffold and RESUME_MD_PATH is unset, leave the scaffold."""
    monkeypatch.chdir(tmp_path)
    (tmp_path / "resumes").mkdir()
    scaffold = "# scaffold\n\nReplace this scaffold with your real master resume."
    (tmp_path / "resumes" / "master.md").write_text(scaffold, encoding="utf-8")
    monkeypatch.delenv("RESUME_MD_PATH", raising=False)
    result = runner.invoke(cli_app, ["seed-resume"])
    assert result.exit_code == 0
    assert (tmp_path / "resumes" / "master.md").read_text() == scaffold


def test_seed_resume_creates_resumes_dir_when_missing(tmp_path: Path, monkeypatch) -> None:
    """If resumes/ doesn't exist and portfolio is set, the command creates the dir."""
    monkeypatch.chdir(tmp_path)
    # no resumes/ directory created
    portfolio = tmp_path / "portfolio.md"
    portfolio.write_text("# Portfolio", encoding="utf-8")
    monkeypatch.setenv("RESUME_MD_PATH", str(portfolio))
    result = runner.invoke(cli_app, ["seed-resume"])
    assert result.exit_code == 0
    # Plan's code only calls mkdir when local.exists() is False — that branch
    # runs when the file doesn't exist. The function should then fall through
    # to the portfolio-copy branch.
    # But looking at the plan code: if local doesn't exist, mkdir is called,
    # then continue to portfolio check (no return). Portfolio file exists, so
    # it gets written. Success.
    target = tmp_path / "resumes" / "master.md"
    assert target.exists()
    assert "Portfolio" in target.read_text()
