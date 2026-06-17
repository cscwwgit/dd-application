import { useState } from 'react';
import type { EventRecord, RestrictedZone } from '../api/types';
import type { SelectedEntity } from '../hooks/useSelectedEntity';

type EventFilter = 'all' | 'threats' | 'drone' | 'selected';

interface Props {
  events: EventRecord[];
  zones: RestrictedZone[];
  selected: SelectedEntity | null;
  onSelectAsset?: (id: string) => void;
}

const THREAT_TYPES = ['warning', 'breach'];
const DRONE_TYPES = ['drone_dispatched', 'drone_shadowing'];

const FILTER_LABELS: { key: EventFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'threats', label: 'Threats' },
  { key: 'drone', label: 'Drone' },
  { key: 'selected', label: 'Selected' },
];

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

function matchesFilter(ev: EventRecord, filter: EventFilter, selected: SelectedEntity | null): boolean {
  switch (filter) {
    case 'threats':
      return THREAT_TYPES.includes(ev.event_type);
    case 'drone':
      return DRONE_TYPES.includes(ev.event_type);
    case 'selected':
      if (!selected) return false;
      if (selected.type === 'asset') return ev.asset_id === selected.id;
      return ev.drone_id === selected.id;
    case 'all':
    default:
      return true;
  }
}

export default function EventLog({ events, zones, selected, onSelectAsset }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [filter, setFilter] = useState<EventFilter>('all');
  const [zoneFilter, setZoneFilter] = useState<string>('all');

  const reversed = [...events].reverse();
  const filtered = reversed.filter(
    (ev) =>
      matchesFilter(ev, filter, selected) &&
      (zoneFilter === 'all' || ev.zone_id === zoneFilter),
  );
  const latest = filtered[0];
  const selectedUnavailable = filter === 'selected' && !selected;

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
        <span
          title={`${filtered.length} shown of ${events.length} total`}
          style={{ color: '#94a3b8', background: '#1e293b', borderRadius: 10, padding: '1px 7px', fontSize: 10 }}
        >
          {filtered.length} / {events.length}
        </span>
      </button>

      {/* Filter controls (preserved across collapse) */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        flexWrap: 'wrap',
        padding: '6px 12px',
        borderBottom: '1px solid #1e293b',
        flexShrink: 0,
      }}>
        {FILTER_LABELS.map(({ key, label }) => {
          const active = filter === key;
          const disabled = key === 'selected' && !selected;
          return (
            <button
              key={key}
              onClick={() => setFilter(key)}
              disabled={disabled}
              title={disabled ? 'No selected entity' : `Show ${label.toLowerCase()} events`}
              style={{
                fontSize: 10,
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: 4,
                border: `1px solid ${active ? '#38bdf8' : '#334155'}`,
                background: active ? '#0c4a6e' : 'transparent',
                color: disabled ? '#475569' : active ? '#e0f2fe' : '#94a3b8',
                cursor: disabled ? 'not-allowed' : 'pointer',
              }}
            >
              {label}
            </button>
          );
        })}
        {zones.length > 0 && (
          <select
            value={zoneFilter}
            onChange={(e) => setZoneFilter(e.target.value)}
            title="Filter by restricted zone"
            style={{
              fontSize: 10,
              marginLeft: 'auto',
              padding: '2px 4px',
              borderRadius: 4,
              border: `1px solid ${zoneFilter !== 'all' ? '#38bdf8' : '#334155'}`,
              background: '#0f172a',
              color: zoneFilter !== 'all' ? '#e0f2fe' : '#94a3b8',
              maxWidth: 120,
            }}
          >
            <option value="all">All Zones</option>
            {zones.map((z) => (
              <option key={z.id} value={z.id}>{z.name}</option>
            ))}
          </select>
        )}
      </div>

      {collapsed ? (
        <div style={{ padding: '8px 12px', fontSize: 11, color: '#64748b', flexShrink: 0 }}>
          {selectedUnavailable ? (
            <span style={{ textTransform: 'none', letterSpacing: 0 }}>No selected entity.</span>
          ) : latest ? (
            <span style={{ textTransform: 'none', letterSpacing: 0 }}>
              Latest: {latest.message}
            </span>
          ) : (
            <span style={{ textTransform: 'none', letterSpacing: 0 }}>No matching events.</span>
          )}
        </div>
      ) : (
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {selectedUnavailable && (
          <div style={{ padding: 12, color: '#475569', fontSize: 12 }}>No selected entity.</div>
        )}
        {!selectedUnavailable && filtered.length === 0 && (
          <div style={{ padding: 12, color: '#475569', fontSize: 12 }}>No matching events.</div>
        )}
        {filtered.map((ev) => {
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
