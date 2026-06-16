# Restricted Zone Airspace Monitor (RZAM)

Restricted Zone Airspace Monitor is a real-time, full-stack tactical dashboard built for the Dominion Dynamics Software Engineer Technical Assessment, **Problem 1 — Map-based Data Visualization**.

The application simulates 130 moving assets across northern Canada, lets an operator draw restricted zones on a live map, calculates threat state and Time-to-Entry (TTE) against those zones, renders historical and predicted trajectories for selected assets, and runs an autonomous patrol drone that can break patrol to intercept and shadow breached assets.

The implementation is intentionally scoped as an assessment-grade operational model: complete enough to demonstrate end-to-end system design, real-time data flow, map interaction, state transitions, and autonomous response behavior, while explicitly documenting where a production-grade version would extend into fleet dispatch, durable event processing, geospatial indexing, uncertainty modeling, and operator workflows.

---

## Why This Scenario

I chose the map-based real-time asset monitoring scenario because it most directly matches Dominion Dynamics' mission profile: operational awareness, autonomous systems, asset/sensor tracking, and operator decision support in constrained environments.

Rather than building a purely visual map demo, I focused on a **backend-authoritative tactical picture**. The backend owns simulation, threat analysis, event generation, drone state, and patrol behavior. The frontend focuses on operator interaction and visualization. This makes the system easier to reason about, avoids split-brain behavior across clients, and gives the assessment a coherent end-to-end data flow.

---

## Assessment Coverage

| Prompt Requirement                                                                | Implementation                                                                                                                                |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Connect to a public API or create a telemetry generator for 100+ real-time assets | Deterministic telemetry generator creates 130 moving aircraft/vehicle assets and streams them at 1 Hz                                         |
| Display real-time data on a map interface                                         | React + TypeScript frontend renders live asset, zone, drone, history, and prediction layers with MapLibre GL JS                               |
| Allow interactive polygons / restricted zones                                     | Operator draws restricted zones directly on the map; zones are persisted to SQLite and evaluated every tick                                   |
| Calculate Time-to-Entry based on current vector                                   | Backend projects each asset's current heading/speed forward in 10-second increments over a 10-minute horizon                                  |
| Change symbology by threat level                                                  | Assets render as `normal`, `warning`, or `critical` based on backend-calculated tactical state                                                |
| Render historical trajectory on asset click                                       | Selected asset shows bounded five-minute history as a faded polyline                                                                          |
| Project predicted path from recent heading/velocity history                       | Selected asset predicted path uses recent trajectory history to estimate speed and turn rate, producing curved projections for banking assets |
| Show asset info panel                                                             | Details panel shows callsign, type, heading, speed, altitude, threat level, TTE, and distance to nearest zone                                 |
| Simulated autonomous drone follows user-defined patrol path                       | Operator can draw a multi-waypoint patrol path; drone follows it while no critical target exists                                              |
| Drone recalculates heading/velocity to shadow nearest breached asset              | Drone acquires the nearest critical asset, recomputes heading and dynamic shadow point every tick, and maintains standoff behind the target   |
| Event/audit visibility                                                            | Event log records warning, breach, drone-dispatch, and drone-shadowing transitions                                                            |
| Full-stack delivery                                                               | FastAPI backend, React frontend, supporting services/helpers, Docker Compose, README, and test suite                                          |

---

## Feature Summary

### Real-Time Tactical Picture

* 130 deterministic simulated assets across northern Canada
* Aircraft and vehicle asset types
* 1 Hz WebSocket telemetry snapshots
* Backend-authoritative threat state
* Current asset snapshot available via REST
* Live status bar with WebSocket state, asset count, zone count, drone count, and last update time

### Restricted Zones

* Operator-drawn polygon zones
* Zone persistence in SQLite
* Zone list sidebar with delete action
* Click a zone in the sidebar to focus/highlight it on the map
* Immediate breach event if a newly drawn zone already contains an asset
* Zone deletion removes the zone from future evaluation without deleting historical events

### Threat Analysis

* Three explicit threat levels:

  * `normal`: outside zones and not projected to enter soon
  * `warning`: outside zones but projected to enter within the warning threshold
  * `critical`: currently inside a restricted zone
