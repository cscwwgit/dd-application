"""Zone creation, deletion, and persistence."""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

import aiosqlite

from app.config import DB_PATH
from app.models import RestrictedZone, ZoneCreate

_zone_counter = 0


def _next_zone_name() -> str:
    global _zone_counter
    _zone_counter += 1
    return f"Restricted Zone {_zone_counter}"


class ZoneService:
    def __init__(self) -> None:
        self._zones: dict[str, RestrictedZone] = {}

    async def load_from_db(self) -> None:
        async with aiosqlite.connect(DB_PATH) as db:
            async with db.execute("SELECT id, name, geojson, created_at FROM restricted_zones") as cursor:
                rows = await cursor.fetchall()
        for row in rows:
            zone = RestrictedZone(
                id=row[0],
                name=row[1],
                geojson=json.loads(row[2]),
                created_at=datetime.fromisoformat(row[3]),
            )
            self._zones[zone.id] = zone

    async def create_zone(self, payload: ZoneCreate) -> RestrictedZone:
        zone_id = str(uuid.uuid4())
        name = payload.name or _next_zone_name()
        zone = RestrictedZone(
            id=zone_id,
            name=name,
            geojson=payload.geojson,
            created_at=datetime.now(timezone.utc),
        )
        self._zones[zone_id] = zone
        async with aiosqlite.connect(DB_PATH) as db:
            await db.execute(
                "INSERT INTO restricted_zones (id, name, geojson, created_at) VALUES (?, ?, ?, ?)",
                (zone_id, name, json.dumps(payload.geojson), zone.created_at.isoformat()),
            )
            await db.commit()
        return zone

    async def delete_zone(self, zone_id: str) -> bool:
        if zone_id not in self._zones:
            return False
        del self._zones[zone_id]
        async with aiosqlite.connect(DB_PATH) as db:
            await db.execute("DELETE FROM restricted_zones WHERE id = ?", (zone_id,))
            await db.commit()
        return True

    def list_zones(self) -> list[RestrictedZone]:
        return list(self._zones.values())

    def get_zone(self, zone_id: str) -> RestrictedZone | None:
        return self._zones.get(zone_id)

    def zones_as_dicts(self) -> list[dict]:
        """Return zones as plain dicts for geo service consumption."""
        return [{"id": z.id, "name": z.name, "geojson": z.geojson} for z in self._zones.values()]
