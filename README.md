# Restricted Zone Airspace Monitor (RZAM)

## Project Overview

Restricted Zone Airspace Monitor is a real-time full-stack tactical dashboard that simulates 130 moving assets across the Canadian Arctic, lets an operator define restricted zones by drawing polygons on a live map, and calculates explicit `critical` / `warning` / `normal` threat levels with hysteresis for every asset each second. An autonomous drone follows an operator-defined patrol path, automatically breaks off to intercept and shadow any critical asset, and resumes patrol when the threat clears. Assets move continuously, threat colors update live, the event log surfaces state transitions as they happen, and selected assets show both historical trajectory and a smoothed projected path on the map.

---

## Why This Scenario

I chose the map-based real-time asset monitoring scenario because it best matched the mission profile of operational awareness, autonomous systems, sensor/asset tracking, and operator decision support in constrained environments. I focused the implementation on a backend-authoritative tactical picture — rather than a purely visual map demo — so that the system demonstrates data flow, state transitions, event generation, and operational UX end-to-end.

---

## Features

- **130 simulated assets** (aircraft + vehicles) with deterministic seed, moving continuously in northern Canada
- **WebSocket telemetry stream** — 1 Hz snapshots pushed to all connected clients including patrol path
- **Polygon zone drawing** — operator draws on map, zone is persisted to backend + SQLite
- **Threat analysis** — explicit `normal` / `warning` / `critical` semantics with critical-always-wins precedence
- **Threat hysteresis** — threat level held for 3 consecutive clear ticks before downgrade (prevents flapping)
- **Zone-created-around-asset** — immediate breach event if a drawn zone encloses an asset already at rest
- **Time-to-Entry (TTE)** — discrete forward projection at 10s steps over a 10-minute horizon
- **Warning threshold** — assets projected to enter a zone within 120s receive `warning` status
- **Smoothed predicted path** — forward projection estimates speed and turn rate from the full bounded history buffer, producing curved arcs for banking assets
- **Operator patrol path** — draw a multi-waypoint route on the map; replaces the default route immediately
- **Autonomous drone state machine** — four states: `patrolling` → `intercepting` → `shadowing` → `returning_to_patrol`
- **Dynamic shadow point** — drone positions itself 500 m behind the target asset relative to the asset's heading
- **Anti-flap intercept logic** — drone keeps current target while it remains critical; only re-acquires on clear
- **Asset click → details panel** — callsign, type, heading, speed, altitude, TTE, distance to zone
- **Drone click → details panel** — live state, heading, target callsign, patrol waypoint index, intercept ETA
- **Historical trajectory** — last 5 minutes of positions rendered as a faded polyline
- **Event log** — `warning`, `breach`, `drone_dispatched`, `shadowing` events with severity colors and human-readable names
- **Transition-based events** — events fire only on state change, never duplicated per tick
- **Zone management** — draw, name, and delete zones from the sidebar; persisted across page refresh
- **Status bar** — WebSocket status, asset count, zone count, active drones, last update time
- **Dark tactical UI** — operator-focused, color-coded threat visualization

---

## How to Run

### Option A — Docker Compose (recommended)

```bash
git clone <your-repo-url>
cd <repo-directory>
docker compose up --build
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:8000
- Backend docs: http://localhost:8000/docs

### Option B — Local (no Docker)

**Backend:**
```bash
cd backend
python -m venv .venv

# Windows:
.venv\Scripts\activate
# macOS / Linux:
source .venv/bin/activate