* Critical state has precedence over warning
* TTE calculated from current heading/speed vector
* Hysteresis prevents flapping near zone boundaries
* Transition-based events avoid duplicate warning/breach spam

### Asset Details

* Click any asset to select it
* Details panel shows callsign, type, position, altitude, heading, speed, threat level, TTE, nearest zone distance, and nearest zone ID
* Historical trajectory renders as a faded polyline
* Predicted path renders as a dashed forward projection
* Event-log asset clicks focus the map and open the corresponding asset details

### Autonomous Patrol Drone

* One autonomous patrol drone
* Default patrol path is available at startup
* Operator can draw and replace the patrol path
* Drone follows patrol waypoints when no critical asset exists
* Drone acquires the nearest currently critical asset from its current position
* Drone retains its current target while that target remains critical to avoid retasking churn
* Drone recomputes heading, velocity, and shadow point every tick
* Drone shadows a 500 m standoff point behind the target relative to the target's current heading
* Drone resumes patrol when no critical assets remain
* Drone details panel shows status, target, heading, speed, waypoint index, and intercept ETA

---

## How to Run

### Option A — Docker Compose

```bash
git clone https://github.com/cscwwgit/dd-application.git
cd dd-application
docker compose up --build
```

Then open:

* Frontend: `http://localhost:5173`
* Backend API: `http://localhost:8000`
* Backend OpenAPI docs: `http://localhost:8000/docs`

The frontend container serves the React app through nginx and proxies the app's REST/WebSocket paths to the backend container. The backend persists zones and event-audit rows to the `backend-data` Docker volume.

### Option B — Local Development

Start the backend:

```bash
cd backend
python -m venv .venv

# Windows PowerShell:
.venv\Scripts\Activate.ps1

# macOS / Linux:
source .venv/bin/activate

pip install -r requirements.txt
uvicorn app.main:app --reload
```

Start the frontend in a separate terminal:

```bash
cd frontend
npm install
npm run dev
```

Then open:

* Frontend: `http://localhost:5173`
* Backend: `http://localhost:8000`
* Backend OpenAPI docs: `http://localhost:8000/docs`

Vite proxies `/assets`, `/zones`, `/events`, `/drones`, `/patrol-path`, `/health`, and `/ws` to the backend during local development.

---

## How to Test

Backend tests:

```bash
cd backend
pip install -r requirements.txt
pytest tests/ -v
```

Frontend build check:

```bash
cd frontend
npm install
npm run build
```

The backend test suite covers:

| Area                      | Examples                                                         |
| ------------------------- | ---------------------------------------------------------------- |
| Geospatial helpers        | point-in-polygon, projection, distance                           |
| Threat analysis           | critical/warning/normal classification, TTE, critical precedence |
| Hysteresis                | elevated state clears only after consecutive lower-risk ticks    |
| Zone-created-around-asset | immediate critical/breach behavior                               |
| Drone patrol              | waypoint following and waypoint advancement                      |
| Drone target acquisition  | nearest critical target selection                                |
| Anti-flap targeting       | drone keeps current target while it remains critical             |
| Dynamic shadowing         | heading recomputation and transition to `shadowing`              |
| Return-to-patrol          | drone resumes patrol when threats clear                          |

At final review, the backend suite contained 26 tests.

---

## Operator Demo Flow

A concise demo can show the full assessment path in under five minutes:

1. Open the dashboard and show live 130-asset movement.
2. Show the default drone patrol path and patrolling drone.
3. Draw a restricted zone around or ahead of one or more assets.
4. Show assets transition to `warning` / `critical`.
5. Click an asset and show details, TTE, distance, history, and predicted path.
6. Show the event log recording warning/breach transitions.
7. Show the drone break patrol, intercept the critical asset, and transition to shadowing.
8. Draw a new patrol path and show the drone resume/re-route when no critical target remains.
9. Delete a zone and show current state clearing while historical events remain.

The assessment video demo is submitted alongside the repository.

---

## Architecture

