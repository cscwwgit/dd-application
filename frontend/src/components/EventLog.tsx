import { useState } from 'react';
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
  const [collapsed, setCollapsed] = useState(false);
  const reversed = [...events].reverse();
  const latest = reversed[0];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: collapsed ? 'auto' : '100%' }}>
      <button
        onClick={() => setCollapsed((c) => !c)}
        title={collapsed ? 'Expand event log' : 'Collapse event log'}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          padding: '8px 12px',
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.08em',
          color: '#64748b',
          textTransform: 'uppercase',
          borderBottom: '1px solid #1e293b',
          background: 'none',
          border: 'none',
          borderBottomWidth: 1,
          borderBottomStyle: 'solid',
          borderBottomColor: '#1e293b',
          cursor: 'pointer',
          flexShrink: 0,
          textAlign: 'left',
        }}
      >
        <span style={{ fontSize: 9 }}>{collapsed ? '▶' : '▼'}</span>
        <span>Event Log</span>
        <span style={{ color: '#94a3b8', background: '#1e293b', borderRadius: 10, padding: '1px 7px', fontSize: 10 }}>{events.length}</span>
      </button>
      {collapsed ? (
        <div style={{ padding: '8px 12px', fontSize: 11, color: '#64748b', flexShrink: 0 }}>
          {latest ? (
            <span style={{ textTransform: 'none', letterSpacing: 0 }}>
              Latest: {latest.message}
            </span>
          ) : (
            'No events yet.'
          )}
        </div>
      ) : (
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
                <div title={ev.asset_id ?? undefined} style={{ fontSize: 12, color: colors.text, wordBreak: 'break-word' }}>
                  {ev.message}
                </div>
                <div style={{ fontSize: 10, color: '#475569', marginTop: 2 }}>
                  {new Date(ev.created_at).toLocaleTimeString()}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
}
