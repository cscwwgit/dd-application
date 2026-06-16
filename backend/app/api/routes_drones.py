"""Drone REST routes."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.services import simulation_loop as sl

router = APIRouter(prefix="/drones", tags=["drones"])


@router.get("")
async def list_drones():
    if sl.drone_dispatcher is None:
        return []
    return [d.model_dump(mode="json") for d in sl.drone_dispatcher.get_all_drones()]


@router.get("/bases")
async def list_bases():
    if sl.drone_dispatcher is None:
        return []
    return [b.model_dump(mode="json") for b in sl.drone_dispatcher.get_bases()]


@router.get("/{drone_id}")
async def get_drone(drone_id: str):
    if sl.drone_dispatcher is None:
        raise HTTPException(status_code=503, detail="Drone service not ready")
    drone = sl.drone_dispatcher.get_drone(drone_id)
    if drone is None:
        raise HTTPException(status_code=404, detail="Drone not found")
    return drone.model_dump(mode="json")
