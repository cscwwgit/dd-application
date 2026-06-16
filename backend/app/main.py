"""FastAPI application entrypoint."""
from __future__ import annotations

import asyncio

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import routes_assets, routes_drones, routes_events, routes_patrol, routes_zones, websocket
from app.db import init_db
from app.services import simulation_loop as sl
from app.services.drone_dispatcher import DroneDispatcher
from app.services.event_store import EventStore
from app.services.history_store import HistoryStore
from app.services.patrol_service import PatrolService
from app.services.telemetry_generator import TelemetryGenerator
from app.services.threat_analyzer import ThreatAnalyzer
from app.services.zone_service import ZoneService

app = FastAPI(title="Restricted Zone Airspace Monitor", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(routes_assets.router)
app.include_router(routes_zones.router)
app.include_router(routes_events.router)
app.include_router(routes_drones.router)
app.include_router(routes_patrol.router)
app.include_router(websocket.router)


@app.on_event("startup")
async def startup() -> None:
    await init_db()

    sl.telemetry_gen = TelemetryGenerator()
    sl.zone_svc = ZoneService()
    sl.threat_analyzer = ThreatAnalyzer()
    sl.history_store = HistoryStore()
    sl.event_store = EventStore()
    sl.drone_dispatcher = DroneDispatcher()
    sl.patrol_svc = PatrolService()

    # Load persisted zones
    await sl.zone_svc.load_from_db()

    # Start simulation loop
    asyncio.create_task(sl.run_simulation())


@app.get("/health")
async def health():
    return {"status": "ok", "version": "1.0.0"}
