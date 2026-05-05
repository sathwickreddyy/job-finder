"""/api/settings/* routes.

Profile/scoring/sources use bulk PUT. Companies has full CRUD with soft-delete
via enabled=0 so notion_page_id references survive. SQLite is the runtime
source of truth — YAML under config/ is a one-time seed read by init-db."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends

from ...storage.config_store import ConfigStore
from ..deps import get_config_store
from ..schemas import (
    CompanyIn,
    CompanyPatch,
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
