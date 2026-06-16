import type { WsStatus } from '../api/websocket';

interface Props {
  wsStatus: WsStatus;
  assetCount: number;
  zoneCount: number;
  activeDrones: number;
  lastUpdated: string | null;
}

export default function StatusBar({ wsStatus, assetCount, zoneCount, activeDrones, lastUpdated }: Props) {
  const statusColors: Record<WsStatus, string> = {
    connected:    '#22c55e',
    connecting:   '#f59e0b',
    disconnected: '#ef4444',
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 20,
      padding: '0 16px',
      height: '100%',
      fontSize: 12,
      color: '#94a3b8',
      flexWrap: 'wrap',
    }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: statusColors[wsStatus],
          display: 'inline-block',
        }} />
        <span style={{ color: statusColors[wsStatus], fontWeight: 600, textTransform: 'uppercase', fontSize: 11 }}>
          {wsStatus}
        </span>
      </span>

      <span>
        <span style={{ color: '#f8fafc', fontWeight: 600 }}>{assetCount}</span>
        {' '}assets
      </span>

      <span>
        <span style={{ color: '#f8fafc', fontWeight: 600 }}>{zoneCount}</span>
        {' '}zones
      </span>

      <span>
        <span style={{ color: activeDrones > 0 ? '#38bdf8' : '#f8fafc', fontWeight: 600 }}>{activeDrones}</span>
        {' '}active drones
      </span>

      {lastUpdated && (
        <span style={{ marginLeft: 'auto', color: '#475569', fontSize: 11 }}>
          Last update: {new Date(lastUpdated).toLocaleTimeString()}
        </span>
      )}
    </div>
  );
}