```text
┌──────────────────────────────────────────────────────────────┐
│ React + TypeScript Frontend                                  │
│ Vite in development, nginx in Docker                         │
│                                                              │
│ App.tsx                                                      │
│ ├── MapView.tsx                                              │
│ │   ├── MapLibre GL JS map                                   │
│ │   ├── GeoJSON sources for assets, drones, zones            │
│ │   ├── Selected asset history + predicted path layers       │
│ │   ├── Restricted-zone drawing                              │
│ │   └── Patrol-path drawing                                  │
│ ├── DetailsPanel.tsx                                         │
│ ├── EventLog.tsx                                             │
│ ├── ZoneList.tsx                                             │
│ └── StatusBar.tsx                                            │
│                                                              │
│ hooks/useTelemetry.ts       WebSocket state                  │
│ hooks/useZones.ts           Zone REST state                  │
│ hooks/useSelectedEntity.ts  Asset/drone selection state      │
└───────────────────────────────┬──────────────────────────────┘
                                │
                                │ REST:
                                │   GET /assets
                                │   GET /assets/{id}/history
                                │   GET /assets/{id}/predicted-path
                                │   GET/POST/DELETE /zones
                                │   GET /events
                                │   GET /drones
                                │   GET/POST/DELETE /patrol-path
                                │
                                │ WebSocket:
                                │   WS /ws/telemetry
                                ▼
┌───────────────────────────────────────────────────────────────┐
│ FastAPI Backend                                               │
│                                                               │
│ main.py                    App startup and service wiring     │
│ simulation_loop.py         1 Hz authoritative world tick      │
│ telemetry_generator.py     Deterministic moving assets        │
│ threat_analyzer.py         TTE + threat classification        │
│ drone_dispatcher.py        Patrol/intercept/shadow state      │
│ patrol_service.py          Current patrol path                │
│ zone_service.py            Restricted-zone CRUD + persistence │
│ history_store.py           Bounded asset trajectory history   │
│ event_store.py             Runtime events + SQLite audit      │
│ geo.py                     Haversine, bearing, projection,    │
│                            point-in-polygon helpers           │
└───────────────────────────────┬───────────────────────────────┘
                                │
                                ▼
                         SQLite (rzam.db)
                         ├── restricted_zones
                         └── events
```

### State Ownership

The backend is the source of truth for:

* asset positions
* threat state
* TTE
* event generation
* drone target selection
* drone movement/state
* patrol path
* zone state

The frontend is responsible for:

* rendering the map and layers
* collecting user input
* showing details/events/status
* sending zone and patrol updates to the backend
* reflecting the backend's streamed world state

This avoids inconsistent client-side threat calculations and ensures multiple browser tabs see the same tactical picture.

---

## API Surface

| Endpoint                          | Purpose                                        |
| --------------------------------- | ---------------------------------------------- |
| `GET /health`                     | Backend health check                           |
| `GET /assets`                     | Current snapshot of all asset states           |
| `GET /assets/{id}/history`        | Bounded position history for selected asset    |
| `GET /assets/{id}/predicted-path` | Smoothed forward projection for selected asset |
| `GET /zones`                      | List restricted zones                          |
| `POST /zones`                     | Create restricted zone from drawn polygon      |
| `DELETE /zones/{id}`              | Delete restricted zone                         |
| `GET /events`                     | Recent runtime event log                       |
| `GET /drones`                     | Current drone state                            |
| `GET /drones/bases`               | Static reference bases                         |
| `GET /patrol-path`                | Current patrol path                            |
| `POST /patrol-path`               | Replace current patrol path                    |
| `DELETE /patrol-path`             | Reset patrol path to default                   |
| `WS /ws/telemetry`                | Live 1 Hz world-state stream                   |

The WebSocket snapshot includes:

* timestamp
* enriched assets
* drones
* recent events
* current patrol path

---

## Data Models

| Model               | Responsibility                                           |
| ------------------- | -------------------------------------------------------- |
| `AssetState`        | Current tactical state for a simulated aircraft/vehicle  |
| `RestrictedZone`    | Operator-defined polygon zone                            |
| `ThreatAssessment`  | Computed threat result for an asset against active zones |
| `EventRecord`       | Historical warning/breach/drone transition event         |
| `DroneState`        | Current autonomous drone state                           |
| `DroneBase`         | Static reference base metadata                           |
| `PatrolWaypoint`    | Single lat/lon waypoint                                  |
| `PatrolPath`        | Ordered operator-defined drone route                     |
| `TelemetrySnapshot` | WebSocket payload carrying current world state           |

