import maplibregl from 'maplibre-gl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchAssetHistory, fetchPredictedPath } from '../api/client';
import type { AssetState, DroneState, HistoryPoint, PatrolPath, PredictedPoint, RestrictedZone } from '../api/types';
import type { SelectedEntity } from '../hooks/useSelectedEntity';
import {
  assetsToGeoJSON,
  dronesToGeoJSON,
  historyToGeoJSON,
  predictedToGeoJSON,
  zonesToGeoJSON,
} from '../map/geojson';
import {
  clearSelectedFilter,
  initLayers,
  setSelectedFilter,
  updateSource,
} from '../map/layers';

interface Props {
  assets: AssetState[];
  drones: DroneState[];
  zones: RestrictedZone[];
  patrolPath: PatrolPath | null;
  selected: SelectedEntity | null;
  onSelectAsset: (id: string) => void;
  onSelectDrone: (id: string) => void;
  onZoneCreated: (name: string | null, geojson: object) => void;
  onPatrolCreated: (waypoints: { lat: number; lon: number }[]) => void;
  focusedZoneId?: string | null;
}

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
const INITIAL_CENTER: [number, number] = [-95.0, 65.0];
const INITIAL_ZOOM = 4;

// Build a preview FeatureCollection from in-progress vertices + optional cursor position
function buildDrawPreview(
  vertices: [number, number][],
  cursor: [number, number] | null,
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  const pts = cursor ? [...vertices, cursor] : vertices;

  if (pts.length >= 2) {
    // Line connecting all points including closing back to first
    const lineCoords = pts.length >= 3 ? [...pts, pts[0]] : pts;
    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: lineCoords },
      properties: {},
    });
  }
  // Vertex dots
  for (const pt of pts) {
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: pt },
      properties: {},
    });
  }
  return { type: 'FeatureCollection', features };
}

