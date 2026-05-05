"""Optional Outlook / Microsoft Graph integration (skeleton).

v1 intentionally only ships:
    - capability check (`enabled`)
    - a stub `check_recent_job_emails()` that returns [] when creds are missing

Full OAuth (device-code or auth-code flow) is documented in README; not
wired up here so `run-daily` can import this module without pulling in
msal / browser flows. Classification logic lives here so adding the
Graph API call later is a contained change.
"""
from __future__ import annotations

import re
from typing import Any

from ..config import Settings
from ..models import EmailEvent
from ..utils import get_logger, utcnow_iso

log = get_logger("integrations.outlook")


def enabled(settings: Settings) -> bool:
    return settings.outlook_enabled


# ---------------------------------------------------------------------------
# Classifier — runs on subject+snippet regardless of email source.
# ---------------------------------------------------------------------------
_PATTERNS = [
    ("interview_invite", r"\binterview\b|\bschedule\b|\bcalendly\b|\bavailability\b"),
    ("assessment", r"\bcoding (assessment|challenge)\b|\bhackerrank\b|\bcodility\b|\bassessment (link|invite)\b"),
    ("recruiter_reply", r"\brecruiter\b|\bhiring team\b|\btalent\b|\bhr @\b|\bfrom .* at \b"),
    ("application_received", r"\bthank you for applying\b|\bapplication received\b|\byour application to\b"),
    ("rejection", r"\bunfortunately\b|\bwe regret\b|\bnot moving forward\b|\bwe have decided not to\b"),
]


def classify_email(subject: str, snippet: str) -> str:
    blob = f"{subject}\n{snippet}".lower()
    for label, pattern in _PATTERNS:
        if re.search(pattern, blob):
            return label
    return "unknown"


# ---------------------------------------------------------------------------
# v1 skeleton entrypoint
# ---------------------------------------------------------------------------
def check_recent_job_emails(settings: Settings) -> list[EmailEvent]:
    """Return classified email events for recent job-related mail.

    v1: returns [] with a warning unless/until the Graph OAuth flow is
    wired. The shape of the return type lets the caller store + apply
    the same logic when the integration is eventually finished.
    """
    if not enabled(settings):
        log.info("outlook skipped (Microsoft Graph credentials not set)")
        return []
    log.warning(
        "outlook integration skeleton: OAuth not wired in v1. "
        "Implement device-code or auth-code flow against Microsoft Graph "
        "and forward to classify_email() to populate email_events."
    )
    return []


def build_event(
    event_id: str,
    received_at: str | None,
    sender: str,
    subject: str,
    snippet: str,
) -> EmailEvent:
    return EmailEvent(
        id=event_id,
        received_at=received_at or utcnow_iso(),
        sender=sender,
        subject=subject,
        snippet=snippet,
        classification=classify_email(subject, snippet),
    )


_ = Any  # silence unused import lint
