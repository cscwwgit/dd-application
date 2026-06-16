import MapboxDraw from '@mapbox/mapbox-gl-draw';
import type { Map as MapLibreMap } from 'maplibre-gl';

export function createDrawControl(): MapboxDraw {
  return new MapboxDraw({
    displayControlsDefault: false,
    controls: { polygon: true, trash: true },
    defaultMode: 'simple_select',
    styles: [
      {
        id: 'gl-draw-polygon-fill',
        type: 'fill',
        filter: ['all', ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
        paint: { 'fill-color': '#ef4444', 'fill-opacity': 0.2 },
      },
      {
        id: 'gl-draw-polygon-stroke',
        type: 'line',
        filter: ['all', ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
        paint: { 'line-color': '#ef4444', 'line-width': 2 },
      },
      {
        id: 'gl-draw-point',
        type: 'circle',
        filter: ['all', ['==', '$type', 'Point'], ['==', 'meta', 'vertex']],
        paint: { 'circle-radius': 5, 'circle-color': '#ef4444' },
      },
    ],
  });
}

export function addDrawControl(map: MapLibreMap, draw: MapboxDraw): void {
  (map as any).addControl(draw);
}
