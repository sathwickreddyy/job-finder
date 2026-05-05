"""Deduplicate normalized Job records.

Primary key is `Job.id` (content-hashed in utils.stable_job_id).
A secondary pass collapses near-duplicates across sources where the
same role+company surfaces with slightly different URLs (e.g., tracker
params). First-seen wins for stable ordering."""
from __future__ import annotations

from typing import Iterable

from .models import Job
from .utils import normalize_text


def _secondary_key(j: Job) -> tuple[str, str]:
    return (normalize_text(j.company), normalize_text(j.role))


def dedupe_jobs(jobs: Iterable[Job]) -> list[Job]:
    seen_ids: set[str] = set()
    seen_secondary: set[tuple[str, str]] = set()
    out: list[Job] = []
    for job in jobs:
        if job.id in seen_ids:
            continue
        sec = _secondary_key(job)
        if sec in seen_secondary:
            # Same company+role surfaced from another source/URL; keep the
            # first one (earlier sources in the pipeline take priority).
            continue
        seen_ids.add(job.id)
        seen_secondary.add(sec)
        out.append(job)
    return out
