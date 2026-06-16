import type { EventRecord } from '../api/types';

interface Props {
  events: EventRecord[];
  onSelectAsset?: (id: string) => void;
}

const SEVERITY_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  critical: { bg: '#450a0a', text: '#fca5a5', dot: '#ef4444' },
  warning:  { bg: '#451a03', text: '#fcd34d', dot: '#f59e0b' },
  info:     { bg: '#0c1a2e', text: '#93c5fd', dot: '#38bdf8' },
};

const EVENT_ICONS: Record<string, string> = {
  breach:          '🔴',
  warning:         '⚠️',
  drone_dispatched:'🚁',
  drone_shadowing: '📡',
};

export default function EventLog({ events, onSelectAsset }: Props) {
  const reversed = [...events].reverse();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{
        padding: '8px 12px',
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.08em',
        color: '#64748b',
        textTransform: 'uppercase',
        borderBottom: '1px solid #1e293b',
        flexShrink: 0,
      }}>
        Event Log
      </div>
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {reversed.length === 0 && (
          <div style={{ padding: 12, color: '#475569', fontSize: 12 }}>No events yet.</div>
        )}
        {reversed.map((ev) => {
          const colors = SEVERITY_COLORS[ev.severity] ?? SEVERITY_COLORS.info;
          const clickable = !!ev.asset_id && !!onSelectAsset;
          return (
            <div
              key={ev.id}
              onClick={clickable ? () => onSelectAsset!(ev.asset_id!) : undefined}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
                padding: '8px 12px',
                borderBottom: '1px solid #0f172a',
                background: colors.bg,
                cursor: clickable ? 'pointer' : 'default',
              }}
            >
              <span style={{ flexShrink: 0, fontSize: 13 }}>
                {EVENT_ICONS[ev.event_type] ?? '•'}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: colors.text, wordBreak: 'break-word' }}>
                  {ev.message}
                </div>
                <div style={{ fontSize: 10, color: '#475569', marginTop: 2 }}>
                  {new Date(ev.created_at).toLocaleTimeString()}
                  {ev.asset_id && (
                    <span style={{ marginLeft: 6, color: '#64748b' }}>{ev.asset_id}</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
