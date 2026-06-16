"""Deterministic asset telemetry generator."""
from __future__ import annotations

import math
import random
from datetime import datetime, timezone

from app.config import (
    LAT_MAX,
    LAT_MIN,
    LON_MAX,
    LON_MIN,
    NUM_ASSETS,
    SIMULATION_SEED,
)
from app.models import AssetState
from app.services.geo import project_point

CALLSIGN_PREFIXES = [
    "ALPHA", "BRAVO", "CHARLIE", "DELTA", "ECHO",
    "FOXTROT", "GOLF", "HOTEL", "INDIA", "JULIET",
    "KILO", "LIMA", "MIKE", "NOVEMBER", "OSCAR",
]

ASSET_TYPES = ["aircraft", "vehicle"]

# Aircraft: faster and higher; vehicles: slower, ground level
AIRCRAFT_SPEED_RANGE = (80.0, 250.0)   # m/s (~288–900 km/h)
VEHICLE_SPEED_RANGE = (5.0, 30.0)       # m/s (~18–108 km/h)
AIRCRAFT_ALT_RANGE = (3000.0, 12000.0)  # metres
VEHICLE_ALT_RANGE = (0.0, 500.0)


def _make_callsign(rng: random.Random, index: int) -> str:
    prefix = CALLSIGN_PREFIXES[index % len(CALLSIGN_PREFIXES)]
    num = rng.randint(10, 99)
    return f"{prefix}{num}"


class Asset:
    """Mutable internal asset representation used by the generator."""

    def __init__(self, asset_id: str, rng: random.Random, index: int) -> None:
        self.id = asset_id
        self.callsign = _make_callsign(rng, index)
        self.asset_type: str = rng.choice(ASSET_TYPES)
        self.lat = rng.uniform(LAT_MIN, LAT_MAX)
        self.lon = rng.uniform(LON_MIN, LON_MAX)
        self.heading_deg = rng.uniform(0.0, 360.0)
        if self.asset_type == "aircraft":
            self.speed_mps = rng.uniform(*AIRCRAFT_SPEED_RANGE)
            self.altitude_m = rng.uniform(*AIRCRAFT_ALT_RANGE)
        else:
            self.speed_mps = rng.uniform(*VEHICLE_SPEED_RANGE)
            self.altitude_m = rng.uniform(*VEHICLE_ALT_RANGE)
        self.heading_change_rate = rng.uniform(-0.5, 0.5)  # deg/tick

    def advance(self, dt_seconds: float) -> None:
        """Move the asset one tick forward."""
        dist = self.speed_mps * dt_seconds
        self.lat, self.lon = project_point(self.lat, self.lon, self.heading_deg, dist)
        # Gradual heading drift
        self.heading_deg = (self.heading_deg + self.heading_change_rate * dt_seconds) % 360

        # Bounce off area boundaries
        if self.lat < LAT_MIN or self.lat > LAT_MAX:
            self.heading_deg = (180 - self.heading_deg) % 360
            self.lat = max(LAT_MIN, min(LAT_MAX, self.lat))
        if self.lon < LON_MIN or self.lon > LON_MAX:
            self.heading_deg = (360 - self.heading_deg) % 360
            self.lon = max(LON_MIN, min(LON_MAX, self.lon))

    def to_state(self) -> AssetState:
        return AssetState(
            id=self.id,
            callsign=self.callsign,
            asset_type=self.asset_type,  # type: ignore[arg-type]
            lat=self.lat,
            lon=self.lon,
            altitude_m=self.altitude_m,
            heading_deg=self.heading_deg,
            speed_mps=self.speed_mps,
            threat_level="normal",
            nearest_zone_id=None,
            distance_to_nearest_zone_m=None,
            tte_seconds=None,
            updated_at=datetime.now(timezone.utc),
        )


class TelemetryGenerator:
    """Owns and advances all simulated assets."""

    def __init__(self) -> None:
        rng = random.Random(SIMULATION_SEED)
        self._assets: list[Asset] = [
            Asset(f"asset-{i:03d}", rng, i) for i in range(NUM_ASSETS)
        ]

    def tick(self, dt_seconds: float) -> None:
        for asset in self._assets:
            asset.advance(dt_seconds)

    def get_states(self) -> list[AssetState]:
        return [a.to_state() for a in self._assets]

    def get_asset(self, asset_id: str) -> Asset | None:
        for a in self._assets:
            if a.id == asset_id:
                return a
        return None

    def get_all_assets(self) -> list[Asset]:
        return list(self._assets)
