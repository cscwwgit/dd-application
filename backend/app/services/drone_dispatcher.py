"""Drone autonomous state machine: patrolling, intercepting, shadowing, returning_to_patrol."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from app.config import (
    DRONE_SHADOW_DISTANCE_M,
    DRONE_SHADOW_STANDOFF_M,
    DRONE_SPEED_MPS,
    DRONE_WAYPOINT_ARRIVAL_M,
)
from app.models import AssetState, DroneBase, DroneState, PatrolPath
from app.services.geo import bearing_deg, haversine_distance_m, project_point

# Static drone bases in Canadian Arctic region
BASES: list[DroneBase] = [
    DroneBase(id="base-iqaluit", name="Iqaluit Air Base", lat=63.7467, lon=-68.5170),
    DroneBase(id="base-yellowknife", name="Yellowknife Operations", lat=62.4540, lon=-114.3718),
    DroneBase(id="base-whitehorse", name="Whitehorse Tactical", lat=60.7212, lon=-135.0568),
    DroneBase(id="base-resolute", name="Resolute Bay Station", lat=74.7169, lon=-94.9691),
    DroneBase(id="base-inuvik", name="Inuvik Forward Base", lat=68.3607, lon=-133.7230),
]


def _shadow_point(target_lat: float, target_lon: float, target_heading: float) -> tuple[float, float]:
    """Compute a standoff position behind the target based on its current heading."""
    shadow_bearing = (target_heading + 180) % 360
    return project_point(target_lat, target_lon, shadow_bearing, DRONE_SHADOW_STANDOFF_M)


class DroneDispatcher:
    """
    Single-drone autonomous state machine.

    States:
      patrolling          — following the operator-defined patrol path
      intercepting        — heading toward nearest critical asset
      shadowing           — maintaining standoff behind target
      returning_to_patrol — no critical assets, heading back to patrol path

    Target acquisition: select nearest critical asset. Do not re-acquire while
    current target is still critical (anti-flap).
    """

    def __init__(self) -> None:
        self._drone: DroneState | None = None
        self._drone_id: str = str(uuid.uuid4())

    # ── Public accessors ───────────────────────────────────────────────────

    def get_all_drones(self) -> list[DroneState]:
        if self._drone:
            return [self._drone]
        return []

    def get_drone(self, drone_id: str) -> DroneState | None:
        if self._drone and self._drone.id == drone_id:
            return self._drone
        return None

    def has_mission_for_asset(self, asset_id: str) -> bool:
        if self._drone is None:
            return False
        return (
            self._drone.target_asset_id == asset_id
            and self._drone.status in ("intercepting", "shadowing")
        )

    def get_bases(self) -> list[DroneBase]:
        return BASES

    # ── Initialization ────────────────────────────────────────────────────

    def initialize(self, patrol_path: PatrolPath) -> None:
        """Create the patrol drone at the first waypoint of the patrol path."""
        wp = patrol_path.waypoints[0]
        self._drone = DroneState(
            id=self._drone_id,
            status="patrolling",
            lat=wp.lat,
            lon=wp.lon,
            heading_deg=0.0,
            target_asset_id=None,
            origin_base_id=None,
            speed_mps=DRONE_SPEED_MPS,
            intercept_seconds=None,
            patrol_waypoint_index=0,
            updated_at=datetime.now(timezone.utc),
        )

    def reset_patrol(self) -> None:
        """Called when the patrol path changes; keep current position but re-enter patrolling."""
        if self._drone is None:
            return
        self._drone = DroneState(
            **{
                **self._drone.model_dump(),
                "status": "patrolling",
                "target_asset_id": None,
                "intercept_seconds": None,
                "patrol_waypoint_index": 0,
                "updated_at": datetime.now(timezone.utc),
            }
        )

    # ── Legacy dispatch shim (used by immediate_zone_assess) ─────────────

    def dispatch(self, asset_id: str, asset_lat: float, asset_lon: float) -> DroneState | None:
        """
        Compatibility shim: immediately task the drone toward an asset.
        Returns the drone state if transition happened, None if already on target.
        """
        if self._drone is None:
            return None
        if self.has_mission_for_asset(asset_id):
            return None
        self._drone = DroneState(
            **{
                **self._drone.model_dump(),
                "status": "intercepting",
                "target_asset_id": asset_id,
                "intercept_seconds": haversine_distance_m(
                    self._drone.lat, self._drone.lon, asset_lat, asset_lon
                ) / DRONE_SPEED_MPS,
                "updated_at": datetime.now(timezone.utc),
            }
        )
        return self._drone

    # ── Main tick ─────────────────────────────────────────────────────────

    def tick(
        self,
        enriched_assets: list[AssetState],
        patrol_path: PatrolPath,
        dt: float,
    ) -> DroneState | None:
        """
        Advance the drone one simulation tick.
        Returns the updated DroneState (or None if not yet initialized).
        """
        if self._drone is None:
            self.initialize(patrol_path)

        drone = self._drone
        critical_assets = [a for a in enriched_assets if a.threat_level == "critical"]

        # ── Target acquisition ───────────────────────────────────────────
        if critical_assets:
            current_target_still_critical = drone.target_asset_id and any(
                a.id == drone.target_asset_id for a in critical_assets
            )
            if not current_target_still_critical:
                # Acquire nearest critical asset (anti-flap: only re-acquire when current clears)
                nearest = min(
                    critical_assets,
                    key=lambda a: haversine_distance_m(drone.lat, drone.lon, a.lat, a.lon),
                )
                drone = DroneState(
                    **{
                        **drone.model_dump(),
                        "status": "intercepting",
                        "target_asset_id": nearest.id,
                        "updated_at": datetime.now(timezone.utc),
                    }
                )
        else:
            # No critical assets — return to patrol if not already patrolling
            if drone.status in ("intercepting", "shadowing"):
                drone = DroneState(
                    **{
                        **drone.model_dump(),
                        "status": "returning_to_patrol",
                        "target_asset_id": None,
                        "intercept_seconds": None,
                        "updated_at": datetime.now(timezone.utc),
                    }
                )

        # ── Movement ─────────────────────────────────────────────────────
        if drone.status in ("intercepting", "shadowing"):
            drone = self._move_toward_target(drone, enriched_assets, dt)
        elif drone.status in ("patrolling", "returning_to_patrol"):
            drone = self._move_patrol(drone, patrol_path, dt)

        self._drone = drone
        return drone

    # ── Movement helpers ──────────────────────────────────────────────────

    def _move_toward_target(
        self,
        drone: DroneState,
        assets: list[AssetState],
        dt: float,
    ) -> DroneState:
        target = next((a for a in assets if a.id == drone.target_asset_id), None)
        if target is None:
            return DroneState(
                **{
                    **drone.model_dump(),
                    "status": "returning_to_patrol",
                    "target_asset_id": None,
                    "intercept_seconds": None,
                    "updated_at": datetime.now(timezone.utc),
                }
            )

        # Compute dynamic shadow point behind target
        shadow_lat, shadow_lon = _shadow_point(target.lat, target.lon, target.heading_deg)
        dist_to_shadow = haversine_distance_m(drone.lat, drone.lon, shadow_lat, shadow_lon)

        # Transition to shadowing when within threshold
        if dist_to_shadow <= DRONE_SHADOW_DISTANCE_M:
            new_status = "shadowing"
        else:
            new_status = "intercepting"

        # Move toward shadow point — recompute heading every tick
        head = bearing_deg(drone.lat, drone.lon, shadow_lat, shadow_lon)
        step = min(DRONE_SPEED_MPS * dt, dist_to_shadow)
        new_lat, new_lon = project_point(drone.lat, drone.lon, head, step)
        new_dist = haversine_distance_m(new_lat, new_lon, shadow_lat, shadow_lon)
        intercept = new_dist / DRONE_SPEED_MPS

        return DroneState(
            **{
                **drone.model_dump(),
                "status": new_status,
                "lat": new_lat,
                "lon": new_lon,
                "heading_deg": head,
                "speed_mps": step / dt if dt > 0 else DRONE_SPEED_MPS,
                "intercept_seconds": intercept,
                "updated_at": datetime.now(timezone.utc),
            }
        )

    def _move_patrol(
        self,
        drone: DroneState,
        patrol_path: PatrolPath,
        dt: float,
    ) -> DroneState:
        waypoints = patrol_path.waypoints
        if not waypoints:
            return drone

        # Find nearest waypoint to resume from if returning
        wp_idx = drone.patrol_waypoint_index or 0
        if drone.status == "returning_to_patrol":
            wp_idx = min(
                range(len(waypoints)),
                key=lambda i: haversine_distance_m(
                    drone.lat, drone.lon, waypoints[i].lat, waypoints[i].lon
                ),
            )

        wp = waypoints[wp_idx]
        dist = haversine_distance_m(drone.lat, drone.lon, wp.lat, wp.lon)

        # Advance waypoint when close enough
        if dist <= DRONE_WAYPOINT_ARRIVAL_M:
            wp_idx = (wp_idx + 1) % len(waypoints)
            wp = waypoints[wp_idx]
            dist = haversine_distance_m(drone.lat, drone.lon, wp.lat, wp.lon)

        head = bearing_deg(drone.lat, drone.lon, wp.lat, wp.lon)
        step = min(DRONE_SPEED_MPS * dt, dist)
        new_lat, new_lon = project_point(drone.lat, drone.lon, head, step)

        return DroneState(
            **{
                **drone.model_dump(),
                "status": "patrolling",
                "lat": new_lat,
                "lon": new_lon,
                "heading_deg": head,
                "speed_mps": step / dt if dt > 0 else DRONE_SPEED_MPS,
                "target_asset_id": None,
                "intercept_seconds": None,
                "patrol_waypoint_index": wp_idx,
                "updated_at": datetime.now(timezone.utc),
            }
        )
