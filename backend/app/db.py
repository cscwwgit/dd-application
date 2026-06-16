"""SQLite database initialization and helpers."""
import os

import aiosqlite

from app.config import DB_PATH

CREATE_ZONES_TABLE = """
CREATE TABLE IF NOT EXISTS restricted_zones (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    geojson TEXT NOT NULL,
    created_at TEXT NOT NULL
)
"""

CREATE_EVENTS_TABLE = """
CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    severity TEXT NOT NULL,
    asset_id TEXT,
    zone_id TEXT,
    drone_id TEXT,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL
)
"""


async def init_db() -> None:
    parent = os.path.dirname(DB_PATH)
    if parent:
        os.makedirs(parent, exist_ok=True)
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(CREATE_ZONES_TABLE)
        await db.execute(CREATE_EVENTS_TABLE)
        await db.commit()
