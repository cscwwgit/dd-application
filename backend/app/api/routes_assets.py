"""Asset REST routes."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.services import simulation_loop as sl

router = APIRouter(prefix="/assets", tags=["assets"])


@router.get("")
async def list_assets():
    if sl.latest_assets:
        return [s.model_dump(mode="json") for s in sl.latest_assets]
    if sl.telemetry_gen is None:
        return []
    return [s.model_dump(mode="json") for s in sl.telemetry_gen.get_states()]


@router.get("/{asset_id}/history")
async def get_asset_history(asset_id: str):
    if sl.history_store is None:
        raise HTTPException(status_code=503, detail="History store not ready")
    history = sl.history_store.get_history(asset_id)
    if not history and sl.telemetry_gen and sl.telemetry_gen.get_asset(asset_id) is None:
        raise HTTPException(status_code=404, detail="Asset not found")
    return history


@router.get("/{asset_id}/predicted-path")
async def get_predicted_path(asset_id: str):
    if sl.telemetry_gen is None:
        raise HTTPException(status_code=503, detail="Telemetry not ready")
    asset_obj = sl.telemetry_gen.get_asset(asset_id)
    if asset_obj is None:
        raise HTTPException(status_code=404, detail="Asset not found")
    state = asset_obj.to_state()
    return sl.get_predicted_path(state)
