export type ThreatLevel = 'normal' | 'warning' | 'critical';
export type AssetType = 'aircraft' | 'vehicle';
export type DroneStatus = 'idle' | 'patrolling' | 'intercepting' | 'shadowing' | 'returning_to_patrol';
export type EventType = 'warning' | 'breach' | 'drone_dispatched' | 'drone_shadowing';
export type Severity = 'info' | 'warning' | 'critical';

export interface AssetState {
  id: string;
  callsign: string;
  asset_type: AssetType;
  lat: number;
  lon: number;
  altitude_m: number | null;
  heading_deg: number;
  speed_mps: number;
  threat_level: ThreatLevel;
  nearest_zone_id: string | null;
  distance_to_nearest_zone_m: number | null;
  tte_seconds: number | null;
  updated_at: string;
}

export interface RestrictedZone {
  id: string;
  name: string;
  geojson: object;
  created_at: string;
}

export interface EventRecord {
  id: string;
  event_type: EventType;
  severity: Severity;
  asset_id: string | null;
  zone_id: string | null;
  drone_id: string | null;
  message: string;
  created_at: string;
}

export interface DroneState {
  id: string;
  status: DroneStatus;
  lat: number;
  lon: number;
  heading_deg: number | null;
  target_asset_id: string | null;
  origin_base_id: string | null;
  speed_mps: number;
  intercept_seconds: number | null;
  patrol_waypoint_index: number | null;
  updated_at: string;
}

export interface PatrolWaypoint {
  lat: number;
  lon: number;
}

export interface PatrolPath {
  id: string;
  name: string;
  waypoints: PatrolWaypoint[];
  created_at: string;
}

export interface TelemetrySnapshot {
  type: 'telemetry_snapshot';
  timestamp: string;
  assets: AssetState[];
  drones: DroneState[];
  events: EventRecord[];
  patrol_path: PatrolPath | null;
}

export interface HistoryPoint {
  lat: number;
  lon: number;
  heading_deg: number;
  altitude_m: number | null;
  recorded_at: string;
}

export interface PredictedPoint {
  lat: number;
  lon: number;
}
