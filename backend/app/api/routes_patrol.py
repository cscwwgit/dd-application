"""Patrol path REST routes."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.models import PatrolPathCreate
from app.services import simulation_loop as sl

router = APIRouter(prefix="/patrol-path", tags=["patrol"])


@router.get("")
async def get_patrol_path():
    if sl.patrol_svc is None:
        raise HTTPException(status_code=503, detail="Patrol service not ready")
    return sl.patrol_svc.get_path().model_dump(mode="json")


@router.post("", status_code=201)
async def set_patrol_path(payload: PatrolPathCreate):
    if sl.patrol_svc is None:
        raise HTTPException(status_code=503, detail="Patrol service not ready")
    if len(payload.waypoints) < 2:
        raise HTTPException(status_code=422, detail="Patrol path requires at least 2 waypoints")
    path = sl.patrol_svc.set_path(payload)
    # Reset drone to start of new path
    if sl.drone_dispatcher is not None:
        sl.drone_dispatcher.reset_patrol()
    return path.model_dump(mode="json")


@router.delete("", status_code=204)
async def delete_patrol_path():
    if sl.patrol_svc is None:
        raise HTTPException(status_code=503, detail="Patrol service not ready")
    sl.patrol_svc.delete_path()
    if sl.drone_dispatcher is not None:
        sl.drone_dispatcher.reset_patrol()