pip install -r requirements.txt
uvicorn app.main:app --reload
```

**Frontend** (separate terminal):
```bash
cd frontend
npm install
npm run dev
```

- Frontend: http://localhost:5173
- Backend: http://localhost:8000

---

## How to Test

```bash
cd backend
pytest tests/ -v
```

Tests cover:

| Test | What it verifies |
|---|---|
| `test_point_inside_zone` / `test_point_outside_zone` | Ray-casting polygon containment |
| `test_tte_for_asset_heading_toward_zone` | TTE returns a finite value for an asset on an intercept heading |
| `test_asset_inside_zone_is_critical` | Asset already inside a zone is classified `critical` |
| `test_critical_has_precedence_over_warning` | Inside-zone is always `critical` regardless of heading (critical wins) |
| `test_asset_projected_to_enter_zone_within_threshold_is_warning` | Asset heading toward zone within 120s is classified `warning` |
| `test_no_zones_returns_normal` | No false positives when no zones are defined |
| `test_threat_analyzer_tracks_transitions` | Transition detection fires on level change only |
| `test_asset_inside_zone_remains_critical_even_when_leaving` | Hysteresis holds `critical` for N ticks after asset leaves zone |
| `test_asset_exiting_zone_clears_after_hysteresis` | Threat level returns to `normal` after hysteresis window expires |
| `test_zone_created_around_existing_asset_creates_breach` | Immediate `critical` when zone is drawn around a stationary asset |
| `test_drone_follows_patrol_waypoints` | Drone advances toward next waypoint each tick while patrolling |
| `test_drone_advances_waypoint_index_on_arrival` | `patrol_waypoint_index` increments on waypoint arrival |
| `test_drone_acquires_nearest_critical_asset` | Drone targets the geographically nearest critical asset |
| `test_drone_keeps_current_target_while_still_critical` | No target switch while current target remains critical (anti-flap) |
| `test_drone_transitions_to_shadowing_when_close` | `intercepting` → `shadowing` transition within proximity threshold |
| `test_drone_recomputes_heading_toward_moving_target` | Heading is recomputed each tick as target moves |
| `test_drone_returns_to_patrol_when_no_critical_assets` | Drone returns to patrol when all threats clear |
| `test_dispatch_shim_is_idempotent_for_same_asset` | Legacy dispatch shim is a no-op for an already-targeted asset |

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  React + TypeScript Frontend (Vite, port 5173)          │
│                                                         │
│  App.tsx                                                │
│  ├── MapView.tsx         MapLibre GL JS map             │
│  │   ├── GeoJSON sources: assets, drones, zones        │
│  │   ├── History + predicted path layers               │
│  │   └── Custom click-to-draw polygon tool             │
│  ├── DetailsPanel.tsx    Asset / drone details          │
│  ├── EventLog.tsx        Live event stream              │
│  ├── ZoneList.tsx        Zone management sidebar        │
│  └── StatusBar.tsx       Connection + counts            │
│                                                         │
│  hooks/useTelemetry.ts      WebSocket client            │
│  hooks/useZones.ts          Zone REST calls             │
│  hooks/useSelectedEntity.ts Click selection state       │
└──────────────────┬──────────────────────────────────────┘
                   │  WebSocket /ws/telemetry (1 Hz)
                   │  REST: GET/POST/DELETE /zones
                   │        GET /assets/{id}/history
                   │        GET /assets/{id}/predicted-path
                   │        GET /events  GET /drones
                   ▼
┌─────────────────────────────────────────────────────────┐
│  FastAPI Backend (uvicorn, port 8000)                   │
│                                                         │
│  simulation_loop.py      Main tick loop (asyncio)       │
│  telemetry_generator.py  130 deterministic assets       │
│  threat_analyzer.py      TTE + threat level per asset   │
│  zone_service.py         Zone CRUD + SQLite             │
│  history_store.py        Bounded deque (300 pts/asset)  │
│  event_store.py          Transition events + SQLite     │
│  drone_dispatcher.py     Autonomous state machine (patrol/intercept/shadow) │
│  patrol_service.py       Operator patrol path CRUD                          │
│  geo.py                  Haversine, bearing, project,   │
│                          point-in-polygon               │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼
              SQLite (rzam.db)
              ├── restricted_zones  (loaded at startup)
              └── events            (audit trail only)

  Drone state, patrol path, and asset history are in-memory only.
```

Asset position history is held in a bounded in-memory `deque` per asset and is not persisted to SQLite. Zones are loaded from SQLite at startup and are durable across restarts. Events are written to SQLite as an audit trail; the live event panel shows the current runtime’s recent buffer. Drone state, patrol path, and asset history are intentionally in-memory for this assessment.

---

## API Surface