The model intentionally separates:

* **current tactical state**: `AssetState`, `DroneState`
* **operator-defined control inputs**: `RestrictedZone`, `PatrolPath`
* **historical facts**: `EventRecord`
* **computed intermediate analysis**: `ThreatAssessment`

That separation keeps rendering, eventing, threat computation, and autonomous behavior easier to reason about.

---

## Operational Semantics

### Threat State vs. Event History

Threat level is current tactical state:

* `normal`: the asset is outside all restricted zones and is not projected to enter one soon.
* `warning`: the asset is outside all restricted zones but its current vector projects it into a zone within the warning threshold.
* `critical`: the asset is currently inside a restricted zone.

A breach does **not** permanently color an asset as critical after it exits. Instead, the breach remains as an immutable event in the event log. A production system would likely extend this into a fuller incident lifecycle with acknowledgement, clearance, assignment, and replay.

### Threat Precedence

Critical has precedence over warning.

If an asset is inside a restricted zone, it remains `critical` even if its heading points out of the zone. Once it clears the zone, it may become `warning` if projected to re-enter soon, or `normal` if no imminent entry is predicted.

### Hysteresis

Threat classification uses a short hysteresis window to avoid noisy boundary flapping.

If an asset downgrades from a higher raw threat state, the reported state only clears after three consecutive lower-threat ticks. This prevents an asset near a polygon boundary from rapidly alternating between `critical`, `warning`, and `normal`.

### Zone Creation Around Existing Assets

When an operator draws a new zone, all current assets are immediately re-evaluated. If an asset is already inside the newly created zone, a breach event is recorded immediately. This reflects the current operating picture: the active zone set now contains a violation, regardless of whether the asset moved into the zone or the zone was created around the asset.

### Zone Deletion

Deleting a zone removes it from future threat evaluation but does not delete historical events. Assets that were critical only because of the deleted zone clear after the hysteresis window if no remaining zone applies. If the drone's current target clears and no other critical assets remain, the drone resumes patrol; if other critical assets remain, it reacquires the nearest one.

### Drone Targeting Policy

This assessment models a **single autonomous patrol drone** rather than a full fleet scheduler.

The drone follows this policy:

1. Patrol the current operator-defined waypoint route while no critical assets exist.
2. When one or more assets are critical, acquire the nearest critical asset from the drone's current position.
3. Keep the current target while that target remains critical, even if another critical asset becomes closer.
4. If the current target clears and other critical assets remain, reacquire the nearest remaining critical asset.
5. If no critical assets remain, resume patrol by routing toward the nearest patrol waypoint.

This policy avoids retasking churn and makes the drone's behavior stable enough for operator interpretation.

### Drone State Machine

```text
patrolling
    │ critical asset detected
    ▼
intercepting
    │ within shadow threshold
    ▼
shadowing
    │ no critical assets remain
    ▼
returning_to_patrol
    │ resumes waypoint route
    ▼
patrolling
```

State meanings:

* `patrolling`: follows operator-defined waypoints in order.
* `intercepting`: flies toward the dynamic shadow point behind the selected target.
* `shadowing`: maintains a standoff position behind the target as it moves.
* `returning_to_patrol`: clears target and routes back toward the patrol path.

### Shadowing

Shadowing means maintaining a standoff position rather than colliding with or sitting directly on top of the target.

Each tick, the backend computes a point 500 m behind the target based on the target's current heading. The drone recomputes its heading and moves toward that dynamic point subject to its speed cap. This satisfies the assessment requirement that the drone recalculate heading and velocity in real time.

### Patrol Path Changes

Changing the patrol path retasks the same active drone to the new route. This keeps the assessment model simple and visible. In a production fleet manager, a patrol change across a large theater would likely assign the nearest available drone from base inventory or a patrol sector instead of requiring one active drone to reposition across hundreds of kilometers.

---

## Prediction and TTE

### TTE

TTE is calculated from the current vector because it answers an immediate tactical question:

> If this asset continues on its present heading and speed, how soon will it enter a restricted zone?

The implementation projects the asset forward in 10-second increments over a 10-minute horizon and returns the first projected point that enters any zone.

### Predicted Path

