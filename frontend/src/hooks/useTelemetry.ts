import { useEffect, useRef, useState } from 'react';
import { TelemetryWebSocket, type WsStatus } from '../api/websocket';
import type { AssetState, DroneState, EventRecord, PatrolPath } from '../api/types';

interface TelemetryState {
  assets: AssetState[];
  drones: DroneState[];
  events: EventRecord[];
  patrolPath: PatrolPath | null;
  overridePatrolPath: (p: PatrolPath) => void;
  wsStatus: WsStatus;
  lastUpdated: string | null;
}

export function useTelemetry(): TelemetryState {
  const [assets, setAssets] = useState<AssetState[]>([]);
  const [drones, setDrones] = useState<DroneState[]>([]);
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [patrolPath, setPatrolPath] = useState<PatrolPath | null>(null);
  const [wsStatus, setWsStatus] = useState<WsStatus>('connecting');
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const wsRef = useRef<TelemetryWebSocket | null>(null);

  useEffect(() => {
    const ws = new TelemetryWebSocket(
      (snapshot) => {
        setAssets(snapshot.assets);
        setDrones(snapshot.drones);
        setEvents(snapshot.events);
        setPatrolPath(snapshot.patrol_path ?? null);
        setLastUpdated(snapshot.timestamp);
      },
      setWsStatus,
    );
    wsRef.current = ws;
    ws.connect();
    return () => ws.disconnect();
  }, []);

  return { assets, drones, events, patrolPath, overridePatrolPath: setPatrolPath, wsStatus, lastUpdated };
}
