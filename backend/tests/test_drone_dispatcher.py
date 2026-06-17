"""Tests for drone dispatcher state machine."""
from datetime import datetime, timezone

import pytest

from app.config import DRONE_SHADOW_DISTANCE_M
from app.models import AssetState, PatrolPath, PatrolPathCreate, PatrolWaypoint
from app.services.drone_dispatcher import DroneDispatcher
from app.services.geo import haversine_distance_m
from app.services.patrol_service import PatrolService


# ── Helpers ──────────────────────────────────────────────────────────────────

def make_patrol_path(waypoints: list[tuple[float, float]]) -> PatrolPath:
    return PatrolPath(
        id="test-patrol",
        name="Test Patrol",
        waypoints=[PatrolWaypoint(lat=lat, lon=lon) for lat, lon in waypoints],
        created_at=datetime.now(timezone.utc),
    )


def make_asset(
    asset_id: str,
    lat: float,
    lon: float,
    threat_level: str = "normal",
    heading: float = 0.0,
    callsign: str | None = None,
) -> AssetState:
    return AssetState(
        id=asset_id,
        callsign=callsign or asset_id.upper(),
        asset_type="aircraft",
        lat=lat,
        lon=lon,
        altitude_m=5000.0,
        heading_deg=heading,
        speed_mps=100.0,
        threat_level=threat_level,  # type: ignore[arg-type]
        nearest_zone_id=None,
        distance_to_nearest_zone_m=None,
        tte_seconds=None,
        updated_at=datetime.now(timezone.utc),
    )


# ── Patrol path tests ─────────────────────────────────────────────────────────

def test_drone_follows_patrol_waypoints():
    """Drone in patrolling state advances toward next waypoint each tick."""
    patrol = make_patrol_path([(68.0, -100.0), (68.0, -95.0), (68.0, -90.0)])
    dispatcher = DroneDispatcher()
    dispatcher.initialize(patrol)

    initial_drone = dispatcher.get_all_drones()[0]
    initial_dist = haversine_distance_m(
        initial_drone.lat, initial_drone.lon,
        patrol.waypoints[0].lat, patrol.waypoints[0].lon,
    )

    dispatcher.tick([], patrol, dt=10.0)
    updated = dispatcher.get_all_drones()[0]

    assert updated.status == "patrolling"
    # Drone should have moved
    assert (updated.lat, updated.lon) != (initial_drone.lat, initial_drone.lon)


def test_drone_advances_waypoint_index_on_arrival():
    """Drone increments patrol_waypoint_index when it reaches a waypoint."""
    patrol = make_patrol_path([(68.0, -100.0), (68.0, -95.0)])
    dispatcher = DroneDispatcher()
    dispatcher.initialize(patrol)

    # Run enough ticks to reach first waypoint (start IS first waypoint, so should skip to next)
    for _ in range(500):
        dispatcher.tick([], patrol, dt=10.0)
        drone = dispatcher.get_all_drones()[0]
        if drone.patrol_waypoint_index and drone.patrol_waypoint_index > 0:
            break

    drone = dispatcher.get_all_drones()[0]
    assert drone.patrol_waypoint_index is not None
    assert drone.patrol_waypoint_index > 0


def test_drone_acquires_nearest_critical_asset():
    """When critical assets appear, drone targets the nearest one."""
    patrol = make_patrol_path([(68.0, -100.0), (68.0, -90.0)])
    dispatcher = DroneDispatcher()
    dispatcher.initialize(patrol)

    # Two critical assets at different distances
    near_asset = make_asset("near-001", lat=68.0, lon=-99.0, threat_level="critical")
    far_asset  = make_asset("far-002",  lat=68.0, lon=-80.0, threat_level="critical")

    dispatcher.tick([near_asset, far_asset], patrol, dt=1.0)
    drone = dispatcher.get_all_drones()[0]

    assert drone.status == "intercepting"
    assert drone.target_asset_id == "near-001"


def test_drone_keeps_current_target_while_still_critical():
    """Drone does not switch target when current target remains critical (anti-flap)."""
    patrol = make_patrol_path([(68.0, -100.0), (68.0, -90.0)])
    dispatcher = DroneDispatcher()
    dispatcher.initialize(patrol)

    current_target = make_asset("current-001", lat=68.0, lon=-99.0, threat_level="critical")
    other_asset    = make_asset("other-002",   lat=68.0, lon=-100.5, threat_level="critical")

    # First tick: acquires nearest (other_asset is slightly closer to start)
    dispatcher.tick([current_target, other_asset], patrol, dt=1.0)
    first_target_id = dispatcher.get_all_drones()[0].target_asset_id

    # Second tick: current target still critical, other also critical — should NOT switch
    dispatcher.tick([current_target, other_asset], patrol, dt=1.0)
    second_target_id = dispatcher.get_all_drones()[0].target_asset_id

    assert first_target_id == second_target_id


def test_drone_transitions_to_shadowing_when_close():
    """Drone transitions from intercepting to shadowing when within threshold."""
    patrol = make_patrol_path([(65.0, -95.0), (65.0, -90.0)])
    dispatcher = DroneDispatcher()
    dispatcher.initialize(patrol)

    # Place a critical asset near the drone's starting position
    target = make_asset("target-001", lat=65.001, lon=-95.0, threat_level="critical", heading=0.0)

    for _ in range(200):
        dispatcher.tick([target], patrol, dt=10.0)
        drone = dispatcher.get_all_drones()[0]
        if drone.status == "shadowing":
            break

    drone = dispatcher.get_all_drones()[0]
    assert drone.status == "shadowing"
    assert drone.target_asset_id == "target-001"


