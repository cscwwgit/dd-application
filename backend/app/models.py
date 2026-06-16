"""Pydantic data models."""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class AssetState(BaseModel):
    id: str
    callsign: str
    asset_type: Literal["aircraft", "vehicle"]
    lat: float
    lon: float
    altitude_m: float | None
    heading_deg: float
    speed_mps: float
    threat_level: Literal["normal", "warning", "critical"]
    nearest_zone_id: str | None
    distance_to_nearest_zone_m: float | None
    tte_seconds: float | None
    updated_at: datetime


class RestrictedZone(BaseModel):
    id: str
    name: str
    geojson: dict
    created_at: datetime


class ZoneCreate(BaseModel):
    name: str | None = None
    geojson: dict


class ThreatAssessment(BaseModel):
    asset_id: str
    threat_level: Literal["normal", "warning", "critical"]
    nearest_zone_id: str | None
    distance_to_nearest_zone_m: float | None
    tte_seconds: float | None
    reason: str


class EventRecord(BaseModel):
    id: str
    event_type: Literal["warning", "breach", "drone_dispatched", "drone_shadowing"]
    severity: Literal["info", "warning", "critical"]
    asset_id: str | None
    zone_id: str | None
    drone_id: str | None
    message: str
    created_at: datetime


class DroneState(BaseModel):
    id: str
    status: Literal["idle", "patrolling", "intercepting", "shadowing", "returning_to_patrol"]
    lat: float
    lon: float
    heading_deg: float | None = None
    target_asset_id: str | None
    origin_base_id: str | None
    speed_mps: float
    intercept_seconds: float | None
    patrol_waypoint_index: int | None = None
    updated_at: datetime


class DroneBase(BaseModel):
    id: str
    name: str
    lat: float
    lon: float


class PatrolWaypoint(BaseModel):
    lat: float
    lon: float


class PatrolPath(BaseModel):
    id: str
    name: str
    waypoints: list[PatrolWaypoint]
    created_at: datetime


class PatrolPathCreate(BaseModel):
    name: str | None = None
    waypoints: list[PatrolWaypoint]


class TelemetrySnapshot(BaseModel):
    type: str = "telemetry_snapshot"
    timestamp: datetime
    assets: list[AssetState]
    drones: list[DroneState]
    events: list[EventRecord]
    patrol_path: PatrolPath | None = None