The selected asset's predicted path is a visualization aid and uses the bounded trajectory history buffer.

The implementation estimates:

* recent/current heading from the latest trajectory segment
* speed from recent position deltas
* turn rate from normalized bearing deltas

It then projects forward using a constant-speed, constant-turn-rate approximation. This allows banking assets to project as curved paths instead of a single straight ray.

This is still a simplified model. It does not infer intent, weather, acceleration, climb/descent behavior, or route plans.

---

## Design Decisions and Tradeoffs

### Simulated Telemetry Instead of a Public API

The prompt allows either a public API or a telemetry generator. I chose a deterministic generator so the reviewer can run the demo reliably without depending on external API availability, rate limits, API keys, or network conditions.

The simulator emits normalized position/heading/speed records shaped like a real ingestion adapter would provide. A production version could replace the generator with ADS-B, ASTERIX, vehicle telemetry, or proprietary sensor feeds while keeping the threat analysis and visualization pipeline largely unchanged.

### FastAPI Instead of Django

Dominion's prompt notes familiarity with React and Python/Django, but also encourages using tools that best demonstrate capability.

I chose FastAPI because this problem is primarily:

* long-lived simulation loop
* WebSocket fan-out
* lightweight REST control endpoints
* explicit Pydantic contracts
* backend-authoritative state

Django would also be viable, especially for user/account/admin-heavy workflows, but it would add framework surface area that is not central to this assessment.

### Backend-Authoritative Threat Analysis

Threat state, event generation, TTE, and drone tasking live in the backend. The frontend does not independently decide whether an asset is `warning` or `critical`.

This avoids inconsistent behavior across clients and keeps all operational semantics in one place.

### Discrete Projection for TTE

TTE uses discrete forward projection rather than exact polygon trajectory intersection.

This is simple, explainable, and testable for the assessment scale. A production system would use more rigorous geospatial trajectory intersection and account for uncertainty, stale telemetry, sensor confidence, and maneuvering targets.

### Bounded In-Memory History

Each asset keeps a bounded five-minute history buffer. This supports selected-asset trajectory rendering and prediction without unbounded memory growth or per-tick database writes.

Only the selected asset's history and predicted path are rendered. The app does not draw 130 historical polylines every tick.

### SQLite Scope

SQLite is used for durable zones and event-audit rows. Drone state, patrol path, and asset history are in-memory for the assessment.

This keeps the hot path simple and avoids per-tick database writes for live telemetry. A production implementation would likely separate durable event storage, time-series telemetry storage, and geospatial indexing.

### GeoJSON Source Updates

The frontend updates MapLibre GeoJSON sources imperatively rather than rendering each asset as a React marker component. This avoids DOM churn and keeps the map responsive with 100+ moving assets at 1 Hz.

### Single-Drone Response Model

The assessment requires an autonomous drone that follows a patrol path and shadows breached assets. I implemented that behavior with one autonomous drone and a clear target-acquisition policy.

I did not implement full multi-drone fleet dispatch, base inventory, fuel/range constraints, or manual retasking because those are substantial product features on their own. The design leaves those as natural production extensions.

---

## Persistence Model

| Data                    | Persisted? | Notes                                                           |
| ----------------------- | ---------: | --------------------------------------------------------------- |
| Restricted zones        |        Yes | Stored in SQLite and loaded at startup                          |
| Event audit rows        |        Yes | Written to SQLite; live event panel shows runtime recent buffer |
| Asset telemetry history |         No | Bounded in-memory deque per asset                               |
| Drone state             |         No | Runtime state only                                              |
| Patrol path             |         No | Runtime state only; default path restored on backend restart    |

---

## Performance Considerations

The hot path is approximately:

```text
assets × zones × projection_steps
```

At assessment scale:

```text
130 assets × modest zone count × 60 projection samples
```

This is safe to evaluate in-process at 1 Hz.

Performance choices:

* 1 Hz world-state stream for operator-level map awareness
* GeoJSON source updates instead of React marker re-rendering
* bounded history buffer per asset
* no per-tick asset writes to SQLite
* only selected asset history/prediction rendered
* transition-based events instead of emitting every tick
* compact WebSocket snapshot carrying the current tactical picture

Scale path for a larger system:

