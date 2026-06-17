import { useCallback, useState } from 'react';
import { setPatrolPath as apiSetPatrolPath } from './api/client';
import DetailsPanel from './components/DetailsPanel';
import EventLog from './components/EventLog';
import MapView from './components/MapView';
import StatusBar from './components/StatusBar';
import ZoneList from './components/ZoneList';
import { useSelectedEntity } from './hooks/useSelectedEntity';
import { useTelemetry } from './hooks/useTelemetry';
import { useZones } from './hooks/useZones';

export default function App() {
  const { assets, drones, events, patrolPath, overridePatrolPath, wsStatus, lastUpdated } = useTelemetry();
  const { zones, addZone, removeZone } = useZones();
  const { selected, selectEntity, clearSelection } = useSelectedEntity();
  const [focusedZoneId, setFocusedZoneId] = useState<string | null>(null);

  const handleFocusZone = useCallback((id: string) => setFocusedZoneId(id), []);

  const handleSelectAsset = useCallback((id: string) => selectEntity('asset', id), [selectEntity]);
  const handleSelectDrone = useCallback((id: string) => selectEntity('drone', id), [selectEntity]);

  const handleZoneCreated = useCallback(
    (name: string | null, geojson: object) => {
      addZone(name, geojson).catch(console.error);
    },
    [addZone],
  );

  const handlePatrolCreated = useCallback(
    (waypoints: { lat: number; lon: number }[]) => {
      apiSetPatrolPath('Operator Patrol Route', waypoints)
        .then((newPath) => {
          overridePatrolPath(newPath);
        })
        .catch((err) => {
          console.error('Failed to set patrol path:', err);
        });
    },
    [overridePatrolPath],
  );

  const activeDrones = drones.filter((d) => d.status !== 'idle').length;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      background: '#0f172a',
      color: '#e2e8f0',
      fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
      overflow: 'hidden',
    }}>
      {/* ── Header ─────────────────────────────────────── */}
      <header style={{
        flexShrink: 0,
        height: 48,
        background: '#020617',
        borderBottom: '1px solid #1e293b',
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        gap: 12,
      }}>
        <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.06em', color: '#ef4444', textTransform: 'uppercase' }}>
          ⬡ RZAM
        </span>
        <span style={{ fontSize: 14, fontWeight: 600, color: '#f8fafc' }}>
          Restricted Zone Airspace Monitor
        </span>
      </header>

      {/* ── Main body ──────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Map — takes all remaining space */}
        <div style={{ flex: 1, position: 'relative' }}>
          <MapView
            assets={assets}
            drones={drones}
            zones={zones}
            patrolPath={patrolPath}
            selected={selected}
            focusedZoneId={focusedZoneId}
            onSelectAsset={handleSelectAsset}
            onSelectDrone={handleSelectDrone}
            onZoneCreated={handleZoneCreated}
            onPatrolCreated={handlePatrolCreated}
          />
        </div>

        {/* Right sidebar */}
        <div style={{
          width: 300,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          background: '#0f172a',
          borderLeft: '1px solid #1e293b',
          overflow: 'hidden',
        }}>
          {/* Details panel */}
          <div
            key={selected ? `${selected.type}:${selected.id}` : 'none'}
            style={{ flexShrink: 0, borderBottom: '1px solid #1e293b', maxHeight: '40%', overflowY: 'auto' }}
          >
            <DetailsPanel
              selected={selected}
              assets={assets}
              drones={drones}
              zones={zones}
              onClose={clearSelection}
            />
          </div>

          {/* Zone list */}
          <div style={{ flexShrink: 0, borderBottom: '1px solid #1e293b' }}>
            <div style={{
              padding: '6px 12px',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.08em',
              color: '#64748b',
              textTransform: 'uppercase',
            }}>
              Restricted Zones
            </div>
            <ZoneList zones={zones} onDelete={removeZone} onFocus={handleFocusZone} />
          </div>

          {/* Event log — fills remaining space */}
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <EventLog
              events={events}
              zones={zones}
              selected={selected}
              onSelectAsset={handleSelectAsset}
            />
          </div>
        </div>
      </div>

      {/* ── Status bar ─────────────────────────────────── */}
      <div style={{
        flexShrink: 0,
        height: 36,
        background: '#020617',
        borderTop: '1px solid #1e293b',
      }}>
        <StatusBar
          wsStatus={wsStatus}
          assetCount={assets.length}
          zoneCount={zones.length}
          activeDrones={activeDrones}
          lastUpdated={lastUpdated}
        />
      </div>
    </div>
  );
}
