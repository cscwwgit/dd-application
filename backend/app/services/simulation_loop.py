"""Main simulation tick loop — advances assets, analyzes threats, dispatches drones, broadcasts."""
from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone

from app.config import TICK_INTERVAL_SECONDS
from app.models import AssetState, TelemetrySnapshot
from app.services.drone_dispatcher import DroneDispatcher
from app.services.event_store import EventStore
from app.services.geo import project_path
from app.services.history_store import HistoryStore
from app.services.patrol_service import PatrolService
from app.services.telemetry_generator import TelemetryGenerator
from app.services.threat_analyzer import ThreatAnalyzer
from app.services.zone_service import ZoneService

# Shared service singletons, initialized at startup
telemetry_gen: TelemetryGenerator | None = None
zone_svc: ZoneService | None = None
threat_analyzer: ThreatAnalyzer | None = None
history_store: HistoryStore | None = None
event_store: EventStore | None = None
drone_dispatcher: DroneDispatcher | None = None
patrol_svc: PatrolService | None = None

# Track previous drone statuses to emit transition events
_prev_drone_status: dict[str, str] = {}

# Latest enriched asset states — updated every tick, served by GET /assets
latest_assets: list[AssetState] = []

# WebSocket connection manager
_ws_clients: set = set()


def register_ws_client(ws) -> None:
    _ws_clients.add(ws)


def unregister_ws_client(ws) -> None:
    _ws_clients.discard(ws)


async def broadcast(payload: dict) -> None:
    if not _ws_clients:
        return
    msg = json.dumps(payload, default=str)
    dead = set()
    for ws in list(_ws_clients):
        try:
            await ws.send_text(msg)
        except Exception:
            dead.add(ws)
    for ws in dead:
        _ws_clients.discard(ws)


def get_predicted_path(asset: AssetState, duration: int = 600, step: int = 10) -> list[dict]:
    """
    Project a turn-rate-aware curved predicted path.

    Algorithm:
    1. Use the full bounded history (up to 5 min) to compute per-segment bearings/speeds.
    2. Starting heading = most-recent segment bearing (tangent at current position),
       falling back to asset.heading_deg.
    3. Smoothed speed = median of all segment speeds.
    4. Turn rate = mean normalised bearing delta per second across all segments.
    5. Project forward using project_path_turn_rate (constant turn rate each step).
    """
    from datetime import datetime as _dt
    import statistics

    from app.services.geo import (
        bearing_deg as _bearing,
        haversine_distance_m as _dist,
        project_path_turn_rate,
    )

    initial_heading = asset.heading_deg
    smoothed_speed = asset.speed_mps
    turn_rate = 0.0

    if history_store is not None:
        history = history_store.get_history(asset.id)
        # Use full 5-minute buffer
        window = history[-300:] if len(history) > 300 else history
        if len(window) >= 2:
            try:
                seg_bearings: list[float] = []
                seg_speeds: list[float] = []
                turn_deltas: list[float] = []

                for i in range(1, len(window)):
                    prev, curr = window[i - 1], window[i]
                    if prev["lat"] == curr["lat"] and prev["lon"] == curr["lon"]:
                        continue
                    try:
                        tp = _dt.fromisoformat(prev["recorded_at"])
                        tc = _dt.fromisoformat(curr["recorded_at"])
                        dt_seg = (tc - tp).total_seconds()
                        if dt_seg <= 0:
                            continue
                    except Exception:
                        continue

                    seg_b = _bearing(prev["lat"], prev["lon"], curr["lat"], curr["lon"])
                    seg_spd = _dist(prev["lat"], prev["lon"], curr["lat"], curr["lon"]) / dt_seg
                    seg_bearings.append(seg_b)
                    seg_speeds.append(seg_spd)

                    if len(seg_bearings) >= 2:
                        delta = seg_bearings[-1] - seg_bearings[-2]
                        if delta > 180:
                            delta -= 360
                        elif delta < -180:
                            delta += 360
                        turn_deltas.append(delta / dt_seg)

                if seg_bearings:
                    # Start from the most-recent segment heading (tangent, not chord)
                    initial_heading = seg_bearings[-1]
                if seg_speeds:
                    smoothed_speed = statistics.median(seg_speeds)
                if turn_deltas:
                    turn_rate = sum(turn_deltas) / len(turn_deltas)
            except Exception:
                pass

    points = project_path_turn_rate(
        asset.lat, asset.lon, initial_heading, smoothed_speed, turn_rate, duration, step
    )
    return [{"lat": lat, "lon": lon} for lat, lon in points]


async def immediate_zone_assess(zone_id: str) -> None:
    """
    Called immediately after a new zone is created.
    Re-evaluates all current assets against the new zone and fires breach events
    for any asset already inside it, triggering drone dispatch if appropriate.
    """
    if not all([telemetry_gen, zone_svc, threat_analyzer, history_store, event_store, drone_dispatcher]):
        return

    zone = zone_svc.get_zone(zone_id)
    if zone is None:
        return

    zone_dict = {"id": zone.id, "name": zone.name, "geojson": zone.geojson}
    raw_states = telemetry_gen.get_states()
    history_store.record_all(raw_states)

    from app.services.geo import point_in_zone  # local import to avoid circular

    for asset in raw_states:
        if point_in_zone(asset.lat, asset.lon, zone.geojson):
            asset_label = asset.callsign
            await event_store.add_event(
                event_type="breach",
                severity="critical",
                message=f"{asset_label} is inside newly created {zone.name}",
                asset_id=asset.id,
                zone_id=zone.id,
            )
            # Force the threat analyzer to know this asset is critical now
            threat_analyzer._previous[asset.id] = "critical"
            threat_analyzer._clear_counts[asset.id] = 0
            # Drone acquisition handled by state machine on next tick