* delta WebSocket updates instead of full snapshots
* geospatial indexing / PostGIS for zone containment and distance
* worker pool for threat analysis
* durable event queue for fan-out and replay
* time-series store for telemetry history
* client-side viewport culling and layer-level styling optimizations

---

## Known Limitations

This is an assessment implementation, not a production defense system.

Current limitations:

* Telemetry is simulated and deterministic.
* TTE uses discrete projection, not exact geodesic intersection.
* TTE assumes current heading/speed over the projection horizon.
* Predicted path estimates constant speed and turn rate from recent history; it does not model intent.
* Zone containment uses in-process ray-casting.
* Authentication, authorization, audit users, and role-based access are out of scope.
* Alert acknowledgement and incident lifecycle are out of scope.
* The drone model uses a single autonomous patrol drone.
* Static bases are reference metadata only; they are not used for fleet dispatch.
* Patrol path changes retask the same drone rather than assigning the nearest available aircraft.
* Drone fuel, range, weather, airspace constraints, and deconfliction are not modeled.
* Asset history, drone state, and patrol path are not durable across backend restarts.

---

## Production Extensions

The current design is intentionally modular. Natural extensions include:

### Real Ingestion

Replace `telemetry_generator.py` with one or more ingestion adapters:

* ADS-B
* ASTERIX
* vehicle telemetry
* drone telemetry
* proprietary sensor feeds
* replayed mission logs

The normalized asset model and downstream threat pipeline can remain stable.

### Geospatial Backend

Move zone checks and distance calculations to a geospatial database or engine:

* PostGIS `ST_Within`
* PostGIS `ST_Distance`
* geospatial indexing
* buffered polygons
* route/trajectory intersection

### Durable Eventing and Replay

Introduce a durable event stream:

* Redis Streams or Kafka
* event replay
* incident reconstruction
* audit trails
* replayable simulation timelines

### Incident Workflow

Add operator workflow around events:

* acknowledge breach
* assign owner
* suppress duplicate alerts
* mark resolved
* retain incident timeline
* export report

### Fleet Manager

Extend the single-drone model into a real fleet scheduler:

* multiple drones per base
* base inventory
* target priority
* manual retasking
* return-to-base
* fuel/range/endurance
* nearest-available-asset assignment
* reassignment policy
* operator override

### Uncertainty Modeling

Add confidence-aware tactical analysis:

* stale telemetry detection
* sensor covariance
* confidence radius
* uncertainty propagation for TTE
* probabilistic zone-entry risk

### Deployment Hardening

* TLS termination
* health probes
* structured logging
* metrics
* OpenTelemetry tracing
* horizontal backend workers
* external database
* CI/CD pipeline
* authentication and authorization

---

## Repository Structure

```text
.
├── README.md
├── docker-compose.yml
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── db.py
│   │   ├── models.py
│   │   ├── api/
│   │   │   ├── routes_assets.py
│   │   │   ├── routes_drones.py
│   │   │   ├── routes_events.py
│   │   │   ├── routes_patrol.py
│   │   │   ├── routes_zones.py
│   │   │   └── websocket.py
│   │   └── services/
│   │       ├── simulation_loop.py
│   │       ├── telemetry_generator.py
│   │       ├── threat_analyzer.py
│   │       ├── drone_dispatcher.py
│   │       ├── patrol_service.py
│   │       ├── zone_service.py
│   │       ├── history_store.py
│   │       ├── event_store.py
│   │       └── geo.py
│   └── tests/
│       ├── test_geo.py
│       ├── test_threat_analyzer.py
│       └── test_drone_dispatcher.py
└── frontend/
    ├── Dockerfile
    ├── nginx.conf
    ├── package.json
    ├── vite.config.ts
    └── src/
        ├── App.tsx
        ├── api/
        ├── components/
        ├── hooks/
        ├── map/
        └── styles/
```

---

## Final Notes

The primary goal of this submission is to demonstrate end-to-end engineering judgment: real-time data flow, explicit operational semantics, maintainable service boundaries, interactive map UX, autonomous response behavior, practical performance choices, and clear tradeoffs.

The implementation intentionally favors a coherent, demoable tactical system over a broad but shallow set of features. The result is a focused assessment-grade prototype with clear seams for production evolution.