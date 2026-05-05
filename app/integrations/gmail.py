"""Optional Gmail integration (skeleton).

Symmetric with outlook.py. v1 does the minimum: if GMAIL_CREDENTIALS_PATH
is not set, skip; if set, log that full OAuth is TBD and return [].
"""
from __future__ import annotations

from ..config import Settings
from ..models import EmailEvent
from ..utils import get_logger
from .outlook import classify_email  # reuse the same classifier

log = get_logger("integrations.gmail")


def enabled(settings: Settings) -> bool:
    return settings.gmail_enabled


def check_recent_job_emails(settings: Settings) -> list[EmailEvent]:
    if not enabled(settings):
        log.info("gmail skipped (GMAIL_CREDENTIALS_PATH not set)")
        return []
    log.warning(
        "gmail integration skeleton: OAuth not wired in v1. "
        "Install google-auth + google-api-python-client, use service-account "
        "or installed-app flow, then forward messages to classify_email()."
    )
    return []


__all__ = ["enabled", "check_recent_job_emails", "classify_email"]
