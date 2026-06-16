"""WebSocket telemetry endpoint."""
from __future__ import annotations

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services import simulation_loop as sl

router = APIRouter(tags=["websocket"])


@router.websocket("/ws/telemetry")
async def telemetry_ws(websocket: WebSocket):
    await websocket.accept()
    sl.register_ws_client(websocket)
    try:
        while True:
            # Keep connection alive; server pushes data via broadcast
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        sl.unregister_ws_client(websocket)