def test_drone_recomputes_heading_toward_moving_target():
    """Heading is recomputed each tick as target moves."""
    patrol = make_patrol_path([(68.0, -100.0), (68.0, -90.0)])
    dispatcher = DroneDispatcher()
    dispatcher.initialize(patrol)

    # Tick 1: target at position A
    target_a = make_asset("mv-001", lat=68.0, lon=-98.0, threat_level="critical", heading=90.0)
    dispatcher.tick([target_a], patrol, dt=1.0)
    heading_1 = dispatcher.get_all_drones()[0].heading_deg

    # Tick 2: target has moved east
    target_b = make_asset("mv-001", lat=68.0, lon=-85.0, threat_level="critical", heading=90.0)
    dispatcher.tick([target_b], patrol, dt=1.0)
    heading_2 = dispatcher.get_all_drones()[0].heading_deg

    assert heading_1 is not None
    assert heading_2 is not None
    # Heading should have changed as target moved
    assert abs(heading_1 - heading_2) > 0.1


def test_drone_returns_to_patrol_when_no_critical_assets():
    """Drone returns to patrolling when no critical assets remain."""
    patrol = make_patrol_path([(68.0, -100.0), (68.0, -90.0)])
    dispatcher = DroneDispatcher()
    dispatcher.initialize(patrol)

    # Start intercepting
    target = make_asset("clear-001", lat=68.0, lon=-98.0, threat_level="critical")
    dispatcher.tick([target], patrol, dt=1.0)
    assert dispatcher.get_all_drones()[0].status == "intercepting"

    # No critical assets now — drone should move to returning_to_patrol
    cleared = make_asset("clear-001", lat=68.0, lon=-98.0, threat_level="normal")
    dispatcher.tick([cleared], patrol, dt=1.0)

    drone = dispatcher.get_all_drones()[0]
    assert drone.status in ("returning_to_patrol", "patrolling")
    assert drone.target_asset_id is None


def test_dispatch_shim_is_idempotent_for_same_asset():
    """Legacy dispatch shim returns None for an already-targeted asset."""
    patrol = make_patrol_path([(68.0, -100.0), (68.0, -90.0)])
    dispatcher = DroneDispatcher()
    dispatcher.initialize(patrol)

    d1 = dispatcher.dispatch("asset-dup", 68.0, -98.0)
    d2 = dispatcher.dispatch("asset-dup", 68.0, -98.0)

    assert d1 is not None
    assert d2 is None


def test_drone_reacquires_nearest_remaining_critical_target_when_current_target_clears():
    """
    Single-drone multi-target policy: the drone holds its current target while
    critical, then reacquires the nearest remaining critical asset once the
    current target clears — without dropping back to patrol while a breach stands.
    """
    patrol = make_patrol_path([(68.0, -100.0), (68.0, -90.0)])
    dispatcher = DroneDispatcher()
    dispatcher.initialize(patrol)

    # asset-a is nearest to the drone's start; asset-b is further east. Both critical.
    asset_a = make_asset("asset-a", lat=68.0, lon=-99.5, threat_level="critical")
    asset_b = make_asset("asset-b", lat=68.0, lon=-95.0, threat_level="critical")

    dispatcher.tick([asset_a, asset_b], patrol, dt=1.0)
    drone = dispatcher.get_all_drones()[0]
    assert drone.target_asset_id == "asset-a"
    assert drone.status in ("intercepting", "shadowing")

    # asset-a clears; asset-b remains critical → drone must reacquire asset-b.
    asset_a_clear = make_asset("asset-a", lat=68.0, lon=-99.5, threat_level="normal")
    dispatcher.tick([asset_a_clear, asset_b], patrol, dt=1.0)
    drone = dispatcher.get_all_drones()[0]

    assert drone.target_asset_id == "asset-b"
    assert drone.status in ("intercepting", "shadowing")
    assert drone.status != "patrolling"


def test_replacing_patrol_path_changes_active_drone_route():
    """
    Replacing the patrol path must make the new path authoritative (guards the
    regression where an operator path was dropped and the default remained).
    The drone should begin routing toward the new path's waypoints.
    """
    patrol_svc = PatrolService()
    default_path = patrol_svc.get_path()
    default_waypoints = list(default_path.waypoints)

    dispatcher = DroneDispatcher()
    dispatcher.initialize(default_path)

    # New route placed far from the default path so movement is unambiguous.
    new_waypoints = [
        PatrolWaypoint(lat=61.0, lon=-72.0),
        PatrolWaypoint(lat=61.5, lon=-71.0),
    ]
    new_path = patrol_svc.set_path(
        PatrolPathCreate(name="Operator Route", waypoints=new_waypoints)
    )

    active = patrol_svc.get_path()
    assert active.id == new_path.id
    assert active.id != default_path.id
    assert active.waypoints == new_waypoints
    assert active.waypoints != default_waypoints

    drone_before = dispatcher.get_all_drones()[0]
    dist_before = haversine_distance_m(
        drone_before.lat, drone_before.lon, new_waypoints[0].lat, new_waypoints[0].lon
    )

    # Mirror the POST /patrol-path behavior, then advance with no critical assets.
    dispatcher.reset_patrol()
    for _ in range(3):
        dispatcher.tick([], active, dt=10.0)

    drone_after = dispatcher.get_all_drones()[0]
    dist_after = haversine_distance_m(
        drone_after.lat, drone_after.lon, new_waypoints[0].lat, new_waypoints[0].lon
    )

    assert drone_after.status in ("patrolling", "returning_to_patrol")
    # Directional: the drone is moving toward the new route, not the old default.
    assert dist_after < dist_before
