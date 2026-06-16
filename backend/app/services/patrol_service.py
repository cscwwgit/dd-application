"""Patrol path storage and retrieval."""
from __future__ import annotations

from datetime import datetime, timezone

from app.models import PatrolPath, PatrolPathCreate, PatrolWaypoint

# Default patrol path over northern Canada so demo starts in a useful state
_DEFAULT_WAYPOINTS: list[PatrolWaypoint] = [
    PatrolWaypoint(lat=68.5, lon=-105.0),
    PatrolWaypoint(lat=70.0, lon=-100.0),
    PatrolWaypoint(lat=71.0, lon=-95.0),
    PatrolWaypoint(lat=70.5, lon=-90.0),
    PatrolWaypoint(lat=69.0, lon=-95.0),
    PatrolWaypoint(lat=67.5, lon=-100.0),
]

_DEFAULT_PATH = PatrolPath(
    id="patrol-default",
    name="Default Arctic Patrol",
    waypoints=_DEFAULT_WAYPOINTS,
    created_at=datetime.now(timezone.utc),
)


class PatrolService:
    def __init__(self) -> None:
        self._path: PatrolPath = _DEFAULT_PATH

    def get_path(self) -> PatrolPath:
        return self._path

    def set_path(self, payload: PatrolPathCreate) -> PatrolPath:
        self._path = PatrolPath(
            id="patrol-primary",
            name=payload.name or "Operator Patrol Route",
            waypoints=payload.waypoints,
            created_at=datetime.now(timezone.utc),
        )
        return self._path

    def delete_path(self) -> None:
        self._path = _DEFAULT_PATH