| Endpoint | Purpose |
|---|---|
| `GET /health` | Backend health check |
| `GET /assets` | Current snapshot of all asset states |
| `GET /assets/{id}/history` | Bounded position history for a selected asset |
| `GET /assets/{id}/predicted-path` | Smoothed 10-minute forward projection for a selected asset |
| `GET /zones` | List all restricted zones |
| `POST /zones` | Create a restricted zone from a drawn polygon |
| `DELETE /zones/{id}` | Delete a restricted zone |
| `GET /events` | Recent event log |
| `GET /drones` | Current drone states |
| `GET /patrol-path` | Get the current drone patrol path |
| `POST /patrol-path` | Set a new operator-defined patrol path |
| `DELETE /patrol-path` | Reset patrol path to built-in default |
| `WS /ws/telemetry` | Live 1 Hz world-state stream (assets + drones + events + patrol path) |

---

## Operational Semantics

### Threat State Machine

Each asset is evaluated against every defined restricted zone every tick. The resulting threat level follows strict precedence rules:

| Raw assessment | Applied level |
|---|---|
| Asset position is inside zone polygon | `critical` (always — heading irrelevant) |
| Asset projected to enter zone within 120 s | `warning` |
| Neither of the above | `normal` |

**Hysteresis:** once an asset reaches `critical` or `warning`, it must see `HYSTERESIS_TICKS` (default 3) consecutive ticks of a lower raw assessment before the level is actually downgraded. This prevents threat level flapping when an asset is near a zone boundary.

**Zone-created-around-asset:** when an operator draws a new zone, any asset already inside that polygon receives an immediate `breach` event — it does not have to wait for the next tick.

### Drone State Machine

The single autonomous drone follows this state graph:

```
patrolling ──(critical asset detected)──► intercepting
                                                │
                                    (within DRONE_SHADOW_DISTANCE_M)
                                                │
                                                ▼
                                           shadowing
                                                │
                                    (no critical assets remain)
                                                │
                                                ▼
                                       returning_to_patrol
                                                │
                               (back at patrol path)  
                                                │
                                                ▼
                                           patrolling
```

- **`patrolling`** — drone cycles through the operator-defined waypoints in order, looping back to waypoint 0 after the last one.
- **`intercepting`** — drone flies directly toward the *dynamic shadow point*: a position `DRONE_SHADOW_STANDOFF_M` (500 m) behind the target asset along the asset's reciprocal heading. Heading and shadow point are recomputed every tick.
- **`shadowing`** — drone has reached the shadow point. It maintains the offset by recomputing the shadow point every tick and moving toward it subject to the drone's speed cap.
- **`returning_to_patrol`** — no critical assets remain; drone clears its target and resumes patrol by routing toward the nearest patrol waypoint.

**Anti-flap:** while a drone has an active target and that target is still `critical`, the drone will not switch to a different asset even if a closer one appears.

---

## Design Decisions and Tradeoffs

### 1. Simulated telemetry instead of a public API
Deterministic seed (42) makes the demo fully reproducible without network dependencies or rate limits. The simulator produces the same shape of normalized telemetry that a real ADS-B or ASTERIX ingestion adapter would feed into the analysis pipeline.

### 2. FastAPI over Django
The core workload is a long-lived telemetry loop plus WebSocket fan-out, not relational CRUD or admin workflows. I chose FastAPI because its async-native design keeps the service surface small and the WebSocket handling straightforward. Django would also be viable, but it would have added framework overhead without corresponding benefit for this assessment.

### 3. Discrete projection for TTE
Each asset's heading and speed are projected forward in 10-second steps up to 600 seconds. The first step that falls inside a zone polygon defines TTE. This approach is simple, testable, and explainable. A production system would use geodesic trajectory intersection with uncertainty bounds and covariance propagation.

### 4. Backend-authoritative analysis
All threat state, event generation, and drone dispatch live in the backend. The frontend is a pure visualization layer. This avoids split-brain: two browser tabs always see the same world state.

### 5. Bounded in-memory history
Each asset keeps a `deque(maxlen=300)` (5 minutes at 1 Hz). This keeps memory proportional to asset count, eliminates per-tick SQLite writes for 130 assets, and is fast to serve on demand. Zones are persisted to SQLite and loaded at startup. Events are written to SQLite as an audit trail, while the live event panel shows the current runtime's recent buffer. Drone state, patrol path, and asset history are intentionally in-memory for this assessment.

