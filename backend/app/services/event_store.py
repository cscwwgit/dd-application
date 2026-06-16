"""Event creation, deduplication, and persistence."""
from __future__ import annotations

import uuid
from collections import deque
from datetime import datetime, timezone

import aiosqlite

from app.config import DB_PATH
from app.models import EventRecord

MAX_RECENT_EVENTS = 200


class EventStore:
    def __init__(self) -> None:
        self._events: deque[EventRecord] = deque(maxlen=MAX_RECENT_EVENTS)

    async def add_event(
        self,
        event_type: str,
        severity: str,
        message: str,
        asset_id: str | None = None,
        zone_id: str | None = None,
        drone_id: str | None = None,
    ) -> EventRecord:
        event = EventRecord(
            id=str(uuid.uuid4()),
            event_type=event_type,  # type: ignore[arg-type]
            severity=severity,  # type: ignore[arg-type]
            asset_id=asset_id,
            zone_id=zone_id,
            drone_id=drone_id,
            message=message,
            created_at=datetime.now(timezone.utc),
        )
        self._events.append(event)
        await self._persist(event)
        return event

    async def _persist(self, event: EventRecord) -> None:
        async with aiosqlite.connect(DB_PATH) as db:
            await db.execute(
                """INSERT INTO events (id, event_type, severity, asset_id, zone_id, drone_id, message, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    event.id,
                    event.event_type,
                    event.severity,
                    event.asset_id,
                    event.zone_id,
                    event.drone_id,
                    event.message,
                    event.created_at.isoformat(),
                ),
            )
            await db.commit()

    def get_recent(self, n: int = 50) -> list[EventRecord]:
        events = list(self._events)
        return events[-n:]
