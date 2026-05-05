from __future__ import annotations

from fastapi import APIRouter, Depends

from ...config import Settings
from ...resume.source import read_resume
from ..deps import get_settings
from ..schemas import CapabilitiesResponse, HealthResponse

router = APIRouter(tags=["system"])


@router.get("/health", response_model=HealthResponse)
def health(settings: Settings = Depends(get_settings)) -> HealthResponse:
    return HealthResponse(
        llm_enabled=settings.llm_enabled,
        notion_enabled=settings.notion_enabled,
        outlook_enabled=settings.outlook_enabled,
        gmail_enabled=settings.gmail_enabled,
    )


@router.get("/capabilities", response_model=CapabilitiesResponse)
def capabilities(settings: Settings = Depends(get_settings)) -> CapabilitiesResponse:
    bundle = read_resume(settings)
    return CapabilitiesResponse(
        llm_enabled=settings.llm_enabled,
        llm_provider=settings.llm_provider,
        notion_enabled=settings.notion_enabled,
        outlook_enabled=settings.outlook_enabled,
        gmail_enabled=settings.gmail_enabled,
        resume_source=bundle.source,
    )
