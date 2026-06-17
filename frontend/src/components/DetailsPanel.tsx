import type { AssetState, DroneState, RestrictedZone } from '../api/types';
import type { SelectedEntity } from '../hooks/useSelectedEntity';

interface Props {
  selected: SelectedEntity | null;
  assets: AssetState[];
  drones: DroneState[];
  zones: RestrictedZone[];
  onClose: () => void;
}

function formatSeconds(s: number | null): string {
  if (s === null) return '—';
  if (s === 0) return 'BREACHED';
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

function formatTTE(s: number | null): string {
  if (s === null) return '—';
  if (s === 0) return 'Breached';
  const total = Math.round(s);
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return `${m}:${String(sec).padStart(2, '0')} (${total}s)`;
}

function formatDist(m: number | null): string {
  if (m === null) return '—';
  if (m === 0) return 'Inside zone';
  if (m >= 1000) return `${(m / 1000).toFixed(1)} km`;
  return `${Math.round(m)} m`;
}

function formatSpeed(mps: number): string {
  return `${Math.round(mps * 3.6)} km/h (${mps.toFixed(0)} m/s)`;
}

function ThreatBadge({ level }: { level: string }) {
  const colors: Record<string, string> = {
    critical: '#ef4444',
    warning: '#f59e0b',
    normal: '#6b7280',
  };
  return (
    <span
      style={{
        background: colors[level] ?? '#6b7280',
        color: '#fff',
        padding: '2px 10px',
        borderRadius: 4,
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
      }}
    >
      {level}
    </span>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid #1e293b' }}>
      <span style={{ color: '#94a3b8', fontSize: 12 }}>{label}</span>
      <span style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 500, maxWidth: '55%', textAlign: 'right', wordBreak: 'break-all' }}>{value}</span>
    </div>
  );
}

function AssetDetails({ asset, zones }: { asset: AssetState; zones: RestrictedZone[] }) {
  const nearestZone = asset.nearest_zone_id
    ? zones.find((z) => z.id === asset.nearest_zone_id)
    : null;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#f8fafc' }}>{asset.callsign}</div>
          <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase' }}>{asset.asset_type}</div>
        </div>
        <ThreatBadge level={asset.threat_level} />
      </div>
      <Row label="Asset ID" value={asset.id} />
      <Row label="Latitude" value={asset.lat.toFixed(5)} />
      <Row label="Longitude" value={asset.lon.toFixed(5)} />
      <Row label="Heading" value={`${asset.heading_deg.toFixed(1)}°`} />
      <Row label="Speed" value={formatSpeed(asset.speed_mps)} />
      <Row label="Altitude" value={asset.altitude_m != null ? `${Math.round(asset.altitude_m)} m` : '—'} />
      <Row
        label="TTE (time to entry)"
        value={
          <span style={{ color: asset.threat_level === 'critical' ? '#ef4444' : asset.tte_seconds !== null && asset.tte_seconds <= 120 ? '#f59e0b' : '#e2e8f0', fontWeight: 700 }}>
            {asset.threat_level === 'critical' ? 'Breached' : formatTTE(asset.tte_seconds)}
          </span>
        }
      />
      <Row label="Zone Distance" value={formatDist(asset.distance_to_nearest_zone_m)} />
      <Row
        label="Nearest Zone"
        value={
          <span title={asset.nearest_zone_id ?? undefined}>
            {nearestZone?.name ?? (asset.nearest_zone_id ? 'Unknown zone' : '—')}
          </span>
        }
      />
      <Row label="Last Update" value={new Date(asset.updated_at).toLocaleTimeString()} />
      <div style={{ marginTop: 10, fontSize: 11, color: '#64748b', lineHeight: 1.5 }}>
        <div><span style={{ color: '#a78bfa', fontWeight: 600 }}>Predicted path</span> — recent turn-rate estimate over trajectory history.</div>
        <div><span style={{ color: '#94a3b8', fontWeight: 600 }}>History path</span> — last 5 min of positions.</div>
        <div>TTE uses the current heading/velocity vector.</div>
      </div>
    </div>
  );
}

function DroneDetails({ drone, assets }: { drone: DroneState; assets: AssetState[] }) {
  const statusColors: Record<string, string> = {
    patrolling: '#38bdf8',
    intercepting: '#f59e0b',
    shadowing: '#22d3ee',
    returning_to_patrol: '#818cf8',
    idle: '#6b7280',
  };
  const targetAsset = drone.target_asset_id
    ? assets.find((a) => a.id === drone.target_asset_id)
    : null;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#38bdf8' }}>DRONE</div>
          <div style={{ fontSize: 11, color: '#64748b', wordBreak: 'break-all' }}>{drone.id.slice(0, 16)}…</div>
        </div>
        <span style={{ background: statusColors[drone.status] ?? '#6b7280', color: '#0f172a', padding: '2px 10px', borderRadius: 4, fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>
          {drone.status.replace('_', ' ')}
        </span>
      </div>
      <Row label="Status" value={drone.status.replace(/_/g, ' ')} />
      <Row label="Target" value={targetAsset ? targetAsset.callsign : (drone.target_asset_id ?? '—')} />
      <Row label="Heading" value={drone.heading_deg != null ? `${drone.heading_deg.toFixed(1)}°` : '—'} />
      <Row label="Speed" value={formatSpeed(drone.speed_mps)} />
      <Row label="Intercept ETA" value={formatSeconds(drone.intercept_seconds)} />
      <Row label="Patrol Waypoint" value={drone.patrol_waypoint_index != null ? `#${drone.patrol_waypoint_index + 1}` : '—'} />
      <Row label="Latitude" value={drone.lat.toFixed(5)} />
      <Row label="Longitude" value={drone.lon.toFixed(5)} />
      <Row label="Last Update" value={new Date(drone.updated_at).toLocaleTimeString()} />
    </div>
  );
}

export default function DetailsPanel({ selected, assets, drones, zones, onClose }: Props) {
  const asset = selected?.type === 'asset' ? assets.find((a) => a.id === selected.id) : null;
  const drone = selected?.type === 'drone' ? drones.find((d) => d.id === selected.id) : null;

  if (!selected || (!asset && !drone)) {
    return (
      <div style={{ padding: 16, color: '#475569', fontSize: 13 }}>
        <div style={{ fontWeight: 600, color: '#64748b', marginBottom: 8 }}>Details</div>
        Click an asset or drone on the map to see details.
      </div>
    );
  }

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: '#64748b', textTransform: 'uppercase' }}>
          {selected.type === 'asset' ? 'Asset Details' : 'Drone Details'}
        </span>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}
        >
          ✕
        </button>
      </div>
      {asset && <AssetDetails asset={asset} zones={zones} />}
      {drone && <DroneDetails drone={drone} assets={assets} />}
    </div>
  );
}
