"""Storage protocol — keeps the rest of the app from caring about SQLite specifics."""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Iterable, Optional

from ..models import ApplicationStatus, EmailEvent, Job, ScoredJob


class Store(ABC):
    @abstractmethod
    def init_schema(self) -> None: ...

    @abstractmethod
    def upsert_jobs(self, jobs: Iterable[Job]) -> int: ...

    @abstractmethod
    def upsert_scored_jobs(self, scored: Iterable[ScoredJob]) -> int: ...

    @abstractmethod
    def get_scored_jobs(self, priorities: Optional[list[str]] = None) -> list[ScoredJob]: ...

    @abstractmethod
    def get_job(self, job_id: str) -> Optional[Job]: ...

    @abstractmethod
    def set_application_status(
        self, job_id: str, status: ApplicationStatus, notes: str | None = None
    ) -> None: ...

    @abstractmethod
    def record_email_event(self, event: EmailEvent) -> None: ...

    @abstractmethod
    def set_sync_state(
        self, job_id: str, target: str, external_id: str, extra: str | None = None
    ) -> None: ...

    @abstractmethod
    def get_sync_state(self, job_id: str, target: str) -> Optional[dict]: ...

    @abstractmethod
    def last_run_at(self) -> Optional[str]: ...

    @abstractmethod
    def mark_run(self) -> None: ...
