import { useState } from 'react';
import type { RestrictedZone } from '../api/types';

interface Props {
  zones: RestrictedZone[];
  onDelete: (id: string) => void;
  onFocus?: (id: string) => void;
}

export default function ZoneList({ zones, onDelete, onFocus }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);

  if (zones.length === 0) {
    return (
      <div style={{ padding: '8px 12px', color: '#475569', fontSize: 12 }}>
        No zones. Draw a polygon on the map.
      </div>
    );
  }

  const handleFocus = (id: string) => {
    setActiveId(id);
    onFocus?.(id);
  };

  return (
    <div>
      {zones.map((z) => (
        <div
          key={z.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '6px 12px',
            borderBottom: '1px solid #1e293b',
            background: activeId === z.id ? 'rgba(239,68,68,0.08)' : 'transparent',
            transition: 'background 0.15s',
          }}
        >
          <span
            onClick={() => handleFocus(z.id)}
            style={{
              fontSize: 12,
              color: activeId === z.id ? '#fca5a5' : '#cbd5e1',
              cursor: onFocus ? 'pointer' : 'default',
              flex: 1,
              paddingRight: 8,
            }}
            title={onFocus ? 'Click to focus on map' : undefined}
          >
            {activeId === z.id ? '◎ ' : ''}{z.name}
          </span>
          <button
            onClick={() => onDelete(z.id)}
            style={{
              background: 'none',
              border: '1px solid #374151',
              borderRadius: 4,
              color: '#9ca3af',
              cursor: 'pointer',
              fontSize: 11,
              padding: '2px 8px',
            }}
          >
            Delete
          </button>
        </div>
      ))}
    </div>
  );
}