### 6. Imperative GeoJSON source updates instead of React marker components
The map is updated imperatively (`source.setData(...)`) on each WebSocket tick. React state holds asset/drone arrays only for the sidebar panels. This avoids re-rendering hundreds of DOM elements at 1 Hz and keeps frame rate stable regardless of asset count.

---

## Data Models

| Model | Key Fields |
|---|---|
| `AssetState` | id, callsign, asset_type, lat, lon, heading_deg, speed_mps, altitude_m, threat_level, tte_seconds, nearest_zone_id, distance_to_nearest_zone_m |
| `RestrictedZone` | id, name, geojson, created_at |
| `EventRecord` | id, event_type, severity, asset_id, zone_id, drone_id, message, created_at |
| `DroneState` | id, status, lat, lon, heading_deg, target_asset_id, origin_base_id, speed_mps, intercept_seconds, patrol_waypoint_index |
| `PatrolPath` | id, name, waypoints (list of lat/lon), created_at |

---

## Performance Considerations

- **GeoJSON source updates** — single `setData()` call per tick; no per-marker DOM churn
- **Bounded history** — `deque(maxlen=300)` per asset; memory scales linearly with asset count
- **Compact WebSocket snapshots** — full state snapshot at 1 Hz is ~30–50 KB for 130 assets
- **History rendered only for selected asset** — avoids drawing 130 polylines simultaneously
- **No per-tick SQLite writes for assets** — only zones and events persist to SQLite; asset history, drone state, and patrol path are in-memory only; minimizes I/O hot path
- **Scale path** — for 1000+ assets: delta updates over WebSocket, PostGIS for zone queries, worker processes for threat analysis

---

## Known Limitations and Assumptions

- The telemetry source is simulated and deterministic for reliable, reproducible review; it is not connected to a live data feed.
- TTE uses discrete forward projection rather than exact polygon-trajectory intersection; a real system would propagate uncertainty and use geodesic intersection.
- TTE uses current heading and velocity with discrete forward projection. The selected-asset predicted path estimates recent turn rate from trajectory history, but still assumes constant speed/turn rate and does not model acceleration, climb/descent, weather, or intent.
- Zone containment checks are evaluated in-process with a ray-casting algorithm, which is appropriate for the assessment scale; a production system would use PostGIS or a geospatial indexing strategy.
- Authentication, authorization, alert acknowledgement, and multi-operator workflows are intentionally out of scope.
- The drone response model uses a single autonomous patrol drone. It does not model a fleet, base inventory, fuel, weather, airspace constraints, or multi-target task prioritization. A production fleet manager would assign the nearest available drone from a base or patrol sector and apply tasking rules.
- Changing the patrol path retasks the same active drone to the new path. A production system would instead assign the nearest available drone from base inventory rather than repositioning an active drone across the entire theater.
- Deleting a zone removes it from future threat evaluation but does not delete historical events. Assets that were critical only because of the deleted zone clear after the hysteresis window. If the drone's current target clears and no other critical assets remain, the drone resumes patrol; if other critical assets remain, it reacquires the nearest one.
- Asset position history is not persisted across backend restarts.

---

## What I Would Do Next

- **Real telemetry adapter** — ADS-B, ASTERIX, or proprietary sensor feed replacing the simulator
- **PostGIS** — replace ray-casting with native `ST_Within` / `ST_Distance` for scale and accuracy
- **Durable event queue** — Redis Streams or Kafka for event fan-out, replay, and audit trail
- **Sensor uncertainty modeling** — confidence radius, covariance propagation for TTE
- **Incident reconstruction / replay** — scrub through historical state at any timestamp
- **Alert acknowledgement** — operator marks a breach as acknowledged to suppress re-notification
- **Authentication + roles** — operator vs. supervisor permissions
- **More rigorous drone tasking** — priority queue, re-tasking, fuel/range constraints
- **Deployment hardening** — TLS termination, health probes, horizontal scaling of backend workers

---

## Demo

<!-- Add screenshot or recorded demo video link before final submission -->

