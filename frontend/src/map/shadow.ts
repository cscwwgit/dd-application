import type { Map as MapLibreMap } from 'maplibre-gl';
import type { AssetState, DroneState } from '../api/types';

// Screen-space symbology tuning. Display-only: never mutates backend state.
const OVERLAP_THRESHOLD_PX = 28; // if drone renders within this of its target, offset it
const OFFSET_PX = 26;            // screen-space nudge: right + up

export interface DroneDisplay {
  drones: GeoJSON.FeatureCollection; // drone markers at display coordinates
  links: GeoJSON.FeatureCollection;  // cyan shadow-link lines (true target -> displayed drone)
}

function droneProperties(d: DroneState): GeoJSON.GeoJsonProperties {
  return {
    id: d.id,
    status: d.status,
    target_asset_id: d.target_asset_id,
    origin_base_id: d.origin_base_id,
    speed_mps: d.speed_mps,
    intercept_seconds: d.intercept_seconds,
    updated_at: d.updated_at,
  };
}

/**
 * Compute display coordinates for drones. A drone that is shadowing a target
 * asset and would render on top of it (within OVERLAP_THRESHOLD_PX) is nudged
 * by a fixed screen-space offset and linked back to the true target position.
 * All other drones render at their true backend coordinates. At high zoom the
 * on-screen separation exceeds the threshold, so positions converge to truth.
 */
export function computeDroneDisplay(
  map: MapLibreMap,
  drones: DroneState[],
  assets: AssetState[],
): DroneDisplay {
  const assetById = new Map(assets.map((a) => [a.id, a]));
  const droneFeatures: GeoJSON.Feature[] = [];
  const linkFeatures: GeoJSON.Feature[] = [];

  for (const d of drones) {
    let lng = d.lon;
    let lat = d.lat;

    const target =
      d.status === 'shadowing' && d.target_asset_id
        ? assetById.get(d.target_asset_id)
        : undefined;

    if (target) {
      const targetPx = map.project([target.lon, target.lat]);
      const dronePx = map.project([d.lon, d.lat]);
      const distPx = Math.hypot(dronePx.x - targetPx.x, dronePx.y - targetPx.y);

      if (distPx < OVERLAP_THRESHOLD_PX) {
        // Offset right (+x) and up (-y) in screen space, then back to lng/lat.
        const displayed = map.unproject([targetPx.x + OFFSET_PX, targetPx.y - OFFSET_PX]);
        lng = displayed.lng;
        lat = displayed.lat;
        linkFeatures.push({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [
              [target.lon, target.lat],
              [lng, lat],
            ],
          },
          properties: { drone_id: d.id, asset_id: target.id },
        });
      }
    }

    droneFeatures.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lng, lat] },
      properties: droneProperties(d),
    });
  }

  return {
    drones: { type: 'FeatureCollection', features: droneFeatures },
    links: { type: 'FeatureCollection', features: linkFeatures },
  };
}
