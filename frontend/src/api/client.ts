import type { HistoryPoint, PatrolPath, PatrolWaypoint, PredictedPoint, RestrictedZone } from './types';

const BASE_URL = '';

async function readJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText}: ${body}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchZones(): Promise<RestrictedZone[]> {
  const res = await fetch(`${BASE_URL}/zones`);
  return readJson<RestrictedZone[]>(res);
}

export async function createZone(name: string | null, geojson: object): Promise<RestrictedZone> {
  const res = await fetch(`${BASE_URL}/zones`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, geojson }),
  });
  return readJson<RestrictedZone>(res);
}

export async function deleteZone(zoneId: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/zones/${zoneId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
}

export async function fetchAssetHistory(assetId: string): Promise<HistoryPoint[]> {
  const res = await fetch(`${BASE_URL}/assets/${assetId}/history`);
  return readJson<HistoryPoint[]>(res);
}

export async function fetchPredictedPath(assetId: string): Promise<PredictedPoint[]> {
  const res = await fetch(`${BASE_URL}/assets/${assetId}/predicted-path`);
  return readJson<PredictedPoint[]>(res);
}

export async function fetchPatrolPath(): Promise<PatrolPath> {
  const res = await fetch(`${BASE_URL}/patrol-path`);
  return readJson<PatrolPath>(res);
}

export async function setPatrolPath(name: string, waypoints: PatrolWaypoint[]): Promise<PatrolPath> {
  const res = await fetch(`${BASE_URL}/patrol-path`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, waypoints }),
  });
  return readJson<PatrolPath>(res);
}

export async function deletePatrolPath(): Promise<void> {
  const res = await fetch(`${BASE_URL}/patrol-path`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
}