export default function MapView({
  assets,
  drones,
  zones,
  patrolPath,
  selected,
  onSelectAsset,
  onSelectDrone,
  onZoneCreated,
  onPatrolCreated,
  focusedZoneId,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const layersReadyRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);

  // Draw mode state
  const [isDrawing, setIsDrawing] = useState(false);
  const [vertexCount, setVertexCount] = useState(0);
  const isDrawingRef = useRef(false);
  const verticesRef = useRef<[number, number][]>([]);
  const cursorRef = useRef<[number, number] | null>(null);
  // Set to true on toolbar button mousedown to swallow the next map click
  const suppressNextClickRef = useRef(false);

  // Patrol draw mode state
  const [isPatrolDrawing, setIsPatrolDrawing] = useState(false);
  const [patrolVertexCount, setPatrolVertexCount] = useState(0);
  const isPatrolDrawingRef = useRef(false);
  const patrolVerticesRef = useRef<[number, number][]>([]);

  // Keep refs in sync with state for use in map event handlers
  useEffect(() => {
    isDrawingRef.current = isDrawing;
    if (!isDrawing) {
      verticesRef.current = [];
      cursorRef.current = null;
    }
  }, [isDrawing]);

  useEffect(() => {
    isPatrolDrawingRef.current = isPatrolDrawing;
    if (!isPatrolDrawing) {
      patrolVerticesRef.current = [];
    }
  }, [isPatrolDrawing]);

  function updateDrawPreview() {
    const map = mapRef.current;
    if (!map || !layersReadyRef.current) return;
    updateSource(map, 'draw-preview', buildDrawPreview(verticesRef.current, cursorRef.current));
  }

  function startPatrolDrawing() {
    if (isDrawing) cancelDrawing();
    patrolVerticesRef.current = [];
    setPatrolVertexCount(0);
    setIsPatrolDrawing(true);
  }

  function cancelPatrolDrawing() {
    setIsPatrolDrawing(false);
    suppressNextClickRef.current = false;
    const map = mapRef.current;
    if (map && layersReadyRef.current) {
      updateSource(map, 'patrol-preview', { type: 'FeatureCollection', features: [] });
    }
  }

  function finishPatrolDrawing() {
    const verts = patrolVerticesRef.current;
    if (verts.length < 2) {
      cancelPatrolDrawing();
      return;
    }
    const waypoints = verts.map(([lng, lat]) => ({ lat, lon: lng }));
    onPatrolCreated(waypoints);
    setIsPatrolDrawing(false);
    suppressNextClickRef.current = false;
    const map = mapRef.current;
    if (map && layersReadyRef.current) {
      updateSource(map, 'patrol-preview', { type: 'FeatureCollection', features: [] });
    }
  }

  function updatePatrolPreview() {
    const map = mapRef.current;
    if (!map || !layersReadyRef.current) return;
    const verts = patrolVerticesRef.current;
    const features: GeoJSON.Feature[] = [];
    if (verts.length >= 2) {
      features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: verts }, properties: {} });
    }
    for (const pt of verts) {
      features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: pt }, properties: {} });
    }
    updateSource(map, 'patrol-preview', { type: 'FeatureCollection', features });
  }

  function startDrawing() {
    verticesRef.current = [];
    cursorRef.current = null;
    setVertexCount(0);
    setIsDrawing(true);
  }

  function cancelDrawing() {
    setIsDrawing(false);
    suppressNextClickRef.current = false;
    const map = mapRef.current;
    if (map && layersReadyRef.current) {
      updateSource(map, 'draw-preview', { type: 'FeatureCollection', features: [] });
    }
  }

  function finishDrawing() {
    const verts = verticesRef.current;
    if (verts.length < 3) {
      cancelDrawing();
      return;
    }
    // Close the ring
    const ring = [...verts, verts[0]];
    const geojson = { type: 'Polygon', coordinates: [ring] };
    onZoneCreated(null, geojson);
    setIsDrawing(false);
    suppressNextClickRef.current = false;
    const map = mapRef.current;
    if (map && layersReadyRef.current) {
      updateSource(map, 'draw-preview', { type: 'FeatureCollection', features: [] });
    }
  }

  // ── Initialize map once ───────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: INITIAL_CENTER,
      zoom: INITIAL_ZOOM,
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-left');

    map.on('load', () => {
      initLayers(map);

      // ── Patrol path source/layer ────────────────────────────────
      map.addSource('patrol-path', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'patrol-path-line',
        type: 'line',
        source: 'patrol-path',
        filter: ['==', '$type', 'LineString'],
        paint: { 'line-color': '#38bdf8', 'line-width': 2, 'line-dasharray': [6, 3], 'line-opacity': 0.7 },
      });
      map.addLayer({
        id: 'patrol-path-points',
        type: 'circle',
        source: 'patrol-path',
        filter: ['==', '$type', 'Point'],
        paint: { 'circle-radius': 4, 'circle-color': '#38bdf8', 'circle-stroke-width': 1, 'circle-stroke-color': '#fff', 'circle-opacity': 0.8 },
      });

      // ── Focused zone outline ───────────────────────────────────
      map.addLayer({
        id: 'zones-focused-outline',
        type: 'line',
        source: 'zones',
        filter: ['==', ['get', 'id'], ''],
        paint: { 'line-color': '#facc15', 'line-width': 3, 'line-opacity': 0.9 },
      });

      // ── Patrol draw preview ────────────────────────────────────
      map.addSource('patrol-preview', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'patrol-preview-line',
        type: 'line',
        source: 'patrol-preview',
        filter: ['==', '$type', 'LineString'],
        paint: { 'line-color': '#38bdf8', 'line-width': 2, 'line-dasharray': [4, 2] },
      });
      map.addLayer({
        id: 'patrol-preview-points',
        type: 'circle',
        source: 'patrol-preview',
        filter: ['==', '$type', 'Point'],
        paint: { 'circle-radius': 4, 'circle-color': '#38bdf8', 'circle-stroke-width': 1, 'circle-stroke-color': '#fff' },
      });

      // ── Zone draw preview sources/layers ────────────────────────
      map.addSource('draw-preview', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'draw-preview-line',
        type: 'line',
        source: 'draw-preview',
        filter: ['==', '$type', 'LineString'],
        paint: { 'line-color': '#ef4444', 'line-width': 2, 'line-dasharray': [3, 2] },
      });
      map.addLayer({
        id: 'draw-preview-points',
        type: 'circle',
        source: 'draw-preview',
        filter: ['==', '$type', 'Point'],
        paint: { 'circle-radius': 5, 'circle-color': '#ef4444', 'circle-stroke-width': 2, 'circle-stroke-color': '#fff' },
      });

      layersReadyRef.current = true;
      setMapReady(true);

      // ── Map click handler ───────────────────────────────────────
      map.on('click', (e) => {
        if (suppressNextClickRef.current) {
          suppressNextClickRef.current = false;
          return;
        }
        if (isPatrolDrawingRef.current) {
          e.preventDefault?.();
          const coord: [number, number] = [e.lngLat.lng, e.lngLat.lat];
          patrolVerticesRef.current = [...patrolVerticesRef.current, coord];
          setPatrolVertexCount(patrolVerticesRef.current.length);
          updatePatrolPreview();
          return;
        }
        if (!isDrawingRef.current) return;
        e.preventDefault?.();
        const coord: [number, number] = [e.lngLat.lng, e.lngLat.lat];
        verticesRef.current = [...verticesRef.current, coord];
        setVertexCount(verticesRef.current.length);
        updateDrawPreview();
      });

      // ── Double-click to finish ──────────────────────────────────
      map.on('dblclick', (e) => {
        e.preventDefault();
        if (isPatrolDrawingRef.current) {
          if (patrolVerticesRef.current.length > 1) {
            patrolVerticesRef.current = patrolVerticesRef.current.slice(0, -1);
          }
          finishPatrolDrawing();
          return;
        }
        if (!isDrawingRef.current) return;
        if (verticesRef.current.length > 1) {
          verticesRef.current = verticesRef.current.slice(0, -1);
        }
        finishDrawing();
      });

      // ── Mouse move for live preview ─────────────────────────────
      map.on('mousemove', (e) => {
        if (!isDrawingRef.current || verticesRef.current.length === 0) return;
        cursorRef.current = [e.lngLat.lng, e.lngLat.lat];
        updateDrawPreview();
      });

      // ── Clear preview line when cursor leaves the map canvas ─────
      map.getCanvas().addEventListener('mouseleave', () => {
        if (!isDrawingRef.current) return;
        cursorRef.current = null;
        updateDrawPreview();
      });

      // ── Asset click (only when not drawing) ─────────────────────
      map.on('click', 'assets-circle', (e) => {
        if (isDrawingRef.current) return;
        const f = e.features?.[0];
        if (f?.properties?.id) onSelectAsset(f.properties.id as string);
      });

      // ── Drone click ─────────────────────────────────────────────
      map.on('click', 'drones-circle', (e) => {
        if (isDrawingRef.current) return;
        const f = e.features?.[0];
        if (f?.properties?.id) onSelectDrone(f.properties.id as string);
      });

      map.on('mouseenter', 'assets-circle', () => {
        if (!isDrawingRef.current) map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', 'assets-circle', () => {
        if (!isDrawingRef.current) map.getCanvas().style.cursor = '';
      });
      map.on('mouseenter', 'drones-circle', () => {
        if (!isDrawingRef.current) map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', 'drones-circle', () => {
        if (!isDrawingRef.current) map.getCanvas().style.cursor = '';
      });
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      layersReadyRef.current = false;
    };
  }, []);

  // Update cursor style when draw mode changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.getCanvas().style.cursor = (isDrawing || isPatrolDrawing) ? 'crosshair' : '';
  }, [isDrawing, isPatrolDrawing]);

  // ── Update patrol path source ────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !layersReadyRef.current) return;
    if (!patrolPath || patrolPath.waypoints.length < 2) {
      updateSource(map, 'patrol-path', { type: 'FeatureCollection', features: [] });
      return;
    }
    const coords = patrolPath.waypoints.map((wp) => [wp.lon, wp.lat]);
    const features: GeoJSON.Feature[] = [
      { type: 'Feature', geometry: { type: 'LineString', coordinates: [...coords, coords[0]] }, properties: {} },
      ...coords.map((c) => ({ type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: c }, properties: {} })),
    ];
    updateSource(map, 'patrol-path', { type: 'FeatureCollection', features });
  }, [patrolPath, mapReady]);

  // ── Update asset source on every tick ────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !layersReadyRef.current) return;
    updateSource(map, 'assets', assetsToGeoJSON(assets));
  }, [assets, mapReady]);

  // ── Update drone source ───────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !layersReadyRef.current) return;
    updateSource(map, 'drones', dronesToGeoJSON(drones));
  }, [drones, mapReady]);

  // ── Update zone source ────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !layersReadyRef.current) return;
    updateSource(map, 'zones', zonesToGeoJSON(zones));
  }, [zones, mapReady]);

  // ── Focus zone: fit map to zone bbox + yellow outline + brief fill pulse ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !layersReadyRef.current) return;
    // Always update outline filter (clears when focusedZoneId is null)
    if (map.getLayer('zones-focused-outline')) {
      map.setFilter('zones-focused-outline', ['==', ['get', 'id'], focusedZoneId ?? '']);
    }
    if (!focusedZoneId) return;
    const zone = zones.find((z) => z.id === focusedZoneId);
    if (!zone) return;
    const geom = zone.geojson as any;
    const coords: [number, number][] =
      geom.type === 'Polygon'
        ? geom.coordinates[0]
        : geom.type === 'MultiPolygon'
        ? geom.coordinates.flat(2)
        : [];
    if (coords.length === 0) return;
    const lons = coords.map((c: [number, number]) => c[0]);
    const lats = coords.map((c: [number, number]) => c[1]);
    map.fitBounds(
      [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]],
      { padding: 80, maxZoom: 9, duration: 600 },
    );
    if (map.getLayer('zones-fill')) {
      map.setPaintProperty('zones-fill', 'fill-opacity', 0.40);
      setTimeout(() => {
        if (mapRef.current?.getLayer('zones-fill')) {
          mapRef.current.setPaintProperty('zones-fill', 'fill-opacity', 0.15);
        }
      }, 800);
    }
  }, [focusedZoneId]);

  // ── Handle selection: filter highlights + clear overlays on change ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !layersReadyRef.current) return;

    clearSelectedFilter(map, 'assets-selected');
    clearSelectedFilter(map, 'assets-selected-pulse');
    clearSelectedFilter(map, 'drones-selected');
    clearSelectedFilter(map, 'drones-selected-pulse');

    if (!selected) {
      updateSource(map, 'history', { type: 'FeatureCollection', features: [] });
      updateSource(map, 'predicted', { type: 'FeatureCollection', features: [] });
      return;
    }

    if (selected.type === 'asset') {
      setSelectedFilter(map, 'assets-selected', selected.id);
      setSelectedFilter(map, 'assets-selected-pulse', selected.id);
    } else if (selected.type === 'drone') {
      setSelectedFilter(map, 'drones-selected', selected.id);
      setSelectedFilter(map, 'drones-selected-pulse', selected.id);
    }
  }, [selected?.type, selected?.id]);

  // ── Animate the selection pulse rings ──────────────────────────────
  useEffect(() => {
    if (!selected) return;
    const layerId = selected.type === 'asset' ? 'assets-selected-pulse' : 'drones-selected-pulse';
    let raf = 0;
    const start = performance.now();
    const animate = (now: number) => {
      const map = mapRef.current;
      if (map && layersReadyRef.current && map.getLayer(layerId)) {
        const phase = ((now - start) % 1500) / 1500; // 0..1 over 1.5s
        const radius = 15 + phase * 14;              // expand 15 → 29
        const opacity = 0.8 * (1 - phase);           // fade out
        map.setPaintProperty(layerId, 'circle-radius', radius);
        map.setPaintProperty(layerId, 'circle-stroke-opacity', opacity);
      }
      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [selected?.type, selected?.id]);

  // ── Fly to selected asset/drone once per selection change ───────────
  const lastFocusedSelectionRef = useRef<string | null>(null);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selected) return;

    const key = `${selected.type}:${selected.id}`;
    if (lastFocusedSelectionRef.current === key) return;
    lastFocusedSelectionRef.current = key;

    if (selected.type === 'asset') {
      const asset = assets.find((a) => a.id === selected.id);
      if (asset) {
        map.easeTo({ center: [asset.lon, asset.lat], zoom: Math.max(map.getZoom(), 6), duration: 600 });
      }
    } else if (selected.type === 'drone') {
      const drone = drones.find((d) => d.id === selected.id);
      if (drone) {
        map.easeTo({ center: [drone.lon, drone.lat], zoom: Math.max(map.getZoom(), 6), duration: 600 });
      }
    }
  }, [selected?.type, selected?.id]);

  // ── Refresh history + predicted path every tick for selected asset ──
  const selectedAsset = selected?.type === 'asset'
    ? assets.find((a) => a.id === selected.id)
    : null;

  useEffect(() => {
    if (!selectedAsset) return;
    const map = mapRef.current;
    if (!map || !layersReadyRef.current) return;

    Promise.all([
      fetchAssetHistory(selectedAsset.id),
      fetchPredictedPath(selectedAsset.id),
    ]).then(([history, predicted]: [HistoryPoint[], PredictedPoint[]]) => {
      if (!mapRef.current || !layersReadyRef.current) return;
      updateSource(mapRef.current, 'history', historyToGeoJSON(history));
      updateSource(mapRef.current, 'predicted', predictedToGeoJSON(predicted));
    }).catch(console.error);
  }, [selectedAsset?.updated_at]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* ── Toolbar ───────────────────────────────────────────── */}
      <div style={{ position: 'absolute', top: 10, right: 10, display: 'flex', gap: 6, zIndex: 10 }}>

        {/* Idle: show both buttons */}
        {!isDrawing && !isPatrolDrawing && (
          <>
            <button
              onClick={startDrawing}
              onMouseDown={() => { suppressNextClickRef.current = false; }}
              title="Draw Restricted Zone"
              style={{ background: '#1e293b', border: '1px solid #475569', borderRadius: 6, color: '#f8fafc', cursor: 'pointer', fontSize: 12, fontWeight: 600, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 2px 8px rgba(0,0,0,0.4)' }}
            >
              <span style={{ fontSize: 14 }}>⬡</span> Draw Zone
            </button>
            <button
              onClick={startPatrolDrawing}
              onMouseDown={() => { suppressNextClickRef.current = false; }}
              title="Draw Patrol Path"
              style={{ background: '#0c2340', border: '1px solid #38bdf8', borderRadius: 6, color: '#38bdf8', cursor: 'pointer', fontSize: 12, fontWeight: 600, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 2px 8px rgba(0,0,0,0.4)' }}
            >
              <span style={{ fontSize: 14 }}>⇢</span> Set Patrol Path
            </button>
          </>
        )}

        {/* Zone draw active */}
        {isDrawing && (
          <>
            <div style={{ background: '#450a0a', border: '1px solid #ef4444', borderRadius: 6, color: '#fca5a5', fontSize: 12, fontWeight: 600, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 2px 8px rgba(0,0,0,0.4)' }}>
              <span>●</span>
              Drawing Zone… {vertexCount > 0 ? `${vertexCount} pts` : 'click to add points'}
            </div>
            <button
              onMouseDown={() => { suppressNextClickRef.current = true; }}
              onClick={finishDrawing}
              disabled={vertexCount < 3}
              title="Finish polygon (or double-click on map)"
              style={{ background: vertexCount >= 3 ? '#166534' : '#1e293b', border: `1px solid ${vertexCount >= 3 ? '#22c55e' : '#475569'}`, borderRadius: 6, color: vertexCount >= 3 ? '#dcfce7' : '#64748b', cursor: vertexCount >= 3 ? 'pointer' : 'not-allowed', fontSize: 12, fontWeight: 600, padding: '6px 12px', boxShadow: '0 2px 8px rgba(0,0,0,0.4)' }}
            >
              ✓ Finish
            </button>
            <button
              onMouseDown={() => { suppressNextClickRef.current = true; }}
              onClick={cancelDrawing}
              title="Cancel drawing"
              style={{ background: '#1e293b', border: '1px solid #475569', borderRadius: 6, color: '#94a3b8', cursor: 'pointer', fontSize: 12, fontWeight: 600, padding: '6px 12px', boxShadow: '0 2px 8px rgba(0,0,0,0.4)' }}
            >
              ✕ Cancel
            </button>
          </>
        )}

        {/* Patrol draw active */}
        {isPatrolDrawing && (
          <>
            <div style={{ background: '#0c2340', border: '1px solid #38bdf8', borderRadius: 6, color: '#7dd3fc', fontSize: 12, fontWeight: 600, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 2px 8px rgba(0,0,0,0.4)' }}>
              <span>⇢</span>
              Patrol Path… {patrolVertexCount > 0 ? `${patrolVertexCount} pts` : 'click to add waypoints'}
            </div>
            <button
              onMouseDown={() => { suppressNextClickRef.current = true; }}
              onClick={finishPatrolDrawing}
              disabled={patrolVertexCount < 2}
              title="Finish patrol path (or double-click on map)"
              style={{ background: patrolVertexCount >= 2 ? '#0c4a6e' : '#1e293b', border: `1px solid ${patrolVertexCount >= 2 ? '#38bdf8' : '#475569'}`, borderRadius: 6, color: patrolVertexCount >= 2 ? '#e0f2fe' : '#64748b', cursor: patrolVertexCount >= 2 ? 'pointer' : 'not-allowed', fontSize: 12, fontWeight: 600, padding: '6px 12px', boxShadow: '0 2px 8px rgba(0,0,0,0.4)' }}
            >
              ✓ Set Path
            </button>
            <button
              onMouseDown={() => { suppressNextClickRef.current = true; }}
              onClick={cancelPatrolDrawing}
              title="Cancel patrol path drawing"
              style={{ background: '#1e293b', border: '1px solid #475569', borderRadius: 6, color: '#94a3b8', cursor: 'pointer', fontSize: 12, fontWeight: 600, padding: '6px 12px', boxShadow: '0 2px 8px rgba(0,0,0,0.4)' }}
            >
              ✕ Cancel
            </button>
          </>
        )}
      </div>

      {/* ── Drawing hint ──────────────────────────────────────── */}
      {isDrawing && (
        <div style={{
          position: 'absolute',
          bottom: 40,
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(15,23,42,0.9)',
          border: '1px solid #475569',
          borderRadius: 6,
          color: '#94a3b8',
          fontSize: 12,
          padding: '6px 14px',
          pointerEvents: 'none',
          zIndex: 10,
        }}>
          Click to add vertices · Double-click to finish · {vertexCount} point{vertexCount !== 1 ? 's' : ''} placed
        </div>
      )}

      {/* ── Legend ────────────────────────────────────────────── */}
      {!isDrawing && !isPatrolDrawing && (
        <div style={{
          position: 'absolute',
          bottom: 12,
          left: 12,
          background: 'rgba(2,6,23,0.82)',
          border: '1px solid #1e293b',
          borderRadius: 8,
          padding: '8px 10px',
          fontSize: 11,
          color: '#cbd5e1',
          zIndex: 10,
          boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          minWidth: 130,
        }}>
          <div style={{ fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Legend</div>
          <LegendDot color="#ef4444" label="Critical" />
          <LegendDot color="#f59e0b" label="Warning" />
          <LegendDot color="#6b7280" label="Normal" />
          <LegendDot color="#38bdf8" label="Drone" />
          <LegendLine color="#ef4444" label="Restricted zone" />
          <LegendLine color="#38bdf8" dashed label="Patrol path" />
          <LegendLine color="#a78bfa" dashed label="Predicted path" />
          <LegendLine color="#94a3b8" label="History (5 min)" />
          <LegendRing color="#fde047" label="Selected" />
        </div>
      )}
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ width: 12, height: 12, borderRadius: '50%', background: color, border: '1.5px solid #fff', flexShrink: 0 }} />
      <span>{label}</span>
    </div>
  );
}

function LegendLine({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ width: 14, height: 0, borderTop: `2px ${dashed ? 'dashed' : 'solid'} ${color}`, flexShrink: 0 }} />
      <span>{label}</span>
    </div>
  );
}

function LegendRing({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ width: 12, height: 12, borderRadius: '50%', background: 'transparent', border: `2.5px solid ${color}`, flexShrink: 0 }} />
      <span>{label}</span>
    </div>
  );
}
