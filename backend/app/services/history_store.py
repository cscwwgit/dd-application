"""Bounded in-memory position history for each asset."""
from __future__ import annotations

from collections import deque
from datetime import datetime, timezone

from app.config import HISTORY_WINDOW_SECONDS
from app.models import AssetState


class PositionRecord:
    __slots__ = ("lat", "lon", "heading_deg", "altitude_m", "recorded_at")

    def __init__(self, lat: float, lon: float, heading_deg: float, altitude_m: float | None, recorded_at: datetime) -> None:
        self.lat = lat
        self.lon = lon
        self.heading_deg = heading_deg
        self.altitude_m = altitude_m
        self.recorded_at = recorded_at


class HistoryStore:
    """Maintains last HISTORY_WINDOW_SECONDS of positions per asset."""

    def __init__(self) -> None:
        self._histories: dict[str, deque[PositionRecord]] = {}
        # Max records: window / tick = 300 points at 1Hz
        self._max_records = HISTORY_WINDOW_SECONDS

    def record(self, asset: AssetState) -> None:
        if asset.id not in self._histories:
            self._histories[asset.id] = deque(maxlen=self._max_records)
        self._histories[asset.id].append(
            PositionRecord(
                lat=asset.lat,
                lon=asset.lon,
                heading_deg=asset.heading_deg,
                altitude_m=asset.altitude_m,
                recorded_at=asset.updated_at,
            )
        )

    def get_history(self, asset_id: str) -> list[dict]:
        """Return history as list of dicts suitable for JSON serialization."""
        if asset_id not in self._histories:
            return []
        return [
            {
                "lat": r.lat,
                "lon": r.lon,
                "heading_deg": r.heading_deg,
                "altitude_m": r.altitude_m,
                "recorded_at": r.recorded_at.isoformat(),
            }
            for r in self._histories[asset_id]
        ]

    def record_all(self, assets: list[AssetState]) -> None:
        for asset in assets:
            self.record(asset)
