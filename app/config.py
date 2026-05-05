"""Top-level runtime configuration: env, paths, feature capability flags.

This module is intentionally thin — it reads env vars and exposes a
frozen `Settings` object. YAML/Markdown loading lives in
`app.config_repo`, which takes `Settings` so it can be swapped for a
remote backend."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

# Load .env exactly once at import time. Safe to call again; dotenv no-ops.
load_dotenv()


def _env(name: str, default: str = "") -> str:
    return os.environ.get(name, default) or default


@dataclass(frozen=True)
class Settings:
    # Config backend
    config_backend: str = field(default_factory=lambda: _env("CONFIG_BACKEND", "local"))
    config_dir: Path = field(default_factory=lambda: Path(_env("CONFIG_DIR", "config")))
    resume_dir: Path = field(default_factory=lambda: Path(_env("RESUME_DIR", "resumes")))
    config_source_url: str = field(default_factory=lambda: _env("CONFIG_SOURCE_URL"))
    resume_source_url: str = field(default_factory=lambda: _env("RESUME_SOURCE_URL"))

    # Storage
    storage_backend: str = field(default_factory=lambda: _env("STORAGE_BACKEND", "sqlite"))
    sqlite_db_path: Path = field(
        default_factory=lambda: Path(_env("SQLITE_DB_PATH", "data/job_search.db"))
    )

    # Optional integrations
    notion_token: str = field(default_factory=lambda: _env("NOTION_TOKEN"))
    notion_jobs_database_id: str = field(
        default_factory=lambda: _env("NOTION_JOBS_DATABASE_ID")
    )
    openai_api_key: str = field(default_factory=lambda: _env("OPENAI_API_KEY"))
    anthropic_api_key: str = field(default_factory=lambda: _env("ANTHROPIC_API_KEY"))
    llm_model: str = field(default_factory=lambda: _env("LLM_MODEL"))
    microsoft_client_id: str = field(default_factory=lambda: _env("MICROSOFT_CLIENT_ID"))
    microsoft_tenant_id: str = field(default_factory=lambda: _env("MICROSOFT_TENANT_ID"))
    microsoft_client_secret: str = field(
        default_factory=lambda: _env("MICROSOFT_CLIENT_SECRET")
    )
    gmail_credentials_path: str = field(
        default_factory=lambda: _env("GMAIL_CREDENTIALS_PATH")
    )

    # Resume source (absolute host paths; portfolio sister repo)
    resume_md_path: str = field(default_factory=lambda: _env("RESUME_MD_PATH"))
    resume_pdf_path: str = field(default_factory=lambda: _env("RESUME_PDF_PATH"))
    resume_docx_path: str = field(default_factory=lambda: _env("RESUME_DOCX_PATH"))

    # Capability flags (derived, cheap to recompute)
    @property
    def config_is_read_only(self) -> bool:
        return self.config_backend.lower() == "http"

    @property
    def llm_enabled(self) -> bool:
        return bool(self.openai_api_key or self.anthropic_api_key)

    @property
    def llm_provider(self) -> str:
        if self.anthropic_api_key:
            return "anthropic"
        if self.openai_api_key:
            return "openai"
        return ""

    @property
    def notion_enabled(self) -> bool:
        return bool(self.notion_token and self.notion_jobs_database_id)

    @property
    def outlook_enabled(self) -> bool:
        return bool(
            self.microsoft_client_id
            and self.microsoft_tenant_id
            and self.microsoft_client_secret
        )

    @property
    def gmail_enabled(self) -> bool:
        return bool(self.gmail_credentials_path)


def load_settings() -> Settings:
    return Settings()
