import type { Map as MapLibreMap } from 'maplibre-gl';

export const THREAT_COLOR_EXPR = [
  'match',
  ['get', 'threat_level'],
  'critical', '#ef4444',
  'warning', '#f59e0b',
  '#6b7280', // normal — muted gray
] as unknown as maplibregl.ExpressionSpecification;

export const DRONE_COLOR = '#38bdf8'; // sky blue
export const SHADOW_LINK_COLOR = '#22d3ee'; // cyan — drone-to-target shadow link

export function initLayers(map: MapLibreMap): void {
  // ── Restricted zones ─────────────────────────────────────────────
  map.addSource('zones', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({
    id: 'zones-fill',
    type: 'fill',
    source: 'zones',
    paint: { 'fill-color': '#ef4444', 'fill-opacity': 0.15 },
  });
  map.addLayer({
    id: 'zones-outline',
    type: 'line',
    source: 'zones',
    paint: { 'line-color': '#ef4444', 'line-width': 2 },
  });

  // ── Shadow link (cyan line from shadowed asset to displayed drone) ──
  // Beneath the markers so both endpoints sit on top of the line.
  map.addSource('shadow-link', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({
    id: 'shadow-link-line',
    type: 'line',
    source: 'shadow-link',
    paint: {
      'line-color': SHADOW_LINK_COLOR,
      'line-width': 1.2,
      'line-opacity': 0.85,
      'line-dasharray': [2, 2],
    },
  });

  // ── Assets ────────────────────────────────────────────────────────
  map.addSource('assets', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({
    id: 'assets-circle',
    type: 'circle',
    source: 'assets',
    paint: {
      'circle-radius': [
        'case',
        ['==', ['get', 'asset_type'], 'aircraft'], 7,
        5,
      ],
      'circle-color': THREAT_COLOR_EXPR,
      'circle-stroke-width': 1.5,
      'circle-stroke-color': '#ffffff',
      'circle-opacity': 0.9,
    },
  });

  // ── Drones ────────────────────────────────────────────────────────
  map.addSource('drones', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({
    id: 'drones-circle',
    type: 'circle',
    source: 'drones',
    paint: {
      'circle-radius': 8,
      'circle-color': DRONE_COLOR,
      'circle-stroke-width': 2,
      'circle-stroke-color': '#ffffff',
    },
  });

  // ── Selected drone highlight (animated pulse + static ring) ───────
  map.addLayer({
    id: 'drones-selected-pulse',
    type: 'circle',
    source: 'drones',
    filter: ['==', ['get', 'id'], ''],
    paint: {
      'circle-radius': 16,
      'circle-color': 'transparent',
      'circle-stroke-width': 2,
      'circle-stroke-color': '#fde047',
      'circle-stroke-opacity': 0.9,
    },
  });
  map.addLayer({
    id: 'drones-selected',
    type: 'circle',
    source: 'drones',
    filter: ['==', ['get', 'id'], ''],
    paint: {
      'circle-radius': 15,
      'circle-color': 'transparent',
      'circle-stroke-width': 4,
      'circle-stroke-color': '#fde047',
    },
  });

  // ── Selected asset highlight (added after drones so a selected asset's ──
  //    ring renders ABOVE drone markers, keeping critical assets visible) ──
  map.addLayer({
    id: 'assets-selected-pulse',
    type: 'circle',
    source: 'assets',
    filter: ['==', ['get', 'id'], ''],
    paint: {
      'circle-radius': 16,
      'circle-color': 'transparent',
      'circle-stroke-width': 2,
      'circle-stroke-color': '#fde047',
      'circle-stroke-opacity': 0.9,
    },
  });
  map.addLayer({
    id: 'assets-selected',
    type: 'circle',
    source: 'assets',
    filter: ['==', ['get', 'id'], ''],
    paint: {
      'circle-radius': 15,
      'circle-color': 'transparent',
      'circle-stroke-width': 4,
      'circle-stroke-color': '#fde047',
    },
  });

  // ── Asset history path ────────────────────────────────────────────
  map.addSource('history', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({
    id: 'history-line',
    type: 'line',
    source: 'history',
    paint: {
      'line-color': '#94a3b8',
      'line-width': 2,
      'line-opacity': 0.5,
    },
  });

  // ── Predicted path ────────────────────────────────────────────────
  map.addSource('predicted', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({
    id: 'predicted-line',
    type: 'line',
    source: 'predicted',
    paint: {
      'line-color': '#a78bfa',
      'line-width': 2,
      'line-dasharray': [4, 3],
      'line-opacity': 0.8,
    },
  });
}

export function updateSource(map: MapLibreMap, sourceId: string, data: GeoJSON.FeatureCollection): void {
  const src = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
  if (src) src.setData(data);
}

export function setSelectedFilter(map: MapLibreMap, layerId: string, id: string): void {
  map.setFilter(layerId, ['==', ['get', 'id'], id]);
}

export function clearSelectedFilter(map: MapLibreMap, layerId: string): void {
  map.setFilter(layerId, ['==', ['get', 'id'], '']);
}
