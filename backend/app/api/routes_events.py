"""Event REST routes."""
from __future__ import annotations

from fastapi import APIRouter

from app.services import simulation_loop as sl

router = APIRouter(prefix="/events", tags=["events"])


@router.get("")
async def list_events(n: int = 50):
    if sl.event_store is None:
        return []
    return [e.model_dump(mode="json") for e in sl.event_store.get_recent(n)]