async def run_simulation() -> None:
    """Main async loop that advances the simulation every tick."""
    while True:
        await asyncio.sleep(TICK_INTERVAL_SECONDS)
        await tick()


async def tick() -> None:
    if not all([telemetry_gen, zone_svc, threat_analyzer, history_store, event_store, drone_dispatcher, patrol_svc]):
        return

    # Advance assets
    telemetry_gen.tick(TICK_INTERVAL_SECONDS)
    raw_states = telemetry_gen.get_states()

    # Analyze threats
    zones = zone_svc.zones_as_dicts()
    assessments = threat_analyzer.analyze(raw_states, zones)
    assessments = threat_analyzer.apply_hysteresis(assessments)

    # Apply assessments to asset states
    assessment_map = {a.asset_id: a for a in assessments}
    enriched_states: list[AssetState] = []
    for state in raw_states:
        assessment = assessment_map.get(state.id)
        if assessment:
            state = AssetState(
                **{
                    **state.model_dump(),
                    "threat_level": assessment.threat_level,
                    "nearest_zone_id": assessment.nearest_zone_id,
                    "distance_to_nearest_zone_m": assessment.distance_to_nearest_zone_m,
                    "tte_seconds": assessment.tte_seconds,
                }
            )
        enriched_states.append(state)

    # Store enriched states for REST endpoint
    global latest_assets
    latest_assets = enriched_states

    # Record history
    history_store.record_all(enriched_states)

    # Detect transitions and emit events
    transitions = threat_analyzer.get_transitions(assessments)
    new_events = []
    for assessment, old_level, new_level in transitions:
        asset_state = next((s for s in enriched_states if s.id == assessment.asset_id), None)

        zone_name = None
        if assessment.nearest_zone_id:
            z = zone_svc.get_zone(assessment.nearest_zone_id)
            zone_name = z.name if z else assessment.nearest_zone_id[:8]

        # Use callsign if available, fall back to asset id
        asset_label = next(
            (s.callsign for s in enriched_states if s.id == assessment.asset_id),
            assessment.asset_id,
        )

        if new_level == "warning" and old_level == "normal":
            tte = f"{assessment.tte_seconds:.0f}s" if assessment.tte_seconds is not None else "unknown"
            ev = await event_store.add_event(
                event_type="warning",
                severity="warning",
                message=f"{asset_label} approaching {zone_name} — initial ETA {tte}",
                asset_id=assessment.asset_id,
                zone_id=assessment.nearest_zone_id,
            )
            new_events.append(ev)

        elif new_level == "critical":
            ev = await event_store.add_event(
                event_type="breach",
                severity="critical",
                message=f"{asset_label} breached {zone_name}",
                asset_id=assessment.asset_id,
                zone_id=assessment.nearest_zone_id,
            )
            new_events.append(ev)

    # Advance drone state machine
    patrol_path = patrol_svc.get_path() if patrol_svc else None
    if patrol_path:
        drone_dispatcher.tick(enriched_states, patrol_path, TICK_INTERVAL_SECONDS)

    # Emit shadowing transition events
    for drone in drone_dispatcher.get_all_drones():
        prev_status = _prev_drone_status.get(drone.id)
        if prev_status != drone.status and drone.status == "intercepting" and prev_status in ("patrolling", "returning_to_patrol", None):
            target_label = next(
                (s.callsign for s in enriched_states if s.id == drone.target_asset_id),
                drone.target_asset_id or "unknown",
            )
            dispatch_ev = await event_store.add_event(
                event_type="drone_dispatched",
                severity="info",
                message=f"Drone broke patrol to intercept {target_label}",
                asset_id=drone.target_asset_id,
                drone_id=drone.id,
            )
            new_events.append(dispatch_ev)
        elif prev_status == "intercepting" and drone.status == "shadowing":
            target_label = next(
                (s.callsign for s in enriched_states if s.id == drone.target_asset_id),
                drone.target_asset_id or "unknown",
            )
            await event_store.add_event(
                event_type="drone_shadowing",
                severity="info",
                message=f"Drone now shadowing {target_label}",
                asset_id=drone.target_asset_id,
                drone_id=drone.id,
            )
        _prev_drone_status[drone.id] = drone.status

    # Build and broadcast snapshot
    snapshot = TelemetrySnapshot(
        timestamp=datetime.now(timezone.utc),
        assets=enriched_states,
        drones=drone_dispatcher.get_all_drones(),
        events=event_store.get_recent(20),
        patrol_path=patrol_path,
    )
    await broadcast(snapshot.model_dump(mode="json"))
