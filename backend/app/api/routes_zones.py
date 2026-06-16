"""Zone REST routes."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.models import ZoneCreate
from app.services import simulation_loop as sl

router = APIRouter(prefix="/zones", tags=["zones"])


@router.get("")
async def list_zones():
    if sl.zone_svc is None:
        return []
    return [z.model_dump(mode="json") for z in sl.zone_svc.list_zones()]


@router.post("", status_code=201)
async def create_zone(payload: ZoneCreate):
    if sl.zone_svc is None:
        raise HTTPException(status_code=503, detail="Zone service not ready")
    zone = await sl.zone_svc.create_zone(payload)
    await sl.immediate_zone_assess(zone.id)
    return zone.model_dump(mode="json")


@router.delete("/{zone_id}", status_code=204)
async def delete_zone(zone_id: str):
    if sl.zone_svc is None:
        raise HTTPException(status_code=503, detail="Zone service not ready")
    ok = await sl.zone_svc.delete_zone(zone_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Zone not found")
