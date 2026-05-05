"""Task 14 — /api/settings/* routes + YAML import.

Profile/scoring/sources use bulk PUT. Companies has full CRUD with soft-delete
via enabled=0 so notion_page_id references survive. POST /settings/import-yaml
is the escape hatch — also exposed as the `import-config` CLI command for
scripted seeding."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from ...config_repo import (
    COMPANIES_YAML,
    PROFILE_YAML,
    SCORING_YAML,
    SOURCES_YAML,
    ConfigRepository,
)
from ...storage.config_store import ConfigStore
from ...utils import utcnow_iso
from ..deps import get_config_repo, get_config_store
from ..schemas import (
    CompanyIn,
    CompanyPatch,
    ImportYamlResponse,
    ProfileIn,
    ScoringIn,
)

router = APIRouter(prefix="/settings", tags=["settings"])


# -- profile -----------------------------------------------------------------
@router.get("/profile")
def get_profile(cstore: ConfigStore = Depends(get_config_store)) -> dict:
    return cstore.get_profile()


@router.put("/profile")
def put_profile(body: ProfileIn, cstore: ConfigStore = Depends(get_config_store)) -> dict:
    cstore.set_profile(body.model_dump(exclude_none=True))
    return cstore.get_profile()


# -- companies ---------------------------------------------------------------
@router.get("/companies")
def list_companies(cstore: ConfigStore = Depends(get_config_store)) -> list[dict]:
    return cstore.list_companies()


@router.post("/companies")
def add_company(body: CompanyIn, cstore: ConfigStore = Depends(get_config_store)) -> dict:
    cid = cstore.add_company(body.model_dump())
    return {"id": cid}


@router.patch("/companies/{cid}")
def update_company(
    cid: int, body: CompanyPatch, cstore: ConfigStore = Depends(get_config_store)
) -> dict:
    cstore.update_company(cid, body.model_dump(exclude_none=True))
    return {"ok": True}


@router.delete("/companies/{cid}")
def delete_company(cid: int, cstore: ConfigStore = Depends(get_config_store)) -> dict:
    cstore.soft_delete_company(cid)
    return {"ok": True}


# -- scoring / sources -------------------------------------------------------
@router.get("/scoring")
def get_scoring(cstore: ConfigStore = Depends(get_config_store)) -> dict:
    return cstore.get_scoring()


@router.put("/scoring")
def put_scoring(body: ScoringIn, cstore: ConfigStore = Depends(get_config_store)) -> dict:
    cstore.put_scoring(body.model_dump())
    return cstore.get_scoring()


@router.get("/sources")
def get_sources(cstore: ConfigStore = Depends(get_config_store)) -> dict:
    return cstore.get_sources()


@router.put("/sources")
def put_sources(
    body: dict[str, Any], cstore: ConfigStore = Depends(get_config_store)
) -> dict:
    cstore.put_sources(body)
    return cstore.get_sources()


# -- import from YAML --------------------------------------------------------
@router.post("/import-yaml", response_model=ImportYamlResponse)
def import_yaml(
    cstore: ConfigStore = Depends(get_config_store),
    repo: ConfigRepository = Depends(get_config_repo),
) -> ImportYamlResponse:
    counts: dict[str, int] = {}

    try:
        profile = repo.load_yaml(PROFILE_YAML)
        if profile:
            cstore.set_profile(profile)
        counts[PROFILE_YAML] = 1 if profile else 0
    except Exception as e:  # noqa: BLE001
        raise HTTPException(400, detail=f"profile import failed: {e}")

    scoring = repo.load_yaml(SCORING_YAML)
    if scoring:
        cstore.put_scoring(scoring)
    counts[SCORING_YAML] = 1 if scoring else 0

    sources = repo.load_yaml(SOURCES_YAML)
    if sources:
        cstore.put_sources(sources)
    counts[SOURCES_YAML] = 1 if sources else 0

    companies = (repo.load_yaml(COMPANIES_YAML) or {}).get("companies") or []
    n = 0
    for c in companies:
        try:
            cstore.add_company(c)
            n += 1
        except Exception:
            # Company already exists via UNIQUE(name) -- update instead
            existing = next(
                (
                    x
                    for x in cstore.list_companies(include_disabled=True)
                    if x["name"].lower() == c["name"].lower()
                ),
                None,
            )
            if existing:
                cstore.update_company(existing["id"], c)
                n += 1
    counts[COMPANIES_YAML] = n

    return ImportYamlResponse(imported=counts, imported_at=utcnow_iso())
